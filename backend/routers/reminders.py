from fastapi import APIRouter, Depends

from core.security import require_role
from services.staff_notify import (
    send_pending_callback_reminders, send_daily_pending_dossiers_digest, send_document_reminders,
    send_weekly_admin_report, send_session_reminders, send_appointment_reminders, send_formateur_dossier_reminders,
)

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


@router.post("/weekly-report/run")
async def run_weekly_admin_report(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel du compte-rendu hebdomadaire admin (test, ou cron
    externe) — la boucle de fond (voir server.py) l'envoie automatiquement les
    samedis 18h et lundis 8h."""
    notified = await send_weekly_admin_report()
    return {"notified": notified}


@router.post("/sessions/run")
async def run_session_reminders(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel des rappels de session (test, ou cron externe) —
    la boucle de fond (voir server.py) les envoie automatiquement chaque
    jour, pour les sessions démarrant dans 3 jours."""
    notified = await send_session_reminders()
    return {"notified": notified}


@router.post("/appointments/run")
async def run_appointment_reminders(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel des rappels de rendez-vous (test, ou cron
    externe) — la boucle de fond (voir server.py) les envoie automatiquement
    chaque jour, pour les rendez-vous du lendemain."""
    notified = await send_appointment_reminders()
    return {"notified": notified}


@router.post("/formateur-dossiers/run")
async def run_formateur_dossier_reminders(user: dict = Depends(require_role("admin"))):
    """Déclenchement manuel des rappels dossier formateur (test, ou cron
    externe) — la boucle de fond (voir server.py) les envoie automatiquement
    toutes les 6h."""
    notified = await send_formateur_dossier_reminders()
    return {"notified": notified}
