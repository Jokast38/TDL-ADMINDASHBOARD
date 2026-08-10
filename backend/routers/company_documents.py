import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from core.database import db
from core.security import require_role
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_DOSSIERS_MGMT
from models.company_document import CompanyDocumentUpdate

router = APIRouter(prefix="/company-documents", tags=["company-documents"])

# Documents "modèles" de l'entreprise (contrats vierges, programmes,
# calendrier d'examens...) — distincts des documents générés par élève
# (voir generated_docs.py) : ce sont des fichiers de référence uploadés une
# fois par l'équipe, consultables/téléchargeables depuis le dashboard.


@router.get("")
async def list_company_documents(
    category: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
):
    q = {}
    if category:
        q["category"] = category
    return await db.company_documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("")
async def upload_company_document(
    file: UploadFile = File(...),
    nom: str = Form(...),
    description: str = Form(""),
    category: str = Form("autre"),
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
):
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 20MB)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    path = f"{APP_NAME}/company-documents/{uuid.uuid4()}.{ext}"
    result = await put_object(path, data, file.content_type or "application/octet-stream")
    doc = {
        "id": str(uuid.uuid4()),
        "nom": nom,
        "description": description,
        "category": category,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "uploaded_by": user["id"],
        "created_at": now_iso(),
    }
    await db.company_documents.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{doc_id}/download")
async def download_company_document(doc_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    doc = await db.company_documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    data, ct = await get_object(doc["storage_path"])
    return Response(
        content=data,
        media_type=doc.get("content_type") or ct,
        headers={"Content-Disposition": f'inline; filename="{doc.get("original_filename") or "document"}"'},
    )


@router.put("/{doc_id}")
async def update_company_document(doc_id: str, payload: CompanyDocumentUpdate, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    existing = await db.company_documents.find_one({"id": doc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Document introuvable")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if update:
        update["updated_at"] = now_iso()
        await db.company_documents.update_one({"id": doc_id}, {"$set": update})
    return await db.company_documents.find_one({"id": doc_id}, {"_id": 0})


@router.delete("/{doc_id}")
async def delete_company_document(doc_id: str, user: dict = Depends(require_role("admin"))):
    existing = await db.company_documents.find_one({"id": doc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Document introuvable")
    await db.company_documents.delete_one({"id": doc_id})
    return {"ok": True}
