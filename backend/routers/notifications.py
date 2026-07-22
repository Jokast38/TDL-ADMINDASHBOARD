from fastapi import APIRouter, Depends

from core.database import db
from core.security import require_role

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Admin, commerciaux et équipe admission/dossiers — tout le monde concerné par
# les demandes de rappel ou les leads à relancer par téléphone.
ROLES_NOTIFICATIONS = ("admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial")

LEADS_A_APPELER_QUERY = {
    "contacted": {"$ne": True},
    "phone": {"$nin": [None, ""]},
    "$or": [{"email": None}, {"email": ""}, {"email": {"$exists": False}}],
}


@router.get("/summary")
async def notifications_summary(user: dict = Depends(require_role(*ROLES_NOTIFICATIONS))):
    """Compteurs de rappel affichés dans la cloche de notification du dashboard :
    remontent tant que les éléments concernés ne sont pas traités (pas de
    dismiss permanent — le compteur ne baisse que quand on traite réellement)."""
    callback_pending = await db.callback_requests.count_documents({"handled": {"$ne": True}})
    leads_a_appeler = await db.leads.count_documents(LEADS_A_APPELER_QUERY)
    return {
        "callback_pending": callback_pending,
        "leads_a_appeler": leads_a_appeler,
        "total": callback_pending + leads_a_appeler,
    }
