from fastapi import APIRouter, Depends

from core.security import require_role
from services.staff_notify import send_pending_callback_reminders, send_daily_pending_dossiers_digest, send_document_reminders

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("/callbacks/run")
async def run_callback_reminders(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel (test, ou cron externe si le service dort entre
    deux requêtes sur le plan gratuit Render) — la boucle de fond (voir
    server.py) l'appelle automatiquement toutes les 4h."""
    notified = await send_pending_callback_reminders()
    return {"notified": notified}


@router.post("/dossiers-digest/run")
async def run_dossiers_digest(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel du récap matinal des dossiers d'inscription en
    attente (test, ou cron externe) — la boucle de fond (voir server.py)
    l'envoie automatiquement tous les jours à 10h, plus une fois immédiatement
    au démarrage du serveur."""
    notified = await send_daily_pending_dossiers_digest()
    return {"notified": notified}


@router.post("/documents/run")
async def run_document_reminders(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel des relances documents manquants (test, ou cron
    externe) — la boucle de fond (voir server.py) les envoie toutes les 24h."""
    notified = await send_document_reminders()
    return {"notified": notified}
