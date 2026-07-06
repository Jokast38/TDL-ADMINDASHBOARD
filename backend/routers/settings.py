import os
from fastapi import APIRouter, Depends

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import EMERGENT_LLM_KEY
from models.settings import SettingsIn
from services.trello import TrelloService

router = APIRouter(tags=["settings"])


@router.get("/settings")
async def get_settings(user: dict = Depends(require_role("admin"))):
    return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {"id": "global"}


@router.put("/settings")
async def update_settings(payload: SettingsIn, user: dict = Depends(require_role("admin"))):
    update = payload.model_dump()
    update["updated_at"] = now_iso()
    await db.settings.update_one({"id": "global"}, {"$set": update}, upsert=True)
    return await db.settings.find_one({"id": "global"}, {"_id": 0})


@router.get("/integrations/status")
async def integrations_status(user: dict = Depends(require_role("admin", "employe"))):
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    trello = await TrelloService.get_board_info()
    return {
        "trello": trello,
        "stripe": {"configured": bool(s.get("stripe_secret_key"))},
        "email": {
            "provider": s.get("email_provider", "mock"),
            "configured": bool(s.get("email_api_key")) if s.get("email_provider") != "mock" else True
        },
        "n8n": {
            "inscription": bool(s.get("n8n_webhook_inscription")),
            "dossier": bool(s.get("n8n_webhook_dossier")),
            "payment": bool(s.get("n8n_webhook_payment")),
        },
        "ai": {"configured": bool(EMERGENT_LLM_KEY)},
        "storage": {"configured": bool(EMERGENT_LLM_KEY)},
    }
