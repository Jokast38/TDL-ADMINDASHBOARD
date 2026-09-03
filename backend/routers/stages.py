import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import ROLES_ALL_STAFF
from models.stage import StageIn, StageUpdate

router = APIRouter(prefix="/stages", tags=["stages"])


def _stage_animateur_ids(stage: dict) -> list:
    """Un stage peut avoir plusieurs formateurs (animateur_ids) ; l'ancien
    champ animateur_id (1 seul) reste lu pour compatibilité avec les stages
    créés avant ce changement."""
    ids = list(stage.get("animateur_ids") or [])
    if stage.get("animateur_id") and stage["animateur_id"] not in ids:
        ids.append(stage["animateur_id"])
    return ids


def _stage_days(stage: dict) -> list:
    try:
        from datetime import date as _date
        d1 = datetime.fromisoformat(stage["date_debut"][:10]).date()
        d2 = datetime.fromisoformat(stage["date_fin"][:10]).date()
        days, cur = [], d1
        while cur <= d2:
            days.append(cur.isoformat())
            cur = cur.fromordinal(cur.toordinal() + 1)
        return days
    except Exception:
        return [stage.get("date_debut", "")]


@router.get("/public/available")
async def list_public_available_stages(formation_id: str):
    """Sessions à venir avec places restantes, pour l'étape « choisir une
    session » de l'inscription publique (voir PublicInscription.jsx) —
    endpoint public (page d'inscription non authentifiée), ne renvoie que le
    strict nécessaire (pas d'infos internes comme les notes ou l'animateur)."""
    today = datetime.now().date().isoformat()
    stages = await db.stages.find(
        {"formation_id": formation_id, "date_fin": {"$gte": today}, "statut": {"$ne": "annule"}},
        {"_id": 0},
    ).sort("date_debut", 1).to_list(100)
    result = []
    for s in stages:
        nb_inscrits = await db.inscriptions.count_documents({"stage_id": s["id"], "status": "active"})
        remaining = max(0, (s.get("capacite_max") or 0) - nb_inscrits)
        if remaining <= 0:
            continue
        result.append({
            "id": s["id"], "date_debut": s["date_debut"], "date_fin": s["date_fin"],
            "lieu_ville": s.get("lieu_ville", ""), "lieu_adresse": s.get("lieu_adresse", ""),
            "places_restantes": remaining,
        })
    return result


@router.get("")
async def list_stages(
    formation_id: Optional[str] = None,
    statut: Optional[str] = None,
    animateur_id: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_ALL_STAFF))
):
    q = {}
    if formation_id: q["formation_id"] = formation_id
    if statut: q["statut"] = statut
    if user["role"] == "animateur":
        q["$or"] = [{"animateur_ids": user["id"]}, {"animateur_id": user["id"]}]
    elif animateur_id:
        q["$or"] = [{"animateur_ids": animateur_id}, {"animateur_id": animateur_id}]
    return await db.stages.find(q, {"_id": 0}).sort("date_debut", -1).to_list(500)


@router.post("")
async def create_stage(payload: StageIn, user: dict = Depends(require_role("admin", "responsable_admission"))):
    formation = await db.formations.find_one({"id": payload.formation_id}, {"_id": 0})
    if not formation:
        raise HTTPException(status_code=404, detail="Formation introuvable")
    doc = payload.model_dump()
    ids = list(doc.get("animateur_ids") or [])
    if doc.get("animateur_id") and doc["animateur_id"] not in ids:
        ids.append(doc["animateur_id"])
    doc["animateur_ids"] = ids
    doc["animateur_id"] = ids[0] if ids else None
    doc["id"] = str(uuid.uuid4())
    doc["formation_titre"] = formation.get("title")
    doc["statut"] = "planifie"
    doc["nb_inscrits"] = 0
    doc["created_at"] = now_iso()
    await db.stages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{sid}")
async def update_stage(sid: str, payload: StageUpdate, user: dict = Depends(require_role("admin", "responsable_admission", "animateur"))):
    existing = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    if user["role"] == "animateur":
        if user["id"] not in _stage_animateur_ids(existing):
            raise HTTPException(status_code=403, detail="Accès refusé")
        update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if k in ("statut", "notes")}
    else:
        update = payload.model_dump(exclude_unset=True)
        if "animateur_ids" in update or "animateur_id" in update:
            ids = list(update.get("animateur_ids") if update.get("animateur_ids") is not None else existing.get("animateur_ids") or [])
            single = update.get("animateur_id", existing.get("animateur_id"))
            if single and single not in ids:
                ids.append(single)
            update["animateur_ids"] = ids
            update["animateur_id"] = ids[0] if ids else None
    update["updated_at"] = now_iso()
    await db.stages.update_one({"id": sid}, {"$set": update})
    return await db.stages.find_one({"id": sid}, {"_id": 0})


@router.delete("/{sid}")
async def delete_stage(sid: str, user: dict = Depends(require_role("admin"))):
    existing = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    await db.stages.delete_one({"id": sid})
    await db.emargements.delete_many({"stage_id": sid})
    return {"ok": True}


@router.get("/{sid}/jours")
async def stage_days_route(sid: str, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    return {"jours": _stage_days(stage)}


@router.get("/{sid}/inscrits")
async def stage_inscrits(sid: str, session_date: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    if user["role"] == "animateur" and user["id"] not in _stage_animateur_ids(stage):
        raise HTTPException(status_code=403, detail="Accès refusé")
    session_date = session_date or _stage_days(stage)[0]
    inscrits = await db.inscriptions.find({"formation_id": stage["formation_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for ins in inscrits:
        em = await db.emargements.find_one({"stage_id": sid, "inscription_id": ins["id"], "session_date": session_date}, {"_id": 0})
        ins["emarge"] = bool(em)
        ins["present"] = em.get("present") if em else None
    return inscrits
