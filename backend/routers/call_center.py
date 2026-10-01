"""Espace commercial (call-center) : file d'appel, journal d'appels (pour
garder un historique par appel — motif d'objection, note — au lieu de
seulement le dernier contact sur le lead), statistiques par agent, et
scripts d'appel partagés.

Pas de nouveau rôle : l'attribution des leads à un agent "commercial" reste
celle déjà en place sur la page Prospects (routers/leads.py), via
assigned_categories sur le profil employé — on réutilise exactement la même
règle de scope ici pour que la file d'appel corresponde à ce que l'agent
voit déjà dans Prospects."""
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS, ROLES_TEAM_MGMT
from core.utils import now_iso
from models.commercial_call import CallLogIn, CallScriptIn, CallScriptUpdate
from services.activity import log_action

router = APIRouter(prefix="/call-center", tags=["call-center"])

CALL_OUTCOMES = {
    "interesse": "Intéressé",
    "inscrit": "Inscrit",
    "a_relancer": "À relancer",
    "pas_de_reponse": "Pas de réponse",
    "injoignable": "Injoignable",
    "pas_interesse": "Plus intéressé",
}

# Mappe l'issue d'un appel sur le statut du lead (routers/leads.py) — "inscrit"
# n'est pas un statut de lead (l'inscription réelle se fait depuis le dossier),
# on le ramène donc à "interesse" côté lead tout en gardant "inscrit" dans
# l'historique d'appel pour le calcul du CA prévisionnel.
_OUTCOME_TO_LEAD_STATUS = {
    "interesse": "interesse", "inscrit": "interesse", "pas_interesse": "pas_interesse",
    "a_relancer": "nouveau", "pas_de_reponse": "nouveau", "injoignable": "nouveau",
}
_RECALL_OUTCOMES = {"a_relancer", "pas_de_reponse", "injoignable"}


def _scope_query(user: dict) -> dict:
    """Même règle que GET /leads : un commercial avec des catégories assignées
    ne voit/n'appelle que ses leads (+ ceux sans catégorie déduite)."""
    assigned = user.get("assigned_categories") or []
    if user["role"] in ("commercial", "responsable_commercial") and assigned:
        return {"$or": [{"category": {"$in": assigned}}, {"category": None}, {"category": {"$exists": False}}]}
    return {}


@router.get("/queue")
async def call_queue(
    status: Optional[str] = None,
    recall_only: bool = False,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    query: Dict = _scope_query(user)
    if status:
        query["status"] = status
    if recall_only:
        query["tags"] = "a_appeler"
    if search:
        query["$and"] = query.get("$and", []) + [{"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]}]
    total = await db.leads.count_documents(query)
    items = await db.leads.find(query, {"_id": 0}) \
        .sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max((total + page_size - 1) // page_size, 1), "outcome_options": CALL_OUTCOMES}


@router.get("/leads/{lead_id}/calls")
async def list_calls_for_lead(lead_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    return await db.commercial_calls.find({"lead_id": lead_id}, {"_id": 0}).sort("at", -1).to_list(500)


@router.post("/calls")
async def log_call(payload: CallLogIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    if payload.outcome not in CALL_OUTCOMES:
        raise HTTPException(status_code=400, detail="Issue d'appel inconnue")
    lead = await db.leads.find_one({"id": payload.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead introuvable")

    call = {
        "id": str(uuid.uuid4()), "lead_id": payload.lead_id, "lead_name": lead.get("name"),
        "agent_id": user["id"], "agent_name": user.get("name", ""),
        "outcome": payload.outcome, "objection_reason": payload.objection_reason, "note": payload.note,
        "at": now_iso(),
    }
    await db.commercial_calls.insert_one(call)
    await log_action(user, "appel", "lead", payload.lead_id, {
        "outcome": payload.outcome, "lead_name": lead.get("name"), "objection_reason": payload.objection_reason,
    })

    lead_update = {
        "contacted": True, "status": _OUTCOME_TO_LEAD_STATUS[payload.outcome],
        "last_contacted_by": user["id"], "last_contacted_at": now_iso(), "updated_at": now_iso(),
    }
    if payload.objection_reason:
        lead_update["objection_reason"] = payload.objection_reason
    if payload.note:
        # On garde la note du dernier appel visible sur le lead sans écraser
        # l'historique (celui-ci reste dans commercial_calls).
        lead_update["notes"] = payload.note
    await db.leads.update_one({"id": payload.lead_id}, {"$set": lead_update})
    if payload.outcome in _RECALL_OUTCOMES:
        await db.leads.update_one({"id": payload.lead_id}, {"$addToSet": {"tags": "a_appeler"}})
    else:
        await db.leads.update_one({"id": payload.lead_id}, {"$pull": {"tags": "a_appeler"}})

    call.pop("_id", None)
    return call


def _period_bounds(period: str) -> str:
    now = datetime.now(timezone.utc)
    if period == "month":
        return now.strftime("%Y-%m")
    return now.strftime("%Y-%m-%d")


@router.get("/stats")
async def call_stats(
    period: str = "day",  # "day" | "month"
    agent_id: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    """Stats d'appels par agent : nombre d'appels, taux de conversion, CA
    prévisionnel (nb d'issues "interesse"/"inscrit" × prix moyen formation).
    Un commercial/responsable_commercial ne voit que ses propres stats ; les
    rôles admin/admission voient tout (ou un agent précis via ?agent_id)."""
    if period not in ("day", "month"):
        raise HTTPException(status_code=400, detail="period invalide (day|month)")
    prefix = _period_bounds(period)

    query: Dict = {"at": {"$regex": f"^{prefix}"}}
    if user["role"] in ("commercial", "responsable_commercial") and not agent_id:
        query["agent_id"] = user["id"]
    elif agent_id:
        query["agent_id"] = agent_id

    calls = await db.commercial_calls.find(query, {"_id": 0}).to_list(50000)

    by_agent: Dict[str, dict] = {}
    for c in calls:
        agent = by_agent.setdefault(c["agent_id"], {
            "agent_id": c["agent_id"], "agent_name": c.get("agent_name", ""),
            "calls": 0, "interesse": 0, "inscrit": 0, "pas_interesse": 0, "a_relancer": 0,
        })
        agent["calls"] += 1
        if c["outcome"] in ("interesse", "inscrit", "pas_interesse", "a_relancer"):
            agent[c["outcome"]] += 1

    avg_price_doc = await db.formations.aggregate([
        {"$match": {"price": {"$gt": 0}}}, {"$group": {"_id": None, "avg": {"$avg": "$price"}}}
    ]).to_list(1)
    avg_price = avg_price_doc[0]["avg"] if avg_price_doc else 0

    agents = []
    for a in by_agent.values():
        converted = a["interesse"] + a["inscrit"]
        a["conversion_rate"] = round(converted / a["calls"] * 100, 1) if a["calls"] else 0
        a["forecast_revenue"] = round(converted * avg_price, 2)
        agents.append(a)
    agents.sort(key=lambda a: a["calls"], reverse=True)

    return {
        "period": period, "date": prefix, "agents": agents,
        "totals": {
            "calls": sum(a["calls"] for a in agents),
            "conversion_rate": round(
                sum(a["interesse"] + a["inscrit"] for a in agents) / sum(a["calls"] for a in agents) * 100, 1
            ) if agents and sum(a["calls"] for a in agents) else 0,
            "forecast_revenue": round(sum(a["forecast_revenue"] for a in agents), 2),
        },
    }


# ---- Scripts d'appel (partagés entre agents, éditables par l'équipe commerciale) ----

@router.get("/scripts")
async def list_scripts(user: dict = Depends(require_role(*ROLES_LEADS))):
    return await db.call_scripts.find({}, {"_id": 0}).sort("title", 1).to_list(500)


@router.post("/scripts")
async def create_script(payload: CallScriptIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "created_at": now_iso(), "updated_at": now_iso()})
    await db.call_scripts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/scripts/{script_id}")
async def update_script(script_id: str, payload: CallScriptUpdate, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    existing = await db.call_scripts.find_one({"id": script_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Script introuvable")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = now_iso()
    await db.call_scripts.update_one({"id": script_id}, {"$set": updates})
    return await db.call_scripts.find_one({"id": script_id}, {"_id": 0})


@router.delete("/scripts/{script_id}")
async def delete_script(script_id: str, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    result = await db.call_scripts.delete_one({"id": script_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Script introuvable")
    return {"ok": True}
