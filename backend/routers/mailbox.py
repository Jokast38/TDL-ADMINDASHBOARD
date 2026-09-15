"""Messagerie interne (type Gmail) sur contact@tdl-formation.fr — voir
services/mailbox.py pour la logique IMAP/SMTP. Accessible à l'équipe
(mêmes rôles que la bibliothèque de documents)."""
import base64
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from core.config import ROLES_DOSSIERS_MGMT
from core.security import require_role
from core.storage import get_object
from core.database import db
import services.mailbox as mailbox

router = APIRouter(prefix="/mailbox", tags=["mailbox"])

_FOLDERS = {"inbox": mailbox.INBOX, "sent": mailbox.SENT}


def _resolve_folder(folder: str) -> str:
    real = _FOLDERS.get(folder)
    if not real:
        raise HTTPException(status_code=404, detail="Dossier inconnu (inbox ou sent)")
    return real


@router.get("/status")
async def mailbox_status(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    return {"configured": mailbox.mailbox_configured()}


def _require_configured():
    if not mailbox.mailbox_configured():
        raise HTTPException(
            status_code=503,
            detail="Messagerie non configurée (IMAP_HOST/SMTP2_HOST/MAILBOX_USER/MAILBOX_PASSWORD manquants)",
        )


@router.get("/{folder}")
async def list_messages(
    folder: str,
    limit: int = 30,
    offset: int = 0,
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
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
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
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
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
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


@router.get("/library/documents")
async def list_library_documents(
    category: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
):
    """Documents déjà stockés (bibliothèque de documents de l'entreprise) —
    utilisé par le compositeur pour joindre un fichier sans le re-uploader."""
    q = {}
    if category:
        q["category"] = category
    return await db.company_documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/send")
async def send_message(
    to: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    cc: str = Form(""),
    library_document_ids: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
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

    try:
        result = await mailbox.send_and_save(to.strip(), subject, body, attachments, cc_list)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Échec de l'envoi : {e}")
    return result
