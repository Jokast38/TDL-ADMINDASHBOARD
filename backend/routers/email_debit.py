"""Débit d'envoi des emails et file des campagnes (demande du 2026-11-12) —
écran Paramètres → Email → « Débit d'envoi ». Règles : services/email_rate.py
et services/email_campaigns.py."""
from fastapi import APIRouter, Depends, HTTPException

from core.config import ROLES_LEADS
from core.database import db
from core.security import require_role
from core.utils import now_iso
from services import email_rate
from services.email_campaigns import public

router = APIRouter(prefix="/email", tags=["email-debit"])


@router.get("/debit")
async def email_debit(user: dict = Depends(require_role(*ROLES_LEADS))):
    stats = await email_rate.stats()
    campaigns = await db.email_campaigns.find({}, {"_id": 0, "lead_ids": 0, "body": 0}).sort("created_at", -1).to_list(15)
    stats["campagnes"] = [public(c) for c in campaigns]
    stats["quota_marketing_restant"] = max(stats["marketing_par_heure"] - stats["derniere_heure_marketing"], 0)
    return stats


@router.get("/campagnes/{campaign_id}")
async def get_campaign(campaign_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    c = await db.email_campaigns.find_one({"id": campaign_id}, {"_id": 0, "lead_ids": 0, "body": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    return public(c)


_TRANSITIONS = {"pause": ("en_cours", "en_pause"), "reprendre": ("en_pause", "en_cours"), "annuler": (None, "annulee")}


@router.post("/campagnes/{campaign_id}/{action}")
async def change_campaign(campaign_id: str, action: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    if action not in _TRANSITIONS:
        raise HTTPException(status_code=404, detail="Action inconnue")
    c = await db.email_campaigns.find_one({"id": campaign_id}, {"_id": 0, "status": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    before, after = _TRANSITIONS[action]
    if (before and c["status"] != before) or c["status"] in ("terminee", "annulee"):
        raise HTTPException(status_code=400, detail="Action impossible dans l'état actuel de la campagne")
    await db.email_campaigns.update_one({"id": campaign_id}, {"$set": {
        "status": after, "updated_at": now_iso(), f"{action}_by": user.get("name")}})
    return await get_campaign(campaign_id, user)
