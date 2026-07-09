from fastapi import APIRouter
from fastapi.responses import Response

from core.database import db
from core.utils import now_iso

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
