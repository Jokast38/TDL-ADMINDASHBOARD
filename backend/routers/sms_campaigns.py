"""Campagnes SMS par la passerelle personnelle (services/sms_campaigns.py)."""
import json
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.config import ROLES_LEADS, ROLES_TEAM_MGMT
from core.database import db
from core.security import require_role
from core.utils import now_iso
from services import smsgate
from services import sms_campaigns as svc
from services import sms_qualification

router = APIRouter(tags=["sms-campaigns"])


class LeadIdsIn(BaseModel):
    lead_ids: List[str] = Field(..., min_length=1, max_length=5000)


class CampaignIn(LeadIdsIn):
    label: Optional[str] = Field(None, max_length=120)
    body: str = Field(..., min_length=1, max_length=600)
    consent_confirmed: bool = False
    # Scénario de qualification (services/sms_qualification.py) : « vtc », « caces »…
    scenario: Optional[str] = Field(None, max_length=40)


@router.post("/sms-campaigns/preview")
async def preview(payload: LeadIdsIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    sel = await svc.select_recipients(payload.lead_ids)
    cfg = await smsgate.gateway_config()
    window_open, why = smsgate.sending_window_open()
    return {
        "eligible": len(sel["recipients"]), "excluded": sel["excluded"], "found": sel["found"],
        "prefix": cfg["prefix"], "stop_text": cfg["stop_text"], "daily_cap": cfg["daily_cap"],
        "configured": smsgate.is_configured(cfg),
        "window_open": window_open, "window_reason": why,
        "exemple_prenom": sel["recipients"][0]["prenom"] if sel["recipients"] else "",
    }


@router.post("/sms-campaigns")
async def create(payload: CampaignIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    if not payload.consent_confirmed:
        raise HTTPException(400, "Confirmez que ces prospects ont accepté d'être contactés par SMS.")
    cfg = await smsgate.gateway_config()
    if not smsgate.is_configured(cfg):
        raise HTTPException(400, "Passerelle SMS non configurée (Paramètres → SMS → Passerelle SMS).")
    label = payload.label or f"Campagne SMS du {datetime.now(smsgate.PARIS):%d/%m/%Y %H:%M}"
    scenario = None
    if payload.scenario:
        if not (await sms_qualification.config())["enabled"]:
            raise HTTPException(400, "Réponses automatiques désactivées (Paramètres → SMS).")
        scenario = (await sms_qualification.scenarios(active_only=True)).get(payload.scenario)
        if not scenario:
            raise HTTPException(400, "Scénario de réponses inconnu")
        # Le 1er SMS reste modifiable, mais doit garder la consigne de réponse.
        codes = [c for c in scenario["steps"][0]["options"]]
        if not all(re.search(rf"\b{re.escape(c)}\b",payload.body, re.IGNORECASE) for c in codes):
            raise HTTPException(400, "Le message doit indiquer les réponses possibles (" + ", ".join(c.upper() for c in codes) + ").")
    return await svc.create_campaign(label, payload.body.strip(), payload.lead_ids, user,
                                     scenario_key=payload.scenario, scenario=scenario)


class OptionIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    label: str = Field(..., min_length=1, max_length=80)
    fin: bool = False  # « plus intéressé » : clôt la conversation


class StepIn(BaseModel):
    id: Optional[str] = Field(None, max_length=40)
    question: str = Field(..., min_length=5, max_length=600)
    options: List[OptionIn] = Field(..., min_length=2, max_length=9)


class ScenarioIn(BaseModel):
    key: str = Field(..., min_length=1, max_length=40)
    label: str = Field(..., min_length=1, max_length=80)
    category: Optional[str] = Field(None, max_length=30)
    actif: bool = True
    steps: List[StepIn] = Field(..., min_length=1, max_length=5)
    final: str = Field(..., min_length=5, max_length=600)
    refus: str = Field(..., min_length=5, max_length=600)


class ScenariosConfigIn(BaseModel):
    enabled: bool
    scenarios: List[ScenarioIn] = Field(default_factory=list, max_length=20)


@router.get("/sms-campaigns/scenarios/config")
async def get_scenarios_config(user: dict = Depends(require_role(*ROLES_LEADS))):
    """Éditeur Paramètres → SMS → Réponses automatiques."""
    cfg = await sms_qualification.config()
    return {"enabled": cfg["enabled"], "scenarios": [
        {"key": k, "label": sc["label"], "category": sc.get("category"), "actif": sc.get("actif", True),
         "steps": [{"id": st.get("id"), "question": st["question"],
                    "options": [{"code": c, "label": o["label"], "fin": o.get("fin") == "refus"} for c, o in st["options"].items()]}
                   for st in sc["steps"]],
         "final": sc["final"], "refus": sc["refus"]}
        for k, sc in cfg["scenarios"].items()]}


@router.put("/sms-campaigns/scenarios/config")
async def save_scenarios_config(payload: ScenariosConfigIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "responsable_admission"))):
    saved = {}
    for sc in payload.scenarios:
        key = sms_qualification.normalize_answer(sc.key).replace(" ", "_")
        if not key or key in saved:
            raise HTTPException(400, f"Identifiant de scénario vide ou en double : « {sc.key} »")
        steps = []
        for i, st in enumerate(sc.steps):
            options = sms_qualification.build_options([o.model_dump() for o in st.options])
            if len(options) < 2:
                raise HTTPException(400, f"{sc.label}, question {i + 1} : au moins deux réponses différentes.")
            missing = [c for c in options if not re.search(rf"\b{re.escape(c)}\b", st.question, re.IGNORECASE)]
            if missing:
                raise HTTPException(400, f"{sc.label}, question {i + 1} : le texte doit citer les réponses " + ", ".join(m.upper() for m in missing) + ".")
            steps.append({"id": st.id or f"q{i + 1}", "question": st.question.strip(), "options": options})
        saved[key] = {"label": sc.label.strip(), "category": sc.category or None, "actif": sc.actif,
                      "steps": steps, "final": sc.final.strip(), "refus": sc.refus.strip()}
    await db.settings.update_one({"id": "global"}, {"$set": {
        "sms_scenarios": saved, "sms_qualification_enabled": payload.enabled, "updated_at": now_iso()}}, upsert=True)
    return await get_scenarios_config(user)


@router.get("/sms-campaigns/scenarios")
async def list_scenarios(user: dict = Depends(require_role(*ROLES_LEADS))):
    """Scénarios actifs proposés dans la fenêtre « Campagne SMS » (vide si
    les réponses automatiques sont désactivées)."""
    if not (await sms_qualification.config())["enabled"]:
        return []
    return [{"key": k, "label": sc["label"], "category": sc.get("category"),
             "steps": [{"question": st["question"], "options": {c: o["label"] for c, o in st["options"].items()}}
                       for st in sc["steps"]],
             "final": sc["final"], "refus": sc["refus"]}
            for k, sc in (await sms_qualification.scenarios(active_only=True)).items()]


@router.get("/sms-campaigns/{campaign_id}/reponses")
async def campaign_replies(campaign_id: str, user: dict = Depends(require_role(*ROLES_LEADS))):
    """Détail des réponses d'une campagne à scénario (qui a répondu quoi)."""
    convs = await db.sms_conversations.find({"campaign_id": campaign_id}, {"_id": 0}).sort("updated_at", -1).to_list(5000)
    return [{"lead_id": c.get("lead_id"), "phone": c.get("phone"), "prenom": c.get("prenom"),
             "status": c.get("status"), "statut_label": sms_qualification.STATUTS.get(c.get("status"), c.get("status")),
             "answers": [a.get("label") for a in c.get("answers") or []], "message": c.get("last_message"),
             "updated_at": c.get("updated_at")} for c in convs]


@router.get("/sms-campaigns")
async def list_campaigns(user: dict = Depends(require_role(*ROLES_LEADS))):
    docs = await db.sms_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(15)
    return [await svc.public(d) for d in docs]


@router.get("/sms-campaigns/gateway/status")
async def gateway_status(user: dict = Depends(require_role(*ROLES_LEADS))):
    cfg = await smsgate.gateway_config()
    window_open, why = smsgate.sending_window_open()
    out = {"configured": smsgate.is_configured(cfg), "window_open": window_open, "window_reason": why,
           "daily_cap": cfg["daily_cap"], "sent_today": await svc._sent_today(),
           "optouts": await db.sms_optouts.count_documents({}),
           "webhook_last": ((await db.settings.find_one({"id": "global"}, {"_id": 0, "sms_webhook_last": 1})) or {}).get("sms_webhook_last"),
           "replies_received": await db.sms_inbound.count_documents({})}
    out["mode"] = cfg["mode"]
    if out["configured"] and cfg["mode"] == "dispatcher":
        try:
            h = await smsgate.call(cfg, "GET", "/health")
            out["devices"] = [{"name": "Téléphone (via serveur SMS personnel)", "last_seen": None,
                               "online": bool(h.get("gateway_online"))}]
            out["dispatcher_queue"] = h.get("queued")
        except smsgate.GatewayError as e:
            out["error"] = f"Serveur SMS personnel injoignable : {e}"
    elif out["configured"]:
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
    if cfg["mode"] == "dispatcher":
        raise HTTPException(400, f"Avec le serveur SMS personnel, collez cette URL comme « URL de callback » de la "
                                 f"plateforme TDL dans son dashboard : {url} — et son « secret callback » dans "
                                 f"le champ Clé de signature ci-dessus.")
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


async def _mark_webhook(seen: dict, result: str) -> None:
    try:
        await db.settings.update_one({"id": "global"}, {"$set": {"sms_webhook_last": {**seen, "result": result}}}, upsert=True)
    except Exception:
        pass


@router.post("/sms/gateway-webhook", include_in_schema=False)
async def gateway_webhook(request: Request):
    """Appelé par le téléphone (via SMS Gate) : statuts des SMS et réponses (STOP)."""
    cfg = await smsgate.gateway_config()
    raw = await request.body()
    try:
        data = json.loads(raw)
    except ValueError:
        data = None
    # Témoin du dernier appel (Paramètres → SMS → État) : permet de voir si le
    # serveur SMS nous joint et si la clé de signature correspond (2026-11-17).
    seen = {"at": now_iso(), "event": (data or {}).get("event") if isinstance(data, dict) else None}
    if not cfg["webhook_secret"]:
        await _mark_webhook(seen, "refusé : clé de signature non configurée dans le CRM")
        raise HTTPException(503, "Clé de signature non configurée")
    if not smsgate.valid_signature(cfg["webhook_secret"], raw, request.headers.get("x-timestamp"),
                                   request.headers.get("x-signature")):
        await _mark_webhook(seen, "refusé : signature invalide (le « secret callback » du serveur SMS "
                                  "est différent de la clé de signature du CRM)")
        raise HTTPException(401, "Signature invalide")
    if not isinstance(data, dict):
        raise HTTPException(400, "JSON invalide")
    await _mark_webhook(seen, "accepté")
    event, p = data.get("event", ""), data.get("payload") or {}
    # Format du serveur SMS personnel (SMS-SERVER) : {"event": "sms.status"|"sms.reply"|"sms.received", "data": {...}}
    d = data.get("data") or {}
    if event == "sms.status":
        await svc.apply_state(d.get("id") or "", d.get("status"), d.get("error"))
    elif event in ("sms.reply", "sms.received"):
        await svc.handle_inbound(d.get("from") or "", d.get("message") or "")
    # Format SMS Gate direct
    elif event == "sms:received":
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
