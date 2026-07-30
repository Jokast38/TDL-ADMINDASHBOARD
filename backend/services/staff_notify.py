from typing import Iterable, Optional

from core.database import db
from services.email import send_email
from services.push import send_push_to_users

CONTACT_EMAIL = "contact@tdl-formation.fr"

CATEGORY_LABELS = {
    "CACES": "CACES", "PERMIS": "Récupération de points", "AUTO_ECOLE": "Auto-école",
    "SSIAP": "SSIAP", "VTC_TAXI": "VTC / Taxi", "ECSR": "ECSR", "VENTE": "Conseiller de Vente",
}


async def _assigned_staff(category: Optional[str], roles: Iterable[str]) -> list:
    query = {"active": True, "role": {"$in": list(roles)}}
    if category:
        query["assigned_categories"] = category
    else:
        query["assigned_categories"] = {"$exists": True, "$ne": []}
    return await db.users.find(query, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(100)


async def notify_new_contact(
    category: Optional[str], roles: Iterable[str],
    email_subject: str, email_body_html: str,
    push_title: str, push_body: str, push_url: str = "/admin/leads",
) -> None:
    """Route un nouveau lead/demande de rappel vers le personnel assigné à cette
    catégorie de formation (email + push). Si personne n'est assigné à cette
    catégorie (ou catégorie inconnue), on retombe sur l'email de contact
    générique — comportement historique conservé, aucun lead perdu."""
    staff = await _assigned_staff(category, roles)
    if not staff:
        await send_email(CONTACT_EMAIL, email_subject, email_body_html)
        return
    for member in staff:
        if member.get("email"):
            await send_email(member["email"], email_subject, email_body_html)
    await send_push_to_users([m["id"] for m in staff], push_title, push_body, push_url)
