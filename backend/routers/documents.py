import uuid
import jwt
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response

from core.database import db
from core.security import get_current_user, require_role
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, JWT_SECRET, JWT_ALGORITHM, ROLES_DOSSIERS_MGMT

router = APIRouter(tags=["documents"])


@router.post("/dossiers/{did}/documents")
async def upload_document(
    did: str,
    file: UploadFile = File(...),
    doc_type: str = Form("autre"),
    user: dict = Depends(get_current_user)
):
    d = await db.dossiers.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if user["role"] == "etudiant" and d.get("student_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 15MB)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    path = f"{APP_NAME}/dossiers/{did}/{uuid.uuid4()}.{ext}"
    result = await put_object(path, data, file.content_type or "application/octet-stream")
    doc = {
        "id": str(uuid.uuid4()), "storage_path": result["path"],
        "original_filename": file.filename, "content_type": file.content_type,
        "size": result["size"], "doc_type": doc_type,
        "verification_status": "pending", "uploaded_by": user["id"],
        "created_at": now_iso(), "is_deleted": False
    }
    await db.documents.insert_one(doc)
    await db.dossiers.update_one(
        {"id": did},
        {"$push": {"documents": doc["id"]}, "$set": {"updated_at": now_iso()}}
    )
    doc.pop("_id", None)
    return doc


@router.get("/dossiers/{did}/documents")
async def list_documents(did: str, user: dict = Depends(get_current_user)):
    d = await db.dossiers.find_one({"id": did}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if user["role"] == "etudiant" and d.get("student_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return await db.documents.find(
        {"id": {"$in": d.get("documents", [])}, "is_deleted": False}, {"_id": 0}
    ).to_list(500)


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, auth: Optional[str] = None, request: Request = None):
    if auth and request is not None and not request.cookies.get("access_token"):
        try:
            jwt.decode(auth, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except Exception:
            raise HTTPException(status_code=401, detail="Token invalide")
    else:
        await get_current_user(request)
    doc = await db.documents.find_one({"id": doc_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    data, ct = await get_object(doc["storage_path"])
    return Response(content=data, media_type=doc.get("content_type") or ct)


@router.put("/documents/{doc_id}/verify")
async def verify_document(doc_id: str, status: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    if status not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    await db.documents.update_one({"id": doc_id}, {"$set": {
        "verification_status": status,
        "verified_by": user["id"],
        "verified_at": now_iso()
    }})
    return await db.documents.find_one({"id": doc_id}, {"_id": 0})
