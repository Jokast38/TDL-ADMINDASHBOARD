"""Campagnes SMS par la passerelle personnelle (services/smsgate.py), demande du 2026-11-12.

Les prospects sont choisis à la main dans la page Prospects (cases à cocher),
puis « Campagne SMS ». La campagne est enregistrée (`db.sms_campaigns`) et
envoyée en tâche de fond (boucle de server.py, toutes les 2 min) :
  - uniquement du lundi au samedi, 8h-20h, hors jours fériés ;
  - dans la limite d'un plafond par jour (défaut 100, protège la ligne SIM) ;
  - jamais vers un numéro qui a répondu STOP (`db.sms_optouts`), ni vers les
    contacts importés par le scraper ProStages (aucun consentement).
Reprise après redémarrage (position `next_index`), un seul serveur à la fois
(bail `lease_until`). Chaque SMS a une ligne dans `db.sms_logs`
(provider="smsgate") dont le statut est mis à jour par webhook ou par
interrogation de la passerelle."""
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from core.database import db
from core.utils import now_iso
from services import smsgate
from services.sms import normalize_phone_fr

logger = logging.getLogger(__name__)

STATUTS = {"en_cours": "En cours", "en_pause": "En pause", "terminee": "Terminée", "annulee": "Annulée"}
LOT_MAX = 30
BAIL_MINUTES = 10
SCRAPED_MARK = "Import scraper ProStages"
STOP_RE = re.compile(r"^\W*(stop|arr[eê]t|desabonn|désabonn|unsubscribe)", re.IGNORECASE)
# Ordre des statuts d'un SMS : on ne revient jamais en arrière
RANK = {"pending": 0, "sent": 1, "delivered": 2, "failed": 3, "cancelled": 3}
STATE_MAP = {"queued": "pending", "sending": "pending", "Pending": "pending", "Processed": "pending", "Sent": "sent", "Delivered": "delivered",
             "Failed": "failed", "Cancelled": "cancelled"}


# ── Sélection des destinataires ─────────────────────────────────────────────

def first_name(lead: dict) -> str:
    return (lead.get("prenom") or (lead.get("name") or "").split(" ")[0] or "").strip().title()


async def select_recipients(lead_ids: List[str]) -> dict:
    leads = await db.leads.find({"id": {"$in": list(dict.fromkeys(lead_ids))}}, {"_id": 0}).to_list(len(lead_ids) + 10)
    optouts = {o["phone"] for o in await db.sms_optouts.find({}, {"_id": 0, "phone": 1}).to_list(100000)}
    recipients, seen = [], set()
    excluded = {"sans_numero": 0, "numero_invalide": 0, "stop": 0, "scraper": 0, "doublon": 0}
    for lead in leads:
        raw = lead.get("phone") or lead.get("telephone") or ""
        if not raw:
            excluded["sans_numero"] += 1
            continue
        if SCRAPED_MARK in (lead.get("notes") or ""):
            excluded["scraper"] += 1
            continue
        phone = normalize_phone_fr(raw)
        if not phone:
            excluded["numero_invalide"] += 1
        elif phone in optouts:
            excluded["stop"] += 1
        elif phone in seen:
            excluded["doublon"] += 1
        else:
            seen.add(phone)
            recipients.append({"lead_id": lead["id"], "phone": phone, "prenom": first_name(lead)})
    return {"recipients": recipients, "excluded": excluded, "found": len(leads)}


def render_text(cfg: dict, body: str, prenom: str) -> str:
    text = body.replace("{prenom}", prenom or "").replace("{{prenom}}", prenom or "")
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    out = (cfg.get("prefix") or "") + text
    if cfg.get("stop_text"):
        out += "\n" + cfg["stop_text"]
    return out


async def create_campaign(label: str, body: str, lead_ids: List[str], user: dict) -> dict:
    sel = await select_recipients(lead_ids)
    doc = {
        "id": str(uuid.uuid4()), "label": label, "body": body, "recipients": sel["recipients"],
        "total": len(sel["recipients"]), "next_index": 0, "status": "en_cours" if sel["recipients"] else "terminee",
        "excluded": sel["excluded"], "created_by": user.get("id"), "created_by_name": user.get("name"),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.sms_campaigns.insert_one(dict(doc))
    return await public(doc)


async def public(doc: dict) -> dict:
    d = {k: v for k, v in doc.items() if k not in ("recipients", "_id", "lease_until")}
    d["statut_label"] = STATUTS.get(d.get("status"), d.get("status"))
    logs = await db.sms_logs.find({"campaign_id": doc["id"]}, {"_id": 0, "status": 1}).to_list(100000)
    counts = {"pending": 0, "sent": 0, "delivered": 0, "failed": 0}
    for l in logs:
        if l.get("status") in counts:
            counts[l["status"]] += 1
    d["stats"] = {**counts, "a_envoyer": max(0, d.get("total", 0) - d.get("next_index", 0))}
    return d


# ── Envoi en tâche de fond ──────────────────────────────────────────────────

async def _take_lease(campaign_id: str) -> bool:
    now = datetime.now(timezone.utc)
    res = await db.sms_campaigns.update_one(
        {"id": campaign_id, "status": "en_cours",
         "$or": [{"lease_until": {"$exists": False}}, {"lease_until": None}, {"lease_until": {"$lt": now.isoformat()}}]},
        {"$set": {"lease_until": (now + timedelta(minutes=BAIL_MINUTES)).isoformat()}},
    )
    return bool(getattr(res, "modified_count", 0) or getattr(res, "matched_count", 0))


async def _sent_today() -> int:
    midnight = datetime.now(smsgate.PARIS).replace(hour=0, minute=0, second=0, microsecond=0)
    return await db.sms_logs.count_documents(
        {"provider": "smsgate", "created_at": {"$gte": midnight.astimezone(timezone.utc).isoformat()}})


async def process_campaigns() -> int:
    """Un passage : confie à la passerelle la suite de chaque campagne en cours."""
    if not await db.sms_campaigns.count_documents({"status": "en_cours"}):
        return 0
    ok, why = smsgate.sending_window_open()
    if not ok:
        return 0
    cfg = await smsgate.gateway_config()
    if not smsgate.is_configured(cfg):
        return 0
    budget = cfg["daily_cap"] - await _sent_today()
    total = 0
    campaigns = await db.sms_campaigns.find({"status": "en_cours"}, {"_id": 0}).sort("created_at", 1).to_list(20)
    for campaign in campaigns:
        if budget <= 0:
            break
        if not await _take_lease(campaign["id"]):
            continue
        recips = campaign.get("recipients") or []
        idx = campaign.get("next_index", 0)
        done, stop_pass = 0, False
        try:
            optouts = {o["phone"] for o in await db.sms_optouts.find({}, {"_id": 0, "phone": 1}).to_list(100000)}
            while idx < len(recips) and done < min(LOT_MAX, budget):
                current = await db.sms_campaigns.find_one({"id": campaign["id"]}, {"_id": 0, "status": 1})
                if not current or current.get("status") != "en_cours":
                    break
                r = recips[idx]
                if r["phone"] in optouts:  # STOP reçu après la création de la campagne
                    idx += 1
                    continue
                msg_id = uuid.uuid4().hex
                text = render_text(cfg, campaign["body"], r.get("prenom", ""))
                log = {"id": msg_id, "gateway_id": msg_id, "provider": "smsgate", "category": "campagne",
                       "campaign_id": campaign["id"], "lead_id": r["lead_id"], "to": r["phone"], "content": text,
                       "created_at": now_iso(), "updated_at": now_iso()}
                try:
                    res = await smsgate.send(cfg, msg_id, r["phone"], text)
                    log["gateway_id"] = res.get("id") or msg_id
                    log["status"] = "pending"
                except smsgate.GatewayError as e:
                    if e.retryable:
                        logger.warning(f"Campagne SMS {campaign['id']} : {e} — reprise au prochain passage")
                        stop_pass = True
                        break
                    log.update(status="failed", error=str(e))
                await db.sms_logs.insert_one(log)
                idx += 1
                done += 1
                await db.sms_campaigns.update_one({"id": campaign["id"]}, {"$set": {"next_index": idx, "updated_at": now_iso()}})
            update = {"lease_until": None, "updated_at": now_iso()}
            if idx >= len(recips):
                update.update({"status": "terminee", "finished_at": now_iso()})
            await db.sms_campaigns.update_one({"id": campaign["id"], "status": "en_cours"}, {"$set": update})
            await db.sms_campaigns.update_one({"id": campaign["id"]}, {"$set": {"lease_until": None}})
        except Exception as e:
            logger.warning(f"Campagne SMS {campaign['id']} : passage interrompu ({e})")
        total += done
        budget -= done
        if stop_pass:
            break
    return total


# ── Statuts (webhook + interrogation) et STOP ──────────────────────────────

async def apply_state(msg_id: str, state: Optional[str], error: Optional[str] = None) -> bool:
    new = STATE_MAP.get(state or "")
    if not new:
        return False
    log = await db.sms_logs.find_one({"gateway_id": msg_id, "provider": "smsgate"}, {"_id": 0, "id": 1, "status": 1})
    if not log or RANK.get(new, 0) <= RANK.get(log.get("status"), 0):
        return False
    update = {"status": new, "updated_at": now_iso()}
    if new == "failed":
        update["error"] = error or "Échec"
    if new == "delivered":
        update["delivered_at"] = now_iso()
    await db.sms_logs.update_one({"id": log["id"]}, {"$set": update})
    return True


async def poll_statuses() -> int:
    """Filet de sécurité si les webhooks n'arrivent pas : interroge la passerelle
    pour les SMS des dernières 48 h encore en attente ou envoyés sans accusé."""
    cfg = await smsgate.gateway_config()
    if not smsgate.is_configured(cfg):
        return 0
    since = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    logs = await db.sms_logs.find(
        {"provider": "smsgate", "status": {"$in": ["pending", "sent"]}, "created_at": {"$gte": since}},
        {"_id": 0, "gateway_id": 1}).sort("updated_at", 1).to_list(40)
    changed = 0
    for l in logs:
        try:
            state, err = smsgate.extract_state(await smsgate.status(cfg, l["gateway_id"]))
        except smsgate.GatewayError as e:
            if e.status is None or e.status == 401:
                break
            continue
        if await apply_state(l["gateway_id"], state, err):
            changed += 1
        else:
            await db.sms_logs.update_one({"gateway_id": l["gateway_id"]}, {"$set": {"updated_at": now_iso()}})
    return changed


async def handle_inbound(sender: str, message: str) -> bool:
    """Réponse STOP → numéro exclu de toutes les campagnes suivantes."""
    if not STOP_RE.match(message or ""):
        return False
    phone = normalize_phone_fr(sender or "")
    if not phone:
        return False
    if not await db.sms_optouts.find_one({"phone": phone}, {"_id": 0}):
        await db.sms_optouts.insert_one({"phone": phone, "message": (message or "")[:160], "created_at": now_iso()})
        logger.info(f"SMS STOP reçu de {phone} : exclu des campagnes")
    return True
