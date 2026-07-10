import uuid
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import ROLES_DOSSIERS_MGMT
from models.callback import CallbackRequestIn, CallbackRequestUpdate
from services.email import send_email

router = APIRouter(prefix="/callback-requests", tags=["callback-requests"])

CONTACT_EMAIL = "contact@tdl-formation.fr"


@router.post("")
async def create_callback_request(payload: CallbackRequestIn):
    """Formulaire public (landing page 'offre fidélité' ou formulaire de
    contact du site) : demande de rappel, sans inscription formelle. Notifie
    l'équipe par email et rend l'entrée visible dans la page Inscriptions du
    dashboard."""
    doc = {
        "id": str(uuid.uuid4()),
        "prenom": payload.prenom, "nom": payload.nom,
        "telephone": payload.telephone, "email": payload.email or "",
        "message": payload.message or "", "session": payload.session or "",
        "source": payload.source or "offre_fidelite",
        "handled": False, "notes": "",
        "created_at": now_iso(),
    }
    await db.callback_requests.insert_one(doc)

    is_contact_form = doc["source"] == "contact_form"
    subject = (
        f"Nouveau message de contact — {payload.prenom} {payload.nom}" if is_contact_form
        else f"Nouvelle demande de rappel — {payload.prenom} {payload.nom}"
    )
    lines = [
        f"<p>Nouveau {'message de contact' if is_contact_form else 'demande de rappel'} depuis le site :</p>",
        f"<p>Nom : <b>{payload.prenom} {payload.nom}</b><br>",
        f"Téléphone : <b>{payload.telephone}</b>",
    ]
    if payload.email:
        lines.append(f"<br>Email : <b>{payload.email}</b>")
    lines.append("</p>")
    if payload.session:
        lines.append(f"<p>Session souhaitée : <b>{payload.session}</b></p>")
    if payload.message:
        lines.append(f"<p>Message :<br>{payload.message}</p>")

    await send_email(CONTACT_EMAIL, subject, "".join(lines))

    doc.pop("_id", None)
    return {"ok": True}


@router.get("")
async def list_callback_requests(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    return await db.callback_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.put("/{cid}")
async def update_callback_request(cid: str, payload: CallbackRequestUpdate, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    existing = await db.callback_requests.find_one({"id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    update["updated_at"] = now_iso()
    await db.callback_requests.update_one({"id": cid}, {"$set": update})
    return await db.callback_requests.find_one({"id": cid}, {"_id": 0})


@router.delete("/{cid}")
async def delete_callback_request(cid: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    await db.callback_requests.delete_one({"id": cid})
    return {"ok": True}
