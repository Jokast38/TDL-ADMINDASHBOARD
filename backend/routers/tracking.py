from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import Response, RedirectResponse

from core.database import db
from core.utils import now_iso
from core.security import require_role
from core.config import ROLES_LEADS

router = APIRouter(prefix="/track", tags=["tracking"])

# GIF transparent 1x1 — le plus petit possible, servi par le pixel de tracking.
_PIXEL = bytes.fromhex(
    "47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b"
)


@router.get("/open/{log_id}.gif")
async def track_open(log_id: str):
    """Chargée par le client mail quand l'email est ouvert (voir
    services.email._with_tracking_pixel). Répond toujours par le pixel, même
    si le log est introuvable, pour ne jamais casser l'affichage de l'email."""
    now = now_iso()
    # opened_at garde la date de la 1re ouverture ; last_opened_at la plus récente.
    await db.email_logs.update_one({"id": log_id, "opened": {"$ne": True}}, {"$set": {"opened_at": now}})
    await db.email_logs.update_one(
        {"id": log_id},
        {"$set": {"opened": True, "last_opened_at": now}, "$inc": {"open_count": 1}},
    )
    return Response(content=_PIXEL, media_type="image/gif", headers={"Cache-Control": "no-store"})


@router.get("/click/{log_id}")
async def track_click(log_id: str, url: str):
    """Redirige vers le lien réel après avoir compté le clic (voir
    services.email._with_click_tracking). Redirige toujours vers `url`, même
    si le log est introuvable, pour ne jamais casser le lien pour le lecteur."""
    now = now_iso()
    await db.email_logs.update_one({"id": log_id, "clicked": {"$ne": True}}, {"$set": {"clicked_at": now}})
    await db.email_logs.update_one(
        {"id": log_id},
        {"$set": {"clicked": True, "last_clicked_at": now}, "$inc": {"click_count": 1}},
    )
    return RedirectResponse(url, status_code=302)


@router.get("/stats")
async def email_stats(days: int = 30, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Statistiques agrégées d'ouverture/clic sur les emails envoyés, pour le
    nouvel onglet Statistiques emails."""
    since = datetime.now(timezone.utc).timestamp() - days * 86400
    since_iso = datetime.fromtimestamp(since, tz=timezone.utc).isoformat()

    match = {"created_at": {"$gte": since_iso}}
    total = await db.email_logs.count_documents(match)
    sent = await db.email_logs.count_documents({**match, "status": {"$in": ["sent", "mocked"]}})
    opened = await db.email_logs.count_documents({**match, "opened": True})
    clicked = await db.email_logs.count_documents({**match, "clicked": True})
    failed = await db.email_logs.count_documents({**match, "status": {"$nin": ["sent", "mocked", "queued"]}})

    by_subject = await db.email_logs.aggregate([
        {"$match": match},
        {"$group": {
            "_id": "$subject",
            "sent": {"$sum": {"$cond": [{"$in": ["$status", ["sent", "mocked"]]}, 1, 0]}},
            "opened": {"$sum": {"$cond": ["$opened", 1, 0]}},
            "clicked": {"$sum": {"$cond": ["$clicked", 1, 0]}},
        }},
        {"$sort": {"sent": -1}},
        {"$limit": 15},
    ]).to_list(15)

    by_day = await db.email_logs.aggregate([
        {"$match": match},
        {"$group": {
            "_id": {"$substrCP": ["$created_at", 0, 10]},
            "sent": {"$sum": {"$cond": [{"$in": ["$status", ["sent", "mocked"]]}, 1, 0]}},
            "opened": {"$sum": {"$cond": ["$opened", 1, 0]}},
            "clicked": {"$sum": {"$cond": ["$clicked", 1, 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]).to_list(days + 1)

    recent = await db.email_logs.find(match, {"_id": 0, "body": 0}).sort("created_at", -1).to_list(50)

    return {
        "total": total, "sent": sent, "opened": opened, "clicked": clicked, "failed": failed,
        "open_rate": round(opened / sent * 100, 1) if sent else 0,
        "click_rate": round(clicked / sent * 100, 1) if sent else 0,
        "by_subject": [
            {"subject": x["_id"] or "(sans objet)", "sent": x["sent"], "opened": x["opened"], "clicked": x["clicked"]}
            for x in by_subject
        ],
        "by_day": [{"day": x["_id"], "sent": x["sent"], "opened": x["opened"], "clicked": x["clicked"]} for x in by_day],
        "recent": recent,
    }
