"""Espace commercial (call-center) : file d'appel, journal d'appels (pour
garder un historique par appel — motif d'objection, note — au lieu de
seulement le dernier contact sur le lead), statistiques par agent, et
scripts d'appel partagés.

Pas de nouveau rôle : l'attribution des leads à un agent "commercial" reste
celle déjà en place sur la page Prospects (routers/leads.py), via
assigned_categories sur le profil employé — on réutilise exactement la même
règle de scope ici pour que la file d'appel corresponde à ce que l'agent
voit déjà dans Prospects."""
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS, ROLES_TEAM_MGMT, effective_assigned_categories
from core.utils import now_iso
from models.commercial_call import CallLogIn, CallScriptIn, CallScriptUpdate
from models.call_appointment import (
    CallAppointmentIn, CallAppointmentUpdate, RdvResultatIn, RdvNoteIn, RdvQualificationIn,
    NouveauContactIn, RappelIn, RappelTentativeIn, RappelUpdate,
)
from services.activity import log_action
from services.appointment_notify import cancel_to_prospect, confirm_to_prospect
from core import rdv_suivi
from core.rdv_suivi import PARIS

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
    assigned = effective_assigned_categories(user)
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
    # Résultats saisis par la personne assignée (suivi des RDV, 2026-11-10).
    "effectue": "Effectué",
    "absent": "Lead absent",
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
    now = datetime.now(PARIS)
    for a in items:
        a["statut_suivi"] = rdv_suivi.statut_suivi(a, now)
    return {"items": items, "status_options": APPOINTMENT_STATUS_LABELS}


# ---- Suivi des rendez-vous (cahier des charges « Rendez-vous dans le CRM »,
# 2026-11-10) : créneaux disponibles de la personne assignée, onglet
# Rendez-vous (mes RDV du jour / équipe) et saisie du résultat. Règles :
# core/rdv_suivi.py ; notification « sans retour » : services/staff_notify.py.

async def _rdv_planifies(commercial_id: str) -> list:
    return await db.call_appointments.find(
        {"commercial_id": commercial_id, "status": "planifie"}, {"_id": 0, "id": 1, "scheduled_at": 1},
    ).to_list(2000)


async def _check_creneau_libre(commercial_id: str, scheduled_at: str, exclude_id: Optional[str] = None) -> None:
    if rdv_suivi.en_conflit(scheduled_at, await _rdv_planifies(commercial_id), exclude_id):
        raise HTTPException(status_code=409, detail="Ce créneau n'est plus disponible — choisissez-en un autre")


# Personnes qui peuvent assurer un rendez-vous (choisies à la réservation).
RDV_ASSIGNABLE_ROLES = ["admin", "responsable_admission", "agent_admin", "agent_telephonique", "commercial", "responsable_commercial", "employe"]


@router.get("/assignees")
async def rdv_assignees(user: dict = Depends(require_role(*ROLES_LEADS))):
    users = await db.users.find(
        {"active": True, "role": {"$in": RDV_ASSIGNABLE_ROLES}}, {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).to_list(500)
    return sorted((u for u in users if u.get("name")), key=lambda u: u["name"].lower())


@router.get("/availability")
async def appointment_availability(commercial_id: str, date: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Créneaux de 30 min (9h-18h, lundi-samedi) de la personne qui assurera
    le RDV, avec ceux déjà pris ou passés."""
    from datetime import date as _date
    try:
        jour = _date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date invalide")
    return {"date": date, "creneaux": rdv_suivi.creneaux(jour, await _rdv_planifies(commercial_id), datetime.now(PARIS))}


@router.get("/rendez-vous")
async def list_rendez_vous(
    vue: str = "moi", date_from: Optional[str] = None, date_to: Optional[str] = None,
    commercial_id: Optional[str] = None, categorie: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    """Onglet Rendez-vous : `vue=moi` (mes RDV, aujourd'hui par défaut) ou
    `vue=equipe` (tous les RDV attribués, avec la personne assignée).
    `categorie` : onglets par catégorie de formation (2026-11-24), déduite
    de la formation du RDV, sinon de l'intérêt du prospect."""
    today = datetime.now(PARIS).date().isoformat()
    date_from, date_to = date_from or today, date_to or date_from or today
    query: Dict = {"status": {"$ne": "disponible"}}
    if vue == "moi":
        query["commercial_id"] = user["id"]
    elif commercial_id:
        query["commercial_id"] = commercial_id
    items = await db.call_appointments.find(query, {"_id": 0}).sort("scheduled_at", 1).to_list(5000)
    now = datetime.now(PARIS)
    out = []
    for a in items:
        d = rdv_suivi.parse(a.get("scheduled_at"))
        if not d or not (date_from <= d.date().isoformat() <= date_to):
            continue
        a["statut_suivi"] = rdv_suivi.statut_suivi(a, now)
        a["date_paris"], a["heure_paris"] = d.date().isoformat(), d.strftime("%H:%M")
        out.append(a)
    await _avec_formation(out)
    categories: Dict[str, int] = {}
    for a in out:
        categories[a["categorie"]] = categories.get(a["categorie"], 0) + 1
    if categorie:
        out = [a for a in out if a["categorie"] == categorie]
    await _avec_qualification(out)
    await _avec_auteur(out)
    return {"items": out, "statuts": rdv_suivi.STATUTS, "date_from": date_from, "date_to": date_to,
            "categories": categories, "categorie_labels": {**_CATEGORIE_LABELS}}


_CATEGORIE_LABELS = {
    "VTC_TAXI": "VTC / Taxi", "CACES": "CACES", "PERMIS": "Récupération de points", "AUTO_ECOLE": "Auto-école",
    "SSIAP": "SSIAP", "ECSR": "ECSR", "VENTE": "Conseiller de vente", "AUTRE": "Non précisée",
}


async def _avec_formation(appts: list) -> None:
    """Formation qui intéresse le prospect (2026-11-24) : celle choisie au
    RDV, sinon l'intérêt de sa fiche ; et sa catégorie (onglets)."""
    from routers.leads import _category_for_interest
    manquants = list({a.get("lead_id") for a in appts if a.get("lead_id") and not (a.get("formation_titre") or a.get("lead_interest"))})
    interets = {}
    if manquants:
        for l in await db.leads.find({"id": {"$in": manquants}}, {"_id": 0, "id": 1, "interest": 1}).to_list(len(manquants)):
            interets[l["id"]] = l.get("interest")
    for a in appts:
        formation = a.get("formation_titre") or a.get("lead_interest") or interets.get(a.get("lead_id")) or ""
        a["formation_interessee"] = formation
        a["categorie"] = _category_for_interest(formation) or "AUTRE"



async def _avec_auteur(appts: list) -> None:
    """Qui a placé chaque RDV et quand (demande du 2026-11-19) : la personne
    qui l'a créé, ou, pour un créneau Cosmosia, l'agent qui se l'est attribué.
    Les RDV antérieurs n'ont que l'identifiant : le nom est retrouvé ici."""
    ids = list({a.get("created_by") for a in appts if a.get("created_by") and not a.get("created_by_name")})
    names = {}
    if ids:
        for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(ids)):
            names[u["id"]] = u.get("name") or ""
    for a in appts:
        if a.get("claimed_at"):
            a["place_par_name"], a["place_le"] = a.get("commercial_name") or "", a["claimed_at"]
        else:
            a["place_par_name"] = a.get("created_by_name") or names.get(a.get("created_by")) or ""
            a["place_le"] = a.get("created_at")


async def _avec_qualification(appts: list) -> None:
    """Qualification actuelle du prospect de chaque RDV (même vocabulaire et
    même source que les pages Leads et Marketing : statut unifié traduit par
    statut_to_qualification ; champ `qualification` pour les anciens imports
    Meta)."""
    from services.lead_migration import statut_to_qualification
    ids = list({a.get("lead_id") for a in appts if a.get("lead_id")})
    if not ids:
        return
    quals = {}
    for lead in await db.leads.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "statut": 1, "motif_cloture": 1, "chaleur": 1}).to_list(len(ids)):
        quals[lead["id"]] = statut_to_qualification(lead)
    reste = [i for i in ids if i not in quals]
    if reste:
        for lead in await db.meta_lead_imports.find({"id": {"$in": reste}}, {"_id": 0, "id": 1, "qualification": 1}).to_list(len(reste)):
            quals[lead["id"]] = lead.get("qualification") or "a_contacter"
    for a in appts:
        a["lead_qualification"] = quals.get(a.get("lead_id"))


@router.put("/appointments/{appointment_id}/qualification")
async def qualifier_rendez_vous(appointment_id: str, payload: RdvQualificationIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Qualifie le prospect d'un RDV depuis l'onglet Rendez-vous (demande du
    2026-11-12), exactement comme depuis Leads/Marketing : même endpoint de
    mise à jour pour les prospects (statut unifié, historique, relances
    automatiques), champ `qualification` pour les anciens imports Meta. La
    qualification choisie est aussi gardée sur le RDV, avec qui et quand."""
    from routers.meta_lead_import import QUALIFICATION_LABELS
    if payload.qualification not in QUALIFICATION_LABELS:
        raise HTTPException(status_code=400, detail="Qualification inconnue")
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    lead_id = appt.get("lead_id")
    if lead_id and await db.leads.find_one({"id": lead_id}, {"_id": 0, "id": 1}):
        from models.lead import LeadUpdate
        from routers.leads import update_lead
        await update_lead(lead_id, LeadUpdate(qualification=payload.qualification), user)
    elif lead_id and await db.meta_lead_imports.find_one({"id": lead_id}, {"_id": 0, "id": 1}):
        await db.meta_lead_imports.update_one({"id": lead_id}, {"$set": {
            "qualification": payload.qualification, "qualified_by": user["id"], "qualified_by_name": user.get("name", ""),
            "qualified_at": now_iso(), "updated_at": now_iso()}})
        await log_action(user, "lead_qualifie", "lead", lead_id, {"name": appt.get("lead_name"), "qualification": payload.qualification, "rdv_id": appointment_id})
    else:
        raise HTTPException(status_code=404, detail="Prospect du rendez-vous introuvable")
    entry = {"qualification": payload.qualification, "at": now_iso(), "by_id": user["id"], "by_name": user.get("name", "")}
    await db.call_appointments.update_one({"id": appointment_id}, {
        "$set": {"qualification_rdv": entry, "updated_at": now_iso()}, "$push": {"qualification_history": entry}})
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    d = rdv_suivi.parse(appt.get("scheduled_at"))
    appt["statut_suivi"] = rdv_suivi.statut_suivi(appt, datetime.now(PARIS))
    if d:
        appt["date_paris"], appt["heure_paris"] = d.date().isoformat(), d.strftime("%H:%M")
    await _avec_qualification([appt])
    await _avec_auteur([appt])
    return appt


@router.post("/appointments/{appointment_id}/notes")
async def add_rendez_vous_note(appointment_id: str, payload: RdvNoteIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Note prise pendant ou après un rendez-vous (demande du 2026-11-12) :
    ajoutée à l'historique du RDV et à celui du prospect (Leads, Cosmosia,
    Meta), pour retrouver le suivi depuis les deux côtés."""
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note vide")
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    note = {"text": text, "at": now_iso(), "by_id": user["id"], "by_name": user.get("name", "")}
    await db.call_appointments.update_one(
        {"id": appointment_id}, {"$push": {"notes_history": note}, "$set": {"updated_at": now_iso()}})

    from services.appointment_notify import format_rdv
    lead_note = {**note, "text": f"📅 RDV du {format_rdv(appt.get('scheduled_at'))} : {text}", "rdv_id": appointment_id}
    for coll in (db.leads, db.meta_lead_imports):
        res = await coll.update_one({"id": appt.get("lead_id")}, {
            "$push": {"notes_history": {"$each": [lead_note], "$slice": -20}},
            "$set": {"notes": lead_note["text"], "notes_updated_at": note["at"], "notes_updated_by": user["id"],
                     "notes_updated_by_name": user.get("name", ""), "updated_at": now_iso()},
        })
        if getattr(res, "matched_count", 0):
            if coll is db.leads:
                from routers.leads import _leads_cache_clear
                _leads_cache_clear()
            break
    await log_action(user, "rdv_note", "lead", appt.get("lead_id"), {"lead_name": appt.get("lead_name"), "note": text})
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    appt["statut_suivi"] = rdv_suivi.statut_suivi(appt, datetime.now(PARIS))
    return appt


@router.post("/appointments/{appointment_id}/resultat")
async def set_rendez_vous_result(appointment_id: str, payload: RdvResultatIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    """La personne assignée (ou un responsable) indique si le RDV a eu lieu."""
    if payload.resultat not in rdv_suivi.RESULTATS:
        raise HTTPException(status_code=400, detail="Résultat inconnu (effectue ou absent)")
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    if appt.get("commercial_id") != user["id"] and user["role"] not in ("admin", "responsable_admission", "responsable_commercial"):
        raise HTTPException(status_code=403, detail="Seule la personne assignée peut renseigner ce rendez-vous")
    if appt.get("status") == "annule":
        raise HTTPException(status_code=400, detail="Rendez-vous annulé")
    await db.call_appointments.update_one({"id": appointment_id}, {"$set": {
        "status": payload.resultat, "resultat_commentaire": (payload.commentaire or "").strip() or None,
        "resultat_at": now_iso(), "resultat_by": user["id"], "resultat_by_name": user.get("name"), "updated_at": now_iso(),
    }})
    await log_action(user, f"rdv_{payload.resultat}", "lead", appt.get("lead_id"), {
        "lead_name": appt.get("lead_name"), "scheduled_at": appt.get("scheduled_at")})
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    appt["statut_suivi"] = rdv_suivi.statut_suivi(appt, datetime.now(PARIS))
    return appt


async def _student_as_contact(student_id: str) -> Optional[dict]:
    """Un apprenant (compte `etudiant`) présenté comme un contact de RDV :
    nom, email, téléphone (celui du compte, sinon de sa dernière
    inscription) et formation de sa dernière inscription."""
    student = await db.users.find_one({"id": student_id, "role": "etudiant"}, {"_id": 0, "password_hash": 0})
    if not student:
        return None
    insc = await db.inscriptions.find(
        {"student_id": student_id}, {"_id": 0, "student_phone": 1, "formation_title": 1, "status": 1},
    ).sort("created_at", -1).limit(1).to_list(1)
    insc = insc[0] if insc else {}
    return {
        "id": student["id"], "name": student.get("name"), "email": student.get("email"),
        "phone": student.get("phone") or insc.get("student_phone"),
        "interest": insc.get("formation_title"), "formation": insc.get("formation_title"),
        "type": "inscrit" if insc else "apprenant",
    }


@router.get("/people")
async def search_people(q: str = "", user: dict = Depends(require_role(*ROLES_LEADS))):
    """Recherche d'une personne pour un RDV (Agenda) : inscrits/apprenants
    ET prospects — avant, seuls les prospects étaient proposés."""
    q = (q or "").strip()
    if len(q) < 2:
        return []
    rx = {"$regex": re.escape(q), "$options": "i"}
    proj = {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "interest": 1}
    results, seen_emails = [], set()

    students = await db.users.find(
        {"role": "etudiant", "$or": [{"name": rx}, {"email": rx}, {"phone": rx}]}, {"_id": 0, "id": 1},
    ).limit(8).to_list(8)
    ids = [s["id"] for s in students]
    # Téléphone parfois saisi seulement sur l'inscription : on cherche aussi là.
    for i in await db.inscriptions.find(
        {"$or": [{"student_name": rx}, {"student_email": rx}, {"student_phone": rx}]}, {"_id": 0, "student_id": 1},
    ).limit(8).to_list(8):
        if i.get("student_id") and i["student_id"] not in ids:
            ids.append(i["student_id"])
    for sid in ids[:8]:
        c = await _student_as_contact(sid)
        if c:
            results.append(c)
            if c.get("email"):
                seen_emails.add(c["email"].lower())

    for coll in ("leads", "meta_lead_imports"):
        for l in await db[coll].find({"$or": [{"name": rx}, {"email": rx}, {"phone": rx}]}, proj).limit(8).to_list(8):
            email = (l.get("email") or "").lower()
            if email and email in seen_emails:
                continue  # déjà proposé (inscrit, ou même prospect dans l'autre liste)
            if email:
                seen_emails.add(email)
            results.append({**l, "type": "prospect"})
    return results[:15]


# Qualifications plus avancées qu'un RDV : jamais rétrogradées.
_QUALIF_APRES_RDV = ("inscrit", "paye")


async def _qualifier_rdv_pris(lead_id: str, user: dict) -> None:
    """Prospect de n'importe quelle liste (Leads, Cosmosia, Meta, Centre
    d'appel) passé en « Rendez-vous pris » quand un agent lui place un RDV
    (demande du 2026-11-10). Un prospect déjà inscrit ou payé reste tel quel."""
    stamp = {"qualified_by": user["id"], "qualified_by_name": user.get("name", ""),
             "qualified_at": now_iso(), "updated_at": now_iso()}
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "statut": 1, "name": 1})
    if lead is not None:
        if lead.get("statut") in _QUALIF_APRES_RDV:
            return
        await db.leads.update_one({"id": lead_id}, {"$set": {
            "statut": "rendez_vous", "chaleur": "chaud", "motif_cloture": None, **stamp}})
        from routers.leads import _leads_cache_clear
        _leads_cache_clear()
    else:
        lead = await db.meta_lead_imports.find_one({"id": lead_id}, {"_id": 0, "qualification": 1, "name": 1})
        if not lead or lead.get("qualification") in _QUALIF_APRES_RDV:
            return
        await db.meta_lead_imports.update_one({"id": lead_id}, {"$set": {"qualification": "rdv_pris", **stamp}})
    await log_action(user, "lead_qualifie", "lead", lead_id, {"name": lead.get("name"), "qualification": "rdv_pris", "auto": True})


@router.post("/appointments")
async def create_call_appointment(payload: CallAppointmentIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Création manuelle — contrairement aux créneaux générés en masse par
    l'import Cosmosia (toujours "disponible", sans agent), un créneau créé
    ici a un agent dès le départ (soi-même par défaut) et est donc déjà
    "planifié", sans étape d'attribution à franchir.
    Sans lead_id, `nouveau_contact` crée le prospect (ou retrouve la fiche
    existante par email / téléphone) — RDV saisi à la main, 2026-11-24."""
    if not payload.lead_id:
        if not payload.nouveau_contact:
            raise HTTPException(status_code=400, detail="Choisissez une personne ou saisissez ses coordonnées")
        new_lead = await _lead_depuis_contact(payload.nouveau_contact, user, payload.formation_titre, "rdv_manuel")
        payload.lead_id = new_lead["id"]
    lead = await db.leads.find_one({"id": payload.lead_id}, {"_id": 0})
    if not lead:
        # Prospects Meta (db.meta_lead_imports) — collection séparée de
        # Prospects/Cosmosia (db.leads), voir routers/meta_lead_import.py.
        # Un rendez-vous pris depuis la page Prospects Meta doit fonctionner
        # exactement comme depuis la page Prospects, donc on y cherche aussi.
        lead = await db.meta_lead_imports.find_one({"id": payload.lead_id}, {"_id": 0})
    person_type = "prospect"
    if not lead:
        # Inscrit ou apprenant (compte étudiant) — demande du 2026-11-06 :
        # l'agenda doit aussi permettre un RDV avec une personne déjà inscrite.
        lead = await _student_as_contact(payload.lead_id)
        person_type = (lead or {}).get("type") or person_type
    if not lead:
        raise HTTPException(status_code=404, detail="Personne introuvable")

    commercial_id = payload.commercial_id or user["id"]
    commercial = await db.users.find_one({"id": commercial_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not commercial:
        raise HTTPException(status_code=404, detail="Agent introuvable")
    await _check_creneau_libre(commercial_id, payload.scheduled_at)

    appt = {
        "id": str(uuid.uuid4()), "lead_id": payload.lead_id,
        "lead_name": lead.get("name"), "lead_phone": lead.get("phone"), "lead_email": lead.get("email"),
        "lead_interest": lead.get("interest") or payload.formation_titre,
        "commercial_id": commercial_id, "commercial_name": commercial.get("name", ""),
        "scheduled_at": payload.scheduled_at, "notes": payload.notes or "",
        "status": "planifie", "reminder_sent": False, "source": "manuel", "person_type": person_type,
        "kind": payload.kind or "appel", "location": payload.location,
        "formation_id": payload.formation_id, "formation_titre": payload.formation_titre,
        "created_by": user["id"], "created_by_name": user.get("name", ""),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.call_appointments.insert_one(appt)
    if person_type == "prospect":
        await _qualifier_rdv_pris(payload.lead_id, user)
    await log_action(user, "rdv_appel_cree", "lead", payload.lead_id, {
        "lead_name": lead.get("name"), "scheduled_at": payload.scheduled_at, "commercial_name": commercial.get("name", ""),
    })
    appt.pop("_id", None)
    # Confirmation au prospect (email + SMS) — demande du 2026-11-06.
    await confirm_to_prospect(appt)
    appt = await db.call_appointments.find_one({"id": appt["id"]}, {"_id": 0}) or appt
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
    moved = ("scheduled_at" in updates and updates["scheduled_at"] != existing.get("scheduled_at")) or \
        ("commercial_id" in updates and updates["commercial_id"] != existing.get("commercial_id"))
    if moved and (updates.get("status") or existing.get("status")) == "planifie":
        await _check_creneau_libre(updates.get("commercial_id") or existing.get("commercial_id"),
                                   updates.get("scheduled_at") or existing.get("scheduled_at"), appointment_id)
    if "scheduled_at" in updates:
        # Reporté à une autre heure/date -> le rappel doit repartir, et la
        # notification « sans retour » aussi.
        updates["reminder_sent"] = False
        updates["sans_retour_notified_at"] = None
    updates["updated_at"] = now_iso()
    await db.call_appointments.update_one({"id": appointment_id}, {"$set": updates})
    appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    # Déplacé (date, type ou lieu) : le prospect est prévenu et le rappel de
    # la veille repart pour la nouvelle date.
    changed = any(k in updates and updates[k] != existing.get(k) for k in ("scheduled_at", "kind", "location"))
    if appt and updates.get("status") == "annule" and existing.get("status") == "planifie":
        await cancel_to_prospect(appt)
    elif appt and changed:
        await confirm_to_prospect(appt, "modification")
        appt = await db.call_appointments.find_one({"id": appointment_id}, {"_id": 0})
    return appt


@router.delete("/appointments/{appointment_id}")
async def delete_call_appointment(appointment_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    result = await db.call_appointments.delete_one({"id": appointment_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    return {"ok": True}


async def _lead_depuis_contact(c: NouveauContactIn, user: dict, formation: Optional[str], source: str) -> dict:
    """Prospect créé depuis un RDV ou un rappel saisi à la main (personne pas
    encore dans le CRM), ou fiche existante retrouvée par email / téléphone."""
    from routers.leads import create_lead_from_contact
    from services.meta_rapprochement import norm_phone
    nom = f"{(c.prenom or '').strip()} {(c.nom or '').strip()}".strip()
    email = (c.email or "").strip().lower() or None
    phone = (c.telephone or "").strip() or None
    if not nom:
        raise HTTPException(status_code=400, detail="Nom du prospect requis")
    if not email and not phone:
        raise HTTPException(status_code=400, detail="Téléphone ou email requis")
    if phone and norm_phone(phone):
        # Même numéro saisi dans un autre format (06…, +33 6…, espaces).
        chiffres = norm_phone(phone)
        existing = await db.leads.find_one({"phone": {"$regex": "".join(f"{d}\\D*" for d in chiffres) + "$"}}, {"_id": 0})
        if existing:
            return existing
    lead = await create_lead_from_contact(
        name=nom, email=email, phone=phone, interest=(c.interest or formation or "").strip(), source=source)
    if lead and lead.get("is_new"):
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"created_by": user["id"], "created_by_name": user.get("name", "")}})
        await log_action(user, "lead_cree", "lead", lead["id"], {"name": nom, "source": source})
    return lead


# ---- Rappels téléphoniques (demande du 2026-11-24) ----
# Une seule liste pour tout ce qui est « à rappeler » : demandes de rappel du
# site et des SMS (db.callback_requests, déjà existantes) + rappels planifiés
# depuis le CRM (même collection, source « crm_rappel »), avec le suivi de
# chaque tentative (qui, quand, résultat, note).
RAPPEL_RESULTATS = {
    "joint": "Joint, traité",
    "messagerie": "Messagerie, message laissé",
    "injoignable": "Injoignable",
    "a_rappeler": "À rappeler plus tard",
    "rdv_pris": "Rendez-vous pris",
    "pas_interesse": "Plus intéressé",
}
RAPPEL_STATUTS = {
    "a_rappeler": "À rappeler", "en_cours": "Tentatives en cours", "traite": "Traité",
    "rdv_pris": "RDV pris", "clos": "Clos (plus intéressé)",
}
_STATUT_APRES = {"joint": "traite", "messagerie": "en_cours", "injoignable": "en_cours",
                 "a_rappeler": "a_rappeler", "rdv_pris": "rdv_pris", "pas_interesse": "clos"}
_FERMES = ("traite", "rdv_pris", "clos")
_SOURCE_LABELS = {"crm_rappel": "Planifié depuis le CRM", "sms_qualification": "Réponse SMS",
                  "contact_form": "Formulaire de contact", "contact_page": "Page contact"}


def rappel_statut(r: dict) -> str:
    if r.get("statut") in RAPPEL_STATUTS:
        return r["statut"]
    return "traite" if r.get("handled") else "a_rappeler"


def _rappel_public(r: dict, now: datetime) -> dict:
    r["statut"] = rappel_statut(r)
    r["nom_complet"] = f"{r.get('prenom') or ''} {r.get('nom') or ''}".strip() or r.get("telephone") or "—"
    r["origine"] = _SOURCE_LABELS.get(r.get("source") or "", "Site internet")
    tent = r.get("tentatives") or []
    r["nb_tentatives"] = len(tent)
    r["derniere_tentative"] = tent[-1] if tent else None
    quand = rdv_suivi.parse(r.get("scheduled_at")) if r.get("scheduled_at") else None
    r["en_retard"] = bool(r["statut"] not in _FERMES and quand and quand < now)
    return r


async def _rappel_ou_404(rid: str) -> dict:
    r = await db.callback_requests.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Rappel introuvable")
    return r


@router.get("/rappels")
async def list_rappels(
    etat: str = "ouverts", assigne: Optional[str] = None, categorie: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    """Page « Rappels » : `etat` = ouverts | fermes | tous ; `assigne` = moi
    ou l'id d'une personne. Les commerciaux limités à des catégories voient
    les rappels de leurs catégories, ceux sans catégorie et ceux qui leur
    sont attribués."""
    items = await db.callback_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    assigned = effective_assigned_categories(user)
    if user["role"] in ("commercial", "responsable_commercial", "agent_telephonique") and assigned:
        items = [r for r in items if not r.get("interest") or r.get("interest") in assigned or r.get("assigned_to") == user["id"]]
    if assigne == "moi":
        items = [r for r in items if r.get("assigned_to") == user["id"]]
    elif assigne:
        items = [r for r in items if r.get("assigned_to") == assigne]
    now = datetime.now(PARIS)
    out = [_rappel_public(r, now) for r in items]
    # Onglets par formation (2026-11-24) : catégorie de la demande, sinon
    # déduite de la formation saisie ; « AUTRE » = demande sans précision.
    from routers.leads import _category_for_interest
    for r in out:
        r["categorie"] = (r.get("interest") if r.get("interest") in _CATEGORIE_LABELS else None)             or _category_for_interest(r.get("session")) or "AUTRE"
    compte = {"ouverts": sum(1 for r in out if r["statut"] not in _FERMES),
              "en_retard": sum(1 for r in out if r["en_retard"]),
              "fermes": sum(1 for r in out if r["statut"] in _FERMES)}
    if etat == "ouverts":
        out = [r for r in out if r["statut"] not in _FERMES]
        # Les plus urgents d'abord : planifiés passés, puis planifiés à venir, puis les autres.
        out.sort(key=lambda r: (r.get("scheduled_at") or "9999", r.get("created_at") or ""))
    elif etat == "fermes":
        out = [r for r in out if r["statut"] in _FERMES]
    categories: Dict[str, int] = {}
    for r in out:
        categories[r["categorie"]] = categories.get(r["categorie"], 0) + 1
    if categorie:
        out = [r for r in out if r["categorie"] == categorie]
    return {"items": out, "compte": compte, "statuts": RAPPEL_STATUTS, "resultats": RAPPEL_RESULTATS,
            "categories": categories, "categorie_labels": {**_CATEGORIE_LABELS}}


@router.post("/rappels")
async def create_rappel(payload: RappelIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Rappel téléphonique planifié depuis le CRM (bouton « Planifier un
    rappel » à côté de « Rendez-vous »). Rien n'est envoyé au prospect : la
    personne assignée reçoit une notification à l'heure du rappel."""
    from routers.leads import _category_for_interest
    if payload.lead_id:
        lead = await db.leads.find_one({"id": payload.lead_id}, {"_id": 0}) \
            or await db.meta_lead_imports.find_one({"id": payload.lead_id}, {"_id": 0}) \
            or await _student_as_contact(payload.lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Personne introuvable")
    elif payload.nouveau_contact:
        lead = await _lead_depuis_contact(payload.nouveau_contact, user, payload.formation_titre, "rappel_manuel")
    else:
        raise HTTPException(status_code=400, detail="Choisissez une personne ou saisissez ses coordonnées")
    if not rdv_suivi.parse(payload.scheduled_at):
        raise HTTPException(status_code=400, detail="Date du rappel invalide")
    assigne_id = payload.assigned_to or user["id"]
    assigne = await db.users.find_one({"id": assigne_id}, {"_id": 0, "id": 1, "name": 1})
    if not assigne:
        raise HTTPException(status_code=404, detail="Personne assignée introuvable")
    prenom, _, nom = (lead.get("name") or "").partition(" ")
    formation = payload.formation_titre or lead.get("interest") or ""
    doc = {
        "id": str(uuid.uuid4()), "prenom": prenom, "nom": nom,
        "telephone": lead.get("phone") or "", "email": lead.get("email") or "",
        "message": (payload.notes or "").strip(), "session": formation,
        "source": "crm_rappel", "interest": _category_for_interest(formation), "center": "",
        "from_meta_ads": bool(lead.get("from_meta_ads")), "lead_id": lead.get("id"),
        "handled": False, "notes": "", "statut": "a_rappeler",
        "scheduled_at": payload.scheduled_at, "reminder_sent": False,
        "assigned_to": assigne["id"], "assigned_to_name": assigne.get("name", ""),
        "created_by": user["id"], "created_by_name": user.get("name", ""),
        "tentatives": [], "created_at": now_iso(),
    }
    await db.callback_requests.insert_one(doc)
    await log_action(user, "rappel_planifie", "lead", lead.get("id"), {
        "name": lead.get("name"), "scheduled_at": payload.scheduled_at, "assigned_to_name": assigne.get("name", ""),
        "note": doc["message"]})
    doc.pop("_id", None)
    return _rappel_public(doc, datetime.now(PARIS))


@router.post("/rappels/{rid}/tentatives")
async def add_rappel_tentative(rid: str, payload: RappelTentativeIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Résultat d'un rappel : la tentative est gardée (qui, quand, résultat,
    note), le statut du rappel suit, et la note va aussi dans l'historique
    du prospect."""
    if payload.resultat not in RAPPEL_RESULTATS:
        raise HTTPException(status_code=400, detail="Résultat inconnu")
    r = await _rappel_ou_404(rid)
    note = (payload.note or "").strip()
    tentative = {"at": now_iso(), "by_id": user["id"], "by_name": user.get("name", ""),
                 "resultat": payload.resultat, "label": RAPPEL_RESULTATS[payload.resultat], "note": note}
    statut = _STATUT_APRES[payload.resultat]
    upd = {"statut": statut, "handled": statut in _FERMES, "updated_at": now_iso(),
           "last_attempt_at": tentative["at"], "last_attempt_by_name": tentative["by_name"]}
    if statut in _FERMES:
        upd.update({"handled_by": user["id"], "handled_by_name": user.get("name", ""), "handled_at": tentative["at"]})
    if payload.prochain_rappel:
        if not rdv_suivi.parse(payload.prochain_rappel):
            raise HTTPException(status_code=400, detail="Date du prochain rappel invalide")
        upd.update({"scheduled_at": payload.prochain_rappel, "reminder_sent": False})
        tentative["prochain_rappel"] = payload.prochain_rappel
        if not r.get("assigned_to"):
            upd.update({"assigned_to": user["id"], "assigned_to_name": user.get("name", "")})
    await db.callback_requests.update_one({"id": rid}, {"$set": upd, "$push": {"tentatives": tentative}})

    lead_id = r.get("lead_id")
    if lead_id:
        texte = f"📞 Rappel ({RAPPEL_RESULTATS[payload.resultat]})" + (f" : {note}" if note else "")
        entry = {"text": texte, "at": tentative["at"], "by_id": user["id"], "by_name": user.get("name", ""), "rappel_id": rid}
        for coll in (db.leads, db.meta_lead_imports):
            res = await coll.update_one({"id": lead_id}, {
                "$push": {"notes_history": {"$each": [entry], "$slice": -20}},
                "$set": {"notes": texte, "notes_updated_at": entry["at"], "notes_updated_by": user["id"],
                         "notes_updated_by_name": user.get("name", ""), "last_contacted_by": user["id"],
                         "last_contacted_at": entry["at"], "contacted": True, "updated_at": now_iso()},
                "$inc": {"relance_count": 1},
            })
            if getattr(res, "matched_count", 0):
                if coll is db.leads:
                    from routers.leads import _leads_cache_clear
                    _leads_cache_clear()
                break
    await log_action(user, "rappel_tentative", "lead", lead_id, {
        "name": f"{r.get('prenom') or ''} {r.get('nom') or ''}".strip(), "resultat": RAPPEL_RESULTATS[payload.resultat],
        "note": note, "rappel_id": rid})
    if statut in _FERMES:
        await log_action(user, "rappel_traite", "callback_request", rid, {"name": f"{r.get('prenom') or ''} {r.get('nom') or ''}".strip()})
    return _rappel_public(await _rappel_ou_404(rid), datetime.now(PARIS))


@router.patch("/rappels/{rid}")
async def update_rappel(rid: str, payload: RappelUpdate, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Réattribuer un rappel ou changer son heure (la notification repart)."""
    await _rappel_ou_404(rid)
    upd = {"updated_at": now_iso()}
    if payload.assigned_to:
        assigne = await db.users.find_one({"id": payload.assigned_to}, {"_id": 0, "id": 1, "name": 1})
        if not assigne:
            raise HTTPException(status_code=404, detail="Personne assignée introuvable")
        upd.update({"assigned_to": assigne["id"], "assigned_to_name": assigne.get("name", "")})
    if payload.scheduled_at:
        if not rdv_suivi.parse(payload.scheduled_at):
            raise HTTPException(status_code=400, detail="Date invalide")
        upd.update({"scheduled_at": payload.scheduled_at, "reminder_sent": False})
    await db.callback_requests.update_one({"id": rid}, {"$set": upd})
    return _rappel_public(await _rappel_ou_404(rid), datetime.now(PARIS))


async def send_rappels_dus() -> int:
    """Notification push à la personne assignée quand l'heure d'un rappel
    planifié arrive (boucle de fond toutes les 15 min, voir server.py)."""
    from services.push import send_push_to_users
    now = datetime.now(PARIS)
    dus = await db.callback_requests.find(
        {"scheduled_at": {"$ne": None}, "handled": {"$ne": True}, "reminder_sent": {"$ne": True}}, {"_id": 0},
    ).to_list(2000)
    sent = 0
    for r in dus:
        quand = rdv_suivi.parse(r.get("scheduled_at"))
        if not quand or quand > now or not r.get("assigned_to"):
            continue
        nom = f"{r.get('prenom') or ''} {r.get('nom') or ''}".strip() or r.get("telephone") or ""
        try:
            await send_push_to_users([r["assigned_to"]], "📞 Rappel à passer",
                                     f"{nom} — {r.get('telephone') or ''} ({quand.strftime('%H:%M')})", "/admin/rappels")
        except Exception:
            pass
        await db.callback_requests.update_one({"id": r["id"]}, {"$set": {"reminder_sent": True}})
        sent += 1
    return sent
