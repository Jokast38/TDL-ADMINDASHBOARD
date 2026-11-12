"""Campagnes SMS par la passerelle personnelle (services/sms_campaigns.py)."""
import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.config import ROLES_LEADS
from core.database import db
from core.security import require_role
from core.utils import now_iso
from services import smsgate
from services import sms_campaigns as svc

router = APIRouter(tags=["sms-campaigns"])


class LeadIdsIn(BaseModel):
    lead_ids: List[str] = Field(..., min_length=1, max_length=5000)


class CampaignIn(LeadIdsIn):
    label: Optional[str] = Field(None, max_length=120)
    body: str = Field(..., min_length=1, max_length=600)
    consent_confirmed: bool = False


@router.post("/sms-campaigns/preview")
async def preview(payload: LeadIdsIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    sel = await svc.select_recipients(payload.lead_ids)
    cfg = await smsgate.gateway_config()
    window_open, why = smsgate.sending_window_open()
    return {
        "eligible": len(sel["recipients"]), "excluded": sel["excluded"], "found": sel["found"],
        "prefix": cfg["prefix"], "stop_text": cfg["stop_text"], "daily_cap": cfg["daily_cap"],
        "configured": bool(cfg["user"] and cfg["password"]),
        "window_open": window_open, "window_reason": why,
        "exemple_prenom": sel["recipients"][0]["prenom"] if sel["recipients"] else "",
    }


@router.post("/sms-campaigns")
async def create(payload: CampaignIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    if not payload.consent_confirmed:
        raise HTTPException(400, "Confirmez que ces prospects ont accepté d'être contactés par SMS.")
    cfg = await smsgate.gateway_config()
    if not (cfg["user"] and cfg["password"]):
        raise HTTPException(400, "Passerelle SMS non configurée (Paramètres → SMS → Passerelle SMS).")
    label = payload.label or f"Campagne SMS du {datetime.now(smsgate.PARIS):%d/%m/%Y %H:%M}"
    return await svc.create_campaign(label, payload.body.strip(), payload.lead_ids, user)


@router.get("/sms-campaigns")
async def list_campaigns(user: dict = Depends(require_role(*ROLES_LEADS))):
    docs = await db.sms_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(15)
    return [await svc.public(d) for d in docs]


@router.get("/sms-campaigns/gateway/status")
async def gateway_status(user: dict = Depends(require_role(*ROLES_LEADS))):
    cfg = await smsgate.gateway_config()
    window_open, why = smsgate.sending_window_open()
    out = {"configured": bool(cfg["user"] and cfg["password"]), "window_open": window_open, "window_reason": why,
           "daily_cap": cfg["daily_cap"], "sent_today": await svc._sent_today(),
           "optouts": await db.sms_optouts.count_documents({})}
    if out["configured"]:
        try:
            devices = await smsgate.call(cfg, "GET", "/devices")
            now = datetime.now(timezone.utc)
            out["devices"] = [{
                "name": d.get("name") or d.get("id"),
                "last_seen": d.get("lastSeen"),
                "online": bool(d.get("lastSeen")) and (now - datetime.fromisoformat(d["lastSeen"].replace("Z", "+00:00"))).total_seconds() < 1800,
            } for d in devices]
        except smsgate.GatewayError as e:
            out["error"] = str(e)
    return out


@router.post("/sms-campaigns/gateway/register-webhooks")
async def register_webhooks(request: Request, user: dict = Depends(require_role("admin"))):
    """Enregistre sur SMS Gate les webhooks vers ce backend (statuts + réponses STOP).
    L'URL doit être publique en HTTPS : c'est le cas sur Render."""
    cfg = await smsgate.gateway_config()
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    url = f"{proto}://{host}/api/sms/gateway-webhook"
    if not url.startswith("https://"):
        raise HTTPException(400, f"Le backend doit être joignable en HTTPS (URL détectée : {url})")
    if not cfg["webhook_secret"]:
        raise HTTPException(400, "Renseignez d'abord la clé de signature (Signing Key de l'appli) dans Paramètres → SMS.")
    try:
        existing = await smsgate.call(cfg, "GET", "/webhooks")
    except smsgate.GatewayError as e:
        raise HTTPException(502, str(e))
    results = {}
    for event in ("sms:received", "sms:sent", "sms:delivered", "sms:failed"):
        if any(w.get("url") == url and w.get("event") == event for w in existing or []):
            results[event] = "déjà enregistré"
            continue
        try:
            await smsgate.call(cfg, "POST", "/webhooks", {"url": url, "event": event})
            results[event] = "ok"
        except smsgate.GatewayError as e:
            results[event] = str(e)
    return {"url": url, "results": results}


@router.post("/sms/gateway-webhook", include_in_schema=False)
async def gateway_webhook(request: Request):
    """Appelé par le téléphone (via SMS Gate) : statuts des SMS et réponses (STOP)."""
    cfg = await smsgate.gateway_config()
    raw = await request.body()
    if not cfg["webhook_secret"]:
        raise HTTPException(503, "Clé de signature non configurée")
    if not smsgate.valid_signature(cfg["webhook_secret"], raw, request.headers.get("x-timestamp"),
                                   request.headers.get("x-signature")):
        raise HTTPException(401, "Signature invalide")
    try:
        data = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "JSON invalide")
    event, p = data.get("event", ""), data.get("payload") or {}
    if event == "sms:received":
        await svc.handle_inbound(p.get("sender") or p.get("phoneNumber") or "", p.get("message") or "")
    elif event in ("sms:sent", "sms:delivered", "sms:failed"):
        state = {"sms:sent": "Sent", "sms:delivered": "Delivered", "sms:failed": "Failed"}[event]
        await svc.apply_state(p.get("messageId") or "", state, p.get("reason"))
    return {"ok": True}


# Déclarée en dernier : sinon « /sms-campaigns/gateway/register-webhooks » serait
# pris pour une action « register-webhooks » sur une campagne « gateway ».
@router.post("/sms-campaigns/{campaign_id}/{action}")
async def campaign_action(campaign_id: str, action: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    transitions = {"pause": ("en_cours", "en_pause"), "reprendre": ("en_pause", "en_cours"),
                   "annuler": (None, "annulee")}
    if action not in transitions:
        raise HTTPException(404, "Action inconnue")
    before, after = transitions[action]
    query = {"id": campaign_id, "status": before} if before else {"id": campaign_id, "status": {"$in": ["en_cours", "en_pause"]}}
    res = await db.sms_campaigns.update_one(query, {"$set": {"status": after, "lease_until": None, "updated_at": now_iso()}})
    if not getattr(res, "matched_count", 0):
        raise HTTPException(409, "Action impossible dans l'état actuel de la campagne")
    return {"ok": True, "status": after}
