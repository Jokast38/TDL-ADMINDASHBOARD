"""File d'attente des campagnes email (demande du 2026-11-12).

Avant : une campagne « par intérêt » était envoyée depuis le navigateur,
email par email, tant que l'onglet restait ouvert ; l'Offre flash partait
d'un bloc, sans plafond. Maintenant une campagne est enregistrée
(`db.email_campaigns`) puis envoyée en tâche de fond, toutes les 2 minutes,
dans la limite du plafond horaire du marketing (services/email_rate.py,
partagé avec les relances automatiques). Elle reprend après un redémarrage
(position `next_index` enregistrée après chaque email) et n'est traitée que
par un serveur à la fois (bail `lease_until`).

Types : « broadcast » (prospects filtrés par intérêt, message libre) et
« flash » (Offre flash, envoyée depuis la boîte de la Messagerie)."""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from core.database import db
from core.utils import now_iso
from services.email_rate import MARKETING, marketing_quota_remaining

logger = logging.getLogger(__name__)

STATUTS = {"en_cours": "En cours", "en_pause": "En pause", "terminee": "Terminée", "annulee": "Annulée"}
LOT_MAX = 60          # emails au plus par passage et par campagne
BAIL_MINUTES = 10


async def create_campaign(kind: str, subject: str, body: str, lead_ids: List[str], user: dict,
                          mark_contacted: bool = True, add_tag: Optional[str] = None, label: Optional[str] = None) -> dict:
    doc = {
        "id": str(uuid.uuid4()), "type": kind, "label": label or subject, "subject": subject, "body": body,
        "lead_ids": lead_ids, "total": len(lead_ids), "next_index": 0, "sent": 0, "failed": 0,
        "status": "en_cours", "mark_contacted": mark_contacted, "add_tag": add_tag,
        "created_by": user.get("id"), "created_by_name": user.get("name"), "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.email_campaigns.insert_one(dict(doc))
    doc.pop("lead_ids")
    return doc


def public(doc: dict) -> dict:
    d = {k: v for k, v in doc.items() if k not in ("lead_ids", "body", "_id", "lease_until")}
    d["statut_label"] = STATUTS.get(d.get("status"), d.get("status"))
    return d


async def _take_lease(campaign_id: str) -> bool:
    now = datetime.now(timezone.utc)
    res = await db.email_campaigns.update_one(
        {"id": campaign_id, "status": "en_cours",
         "$or": [{"lease_until": {"$exists": False}}, {"lease_until": None}, {"lease_until": {"$lt": now.isoformat()}}]},
        {"$set": {"lease_until": (now + timedelta(minutes=BAIL_MINUTES)).isoformat()}},
    )
    return bool(getattr(res, "modified_count", 0) or getattr(res, "matched_count", 0))


async def _send_one(campaign: dict, lead: dict) -> bool:
    body = (campaign.get("body") or "").replace("{{name}}", lead.get("name", ""))
    if campaign["type"] == "flash":
        from routers.flash_offer import send_flash_offer_email
        return await send_flash_offer_email(lead["email"], lead.get("name", ""), campaign["id"])
    from services.email import send_email
    log = await send_email(lead["email"], campaign["subject"], body,
                           extra={"lead_id": lead["id"], "campaign": True, "campaign_id": campaign["id"]}, kind=MARKETING)
    return log["status"] in ("sent", "mocked")


async def _after_sent(campaign: dict, lead: dict, user_id: Optional[str]) -> None:
    update = {"updated_at": now_iso()}
    if campaign.get("mark_contacted"):
        update.update({"contacted": True, "last_contacted_at": now_iso(), "last_contacted_by": user_id, "status": "contacte"})
    await db.leads.update_one({"id": lead["id"]}, {"$set": update})
    if campaign.get("add_tag"):
        await db.leads.update_one({"id": lead["id"]}, {"$addToSet": {"tags": campaign["add_tag"]}})


async def process_campaigns() -> int:
    """Un passage : envoie la suite de chaque campagne en cours, sans
    dépasser le plafond horaire du marketing. Renvoie le nombre d'emails partis."""
    total = 0
    campaigns = await db.email_campaigns.find({"status": "en_cours"}, {"_id": 0}).sort("created_at", 1).to_list(50)
    for campaign in campaigns:
        budget = min(await marketing_quota_remaining(), LOT_MAX)
        if budget <= 0:
            break
        if not await _take_lease(campaign["id"]):
            continue  # traitée par un autre serveur
        ids = campaign.get("lead_ids") or []
        idx, sent, failed = campaign.get("next_index", 0), campaign.get("sent", 0), campaign.get("failed", 0)
        done_this_pass = 0
        try:
            while idx < len(ids) and done_this_pass < budget:
                current = await db.email_campaigns.find_one({"id": campaign["id"]}, {"_id": 0, "status": 1})
                if not current or current.get("status") != "en_cours":
                    break  # annulée ou mise en pause entre-temps
                lead = await db.leads.find_one({"id": ids[idx]}, {"_id": 0})
                idx += 1
                if not lead or not lead.get("email"):
                    failed += 1
                else:
                    ok = False
                    try:
                        ok = await _send_one(campaign, lead)
                    except Exception as e:
                        logger.warning(f"Campagne {campaign['id']} : échec pour {lead.get('email')} ({e})")
                    if ok:
                        sent += 1
                        await _after_sent(campaign, lead, campaign.get("created_by"))
                    else:
                        failed += 1
                    done_this_pass += 1
                await db.email_campaigns.update_one({"id": campaign["id"]}, {"$set": {
                    "next_index": idx, "sent": sent, "failed": failed, "updated_at": now_iso()}})
            update = {"lease_until": None, "updated_at": now_iso()}
            if idx >= len(ids):
                update.update({"status": "terminee", "finished_at": now_iso()})
            await db.email_campaigns.update_one({"id": campaign["id"], "status": "en_cours"}, {"$set": update})
            await db.email_campaigns.update_one({"id": campaign["id"]}, {"$set": {"lease_until": None}})
        except Exception as e:
            logger.warning(f"Campagne {campaign['id']} : passage interrompu ({e})")
        total += done_this_pass
    if total:
        from routers.leads import _leads_cache_clear
        _leads_cache_clear()
    return total
