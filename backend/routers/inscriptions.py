import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import hash_password, get_current_user, require_role
from core.utils import now_iso
from core.config import ROLES_DOSSIERS_MGMT
from models.inscription import InscriptionIn, DossierUpdate
from services.trello import TrelloService
from services.n8n import trigger_n8n
from services.email import send_email

router = APIRouter(tags=["inscriptions"])


def _missing_docs(dossier: dict, docs: list) -> list:
    requis = dossier.get("documents_requis") or []
    fournis_types = {d["doc_type"] for d in docs if d.get("verification_status") != "rejected"}
    return [r for r in requis if r not in fournis_types]


@router.post("/inscriptions")
async def create_inscription(payload: InscriptionIn):
    formation = await db.formations.find_one({"id": payload.formation_id}, {"_id": 0})
    if not formation:
        raise HTTPException(status_code=404, detail="Formation introuvable")
    user = await db.users.find_one({"email": payload.student_email.lower()})
    if not user:
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id, "email": payload.student_email.lower(),
            "name": payload.student_name, "role": "etudiant",
            "phone": payload.student_phone,
            "password_hash": hash_password(secrets.token_urlsafe(12)),
            "created_at": now_iso(), "active": True
        })
    else:
        user_id = user["id"]

    insc_id = str(uuid.uuid4())
    inscription = {
        "id": insc_id, "formation_id": payload.formation_id,
        "formation_title": formation["title"], "category": formation["category"],
        "student_id": user_id, "student_name": payload.student_name,
        "student_email": payload.student_email.lower(), "student_phone": payload.student_phone,
        "price": formation.get("price", 0), "payment_status": "pending",
        "notes": payload.notes or "", "created_at": now_iso()
    }
    await db.inscriptions.insert_one(inscription)

    dossier_id = str(uuid.uuid4())
    trello_card = await TrelloService.create_card(
        name=f"{payload.student_name} - {formation['title']}",
        desc=f"Formation: {formation['title']}\nCatégorie: {formation['category']}\nEmail: {payload.student_email}\nTéléphone: {payload.student_phone or 'N/A'}",
        list_name="Nouveau"
    )
    dossier = {
        "id": dossier_id, "inscription_id": insc_id, "student_id": user_id,
        "formation_id": payload.formation_id, "formation_title": formation["title"],
        "category": formation["category"], "student_name": payload.student_name,
        "student_email": payload.student_email.lower(),
        "status": "nouveau", "notes": "", "assigned_to": None,
        "documents_requis": formation.get("documents_requis", []),
        "trello_card_id": trello_card["id"] if trello_card else None,
        "trello_card_url": trello_card.get("shortUrl") if trello_card else None,
        "documents": [], "created_at": now_iso(), "updated_at": now_iso()
    }
    await db.dossiers.insert_one(dossier)

    await trigger_n8n("inscription", {
        "inscription_id": insc_id, "dossier_id": dossier_id,
        "student_email": payload.student_email, "formation": formation["title"]
    })
    await send_email(
        payload.student_email,
        f"Confirmation d'inscription - {formation['title']}",
        f"<p>Bonjour {payload.student_name},</p><p>Votre inscription à <b>{formation['title']}</b> a bien été enregistrée. Nous vous contactons sous 24h pour la suite.</p><p>TDL Formation</p>"
    )
    inscription.pop("_id", None)
    dossier.pop("_id", None)
    return {"inscription": inscription, "dossier": dossier}


@router.get("/inscriptions")
async def list_inscriptions(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    return await db.inscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/dossiers/me")
async def list_my_dossiers(user: dict = Depends(get_current_user)):
    if user["role"] != "etudiant":
        raise HTTPException(status_code=403, detail="Réservé aux étudiants")
    items = await db.dossiers.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for d in items:
        docs = await db.documents.find({"id": {"$in": d.get("documents", [])}, "is_deleted": False}, {"_id": 0}).to_list(200)
        manquants = _missing_docs(d, docs)
        d["documents_manquants"] = manquants
        d["nb_documents_manquants"] = len(manquants)
    return items


@router.get("/dossiers")
async def list_dossiers(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    items = await db.dossiers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for d in items:
        docs = await db.documents.find({"id": {"$in": d.get("documents", [])}, "is_deleted": False}, {"_id": 0}).to_list(200)
        d["nb_documents_manquants"] = len(_missing_docs(d, docs))
    return items


@router.get("/dossiers/{did}")
async def get_dossier(did: str, user: dict = Depends(get_current_user)):
    d = await db.dossiers.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if user["role"] == "etudiant" and d.get("student_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    docs = await db.documents.find({"id": {"$in": d.get("documents", [])}, "is_deleted": False}, {"_id": 0}).to_list(200)
    manquants = _missing_docs(d, docs)
    d["documents_manquants"] = manquants
    d["nb_documents_manquants"] = len(manquants)
    return d


@router.put("/dossiers/{did}")
async def update_dossier(did: str, payload: DossierUpdate, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    d = await db.dossiers.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    new_status = update.get("status")
    if new_status and d.get("trello_card_id"):
        mapping = {
            "nouveau": "Nouveau", "en_verification": "En vérification",
            "complet": "Complet", "soumis_ants": "Soumis ANTS",
            "termine": "Terminé", "rejete": "En vérification"
        }
        await TrelloService.move_card(d["trello_card_id"], mapping.get(new_status, "Nouveau"))
    await db.dossiers.update_one({"id": did}, {"$set": update})
    await trigger_n8n("dossier", {"dossier_id": did, **update})

    if new_status and new_status != d.get("status"):
        note_html = ""
        if new_status == "rejete" and update.get("notes"):
            note_html = f"<p><i>Note : {update.get('notes')}</i></p>"
        STATUS_EMAIL = {
            "complet": (
                f"Dossier complet — {d.get('formation_title', '')}",
                f"<p>Bonjour {d.get('student_name', '')},</p><p>Votre dossier pour la formation <b>{d.get('formation_title', '')}</b> a été vérifié et est désormais <b>complet</b>.</p><p>TDL Formation</p>"
            ),
            "soumis_ants": (
                f"Dossier soumis — {d.get('formation_title', '')}",
                f"<p>Bonjour {d.get('student_name', '')},</p><p>Votre dossier pour la formation <b>{d.get('formation_title', '')}</b> a été soumis aux autorités compétentes (ANTS).</p><p>TDL Formation</p>"
            ),
            "termine": (
                f"Dossier finalisé — {d.get('formation_title', '')}",
                f"<p>Bonjour {d.get('student_name', '')},</p><p>Votre dossier pour la formation <b>{d.get('formation_title', '')}</b> est désormais <b>terminé</b>. Félicitations !</p><p>TDL Formation</p>"
            ),
            "rejete": (
                f"Dossier à corriger — {d.get('formation_title', '')}",
                f"<p>Bonjour {d.get('student_name', '')},</p><p>Votre dossier pour la formation <b>{d.get('formation_title', '')}</b> nécessite des corrections.</p>{note_html}<p>TDL Formation</p>"
            ),
        }
        if new_status in STATUS_EMAIL and d.get("student_email"):
            subject, body = STATUS_EMAIL[new_status]
            try:
                await send_email(d["student_email"], subject, body)
            except Exception:
                pass

    return await db.dossiers.find_one({"id": did}, {"_id": 0})
