import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import ROLES_DOCS_VIEW
from models.document import DocTemplateIn, DocTemplateUpdate

router = APIRouter(prefix="/doc-templates", tags=["doc-templates"])


@router.get("")
async def list_doc_templates(type_doc: Optional[str] = None, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    q = {"actif": True}
    if type_doc:
        q["type_doc"] = type_doc
    return await db.doc_templates.find(q, {"_id": 0}).sort("nom", 1).to_list(200)


@router.post("")
async def create_doc_template(payload: DocTemplateIn, user: dict = Depends(require_role("admin"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    doc["created_by"] = user["id"]
    await db.doc_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{tid}")
async def update_doc_template(tid: str, payload: DocTemplateUpdate, user: dict = Depends(require_role("admin"))):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    await db.doc_templates.update_one({"id": tid}, {"$set": update_data})
    return await db.doc_templates.find_one({"id": tid}, {"_id": 0})


@router.delete("/{tid}")
async def delete_doc_template(tid: str, user: dict = Depends(require_role("admin"))):
    await db.doc_templates.update_one({"id": tid}, {"$set": {"actif": False}})
    return {"ok": True}
