from fastapi import APIRouter, Depends

from core.database import db
from core.security import require_role
from core.config import ROLES_ALL_STAFF, VAPID_PUBLIC_KEY
from core.utils import now_iso
from models.push import PushSubscribeIn, PushUnsubscribeIn

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key")
async def vapid_public_key(user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    return {"key": VAPID_PUBLIC_KEY}


@router.post("/subscribe")
async def subscribe(payload: PushSubscribeIn, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    endpoint = payload.subscription.get("endpoint")
    if not endpoint:
        return {"ok": False}
    await db.push_subscriptions.update_one(
        {"endpoint": endpoint},
        {"$set": {
            "endpoint": endpoint, "user_id": user["id"], "subscription": payload.subscription,
            "created_at": now_iso(),
        }},
        upsert=True,
    )
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(payload: PushUnsubscribeIn, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    await db.push_subscriptions.delete_one({"endpoint": payload.endpoint, "user_id": user["id"]})
    return {"ok": True}
