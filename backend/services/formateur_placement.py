"""Placement des formateurs sur les sessions depuis leur espace (voir
core/placement_rules.py pour les règles). Écrit directement dans
`stage.animateur_ids`, comme une assignation par un agent depuis la page
Sessions de formation : une date choisie apparaît donc partout (sessions du
formateur, émargement, attestations, annexe de la convention)."""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException

from core.database import db
from core.placement_rules import (
    formateur_categories, place_for, places_occupees, places_of_category, planning_deadline,
    quota_depasse, stage_nb_jours, stages_overlap,
)
from core.utils import now_iso
from services.activity import log_action
from services.convention import _stage_animateur_ids, regenerate_convention_pdf
from services.push import send_push_to_users

_ROLES_NOTIFIES = ["admin", "responsable_admission", "agent_admin"]


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _year_query(year: int) -> dict:
    return {"$gte": f"{year}-01-01", "$lt": f"{year + 1}-01-01"}


async def _categories_by_formation(categories: Optional[list] = None) -> dict:
    query = {"category": {"$in": categories}} if categories else {}
    formations = await db.formations.find(query, {"_id": 0, "id": 1, "category": 1}).to_list(500)
    return {f["id"]: f.get("category") for f in formations}


async def _titres_by_user(stages: list) -> dict:
    ids = {aid for s in stages for aid in _stage_animateur_ids(s)}
    if not ids:
        return {}
    users = await db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "titre": 1}).to_list(len(ids))
    return {u["id"]: u.get("titre") for u in users}


async def _my_stages(uid: str, year: int) -> list:
    return await db.stages.find(
        {"date_debut": _year_query(year), "statut": {"$ne": "annule"}, "$or": [{"animateur_ids": uid}, {"animateur_id": uid}]},
        {"_id": 0},
    ).to_list(500)


def _occupied(stage: dict, category: Optional[str], titres: dict, exclude: Optional[str] = None) -> set:
    holders = [titres.get(aid) for aid in _stage_animateur_ids(stage) if aid != exclude and aid in titres]
    return places_occupees(holders, category)


async def planning_for(user: dict, year: int) -> dict:
    """Sessions de l'année ouvertes à ce formateur. Ne renvoie jamais les
    formateurs placés : seulement si chaque place est libre ou non."""
    today = _today()
    categories = await _categories_by_formation(formateur_categories(user))
    stages = await db.stages.find(
        {"formation_id": {"$in": list(categories)}, "date_debut": _year_query(year), "statut": {"$ne": "annule"}},
        {"_id": 0},
    ).sort("date_debut", 1).to_list(2000)
    titres = await _titres_by_user(stages)
    mine = await _my_stages(user["id"], year)
    mine_ids = {s["id"] for s in mine}
    jours = sum(stage_nb_jours(s) for s in mine)
    quota = user.get("quota_jours_annuel")
    deadline = planning_deadline(year)

    items = []
    for s in stages:
        category = categories.get(s.get("formation_id"))
        occupied = _occupied(s, category, titres, exclude=user["id"])
        my_place = place_for(user.get("titre"), category)
        is_mine = s["id"] in mine_ids
        a_venir = s["date_debut"][:10] > today.isoformat()
        conflict = not is_mine and any(stages_overlap(s, m) for m in mine)
        items.append({
            "id": s["id"], "formation_titre": s.get("formation_titre"), "category": category,
            "date_debut": s["date_debut"], "date_fin": s["date_fin"],
            "heure_debut": s.get("heure_debut"), "heure_fin": s.get("heure_fin"),
            "creneau": s.get("creneau"), "lieu_ville": s.get("lieu_ville", ""),
            "nb_jours": stage_nb_jours(s), "ma_place": my_place,
            "places": {p: p not in occupied for p in places_of_category(category)},
            "mine": is_mine, "conflit": conflict,
            "peut_choisir": a_venir and not is_mine and not conflict and my_place not in occupied
            and not quota_depasse(jours, stage_nb_jours(s), quota),
            "peut_retirer": is_mine and a_venir and today <= deadline,
        })
    return {
        "year": year, "date_limite": deadline.isoformat(), "jours_places": jours,
        "quota_jours_annuel": quota, "sessions": items,
    }


async def _stage_ouvert(stage_id: str) -> tuple:
    stage = await db.stages.find_one({"id": stage_id}, {"_id": 0})
    if not stage or stage.get("statut") == "annule":
        raise HTTPException(status_code=404, detail="Session introuvable")
    if stage["date_debut"][:10] <= _today().isoformat():
        raise HTTPException(status_code=400, detail="Cette session a déjà commencé — contactez un agent")
    formation = await db.formations.find_one({"id": stage.get("formation_id")}, {"_id": 0, "category": 1})
    return stage, (formation or {}).get("category")


async def _write_team(stage: dict, ids: list, conflict_detail: str) -> None:
    # Filtre sur la liste lue juste avant : si un autre formateur s'est placé
    # entre-temps, rien n'est écrit plutôt que de lui prendre sa place.
    result = await db.stages.update_one(
        {"id": stage["id"], "animateur_ids": stage.get("animateur_ids")},
        {"$set": {"animateur_ids": ids, "animateur_id": ids[0] if ids else None, "updated_at": now_iso()}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=409, detail=conflict_detail)


async def _after_change(user: dict, stage: dict, category: Optional[str], action: str, push_title: str) -> None:
    if category == "PERMIS":
        await regenerate_convention_pdf(user["id"])
    await log_action(user, action, "stage", stage["id"], {"formation_titre": stage.get("formation_titre"), "date_debut": stage["date_debut"]})
    # Push uniquement : un formateur choisit une année entière de dates d'un
    # coup, un email par date saturerait les boîtes et le quota d'envoi.
    agents = await db.users.find({"active": True, "role": {"$in": _ROLES_NOTIFIES}}, {"_id": 0, "id": 1}).to_list(100)
    if agents:
        await send_push_to_users(
            [a["id"] for a in agents], push_title,
            f"{user.get('name', '')} — {stage.get('formation_titre', '')} du {stage['date_debut'][:10]}", "/admin/formateurs",
        )


async def place_formateur(user: dict, stage_id: str) -> dict:
    stage, category = await _stage_ouvert(stage_id)
    if category not in formateur_categories(user):
        raise HTTPException(status_code=403, detail="Cette formation ne fait pas partie de vos types de formations")
    ids = _stage_animateur_ids(stage)
    if user["id"] in ids:
        raise HTTPException(status_code=400, detail="Vous êtes déjà placé sur cette session")

    titres = await _titres_by_user([stage])
    if place_for(user.get("titre"), category) in _occupied(stage, category, titres):
        raise HTTPException(status_code=409, detail="Cette place n'est plus disponible")

    mine = await _my_stages(user["id"], int(stage["date_debut"][:4]))
    if any(stages_overlap(stage, m) for m in mine):
        raise HTTPException(status_code=409, detail="Vous êtes déjà placé sur une session à ces dates")
    jours = sum(stage_nb_jours(s) for s in mine)
    if quota_depasse(jours, stage_nb_jours(stage), user.get("quota_jours_annuel")):
        raise HTTPException(status_code=409, detail="Quota de jours atteint — contactez un agent pour une date supplémentaire")

    await _write_team(stage, ids + [user["id"]], "Cette place vient d'être prise")
    await _after_change(user, stage, category, "placement_formateur", "Nouveau placement formateur")
    return {"ok": True}


async def retirer_formateur(user: dict, stage_id: str) -> dict:
    stage, category = await _stage_ouvert(stage_id)
    ids = _stage_animateur_ids(stage)
    if user["id"] not in ids:
        raise HTTPException(status_code=400, detail="Vous n'êtes pas placé sur cette session")
    if _today() > planning_deadline(int(stage["date_debut"][:4])):
        raise HTTPException(status_code=403, detail="Date limite passée — contactez un agent pour modifier ce placement")
    await _write_team(stage, [i for i in ids if i != user["id"]], "La session vient d'être modifiée, réessayez")
    await _after_change(user, stage, category, "retrait_placement_formateur", "Placement formateur retiré")
    return {"ok": True}


async def agenda(start: str, end: str) -> list:
    """Sessions qui chevauchent [start, end] avec, pour chaque place, les
    formateurs qui l'occupent — vue des agents (page Formateurs), qui eux
    voient les noms, contrairement au formateur dans son espace."""
    stages = await db.stages.find(
        {"date_debut": {"$lte": f"{end}T23:59:59"}, "date_fin": {"$gte": start}, "statut": {"$ne": "annule"}},
        {"_id": 0},
    ).sort("date_debut", 1).to_list(2000)
    categories = await _categories_by_formation()
    ids = {aid for s in stages for aid in _stage_animateur_ids(s)}
    users = await db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "name": 1, "titre": 1}).to_list(len(ids) or 1)
    by_id = {u["id"]: u for u in users}

    items = []
    for s in stages:
        category = categories.get(s.get("formation_id"))
        places = {p: [] for p in places_of_category(category)}
        for aid in _stage_animateur_ids(s):
            u = by_id.get(aid, {"id": aid, "name": "Compte supprimé"})
            places.setdefault(place_for(u.get("titre"), category), []).append({"id": aid, "name": u.get("name", "")})
        items.append({
            "id": s["id"], "formation_titre": s.get("formation_titre"), "category": category,
            "date_debut": s["date_debut"][:10], "date_fin": s["date_fin"][:10],
            "heure_debut": s.get("heure_debut"), "heure_fin": s.get("heure_fin"),
            "lieu_ville": s.get("lieu_ville", ""), "places": places,
        })
    return items


async def planning_overview(year: int) -> dict:
    """Jours placés par formateur sur l'année, pour les agents (page Formateurs)
    et le rappel annuel."""
    stages = await db.stages.find(
        {"date_debut": _year_query(year), "statut": {"$ne": "annule"}},
        {"_id": 0, "animateur_ids": 1, "animateur_id": 1, "date_debut": 1, "date_fin": 1},
    ).to_list(5000)
    jours = {}
    for s in stages:
        for aid in _stage_animateur_ids(s):
            jours[aid] = jours.get(aid, 0) + stage_nb_jours(s)
    return jours
