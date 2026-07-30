import uuid
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import ROLES_DOSSIERS_MGMT
from models.callback import CallbackRequestIn, CallbackRequestUpdate
from services.staff_notify import notify_new_contact, CATEGORY_LABELS

router = APIRouter(prefix="/callback-requests", tags=["callback-requests"])

# Déduction de la catégorie de formation à partir du "source" de la landing
# page, pour les cas où celle-ci ne l'a pas déjà précisée explicitement dans
# `interest` (voir CallbackRequestIn.interest).
_SOURCE_TO_CATEGORY = {
    "offre_fidelite": "PERMIS",
    "offre_fidelite_189": "PERMIS",
    "meta_stage_recuperation_points_240": "PERMIS",
    "meta_formation_ssiap": "SSIAP",
    "meta_formation_taxi": "VTC_TAXI",
}

# Rappel/contact : concerne aussi bien un commercial (nouvelle vente) qu'un
# chargé d'admission (question sur un dossier/financement) — les deux profils
# sont notifiés, chacun uniquement si sa catégorie assignée correspond.
_NOTIFY_ROLES = ("responsable_admission", "agent_admin", "commercial", "responsable_commercial")


@router.post("")
async def create_callback_request(payload: CallbackRequestIn):
    """Formulaire public (landing page 'offre fidélité' ou formulaire de
    contact du site) : demande de rappel, sans inscription formelle. Notifie
    le personnel assigné à la catégorie concernée (email + push), avec repli
    sur l'email de contact générique si personne n'est assigné, et rend
    l'entrée visible dans la page Inscriptions du dashboard."""
    category = payload.interest or _SOURCE_TO_CATEGORY.get(payload.source or "")
    doc = {
        "id": str(uuid.uuid4()),
        "prenom": payload.prenom, "nom": payload.nom,
        "telephone": payload.telephone, "email": payload.email or "",
        "message": payload.message or "", "session": payload.session or "",
        "source": payload.source or "offre_fidelite", "interest": category,
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
    if category:
        lines.append(f"<p>Intérêt : <b>{CATEGORY_LABELS.get(category, category)}</b></p>")
    if payload.session:
        lines.append(f"<p>Session souhaitée : <b>{payload.session}</b></p>")
    if payload.message:
        lines.append(f"<p>Message :<br>{payload.message}</p>")

    await notify_new_contact(
        category=category, roles=_NOTIFY_ROLES,
        email_subject=subject, email_body_html="".join(lines),
        push_title="Nouvelle demande de rappel",
        push_body=f"{payload.prenom} {payload.nom} — {CATEGORY_LABELS.get(category, 'formation non précisée')}",
        push_url="/admin/inscriptions",
    )

    doc.pop("_id", None)
    return {"ok": True}


@router.get("")
async def list_callback_requests(user: dict = Depends(require_role(*(ROLES_DOSSIERS_MGMT + _NOTIFY_ROLES)))):
    query = {}
    assigned = user.get("assigned_categories") or []
    if user["role"] in ("commercial", "responsable_commercial", "responsable_admission", "agent_admin") and assigned:
        query["$or"] = [{"interest": {"$in": assigned}}, {"interest": None}, {"interest": {"$exists": False}}]
    return await db.callback_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.put("/{cid}")
async def update_callback_request(cid: str, payload: CallbackRequestUpdate, user: dict = Depends(require_role(*(ROLES_DOSSIERS_MGMT + _NOTIFY_ROLES)))):
    existing = await db.callback_requests.find_one({"id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    if update.get("handled"):
        update["handled_by"] = user["id"]
    update["updated_at"] = now_iso()
    await db.callback_requests.update_one({"id": cid}, {"$set": update})
    return await db.callback_requests.find_one({"id": cid}, {"_id": 0})


@router.delete("/{cid}")
async def delete_callback_request(cid: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    await db.callback_requests.delete_one({"id": cid})
    return {"ok": True}
