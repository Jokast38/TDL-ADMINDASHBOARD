"""Génération des sessions de récupération de points d'une année pour un
centre (bouton « Générer les sessions » de la page Sessions de formation,
demande du 2026-11-12). Dates : core/recup_calendar.py. Une date déjà prise
par une session du même centre (hors test) n'est jamais recréée : relancer
la génération ne crée pas de doublon."""
import uuid

from fastapi import HTTPException

from core.database import db
from core.recup_calendar import CENTRES_RECUP, sessions_recup
from core.utils import now_iso


def centre_of(stage: dict):
    lieu = f"{stage.get('lieu_ville') or ''} {stage.get('lieu_adresse') or ''}".lower()
    if "creil" in lieu:
        return "creil"
    if "epinay" in lieu or "épinay" in lieu:
        return "epinay"
    return None


async def _formation(formation_id: str) -> dict:
    formation = await db.formations.find_one({"id": formation_id}, {"_id": 0, "id": 1, "title": 1, "category": 1})
    if not formation or formation.get("category") != "PERMIS":
        raise HTTPException(status_code=400, detail="Formation de récupération de points introuvable")
    return formation


async def _modules_type(formation_id: str) -> list:
    """Modules des deux journées, repris de la dernière session de la
    formation qui en a deux (tronc commun puis enseignement spécialisé)."""
    stages = await db.stages.find(
        {"formation_id": formation_id, "is_test": {"$ne": True}}, {"_id": 0, "date_debut": 1, "modules": 1},
    ).sort("date_debut", -1).to_list(300)
    for s in stages:
        mods = sorted(s.get("modules") or [], key=lambda m: m.get("date") or "")
        if len(mods) == 2 and all(m.get("module_id") for m in mods):
            return [(m["module_id"], m.get("module_nom", "")) for m in mods]
    return []


async def plan(year: int, centre: str, formation_id: str) -> dict:
    if centre not in CENTRES_RECUP:
        raise HTTPException(status_code=400, detail="Centre inconnu")
    formation = await _formation(formation_id)
    existing = await db.stages.find(
        {"formation_id": formation_id, "date_debut": {"$gte": f"{year}-01-01", "$lt": f"{year + 1}-01-01"},
         "is_test": {"$ne": True}},
        {"_id": 0, "date_debut": 1, "lieu_ville": 1, "lieu_adresse": 1, "statut": 1},
    ).to_list(2000)
    taken = {e["date_debut"][:10] for e in existing if centre_of(e) == centre}
    sessions = []
    for s in sessions_recup(year):
        debut = s["date_debut"].isoformat()
        sessions.append({"date_debut": debut, "date_fin": s["date_fin"].isoformat(), "note": s["note"],
                         "existe": debut in taken})
    return {"year": year, "centre": centre, "centre_label": CENTRES_RECUP[centre]["label"], "formation": formation,
            "sessions": sessions, "a_creer": sum(not s["existe"] for s in sessions),
            "deja_en_ligne": sum(s["existe"] for s in sessions)}


async def generate(year: int, centre: str, formation_id: str, user: dict) -> dict:
    result = await plan(year, centre, formation_id)
    c = CENTRES_RECUP[centre]
    modules = await _modules_type(formation_id)
    batch = f"recup_{centre}_{year}_{now_iso()[:19]}"
    created = []
    for s in result["sessions"]:
        if s["existe"]:
            continue
        days = [s["date_debut"], s["date_fin"]]
        doc = {
            "id": str(uuid.uuid4()), "formation_id": formation_id, "formation_titre": result["formation"]["title"],
            "date_debut": s["date_debut"], "date_fin": s["date_fin"],
            "heure_debut": c["heure_debut"], "heure_fin": c["heure_fin"],
            "lieu_ville": c["lieu_ville"], "lieu_adresse": c["lieu_adresse"], "capacite_max": 20,
            "external_reserved": 0, "creneau": "JOUR", "animateur_id": None, "animateur_ids": [], "statut": "planifie",
            "nb_inscrits": 0, "notes": s["note"], "centre": centre,
            "source_import": "generation_recup", "generation_batch": batch, "generated_by": user.get("id"),
            "modules": [
                {"id": str(uuid.uuid4()), "date": d, "heure_debut": c["heure_debut"], "heure_fin": c["heure_fin"],
                 "module_id": mid, "module_nom": nom, "animateur_id": None}
                for d, (mid, nom) in zip(days, modules)
            ],
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.stages.insert_one(doc)
        created.append(s["date_debut"])
    return {**result, "crees": len(created), "generation_batch": batch}
