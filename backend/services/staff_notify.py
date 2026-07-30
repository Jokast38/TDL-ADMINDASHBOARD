from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from core.database import db
from services.email import send_email
from services.push import send_push_to_users

CONTACT_EMAIL = "contact@tdl-formation.fr"

# Rôles concernés par les demandes de rappel (mêmes que _NOTIFY_ROLES dans
# routers/callback.py — dupliqué ici pour éviter un import circulaire).
CALLBACK_NOTIFY_ROLES = ("responsable_admission", "agent_admin", "commercial", "responsable_commercial")

# Une demande toute fraîche (< 1h) ne doit pas déclencher de rappel dès le
# premier passage de la boucle — l'email de notification immédiate suffit,
# le rappel concerne les demandes qui traînent.
_MIN_AGE_FOR_REMINDER = timedelta(hours=1)

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


def _parse_iso(value: str):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def send_pending_callback_reminders() -> int:
    """Relance par email/push le personnel assigné pour chaque demande de
    rappel encore non traitée (`handled=False`) depuis plus d'1h — appelée
    toutes les 4h par la boucle de fond (voir server.py) et manuellement via
    POST /reminders/callbacks/run. Regroupe toutes les demandes en attente
    d'un même employé dans un seul email (pas un email par demande)."""
    now = datetime.now(timezone.utc)
    pending = await db.callback_requests.find({"handled": {"$ne": True}}, {"_id": 0}).to_list(2000)
    pending = [p for p in pending if (ref := _parse_iso(p.get("created_at"))) and (now - ref) >= _MIN_AGE_FOR_REMINDER]
    if not pending:
        return 0

    staff = await db.users.find(
        {"active": True, "role": {"$in": list(CALLBACK_NOTIFY_ROLES)}},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "assigned_categories": 1},
    ).to_list(200)

    notified = 0
    for member in staff:
        assigned = member.get("assigned_categories") or []
        # Sans catégorie assignée, cette personne voit déjà toutes les demandes
        # dans son dashboard (voir GET /callback-requests) — elle reçoit donc
        # un rappel sur tout ce qui est en attente, pas seulement "le sien".
        mine = pending if not assigned else [
            p for p in pending if not p.get("interest") or p["interest"] in assigned
        ]
        if not mine or not member.get("email"):
            continue

        rows = "".join(
            f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee;'>{p['prenom']} {p['nom']}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{p.get('telephone','')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{CATEGORY_LABELS.get(p.get('interest'), 'Non précisé')}</td></tr>"
            for p in mine
        )
        subject = f"⏰ {len(mine)} demande(s) de rappel toujours en attente"
        body = (
            f"<p>Bonjour {member.get('name','')},</p>"
            f"<p>Les demandes de rappel suivantes n'ont toujours pas été traitées :</p>"
            f"<table style='border-collapse:collapse;width:100%;'>"
            f"<tr><th style='text-align:left;padding:6px 10px;'>Nom</th><th style='text-align:left;padding:6px 10px;'>Téléphone</th><th style='text-align:left;padding:6px 10px;'>Intérêt</th></tr>"
            f"{rows}</table>"
            f"<p style='margin-top:16px;'>Rendez-vous sur la page Inscriptions du dashboard pour les traiter.</p>"
        )
        await send_email(member["email"], subject, body)
        await send_push_to_users(
            [member["id"]], "Demandes de rappel en attente",
            f"{len(mine)} demande(s) non traitée(s)", "/admin/inscriptions",
        )
        notified += 1
    return notified
