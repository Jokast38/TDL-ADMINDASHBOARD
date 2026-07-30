from fastapi import APIRouter, Depends

from core.security import require_role
from services.staff_notify import send_pending_callback_reminders

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("/callbacks/run")
async def run_callback_reminders(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel (test, ou cron externe si le service dort entre
    deux requêtes sur le plan gratuit Render) — la boucle de fond (voir
    server.py) l'appelle automatiquement toutes les 4h."""
    notified = await send_pending_callback_reminders()
    return {"notified": notified}
