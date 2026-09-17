"""Offre flash provisoire — stage de récupération de points du 21-22/09/2026,
tarif exceptionnel à 120€ (au lieu de 240€), 15 places réservées à cette
campagne (indépendant des places déjà prises sur la session au tarif normal).

Le prix n'est JAMAIS accepté depuis le client (InscriptionIn n'a pas de champ
price — voir routers/inscriptions.py) : il est toujours fixé ici, côté
serveur, à partir des seules constantes ci-dessous, pour qu'aucune requête
trafiquée ne puisse obtenir le tarif promo sur une autre formation/session.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS
from models.inscription import InscriptionIn
from routers.inscriptions import create_inscription
from services import mailbox
from services.email_template import render_branded_email

router = APIRouter(prefix="/flash-offer", tags=["flash-offer"])
log = logging.getLogger(__name__)

FLASH_FORMATION_ID = "e22bcca0-6656-4335-b6a6-8a06235a2770"
FLASH_STAGE_ID = "e5afe3bb-4e0e-4065-afa3-68a00fe80044"
FLASH_SOURCE = "flash_recup_points_sept2026"
FLASH_CAP = 15
FLASH_PRICE = 120.0
FLASH_FORMATION_TITLE = "Stage Récupération de points — Offre flash -50%"


async def _flash_sold_count() -> int:
    return await db.inscriptions.count_documents({
        "stage_id": FLASH_STAGE_ID, "source": FLASH_SOURCE, "status": "active",
    })


@router.get("/status")
async def flash_status():
    sold = await _flash_sold_count()
    remaining = max(0, FLASH_CAP - sold)
    return {"remaining": remaining, "cap": FLASH_CAP, "sold_out": remaining <= 0}


@router.post("/inscription")
async def flash_inscription(payload: InscriptionIn, request: Request):
    if payload.formation_id != FLASH_FORMATION_ID or payload.stage_id != FLASH_STAGE_ID:
        raise HTTPException(status_code=400, detail="Offre invalide")

    sold = await _flash_sold_count()
    if sold >= FLASH_CAP:
        raise HTTPException(status_code=409, detail="Cette offre flash est complète.")

    payload.source = FLASH_SOURCE
    result = await create_inscription(payload, request)
    insc_id = result["inscription"]["id"]

    # Recompte après insertion pour couper la fenêtre de course entre deux
    # réservations quasi simultanées sur la dernière place — si le cap est
    # dépassé, on annule celle-ci plutôt que d'ouvrir une 16e place.
    if await _flash_sold_count() > FLASH_CAP:
        await db.inscriptions.update_one({"id": insc_id}, {"$set": {"status": "annule"}})
        await db.dossiers.delete_one({"inscription_id": insc_id})
        raise HTTPException(status_code=409, detail="Cette offre flash vient de passer complète, désolé.")

    await db.inscriptions.update_one(
        {"id": insc_id},
        {"$set": {"price": FLASH_PRICE, "formation_title": FLASH_FORMATION_TITLE}},
    )
    updated = await db.inscriptions.find_one({"id": insc_id}, {"_id": 0})
    return {"inscription": updated}


# ── Campagne email (envoi via la messagerie interne o2switch, pas Brevo, pour
#    éviter la limite d'envoi du fournisseur principal) ───────────────────────

LANDING_URL = "https://www.tdl-formation.fr/offre-flash-points"
CAMPAIGN_SUBJECT = "⚡ Offre flash -50% : 120€ au lieu de 240€ — Stage récupération de points"


def _campaign_body(name: str) -> str:
    first_name = (name or "").split(" ")[0].strip() or "Bonjour"
    return (
        f"{first_name},\n\n"
        "Une place s'est libérée pour notre prochaine session de récupération de points, "
        "les 21 et 22 septembre 2026 à Épinay-sur-Seine (93).\n\n"
        "Pour l'occasion, nous ouvrons 15 places à un tarif exceptionnel : 120€ au lieu de 240€, "
        "soit -50% — valable uniquement pour cette session et dans la limite des places disponibles.\n\n"
        "Jusqu'à 4 points récupérés en 2 jours, sans examen, dans notre centre agréé.\n\n"
        "Les places partent vite : réservez la vôtre dès maintenant, le paiement se fait en ligne "
        "en quelques minutes et votre place est confirmée immédiatement.\n\n"
        "TDL Formation"
    )


async def _send_campaign_email(to_email: str, to_name: str = "") -> dict:
    body_html = render_branded_email(
        _campaign_body(to_name),
        button_label="Je réserve ma place à 120€",
        button_url=LANDING_URL,
    )
    return await mailbox.send_and_save(to_email, CAMPAIGN_SUBJECT, body_html)


class CampaignTestIn(BaseModel):
    email: EmailStr
    name: str = ""


@router.post("/campaign/test")
async def campaign_test(payload: CampaignTestIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    if not mailbox.mailbox_configured():
        raise HTTPException(status_code=503, detail="Messagerie interne non configurée")
    await _send_campaign_email(payload.email, payload.name)
    return {"status": "sent", "to": payload.email}


@router.get("/campaign/targets")
async def campaign_targets(user: dict = Depends(require_role(*ROLES_LEADS))):
    """Prévisualise le nombre de destinataires : anciens leads (avec email)
    n'ayant jamais eu d'inscription, à l'exclusion des personnes déjà
    inscrites (nouvellement ou non)."""
    inscribed_emails = set(await db.inscriptions.distinct("student_email"))
    leads = await db.leads.find({"email": {"$ne": None, "$exists": True}}, {"_id": 0, "email": 1}).to_list(100000)
    count = sum(1 for l in leads if l.get("email") and l["email"].strip().lower() not in inscribed_emails)
    return {"targets": count}


@router.post("/campaign/send")
async def campaign_send(user: dict = Depends(require_role(*ROLES_LEADS))):
    if not mailbox.mailbox_configured():
        raise HTTPException(status_code=503, detail="Messagerie interne non configurée")

    inscribed_emails = set(await db.inscriptions.distinct("student_email"))
    leads = await db.leads.find({"email": {"$ne": None, "$exists": True}}, {"_id": 0}).to_list(100000)

    sent, failed, skipped = 0, 0, 0
    for lead in leads:
        email = (lead.get("email") or "").strip().lower()
        if not email or email in inscribed_emails:
            skipped += 1
            continue
        try:
            await _send_campaign_email(email, lead.get("name", ""))
            sent += 1
        except Exception as e:
            failed += 1
            log.warning(f"Campagne offre flash : échec d'envoi à {email} : {e}")

    return {"sent": sent, "failed": failed, "skipped": skipped, "total_leads": len(leads)}
