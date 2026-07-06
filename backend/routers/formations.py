import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from models.formation import FormationIn

router = APIRouter(prefix="/formations", tags=["formations"])


@router.get("")
async def list_formations(category: Optional[str] = None, active_only: bool = False):
    q = {}
    if category:
        q["category"] = category
    if active_only:
        q["active"] = True
    return await db.formations.find(q, {"_id": 0}).to_list(500)


@router.post("")
async def create_formation(payload: FormationIn, user: dict = Depends(require_role("admin", "employe"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.formations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{fid}")
async def update_formation(fid: str, payload: FormationIn, user: dict = Depends(require_role("admin", "employe"))):
    await db.formations.update_one({"id": fid}, {"$set": payload.model_dump()})
    return await db.formations.find_one({"id": fid}, {"_id": 0})


@router.delete("/{fid}")
async def delete_formation(fid: str, user: dict = Depends(require_role("admin"))):
    await db.formations.delete_one({"id": fid})
    return {"ok": True}
