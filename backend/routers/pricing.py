"""Grille de prix formation × ville (Paramètres) — voir services/
lead_migration.compute_prix_effectif : prix_personnalise (sur le prospect) >
prix de cette grille > Formation.price. Collection db.prix_formation_ville,
une entrée par (formation_id, ville)."""
import uuid
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from models.pricing import PrixFormationVilleIn, PrixFormationVilleUpdate

router = APIRouter(prefix="/prix-formation-ville", tags=["pricing"])


@router.get("")
async def list_prix(user: dict = Depends(require_role("admin", "responsable_admission"))):
    return await db.prix_formation_ville.find({}, {"_id": 0}).to_list(1000)


@router.post("")
async def create_prix(payload: PrixFormationVilleIn, user: dict = Depends(require_role("admin", "responsable_admission"))):
    existing = await db.prix_formation_ville.find_one({"formation_id": payload.formation_id, "ville": payload.ville})
    if existing:
        raise HTTPException(status_code=400, detail="Une entrée existe déjà pour cette formation et cette ville — modifiez-la plutôt.")
    doc = {
        "id": str(uuid.uuid4()), "formation_id": payload.formation_id, "ville": payload.ville,
        "prix": payload.prix, "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.prix_formation_ville.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{pid}")
async def update_prix(pid: str, payload: PrixFormationVilleUpdate, user: dict = Depends(require_role("admin", "responsable_admission"))):
    existing = await db.prix_formation_ville.find_one({"id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    await db.prix_formation_ville.update_one({"id": pid}, {"$set": {"prix": payload.prix, "updated_at": now_iso()}})
    return await db.prix_formation_ville.find_one({"id": pid}, {"_id": 0})


@router.delete("/{pid}")
async def delete_prix(pid: str, user: dict = Depends(require_role("admin"))):
    await db.prix_formation_ville.delete_one({"id": pid})
    return {"ok": True}
