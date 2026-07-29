import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from models.limova import (
    LimovaToggleIn, PhoneCampaignIn, CallOutcomeIn, LinkedinMessageIn, RegisterInboundNumberIn,
)
from services import limova

router = APIRouter(prefix="/limova", tags=["limova"])

_OUTCOME_LABELS = {
    "veut_etre_rappele": "Veut être rappelé",
    "veut_sinscrire": "Veut s'inscrire",
    "pas_interesse": "Pas intéressé",
    "injoignable": "Injoignable",
}


async def _settings() -> dict:
    return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}


@router.get("/status")
async def limova_status(user: dict = Depends(require_role("admin", "employe"))):
    s = await _settings()
    return {
        "api_key_configured": await limova.api_key_configured(),
        "phone_agent_configured": bool(s.get("limova_phone_agent_id")),
        "linkedin_agent_configured": bool(s.get("limova_marketing_agent_id")),
        "phone_enabled": bool(s.get("limova_phone_enabled")),
        "linkedin_enabled": bool(s.get("limova_linkedin_enabled")),
    }


@router.put("/toggle")
async def toggle_limova(payload: LimovaToggleIn, user: dict = Depends(require_role("admin"))):
    update = {}
    if payload.phone_enabled is not None:
        update["limova_phone_enabled"] = payload.phone_enabled
    if payload.linkedin_enabled is not None:
        update["limova_linkedin_enabled"] = payload.linkedin_enabled
    if update:
        update["updated_at"] = now_iso()
        await db.settings.update_one({"id": "global"}, {"$set": update}, upsert=True)
    return await limova_status(user)


# ── Agent téléphonique ─────────────────────────────────────────────────────────

@router.post("/phone/campaigns")
async def create_phone_campaign(payload: PhoneCampaignIn, user: dict = Depends(require_role(*("admin", "employe")))):
    s = await _settings()
    if not s.get("limova_phone_enabled"):
        raise HTTPException(status_code=400, detail="L'agent téléphonique est désactivé (activez-le d'abord)")

    query: Dict[str, Any] = {"phone": {"$nin": [None, ""]}}
    if payload.lead_ids:
        query["id"] = {"$in": payload.lead_ids}
    elif payload.interest_in:
        values = [v for v in payload.interest_in.split("|") if v]
        if values:
            query["interest"] = {"$in": values}
    leads = await db.leads.find(query, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(20000)
    if not leads:
        raise HTTPException(status_code=400, detail="Aucun lead avec numéro de téléphone ne correspond à ce ciblage")

    try:
        agent_id = await limova.get_phone_agent_id()
        campaign = await limova.create_campaign(payload.name, agent_id, channel="phone")
        campaign_id = campaign.get("id") or campaign.get("_id")
        await limova.add_prospects(campaign_id, [
            {"name": l.get("name") or "", "phone": l["phone"], "leadId": l["id"]} for l in leads
        ])
        await limova.start_campaign(campaign_id)
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))

    doc = {
        "id": str(uuid.uuid4()), "limova_campaign_id": campaign_id, "name": payload.name,
        "channel": "phone", "targeted_count": len(leads), "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.limova_campaigns.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/phone/campaigns")
async def list_phone_campaigns(user: dict = Depends(require_role("admin", "employe"))):
    return await db.limova_campaigns.find({"channel": "phone"}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/phone/campaigns/{campaign_id}/pause")
async def pause_phone_campaign(campaign_id: str, user: dict = Depends(require_role("admin", "employe"))):
    local = await db.limova_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not local:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    try:
        await limova.pause_campaign(local["limova_campaign_id"])
    except (limova.LimovaNotConfigured, limova.LimovaError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True}


@router.get("/phone/calls")
async def list_phone_calls(page: int = 1, user: dict = Depends(require_role("admin", "employe"))):
    """Appels récents renvoyés par Limova, enrichis de la qualification manuelle
    éventuellement déjà saisie par un employé (voir POST .../outcome)."""
    try:
        phone_agent_id = await limova.get_phone_agent_id()
        data = await limova.list_calls(phone_agent_id, page=page)
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))

    calls = data if isinstance(data, list) else data.get("data", [])
    call_ids = [c.get("id") for c in calls if c.get("id")]
    outcomes = await db.call_outcomes.find({"call_id": {"$in": call_ids}}, {"_id": 0}).to_list(len(call_ids) or 1)
    outcomes_by_id = {o["call_id"]: o for o in outcomes}
    for c in calls:
        o = outcomes_by_id.get(c.get("id"))
        c["outcome"] = o["outcome"] if o else None
        c["outcome_label"] = _OUTCOME_LABELS.get(o["outcome"]) if o else None
        c["outcome_notes"] = o.get("notes") if o else None
    return {"calls": calls, "outcome_options": _OUTCOME_LABELS}


@router.post("/phone/calls/{call_id}/outcome")
async def set_call_outcome(call_id: str, payload: CallOutcomeIn, user: dict = Depends(require_role("admin", "employe"))):
    if payload.outcome not in _OUTCOME_LABELS:
        raise HTTPException(status_code=400, detail="Issue d'appel invalide")
    await db.call_outcomes.update_one(
        {"call_id": call_id},
        {"$set": {
            "call_id": call_id, "outcome": payload.outcome, "notes": payload.notes or "",
            "qualified_by": user["id"], "updated_at": now_iso(),
        }},
        upsert=True,
    )
    return {"ok": True, "outcome": payload.outcome, "label": _OUTCOME_LABELS[payload.outcome]}


# ── Agent d'accueil (réception d'appels entrants, décroche si sans réponse) ───

@router.get("/phone/inbound-numbers")
async def list_inbound_numbers(user: dict = Depends(require_role("admin", "employe"))):
    try:
        return await limova.list_inbound_numbers()
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/phone/inbound-numbers")
async def register_inbound_number(payload: RegisterInboundNumberIn, user: dict = Depends(require_role("admin"))):
    """Achète un numéro dédié qui transfère vers `user_phone_number` — action
    facturée par Limova (3600 crédits) et non réversible : exige une
    confirmation explicite (`confirm_cost=true`) plutôt qu'un simple appel."""
    if not payload.confirm_cost:
        raise HTTPException(
            status_code=400,
            detail="Confirmation requise : cette action achète un numéro Twilio réel et facture des crédits Limova",
        )
    try:
        return await limova.register_inbound_number(payload.user_phone_number, payload.friendly_name)
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/phone/inbound-numbers/connect-agent")
async def connect_inbound_agent(user: dict = Depends(require_role("admin"))):
    """Connecte l'agent téléphonique configuré (Paramètres → Limova) à la
    réception d'appels entrants — c'est lui qui décroche si un appel transféré
    reste sans réponse."""
    try:
        agent_id = await limova.get_phone_agent_id()
        return await limova.connect_agent_phone(agent_id)
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/phone/stats")
async def phone_stats(user: dict = Depends(require_role("admin", "employe"))):
    total_calls = await db.call_outcomes.count_documents({})
    by_outcome = await db.call_outcomes.aggregate([
        {"$group": {"_id": "$outcome", "count": {"$sum": 1}}},
    ]).to_list(20)
    campaigns_count = await db.limova_campaigns.count_documents({"channel": "phone"})
    return {
        "qualified_calls": total_calls,
        "campaigns_launched": campaigns_count,
        "by_outcome": [
            {"outcome": x["_id"], "label": _OUTCOME_LABELS.get(x["_id"], x["_id"]), "count": x["count"]}
            for x in by_outcome
        ],
    }


# ── LinkedIn ───────────────────────────────────────────────────────────────────

@router.get("/linkedin/auth-status")
async def linkedin_status(user: dict = Depends(require_role("admin", "employe"))):
    try:
        return await limova.linkedin_auth_status()
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/linkedin/auth-initiate")
async def linkedin_initiate(user: dict = Depends(require_role("admin"))):
    try:
        return await limova.linkedin_auth_initiate()
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/linkedin/send")
async def linkedin_send(payload: LinkedinMessageIn, user: dict = Depends(require_role("admin", "employe"))):
    s = await _settings()
    if not s.get("limova_linkedin_enabled"):
        raise HTTPException(status_code=400, detail="L'agent LinkedIn est désactivé (activez-le d'abord)")
    try:
        if payload.connection_request:
            result = await limova.linkedin_connection_request(payload.profile_url, payload.message)
        else:
            result = await limova.linkedin_send_message(payload.profile_url, payload.message)
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))

    await db.linkedin_actions.insert_one({
        "id": str(uuid.uuid4()), "profile_url": payload.profile_url, "message": payload.message,
        "connection_request": payload.connection_request, "sent_by": user["id"], "created_at": now_iso(),
    })
    return result


@router.get("/linkedin/stats")
async def linkedin_stats(user: dict = Depends(require_role("admin", "employe"))):
    total = await db.linkedin_actions.count_documents({})
    connections = await db.linkedin_actions.count_documents({"connection_request": True})
    return {"total_sent": total, "connection_requests": connections, "messages": total - connections}


# ── Instagram / Facebook (connexion uniquement, pas de publication via l'API) ─

@router.get("/instagram/auth-status")
async def instagram_status(user: dict = Depends(require_role("admin", "employe"))):
    try:
        return await limova.instagram_auth_status()
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/instagram/auth-initiate")
async def instagram_initiate(user: dict = Depends(require_role("admin"))):
    try:
        return await limova.instagram_auth_initiate()
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/facebook/auth-status")
async def facebook_status(user: dict = Depends(require_role("admin", "employe"))):
    try:
        return await limova.facebook_auth_status()
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/facebook/auth-initiate")
async def facebook_initiate(user: dict = Depends(require_role("admin"))):
    try:
        return await limova.facebook_auth_initiate()
    except limova.LimovaNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except limova.LimovaError as e:
        raise HTTPException(status_code=502, detail=str(e))
