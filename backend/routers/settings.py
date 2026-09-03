import os
from fastapi import APIRouter, Depends, UploadFile, File

from core.database import db
from core.security import require_role
from core.storage import put_object
from core.utils import now_iso
from core.config import EMERGENT_LLM_KEY, OLLAMA_API_KEY, APP_NAME
from models.settings import SettingsIn
from services.trello import TrelloService

router = APIRouter(tags=["settings"])


@router.get("/settings")
async def get_settings(user: dict = Depends(require_role("admin"))):
    return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {"id": "global"}


@router.put("/settings")
async def update_settings(payload: SettingsIn, user: dict = Depends(require_role("admin"))):
    # Ne met à jour que les champs explicitement envoyés (voir SettingsIn) —
    # un appel partiel ne doit jamais réinitialiser le reste de la config.
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.settings.update_one({"id": "global"}, {"$set": update}, upsert=True)
    return await db.settings.find_one({"id": "global"}, {"_id": 0})


@router.post("/settings/attestation-cachet")
async def upload_attestation_cachet(file: UploadFile = File(...), user: dict = Depends(require_role("admin"))):
    """Cachet/tampon du centre, apposé par défaut sur les attestations de
    stage de récupération de points (case "Signature du directeur") — voir
    services/pdf.py:generate_stage_recup_points_attestation."""
    data = await file.read()
    result = await put_object(f"{APP_NAME}/settings/attestation_cachet.png", data, file.content_type or "image/png")
    await db.settings.update_one(
        {"id": "global"}, {"$set": {"attestation_cachet_path": result["path"], "updated_at": now_iso()}}, upsert=True
    )
    return {"ok": True}


@router.post("/settings/attestation-psychologue-signature")
async def upload_attestation_psychologue_signature(file: UploadFile = File(...), user: dict = Depends(require_role("admin"))):
    """Signature par défaut du psychologue (deuxième profil requis par la
    réglementation pour ce type de stage) — cette personne n'a pas
    forcément de compte sur le dashboard, donc pas de mécanisme
    d'auto-upload équivalent à /me/signature pour les animateurs."""
    data = await file.read()
    result = await put_object(f"{APP_NAME}/settings/attestation_psychologue_signature.png", data, file.content_type or "image/png")
    await db.settings.update_one(
        {"id": "global"}, {"$set": {"attestation_psychologue_signature_path": result["path"], "updated_at": now_iso()}}, upsert=True
    )
    return {"ok": True}


@router.get("/integrations/status")
async def integrations_status(user: dict = Depends(require_role("admin", "employe"))):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    trello = await TrelloService.get_board_info()
    email_provider = s.get("email_provider", "mock")
    if email_provider == "smtp":
        email_configured = bool(s.get("smtp_host") and s.get("smtp_user") and s.get("smtp_password"))
    elif email_provider == "mock":
        email_configured = True
    else:
        email_configured = bool(s.get("email_api_key"))
    return {
        "trello": trello,
        "stripe": {"configured": bool(s.get("stripe_secret_key"))},
        "email": {"provider": email_provider, "configured": email_configured},
        "n8n": {
            "inscription": bool(s.get("n8n_webhook_inscription")),
            "dossier": bool(s.get("n8n_webhook_dossier")),
            "payment": bool(s.get("n8n_webhook_payment")),
        },
        "ai": {"configured": bool(OLLAMA_API_KEY)},
        "storage": {"configured": bool(EMERGENT_LLM_KEY)},
    }
