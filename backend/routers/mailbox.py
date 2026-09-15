"""Messagerie interne (type Gmail) sur contact@tdl-formation.fr — voir
services/mailbox.py pour la logique IMAP/SMTP. Accessible à l'équipe
(mêmes rôles que la bibliothèque de documents)."""
import base64
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from core.config import ROLES_MAILBOX
from core.security import require_role
from core.storage import get_object
from core.database import db
from core.utils import now_iso
from services.email_template import render_branded_email
import services.mailbox as mailbox

router = APIRouter(prefix="/mailbox", tags=["mailbox"])

_FOLDERS = {"inbox": mailbox.INBOX, "sent": mailbox.SENT}


def _resolve_folder(folder: str) -> str:
    real = _FOLDERS.get(folder)
    if not real:
        raise HTTPException(status_code=404, detail="Dossier inconnu (inbox ou sent)")
    return real


@router.get("/status")
async def mailbox_status(user: dict = Depends(require_role(*ROLES_MAILBOX))):
    return {"configured": mailbox.mailbox_configured()}


def _require_configured():
    if not mailbox.mailbox_configured():
        raise HTTPException(
            status_code=503,
            detail="Messagerie non configurée (IMAP_HOST/SMTP2_HOST/MAILBOX_USER/MAILBOX_PASSWORD manquants)",
        )


def _default_signature(user: dict) -> str:
    return f"{user.get('name') or ''}\nTDL Formation".strip()


class SignatureIn(BaseModel):
    signature: str


@router.get("/me/signature")
async def get_my_signature(user: dict = Depends(require_role(*ROLES_MAILBOX))):
    """Signature texte ajoutée en bas des emails envoyés par l'utilisateur —
    distincte de signature_data_url (image de signature manuscrite pour les
    conventions animateurs, voir routers/employees.py)."""
    return {"signature": user.get("email_signature") or _default_signature(user)}


@router.put("/me/signature")
async def update_my_signature(payload: SignatureIn, user: dict = Depends(require_role(*ROLES_MAILBOX))):
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_signature": payload.signature, "updated_at": now_iso()}})
    return {"signature": payload.signature}


@router.get("/library/documents")
async def list_library_documents(
    category: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_MAILBOX)),
):
    """Documents déjà stockés (bibliothèque de documents de l'entreprise) —
    utilisé par le compositeur pour joindre un fichier sans le re-uploader.
    Déclarée avant /{folder} et /{folder}/{uid} : FastAPI matche les routes
    dans leur ordre de déclaration, et "/library/documents" correspondrait
    sinon au motif générique /{folder}/{uid} (folder="library",
    uid="documents") — c'est exactement ce qui causait le 404."""
    q = {}
    if category:
        q["category"] = category
    return await db.company_documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/{folder}")
async def list_messages(
    folder: str,
    limit: int = 30,
    offset: int = 0,
    user: dict = Depends(require_role(*ROLES_MAILBOX)),
):
    _require_configured()
    real_folder = _resolve_folder(folder)
    if limit > 100:
        limit = 100
    try:
        return await mailbox.list_messages(real_folder, limit, offset)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur IMAP : {e}")


@router.get("/{folder}/{uid}")
async def get_message(
    folder: str,
    uid: str,
    user: dict = Depends(require_role(*ROLES_MAILBOX)),
):
    _require_configured()
    real_folder = _resolve_folder(folder)
    try:
        msg = await mailbox.get_message(real_folder, uid, mark_read=(folder == "inbox"))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur IMAP : {e}")
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")
    return msg


@router.get("/{folder}/{uid}/attachment/{part_index}")
async def download_attachment(
    folder: str,
    uid: str,
    part_index: int,
    user: dict = Depends(require_role(*ROLES_MAILBOX)),
):
    _require_configured()
    real_folder = _resolve_folder(folder)
    try:
        result = await mailbox.get_attachment(real_folder, uid, part_index)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur IMAP : {e}")
    if not result:
        raise HTTPException(status_code=404, detail="Pièce jointe introuvable")
    content, filename, content_type = result
    return Response(
        content=content,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/send")
async def send_message(
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    cc: str = Form(""),
    button_label: str = Form(""),
    button_url: str = Form(""),
    library_document_ids: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    user: dict = Depends(require_role(*ROLES_MAILBOX)),
):
    _require_configured()
    attachments = []

    for f in files:
        data = await f.read()
        if len(data) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"Fichier trop volumineux (max 20MB) : {f.filename}")
        attachments.append({"filename": f.filename, "content": data})

    doc_ids = [d.strip() for d in library_document_ids.split(",") if d.strip()]
    for doc_id in doc_ids:
        doc = await db.company_documents.find_one({"id": doc_id}, {"_id": 0})
        if not doc:
            continue
        content, _ct = await get_object(doc["storage_path"])
        attachments.append({"filename": doc.get("original_filename") or doc.get("nom") or doc_id, "content": content})

    cc_list = [c.strip() for c in cc.split(",") if c.strip()]
    # L'employé qui envoie doit systématiquement recevoir une copie — ça lui
    # sert de trace/suivi de ce qui est parti en son nom depuis la boîte
    # partagée contact@. Pas de doublon si déjà destinataire ou déjà en cc.
    sender_email = (user.get("email") or "").strip()
    if sender_email and sender_email.lower() not in [to.strip().lower()] + [c.lower() for c in cc_list]:
        cc_list.append(sender_email)

    signature = (user.get("email_signature") or _default_signature(user)).strip()
    body_with_signature = f"{body}\n\n{signature}" if signature else body

    # Le compositeur ne fait saisir que du texte simple (pas d'éditeur HTML) —
    # render_branded_email l'habille avec le gabarit TDL (logo, signature,
    # pied de page) déjà utilisé pour les relances Leads, et ajoute le bouton
    # d'action si renseigné.
    html_body = render_branded_email(
        body_with_signature,
        button_label=button_label.strip() or None,
        button_url=button_url.strip() or None,
    )

    try:
        result = await mailbox.send_and_save(to.strip(), subject, html_body, attachments, cc_list)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Échec de l'envoi : {e}")
    return result
