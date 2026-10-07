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
from models.call_appointment import CallAppointmentIn, CallAppointmentUpdate
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
        "note": payload.note,
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


# ---- Agenda d'appel (créneaux à appeler, logique de call-center) ----
# Collection dédiée (db.call_appointments), distincte de db.appointment_slots
# (créneaux multi-places en self-service pour les candidats). Deux façons
# d'y arriver :
#  - en masse, depuis un import Cosmosia (routers/cosmosia_import.py) : le
#    créneau est créé "disponible", sans agent, daté depuis le CSV — visible
#    de toute l'équipe commerciale, pris par le premier qui clique dessus
#    (logique de centre d'appel : "je me l'attribue").
#  - manuellement (POST ci-dessous) : un agent (ou un responsable pour un
#    tiers) programme directement un appel daté/assigné — déjà "planifié"
#    sans étape d'attribution, avec rappel par email avant l'heure (voir
#    services/staff_notify.py et la boucle de fond dans server.py).
APPOINTMENT_STATUS_LABELS = {
    "disponible": "Disponible",
    "planifie": "Planifié",
    "traite": "Traité",
    "annule": "Annulé",
}
# Statuts "actifs" du point de vue de qui a la main sur le créneau — un
# agent voit toujours ses propres créneaux (peu importe le statut) + le pool
# partagé non encore pris, pour pouvoir se l'attribuer.
_POOL_STATUS = "disponible"


@router.get("/appointments")
async def list_call_appointments(
    date_from: Optional[str] = None, date_to: Optional[str] = None,
    commercial_id: Optional[str] = None, status: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    query: Dict = {}
    if commercial_id:
        query["commercial_id"] = commercial_id
    elif user["role"] in ("commercial", "responsable_commercial"):
        # Un commercial voit ses propres créneaux (tous statuts) + le pool
        # partagé pas encore attribué — jamais les créneaux déjà pris par
        # un collègue, qui disparaissent de sa vue dès l'attribution.
        query["$or"] = [{"commercial_id": user["id"]}, {"status": _POOL_STATUS}]
    if status:
        query["status"] = status
    if date_from or date_to:
        range_q = {}
        if date_from:
            range_q["$gte"] = date_from
        if date_to:
            range_q["$lte"] = f"{date_to}T23:59:59.999999"
        query["scheduled_at"] = range_q
    items = await db.call_appointments.find(query, {"_id": 0}).sort("scheduled_at", 1).to_list(2000)
    return {"items": items, "status_options": APPOINTMENT_STATUS_LABELS}


@router.post("/appointments")
async def create_call_appointment(payload: CallAppointmentIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Création manuelle — contrairement aux créneaux générés en masse par
    l'import Cosmosia (toujours "disponible", sans agent), un créneau créé
    ici a un agent dès le départ (soi-même par défaut) et est donc déjà
    "planifié", sans étape d'attribution à franchir."""
    lead = await db.leads.find_one({"id": payload.lead_id}, {"_id": 0})
    if not lead:
        # Prospects Meta (db.meta_lead_imports) — collection séparée de
        # Prospects/Cosmosia (db.leads), voir routers/meta_lead_import.py.
        # Un rendez-vous pris depuis la page Prospects Meta doit fonctionner
        # exactement comme depuis la page Prospects, donc on y cherche aussi.
        lead = await db.meta_lead_imports.find_one({"id": payload.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead introuvable")

    commercial_id = payload.commercial_id or user["id"]
    commercial = await db.users.find_one({"id": commercial_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not commercial:
        raise HTTPException(status_code=404, detail="Agent introuvable")

    appt = {
        "id": str(uuid.uuid4()), "lead_id": payload.lead_id,
        "lead_name": lead.get("name"), "lead_phone": lead.get("phone"), "lead_email": lead.get("email"),
        "lead_interest": lead.get("interest"),
        "commercial_id": commercial_id, "commercial_name": commercial.get("name", ""),
        "scheduled_at": payload.scheduled_at, "notes": payload.notes or "",
        "status": "planifie", "reminder_sent": False, "source": "manuel",
        "kind": payload.kind or "appel", "location": payload.location,
        "formation_id": payload.formation_id, "formation_titre": payload.formation_titre,
        "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.call_appointments.insert_one(appt)
    await log_action(user, "rdv_appel_cree", "lead", payload.lead_id, {
        "lead_name": lead.get("name"), "scheduled_at": payload.scheduled_at, "commercial_name": commercial.get("name", ""),
    })
    appt.pop("_id", None)
    return appt


@router.post("/appointments/{appointment_id}/claim")
async def claim_call_appointment(appointment_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Un agent s'attribue un créneau du pool partagé (issu de l'import
    Cosmosia) : l'attribution ET le traitement n'est qu'une seule action
    (pas d'étape "en cours" intermédiaire) — le créneau passe "traité",
    porte le nom de l'agent, et disparaît immédiatement de la liste des
    autres commerciaux. Le filtre `status: _POOL_STATUS` dans la requête
    d'update est ce qui rend l'opération atomique : si deux agents cliquent
    au même moment, un seul des deux `update_one` trouve encore le document
    à l'état "disponible" et le modifie — l'autre récupère matched_count=0
    et reçoit un 409, sans jamais écraser la première attribution."""
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Créneau introuvable")
    result = await db.call_appointments.update_one(
        {"id": appointment_id, "status": _POOL_STATUS},
        {"$set": {
            "status": "traite", "commercial_id": user["id"], "commercial_name": user.get("name", ""),
            "claimed_at": now_iso(), "updated_at": now_iso(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=409, detail="Ce créneau vient d'être pris par un autre agent")
    await log_action(user, "appel_attribue", "lead", appt.get("lead_id"), {
        "lead_name": appt.get("lead_name"), "scheduled_at": appt.get("scheduled_at"),
    })
    return await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})


@router.patch("/appointments/{appointment_id}")
async def update_call_appointment(
    appointment_id: str, payload: CallAppointmentUpdate, user: dict = Depends(require_role(*ROLES_LEADS)),
):
    existing = await db.call_appointments.find_one({"id": appointment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not updates:
        return {**existing, "_id": None}
    if updates.get("status") and updates["status"] not in APPOINTMENT_STATUS_LABELS:
        raise HTTPException(status_code=400, detail="Statut inconnu")
    if updates.get("commercial_id"):
        commercial = await db.users.find_one({"id": updates["commercial_id"]}, {"_id": 0, "id": 1, "name": 1})
        if not commercial:
            raise HTTPException(status_code=404, detail="Agent introuvable")
        updates["commercial_name"] = commercial.get("name", "")
    if "scheduled_at" in updates:
        # Reporté à une autre heure/date -> le rappel doit repartir.
        updates["reminder_sent"] = False
    updates["updated_at"] = now_iso()
    await db.call_appointments.update_one({"id": appointment_id}, {"$set": updates})
    return await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})


@router.delete("/appointments/{appointment_id}")
async def delete_call_appointment(appointment_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    result = await db.call_appointments.delete_one({"id": appointment_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    return {"ok": True}
