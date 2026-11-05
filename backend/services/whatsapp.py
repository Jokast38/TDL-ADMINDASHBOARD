"""Envoi de messages WhatsApp via l'API Cloud de Meta (demande du
2026-11-03) — EN PLUS du mail pour les messages importants à l'apprenant
(convocation, rappel la veille, documents manquants, lien de paiement,
demande d'avis Google), jamais à sa place. Modèles et textes :
core/whatsapp_templates.py.

Best-effort comme services/sms.py : un échec n'interrompt jamais le flux
de l'appelant, mais chaque tentative est journalisée dans db.whatsapp_logs.
Les statuts de remise (reçu, lu, échec) arrivent ensuite par le webhook
Meta (routers/meta_leads.py) et complètent le journal."""
import asyncio
import logging
import time
import uuid

from core.config import (
    META_WHATSAPP_BUSINESS_ACCOUNT_ID, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_TOKEN, OUTBOUND_DISABLED,
)
from core.database import db
from core.utils import now_iso
from core.whatsapp_templates import template_payload
from services.sms import normalize_phone_fr

logger = logging.getLogger(__name__)

GRAPH_URL = "https://graph.facebook.com/v21.0"
_PHONE_ID_CACHE_S = 3600
_phone_id_cache: dict = {}


def _http_get(url: str, params: dict):
    import requests
    return requests.get(url, params=params, timeout=15)


def _http_post(url: str, headers: dict, json_data: dict):
    import requests
    return requests.post(url, headers=headers, json=json_data, timeout=15)


def _phone_number_id() -> str | None:
    """Identifiant du numéro expéditeur : celui de la configuration, sinon le
    premier numéro du compte WhatsApp (mis en cache une heure)."""
    if META_WHATSAPP_PHONE_NUMBER_ID:
        return META_WHATSAPP_PHONE_NUMBER_ID
    if not (META_WHATSAPP_BUSINESS_ACCOUNT_ID and META_WHATSAPP_TOKEN):
        return None
    cached = _phone_id_cache.get("id")
    if cached and time.time() - cached[1] < _PHONE_ID_CACHE_S:
        return cached[0]
    try:
        r = _http_get(f"{GRAPH_URL}/{META_WHATSAPP_BUSINESS_ACCOUNT_ID}/phone_numbers",
                      {"access_token": META_WHATSAPP_TOKEN, "fields": "id"})
        r.raise_for_status()
        numbers = r.json().get("data") or []
    except Exception as e:
        logger.warning(f"WhatsApp : numéro expéditeur introuvable — {e}")
        return None
    if not numbers:
        return None
    _phone_id_cache["id"] = (numbers[0]["id"], time.time())
    return numbers[0]["id"]


def _error_status(r) -> str:
    try:
        err = r.json().get("error", {})
        detail = (err.get("error_data") or {}).get("details") or err.get("message") or r.text
        return f"failed: {err.get('code', r.status_code)} {detail}"[:300]
    except Exception:
        return f"failed: HTTP {r.status_code} {r.text[:200]}"


async def send_whatsapp(to_phone: str, template: str, params: list, button_param: str = None, extra: dict = None) -> dict:
    """Envoie le modèle `template` au numéro `to_phone`. Le statut "sent"
    signifie que Meta a accepté le message ; la remise réelle est suivie par
    le webhook (`delivery_status`)."""
    log = {
        "id": str(uuid.uuid4()), "to": to_phone, "template": template,
        "params": [str(p) for p in params], "status": "queued", "created_at": now_iso(), **(extra or {}),
    }

    async def _done(status: str) -> dict:
        log["status"] = status
        await db.whatsapp_logs.insert_one(dict(log))
        return log

    s = await db.settings.find_one({"id": "global"}, {"_id": 0, "whatsapp_enabled": 1}) or {}
    if OUTBOUND_DISABLED or s.get("whatsapp_enabled") is False:
        return await _done("disabled")
    if not META_WHATSAPP_TOKEN:
        return await _done("not_configured")

    phone = normalize_phone_fr(to_phone)
    if not phone:
        return await _done("invalid_phone")
    log["to"] = phone
    if await db.whatsapp_opt_outs.find_one({"phone": phone}, {"_id": 0, "phone": 1}):
        return await _done("opted_out")

    try:
        payload = template_payload(template, params, button_param)
    except ValueError as e:
        logger.error(f"WhatsApp : {e}")
        return await _done(f"failed: {e}")

    phone_id = await asyncio.to_thread(_phone_number_id)
    if not phone_id:
        return await _done("not_configured")

    try:
        r = await asyncio.to_thread(
            _http_post, f"{GRAPH_URL}/{phone_id}/messages",
            {"Authorization": f"Bearer {META_WHATSAPP_TOKEN}", "Content-Type": "application/json"},
            {"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "template", "template": payload},
        )
    except Exception as e:
        return await _done(f"error: {e}")
    if r.status_code >= 300:
        return await _done(_error_status(r))
    messages = r.json().get("messages") or [{}]
    log["wa_message_id"] = messages[0].get("id")
    return await _done("sent")


async def send_whatsapp_or_sms(to_phone: str, template: str, params: list, sms_text: str = None,
                               button_param: str = None, extra: dict = None) -> dict:
    """WhatsApp d'abord ; le SMS (services/sms.py), quand il existait déjà
    pour ce message, ne part que si WhatsApp n'a pas pu être envoyé — sinon
    l'apprenant recevrait le même message trois fois."""
    from services.sms import send_sms
    if not to_phone:
        return {"status": "no_phone"}
    log = await send_whatsapp(to_phone, template, params, button_param, extra)
    if log["status"] != "sent" and log["status"] != "opted_out" and sms_text:
        await send_sms(to_phone, sms_text, extra=extra)
    return log


async def record_status(status: dict) -> None:
    """Statut de remise reçu par le webhook Meta : sent, delivered, read ou
    failed (avec la raison)."""
    message_id = status.get("id")
    if not message_id:
        return
    update = {"delivery_status": status.get("status"), "delivery_updated_at": now_iso()}
    if status.get("status") == "failed":
        errors = status.get("errors") or [{}]
        update["delivery_error"] = f"{errors[0].get('code', '')} {errors[0].get('title') or errors[0].get('message') or ''}".strip()
    await db.whatsapp_logs.update_one({"wa_message_id": message_id}, {"$set": update})


async def record_inbound(message: dict) -> None:
    """Message reçu de l'apprenant : enregistré, et une demande STOP le
    retire définitivement des envois WhatsApp."""
    from core.whatsapp_templates import is_stop_request
    phone = normalize_phone_fr("+" + (message.get("from") or "").lstrip("+"))
    text = ((message.get("text") or {}).get("body") or (message.get("button") or {}).get("text") or "")
    await db.whatsapp_inbound.insert_one({
        "id": str(uuid.uuid4()), "wa_message_id": message.get("id"), "from": phone,
        "type": message.get("type"), "text": text, "received_at": now_iso(),
    })
    if phone and is_stop_request(text):
        await db.whatsapp_opt_outs.update_one(
            {"phone": phone}, {"$setOnInsert": {"phone": phone, "opted_out_at": now_iso(), "text": text}}, upsert=True,
        )
        logger.info("WhatsApp : désinscription d'un apprenant (STOP)")
