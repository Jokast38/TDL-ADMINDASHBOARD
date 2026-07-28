import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS
from core.utils import now_iso
from models.lead import LeadAutomationIn, LeadAutomationUpdate
from services.email import send_email
from routers.leads import _leads_cache_clear

router = APIRouter(prefix="/leads/automations", tags=["lead-automations"])
log = logging.getLogger(__name__)

# Un lead ayant répondu positivement ou négativement sort du cycle de relance
# automatique — seule une intervention manuelle (désactiver la règle, ou changer
# à nouveau le statut du lead) le remet dans un parcours de relance.
_STOP_STATUSES = ["interesse", "pas_interesse"]


def _parse_iso(value: str):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def _rule_target_query(rule: Dict[str, Any]) -> Dict[str, Any]:
    # "email_invalide" : posé automatiquement quand un envoi échoue faute d'adresse
    # valide (voir _run_rule) — sans cette exclusion, un lead mal saisi est retenté
    # à chaque passage de la règle, indéfiniment, sans jamais pouvoir aboutir.
    query: Dict[str, Any] = {"status": {"$nin": _STOP_STATUSES}, "tags": {"$nin": ["email_invalide"]}}
    if rule.get("target_type") == "selection":
        query["id"] = {"$in": rule.get("lead_ids") or []}
    else:
        values = [v for v in (rule.get("interest_in") or "").split("|") if v]
        if values:
            query["interest"] = {"$in": values}
    return query


async def _run_rule(rule: Dict[str, Any], force: bool = False) -> int:
    query = await _rule_target_query(rule)
    leads = await db.leads.find(query, {"_id": 0}).to_list(100000)
    now = datetime.now(timezone.utc)
    freq_days = rule.get("frequency_days") or 0
    sent = 0
    for lead in leads:
        if not lead.get("email"):
            continue
        if not force:
            ref = _parse_iso(lead.get("last_contacted_at") or lead.get("created_at") or "")
            if ref and (now - ref).days < freq_days:
                continue
        body = (rule.get("body") or "").replace("{{name}}", lead.get("name", ""))
        result = await send_email(
            lead["email"], rule.get("subject", ""), body,
            extra={"lead_id": lead["id"], "automation_id": rule["id"]},
        )
        if result["status"] == "invalid_email":
            await db.leads.update_one(
                {"id": lead["id"]}, {"$set": {"updated_at": now_iso()}, "$addToSet": {"tags": "email_invalide"}}
            )
            continue
        if result["status"] not in ("sent", "mocked"):
            continue
        sent += 1
        update = {"updated_at": now_iso()}
        if rule.get("mark_contacted", True):
            update.update({"contacted": True, "last_contacted_at": now_iso(), "status": "contacte"})
        await db.leads.update_one({"id": lead["id"]}, {"$set": update})
        if rule.get("add_tag"):
            await db.leads.update_one({"id": lead["id"]}, {"$addToSet": {"tags": rule["add_tag"]}})
    if sent:
        _leads_cache_clear()
    await db.lead_automations.update_one(
        {"id": rule["id"]}, {"$set": {"last_run_at": now_iso(), "last_run_sent": sent}}
    )
    return sent


_MIN_INTERVAL_MINUTES = 20


async def run_due_automations() -> int:
    """Parcourt toutes les règles actives et relance les leads dont l'échéance
    est atteinte. Appelée en boucle par la tâche de fond (voir server.py) et
    par l'endpoint /run-due, ce qui permet aussi de la déclencher via un cron
    externe si le service dort entre deux requêtes (plan gratuit Render).

    La boucle de fond relance ce passage à chaque redémarrage du process (pas
    seulement toutes les heures) — sur Render free tier qui redémarre souvent,
    ça pouvait déclencher des dizaines de passages par jour. Ce verrou global
    empêche deux passages à moins de 20 min d'écart, quelle que soit la cause."""
    lock = await db.settings.find_one({"id": "automations_lock"}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if lock and lock.get("last_run_at"):
        last = _parse_iso(lock["last_run_at"])
        if last and (now - last).total_seconds() < _MIN_INTERVAL_MINUTES * 60:
            return 0
    await db.settings.update_one({"id": "automations_lock"}, {"$set": {"last_run_at": now_iso()}}, upsert=True)

    rules = await db.lead_automations.find({"active": True}, {"_id": 0}).to_list(1000)
    total = 0
    for rule in rules:
        try:
            total += await _run_rule(rule, force=False)
        except Exception as e:
            log.warning(f"Automation {rule.get('id')} failed: {e}")
    return total


@router.get("")
async def list_automations(user: dict = Depends(require_role(*ROLES_LEADS))):
    return await db.lead_automations.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("")
async def create_automation(payload: LeadAutomationIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    if payload.target_type not in ("interest", "selection"):
        raise HTTPException(status_code=400, detail="target_type invalide")
    if payload.target_type == "selection" and not payload.lead_ids:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins un lead")
    if payload.frequency_days < 1:
        raise HTTPException(status_code=400, detail="La fréquence doit être d'au moins 1 jour")
    rule = payload.dict()
    rule.update({
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "created_by": user["id"],
        "last_run_at": None,
        "last_run_sent": 0,
    })
    await db.lead_automations.insert_one(rule)
    rule.pop("_id", None)
    return rule


@router.put("/{automation_id}")
async def update_automation(automation_id: str, payload: LeadAutomationUpdate, user: dict = Depends(require_role(*ROLES_LEADS))):
    rule = await db.lead_automations.find_one({"id": automation_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    patch = {k: v for k, v in payload.dict().items() if v is not None}
    if patch:
        patch["updated_at"] = now_iso()
        await db.lead_automations.update_one({"id": automation_id}, {"$set": patch})
    return await db.lead_automations.find_one({"id": automation_id}, {"_id": 0})


@router.delete("/{automation_id}")
async def delete_automation(automation_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    result = await db.lead_automations.delete_one({"id": automation_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    return {"ok": True}


@router.post("/preview-count")
async def preview_matching_count(payload: Dict[str, Any], user: dict = Depends(require_role(*ROLES_LEADS))):
    """Nombre de leads actuellement concernés par un ciblage donné (avant même
    de créer la règle) — utilisé par le frontend pour afficher un aperçu live."""
    query = await _rule_target_query(payload)
    count = await db.leads.count_documents(query)
    with_email = await db.leads.count_documents({**query, "email": {"$nin": [None, ""]}})
    return {"total": count, "with_email": with_email}


@router.post("/{automation_id}/run-now")
async def run_automation_now(automation_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    rule = await db.lead_automations.find_one({"id": automation_id}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    sent = await _run_rule(rule, force=True)
    return {"sent": sent}


@router.post("/run-due")
async def run_due(user: dict = Depends(require_role(*ROLES_LEADS))):
    """Déclenche manuellement (ou via cron externe) le passage de toutes les
    règles actives — envoie uniquement aux leads dont l'échéance est atteinte."""
    sent = await run_due_automations()
    return {"sent": sent}
