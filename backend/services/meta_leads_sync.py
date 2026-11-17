"""Synchronisation automatique des leads Meta (publicités à formulaire) —
demande du 2026-11-17. Lit directement les formulaires de la page Facebook
toutes les 15 minutes (boucle dans server.py) et crée les leads manquants,
avec une notification push à l'équipe.

Complète le webhook temps réel (routers/meta_leads.py) : tant que celui-ci
n'est pas actif côté Meta, c'est la seule arrivée automatique des leads ; une
fois actif, elle rattrape ceux dont la notification se serait perdue. Pas de
doublon : un lead déjà connu (même identifiant Meta, sinon même email ou
téléphone) n'est jamais recréé — comme l'import CSV (routers/meta_lead_import.py).
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

from core.config import META_PAGE_ACCESS_TOKEN, META_WHATSAPP_TOKEN
from core.database import db
from core.meta_ville import meta_ville
from core.utils import now_iso
from services.push import send_push_to_users
from services.staff_notify import CALLBACK_NOTIFY_ROLES, notify_new_lead

logger = logging.getLogger(__name__)

GRAPH = "https://graph.facebook.com/v23.0"
# Page « Récupération Points Permis IDF » (portefeuille BR company), qui porte
# les formulaires des campagnes.
META_LEADS_PAGE_ID = os.getenv("META_LEADS_PAGE_ID", "1208010002400355")
SYNC_INTERVAL_SECONDS = 15 * 60
# Première synchronisation : on remonte 3 jours (les leads plus anciens sont
# arrivés par import CSV) ; ensuite, on repart du dernier lead vu, avec une
# marge, car Meta peut indexer un lead quelques minutes après sa création.
FIRST_SYNC_DAYS = 3
OVERLAP = timedelta(minutes=30)
# Au-delà, une seule notification groupée plutôt qu'un email + push par lead.
NOTIFY_ONE_BY_ONE_MAX = 5
# ad_name/adset_name/campaign_name : demandés, mais Meta ne les renvoie pas
# toujours sur cette route ; la ville et la catégorie se déduisent alors du nom
# du formulaire (« Épinay | Stage points | … »).
LEAD_FIELDS = "id,created_time,field_data,ad_name,adset_name,campaign_name,form_id,platform"


def _get(path: str, token: str, **params) -> dict:
    r = requests.get(f"{GRAPH}/{path}", params={"access_token": token, **params}, timeout=30)
    data = r.json()
    if "error" in data:
        raise RuntimeError(data["error"].get("message", "erreur Graph API"))
    return data


def _page_token() -> str:
    """Jeton de la page, obtenu avec le premier jeton d'utilisateur système
    qui y a accès (META_PAGE_ACCESS_TOKEN, sinon celui de WhatsApp : même
    utilisateur système dans la configuration actuelle)."""
    errors = []
    for token in dict.fromkeys(t for t in (META_PAGE_ACCESS_TOKEN, META_WHATSAPP_TOKEN) if t):
        try:
            page_token = _get(META_LEADS_PAGE_ID, token, fields="access_token").get("access_token")
            if page_token:
                return page_token
        except RuntimeError as e:
            errors.append(str(e))
    raise RuntimeError("aucun jeton n'a accès à la page des formulaires : " + " | ".join(errors[:2]))


def _fetch_new_leads(since: datetime) -> list:
    """[(formulaire, lead)] créés après `since`, tous formulaires de la page."""
    token = _page_token()
    forms = _get(f"{META_LEADS_PAGE_ID}/leadgen_forms", token, fields="id,name", limit=100).get("data", [])
    filtering = json.dumps([{"field": "time_created", "operator": "GREATER_THAN", "value": int(since.timestamp())}])
    out = []
    for form in forms:
        params = {"fields": LEAD_FIELDS, "filtering": filtering, "limit": 100}
        path = f"{form['id']}/leads"
        while True:
            page = _get(path, token, **params)
            out.extend((form, lead) for lead in page.get("data", []))
            nxt = (page.get("paging") or {}).get("cursors", {}).get("after")
            if not nxt or not (page.get("paging") or {}).get("next"):
                break
            params["after"] = nxt
    return out


def _parse_time(value: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S%z")
    except (TypeError, ValueError):
        return None


async def _ingest(form: dict, lead: dict) -> Optional[dict]:
    """Crée le lead s'il est nouveau ; renvoie le lead créé, sinon None."""
    from routers.leads import _category_for_interest, create_lead_from_contact
    from routers.meta_lead_import import _clean_phone
    from routers.meta_leads import _extract_fields

    meta_id = lead.get("id")
    # L'export CSV de Meta préfixe l'identifiant (« l:123… »), l'API non.
    if not meta_id or await db.leads.find_one({"meta_details.meta_lead_id": {"$in": [meta_id, f"l:{meta_id}"]}}, {"_id": 0, "id": 1}):
        return None
    parsed = _extract_fields(lead.get("field_data", []))
    email = (parsed["email"] or "").strip().lower() or None
    phone = _clean_phone(parsed["phone"]) or None
    if not email and not phone:
        return None
    # Déjà apprenant (inscription active) : pas un prospect à démarcher.
    enrolled = {"$or": [*([{"student_email": email}] if email else []), *([{"student_phone": phone}] if phone else [])]}
    if await db.inscriptions.find_one({**enrolled, "status": "active"}, {"_id": 0, "id": 1}):
        return None

    form_name = form.get("name") or ""
    created = await create_lead_from_contact(
        name=parsed["name"], email=email, phone=phone, interest=form_name,
        notes=parsed["notes"], source="meta", from_meta_ads=True,
    )
    if not created:
        return None
    meta_details = {
        "meta_lead_id": f"l:{meta_id}", "created_time": lead.get("created_time"),  # même forme que l import CSV
        "adset_name": lead.get("adset_name"), "ad_name": lead.get("ad_name"),
        "form_name": form_name, "platform": lead.get("platform"), "answers": parsed["answers"],
        "via": "sync_api",
    }
    category = _category_for_interest(form_name) or _category_for_interest(lead.get("campaign_name"))
    ville = meta_ville(parsed["answers"], lead.get("ad_name"), lead.get("adset_name"), form_name, lead.get("campaign_name"))
    if not created.get("is_new"):
        # Prospect déjà connu (même email/téléphone) : on rattache la fiche à
        # Meta sans la recréer ni renotifier l'équipe.
        update = {"updated_at": now_iso(), "sources": list({*(created.get("sources") or []), "meta"})}
        if not (created.get("meta_details") or {}).get("meta_lead_id"):
            update.update({"meta_details": meta_details, "campaign_name": lead.get("campaign_name")})
        if ville and not created.get("ville"):
            update["ville"] = ville
        if category and not created.get("category"):
            update["category"] = category
        await db.leads.update_one({"id": created["id"]}, {"$set": update})
        return None
    extra = {
        "ville": ville, "campaign_name": lead.get("campaign_name"), "campagne": lead.get("campaign_name"),
        "sources": ["meta"], "meta_details": meta_details,
    }
    if category:
        extra["category"] = category
    await db.leads.update_one({"id": created["id"]}, {"$set": extra})
    created.update(extra)
    return created


async def _notify(new_leads: list) -> None:
    if len(new_leads) <= NOTIFY_ONE_BY_ONE_MAX:
        for lead in new_leads:
            await notify_new_lead(lead)
        return
    staff = await db.users.find({"active": True, "role": {"$in": list(CALLBACK_NOTIFY_ROLES)}}, {"_id": 0, "id": 1}).to_list(500)
    if staff:
        await send_push_to_users(
            [s["id"] for s in staff], f"{len(new_leads)} nouveaux leads Meta",
            ", ".join(lead.get("name", "") for lead in new_leads[:4]) + ("…" if len(new_leads) > 4 else ""),
            "/admin/leads",
        )


async def sync_meta_leads() -> dict:
    settings = await db.settings.find_one({"id": "global"}, {"_id": 0, "meta_leads_sync_since": 1}) or {}
    since = _parse_time(settings.get("meta_leads_sync_since")) or (datetime.now(timezone.utc) - timedelta(days=FIRST_SYNC_DAYS))
    fetched = await asyncio.to_thread(_fetch_new_leads, since)
    new_leads = []
    for form, lead in sorted(fetched, key=lambda fl: fl[1].get("created_time") or ""):
        created = await _ingest(form, lead)
        if created:
            new_leads.append(created)
    latest = max((t for _, lead in fetched if (t := _parse_time(lead.get("created_time")))), default=None)
    if latest:
        mark = max(since, latest - OVERLAP)
        await db.settings.update_one(
            {"id": "global"}, {"$set": {"meta_leads_sync_since": mark.strftime("%Y-%m-%dT%H:%M:%S%z")}}, upsert=True,
        )
    await db.settings.update_one(
        {"id": "global"},
        {"$set": {"meta_leads_sync_last_run": now_iso(), "meta_leads_sync_last_result": {"lus": len(fetched), "crees": len(new_leads)}}},
        upsert=True,
    )
    if new_leads:
        from routers.leads import _leads_cache_clear
        _leads_cache_clear()
        await _notify(new_leads)
    return {"lus": len(fetched), "crees": len(new_leads), "depuis": since.isoformat()}
