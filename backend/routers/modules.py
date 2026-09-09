import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import ROLES_ALL_STAFF
from models.module import (
    FormationModuleIn, FormationModuleUpdate,
    SessionTemplateIn, SessionTemplateUpdate,
    ApplyTemplateIn, StageModulesIn,
)

router = APIRouter(tags=["modules"])


# ---------------------------------------------------------------------------
# Bibliothèque de modules de formation (réutilisables, un même module peut
# apparaître dans plusieurs modèles de session de la même catégorie).
# Le contenu réel des modules sera fourni plus tard par l'équipe pédagogique —
# ceci construit la structure permettant de les rattacher aux sessions.
# ---------------------------------------------------------------------------
@router.get("/formation-modules")
async def list_formation_modules(category: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    q = {"category": category} if category else {}
    return await db.formation_modules.find(q, {"_id": 0}).sort("nom", 1).to_list(500)


@router.post("/formation-modules")
async def create_formation_module(payload: FormationModuleIn, user: dict = Depends(require_role("admin", "responsable_admission"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.formation_modules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/formation-modules/{mid}")
async def update_formation_module(mid: str, payload: FormationModuleUpdate, user: dict = Depends(require_role("admin", "responsable_admission"))):
    existing = await db.formation_modules.find_one({"id": mid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Module introuvable")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    update["updated_at"] = now_iso()
    await db.formation_modules.update_one({"id": mid}, {"$set": update})
    return await db.formation_modules.find_one({"id": mid}, {"_id": 0})


@router.delete("/formation-modules/{mid}")
async def delete_formation_module(mid: str, user: dict = Depends(require_role("admin"))):
    existing = await db.formation_modules.find_one({"id": mid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Module introuvable")
    await db.formation_modules.delete_one({"id": mid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Modèles de session pré-enregistrés (« modèles de session pré-enregistré »
# demandés pour chaque type de formation) — une liste de modules positionnés
# sur des jours relatifs (jour 1 = date_debut du stage), appliqués en un clic
# à la création/édition d'une session dans Stages.jsx.
# ---------------------------------------------------------------------------
@router.get("/session-templates")
async def list_session_templates(category: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    q = {"category": category} if category else {}
    return await db.session_templates.find(q, {"_id": 0}).sort("nom", 1).to_list(200)


@router.post("/session-templates")
async def create_session_template(payload: SessionTemplateIn, user: dict = Depends(require_role("admin", "responsable_admission"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    await db.session_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/session-templates/{tid}")
async def update_session_template(tid: str, payload: SessionTemplateUpdate, user: dict = Depends(require_role("admin", "responsable_admission"))):
    existing = await db.session_templates.find_one({"id": tid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    update["updated_at"] = now_iso()
    await db.session_templates.update_one({"id": tid}, {"$set": update})
    return await db.session_templates.find_one({"id": tid}, {"_id": 0})


@router.delete("/session-templates/{tid}")
async def delete_session_template(tid: str, user: dict = Depends(require_role("admin"))):
    existing = await db.session_templates.find_one({"id": tid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    await db.session_templates.delete_one({"id": tid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Calendrier pédagogique d'une session précise (stage.modules) — appliqué
# depuis un modèle, ou édité manuellement.
# ---------------------------------------------------------------------------
@router.post("/stages/{sid}/apply-template")
async def apply_session_template(sid: str, payload: ApplyTemplateIn, user: dict = Depends(require_role("admin", "responsable_admission"))):
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    template = await db.session_templates.find_one({"id": payload.template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Modèle introuvable")

    try:
        date_debut = datetime.fromisoformat(stage["date_debut"][:10]).date()
    except Exception:
        raise HTTPException(status_code=400, detail="date_debut du stage invalide")

    module_ids = [m["module_id"] for m in template.get("modules", [])]
    modules_lib = await db.formation_modules.find({"id": {"$in": module_ids}}, {"_id": 0}).to_list(200)
    modules_by_id = {m["id"]: m for m in modules_lib}

    new_items = []
    for item in template.get("modules", []):
        mod = modules_by_id.get(item["module_id"])
        new_items.append({
            "id": str(uuid.uuid4()),
            "module_id": item["module_id"],
            "module_nom": mod["nom"] if mod else "Module",
            "date": (date_debut + timedelta(days=max(0, item.get("jour", 1) - 1))).isoformat(),
            "heure_debut": item.get("heure_debut", "09:00"),
            "heure_fin": item.get("heure_fin", "17:00"),
            "animateur_id": item.get("animateur_id"),
        })

    existing_modules = [] if payload.replace else list(stage.get("modules") or [])
    modules = existing_modules + new_items
    await db.stages.update_one({"id": sid}, {"$set": {"modules": modules, "updated_at": now_iso()}})
    return await db.stages.find_one({"id": sid}, {"_id": 0})


@router.put("/stages/{sid}/modules")
async def set_stage_modules(sid: str, payload: StageModulesIn, user: dict = Depends(require_role("admin", "responsable_admission"))):
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    items = []
    for m in payload.modules:
        d = m.model_dump()
        d["id"] = d.get("id") or str(uuid.uuid4())
        items.append(d)
    await db.stages.update_one({"id": sid}, {"$set": {"modules": items, "updated_at": now_iso()}})
    return await db.stages.find_one({"id": sid}, {"_id": 0})


# ---------------------------------------------------------------------------
# Vue agenda globale — pour la page Agenda.jsx (dashboard-style), agrège les
# modules planifiés de toutes les sessions sur une période, avec formation,
# lieu et formateur, triés par date/heure.
# ---------------------------------------------------------------------------
@router.get("/agenda")
async def get_agenda(date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    today = datetime.now().date()
    date_from = date_from or today.isoformat()
    date_to = date_to or (today + timedelta(days=30)).isoformat()

    # Toutes les sessions qui chevauchent la période — pas seulement celles
    # avec un calendrier de modules déjà détaillé, sinon l'agenda reste vide
    # tant que personne n'a saisi de modules (la plupart des sessions
    # existantes n'en ont pas encore). Les sessions sans modules apparaissent
    # comme un bloc « journée » générique au nom de la formation.
    q = {"date_debut": {"$lte": date_to}, "date_fin": {"$gte": date_from}, "statut": {"$ne": "annule"}}
    if user["role"] == "animateur":
        q["$or"] = [{"animateur_ids": user["id"]}, {"animateur_id": user["id"]}]
    stages = await db.stages.find(q, {"_id": 0}).to_list(500)

    animateur_ids = set()
    for s in stages:
        for m in s.get("modules") or []:
            if m.get("animateur_id"):
                animateur_ids.add(m["animateur_id"])
        for aid in (s.get("animateur_ids") or ([s["animateur_id"]] if s.get("animateur_id") else [])):
            animateur_ids.add(aid)
    animateurs = await db.users.find({"id": {"$in": list(animateur_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    animateur_names = {a["id"]: a["name"] for a in animateurs}

    events = []
    for s in stages:
        modules = s.get("modules") or []
        if modules:
            for m in modules:
                if not (date_from <= m.get("date", "") <= date_to):
                    continue
                events.append({
                    "id": m.get("id"),
                    "date": m.get("date"),
                    "heure_debut": m.get("heure_debut"),
                    "heure_fin": m.get("heure_fin"),
                    "module_nom": m.get("module_nom"),
                    "stage_id": s["id"],
                    "formation_titre": s.get("formation_titre"),
                    "lieu_ville": s.get("lieu_ville"),
                    "animateur_id": m.get("animateur_id"),
                    "animateur_nom": animateur_names.get(m.get("animateur_id"), ""),
                })
        else:
            # Pas de calendrier détaillé : un bloc par jour de la session,
            # dans la limite de la période demandée.
            try:
                d1 = max(datetime.fromisoformat(s["date_debut"][:10]).date(), datetime.fromisoformat(date_from).date())
                d2 = min(datetime.fromisoformat(s["date_fin"][:10]).date(), datetime.fromisoformat(date_to).date())
            except Exception:
                continue
            stage_animateur_ids = s.get("animateur_ids") or ([s["animateur_id"]] if s.get("animateur_id") else [])
            animateur_nom = ", ".join(animateur_names.get(aid, "") for aid in stage_animateur_ids if animateur_names.get(aid))
            cur = d1
            while cur <= d2:
                events.append({
                    "id": f"{s['id']}_{cur.isoformat()}",
                    "date": cur.isoformat(),
                    "heure_debut": "09:00",
                    "heure_fin": "17:00",
                    "module_nom": s.get("formation_titre") or "Session",
                    "stage_id": s["id"],
                    "formation_titre": s.get("formation_titre"),
                    "lieu_ville": s.get("lieu_ville"),
                    "animateur_id": stage_animateur_ids[0] if stage_animateur_ids else None,
                    "animateur_nom": animateur_nom,
                    "is_session_fallback": True,
                })
                cur += timedelta(days=1)
    events.sort(key=lambda e: (e["date"], e.get("heure_debut") or ""))
    return {"events": events, "date_from": date_from, "date_to": date_to}
