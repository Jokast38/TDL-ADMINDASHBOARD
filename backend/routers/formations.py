import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso, slugify
from models.formation import FormationIn

router = APIRouter(prefix="/formations", tags=["formations"])


async def _unique_slug(title: str, exclude_id: Optional[str] = None) -> str:
    """Slug lisible et indexable (ex: /formations/caces-r489) plutôt que
    l'UUID brut utilisé jusqu'ici pour /formations/{id} — sans mot-clé dans
    l'URL, Google a beaucoup plus de mal à comprendre le sujet de la page.
    Ajoute un suffixe numérique en cas de collision (deux formations au
    titre identique)."""
    base = slugify(title)
    slug = base
    n = 2
    while True:
        q = {"slug": slug}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        existing = await db.formations.find_one(q, {"_id": 0, "id": 1})
        if not existing:
            return slug
        slug = f"{base}-{n}"
        n += 1


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
    doc["slug"] = await _unique_slug(payload.title)
    doc["created_at"] = now_iso()
    await db.formations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{fid}")
async def update_formation(fid: str, payload: FormationIn, user: dict = Depends(require_role("admin", "employe"))):
    update = payload.model_dump()
    existing = await db.formations.find_one({"id": fid}, {"_id": 0, "slug": 1})
    # Ne jamais régénérer un slug déjà attribué (casserait l'URL déjà
    # indexée/partagée) — seulement combler celles créées avant l'ajout de
    # ce champ.
    if not (existing or {}).get("slug"):
        update["slug"] = await _unique_slug(payload.title, exclude_id=fid)
    await db.formations.update_one({"id": fid}, {"$set": update})
    return await db.formations.find_one({"id": fid}, {"_id": 0})


@router.delete("/{fid}")
async def delete_formation(fid: str, user: dict = Depends(require_role("admin"))):
    await db.formations.delete_one({"id": fid})
    return {"ok": True}
