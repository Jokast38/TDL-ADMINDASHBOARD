"""Page de test, admin uniquement — vérifie l'intégration Meta "Prospects
qualifiés" (services/meta_crm_events.py) avant de la brancher sur de vrais
changements de qualification. Voir frontend/src/pages/MetaCrmTest.jsx."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from core.security import require_role
from core.database import db
from services import meta_crm_events

router = APIRouter(prefix="/meta-crm-test", tags=["meta-crm-test"])


class CrmTestEventIn(BaseModel):
    event_name: str = "Lead"
    meta_lead_id: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


@router.get("/status")
async def crm_status(user: dict = Depends(require_role("admin"))):
    return {"configured": meta_crm_events.configured()}


@router.post("/send")
async def send_test_event(payload: CrmTestEventIn, user: dict = Depends(require_role("admin"))):
    return await meta_crm_events.send_crm_lead_event(
        payload.event_name, payload.meta_lead_id, payload.email, payload.phone,
    )


@router.get("/log")
async def crm_log(user: dict = Depends(require_role("admin"))):
    return await db.meta_crm_events_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
