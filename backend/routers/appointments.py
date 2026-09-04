import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role, get_current_user
from core.utils import now_iso
from core.config import ROLES_DOSSIERS_MGMT
from models.appointment import SlotGenerateIn, SlotUnlock4thIn, SlotBookIn
from services.email import send_email
from services.push import send_push_to_user, send_push_to_users
from services.staff_notify import notify_new_contact

router = APIRouter(prefix="/slots", tags=["appointments"])

# Capacité confirmée (section 3 du cahier des charges) : 24 personnes/jour
# réparties sur 8 heures (9h-17h) = 3 personnes/heure. La règle du "4e
# créneau" (débloqué manuellement par un admin) est gérée via
# `capacite_bonus`, jamais en dur dans `capacite`.
CAPACITE_PAR_CRENEAU = 3

FORMULES = {
    # (heures de départ des créneaux horaires, nombre de jours ouvrés à générer)
    "journee": {"hours": list(range(9, 17)), "business_days": 5},   # 9h-17h, 1 semaine
    "soiree": {"hours": [18, 19, 20], "business_days": 10},          # 18h-21h, 2 semaines
}


def _business_days(start_date: datetime, count: int) -> list:
    days = []
    d = start_date
    while len(days) < count:
        if d.weekday() < 5:  # lundi=0 ... vendredi=4
            days.append(d)
        d += timedelta(days=1)
    return days


@router.post("/generate")
async def generate_slots(payload: SlotGenerateIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Génère les créneaux RDV pour une formule (section 2.2) : "journee"
    (9h-17h, 1 semaine) ou "soiree" (18h-21h, 2 semaines), 3 places/créneau.
    Idempotent : un créneau déjà généré (même type/date/heure/département)
    n'est jamais dupliqué."""
    if payload.formule not in FORMULES:
        raise HTTPException(status_code=400, detail="Formule invalide (journee ou soiree)")
    try:
        start = datetime.strptime(payload.start_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date invalide (format attendu: YYYY-MM-DD)")

    conf = FORMULES[payload.formule]
    created = 0
    for day in _business_days(start, conf["business_days"]):
        date_str = day.strftime("%Y-%m-%d")
        for h in conf["hours"]:
            existing = await db.appointment_slots.find_one({
                "type": payload.type, "date": date_str, "heure_debut": f"{h:02d}:00",
                "department": payload.department,
            })
            if existing:
                continue
            slot = {
                "id": str(uuid.uuid4()), "type": payload.type, "date": date_str,
                "heure_debut": f"{h:02d}:00", "heure_fin": f"{h + 1:02d}:00",
                "department": payload.department,
                "capacite": CAPACITE_PAR_CRENEAU, "capacite_bonus": 0,
                "bookings": [], "created_at": now_iso(),
            }
            await db.appointment_slots.insert_one(slot)
            created += 1
    return {"created": created}


def _serialize(slot: dict) -> dict:
    slot.pop("_id", None)
    total = slot.get("capacite", CAPACITE_PAR_CRENEAU) + slot.get("capacite_bonus", 0)
    slot["places_disponibles"] = max(0, total - len(slot.get("bookings", [])))
    slot["places_totales"] = total
    return slot


@router.get("")
async def list_slots(
    type: str = None, date_from: str = None, date_to: str = None, department: str = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if type: q["type"] = type
    if department: q["department"] = department
    if date_from or date_to:
        q["date"] = {}
        if date_from: q["date"]["$gte"] = date_from
        if date_to: q["date"]["$lte"] = date_to
    slots = await db.appointment_slots.find(q, {"_id": 0}).sort([("date", 1), ("heure_debut", 1)]).to_list(2000)
    return [_serialize(s) for s in slots]


@router.post("/{slot_id}/book")
async def book_slot(slot_id: str, payload: SlotBookIn, user: dict = Depends(get_current_user)):
    """Réserve une place sur un créneau — verrouillage atomique côté base
    (aucune place n'est accordée deux fois même en cas de requêtes
    simultanées, section 3 "accès unique")."""
    dossier = await db.dossiers.find_one({"id": payload.dossier_id, "student_id": user["id"]}, {"_id": 0})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier introuvable")

    slot = await db.appointment_slots.find_one({"id": slot_id})
    if not slot:
        raise HTTPException(status_code=404, detail="Créneau introuvable")
    if any(b["student_id"] == user["id"] for b in slot.get("bookings", [])):
        raise HTTPException(status_code=400, detail="Vous avez déjà réservé ce créneau")

    total = slot.get("capacite", CAPACITE_PAR_CRENEAU) + slot.get("capacite_bonus", 0)
    booking = {
        "student_id": user["id"], "dossier_id": payload.dossier_id,
        "student_name": dossier.get("student_name"), "booked_at": now_iso(),
    }
    # Condition sur la taille du tableau au moment du update — si deux
    # requêtes arrivent en même temps sur la dernière place, une seule
    # passera cette condition côté MongoDB.
    result = await db.appointment_slots.update_one(
        {"id": slot_id, f"bookings.{total - 1}": {"$exists": False}},
        {"$push": {"bookings": booking}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Ce créneau est complet")

    if user.get("email"):
        await send_email(
            user["email"],
            f"Rendez-vous confirmé — {slot['date']} à {slot['heure_debut']}",
            (
                f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                f"<p>Votre rendez-vous est confirmé pour le <b>{slot['date']}</b> à <b>{slot['heure_debut']}</b> "
                f"({slot.get('department', '')}).</p><p>TDL Formation</p>"
            ),
        )
    await send_push_to_user(user["id"], "Rendez-vous confirmé", f"{slot['date']} à {slot['heure_debut']}", "/espace-etudiant")
    await notify_new_contact(
        category=dossier.get("category"),
        roles=ROLES_DOSSIERS_MGMT,
        email_subject=f"📅 Nouveau rendez-vous réservé — {dossier.get('student_name', '')}",
        email_body_html=(
            f"<p><b>{dossier.get('student_name', '')}</b> a réservé le créneau du "
            f"<b>{slot['date']}</b> à <b>{slot['heure_debut']}</b> ({slot.get('department', '')}).</p>"
        ),
        push_title="Nouveau rendez-vous",
        push_body=f"{dossier.get('student_name', '')} — {slot['date']} {slot['heure_debut']}",
        push_url="/admin/rdv",
    )

    updated = await db.appointment_slots.find_one({"id": slot_id}, {"_id": 0})
    return _serialize(updated)


@router.delete("/{slot_id}/book")
async def cancel_booking(slot_id: str, user: dict = Depends(get_current_user)):
    result = await db.appointment_slots.update_one(
        {"id": slot_id}, {"$pull": {"bookings": {"student_id": user["id"]}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    updated = await db.appointment_slots.find_one({"id": slot_id}, {"_id": 0})
    return _serialize(updated)


@router.post("/{slot_id}/unlock-4th")
async def unlock_4th_slot(slot_id: str, payload: SlotUnlock4thIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Règle du 4e créneau (section 3, confirmée) : un admin peut débloquer
    une 4e place sur un créneau déjà complet pour un apprenant précis, qui en
    est notifié."""
    slot = await db.appointment_slots.find_one({"id": slot_id})
    if not slot:
        raise HTTPException(status_code=404, detail="Créneau introuvable")
    dossier = await db.dossiers.find_one({"id": payload.dossier_id, "student_id": payload.student_id}, {"_id": 0})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier introuvable pour cet apprenant")
    if any(b["student_id"] == payload.student_id for b in slot.get("bookings", [])):
        raise HTTPException(status_code=400, detail="Cet apprenant a déjà une place sur ce créneau")

    booking = {
        "student_id": payload.student_id, "dossier_id": payload.dossier_id,
        "student_name": dossier.get("student_name"), "booked_at": now_iso(), "via_4e_creneau": True,
    }
    await db.appointment_slots.update_one(
        {"id": slot_id},
        {"$set": {"capacite_bonus": 1}, "$push": {"bookings": booking}},
    )

    if dossier.get("student_email"):
        await send_email(
            dossier["student_email"],
            "Une place vient de se libérer pour votre créneau",
            (
                f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                f"<p>Bonne nouvelle : une place supplémentaire a été débloquée pour vous sur le "
                f"créneau du <b>{slot['date']}</b> à <b>{slot['heure_debut']}</b>.</p>"
                f"<p>TDL Formation</p>"
            ),
        )
    await send_push_to_user(payload.student_id, "Créneau débloqué", f"{slot['date']} à {slot['heure_debut']}", "/espace-etudiant")

    updated = await db.appointment_slots.find_one({"id": slot_id}, {"_id": 0})
    return _serialize(updated)


@router.delete("/{slot_id}")
async def delete_slot(slot_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    await db.appointment_slots.delete_one({"id": slot_id})
    return {"ok": True}
