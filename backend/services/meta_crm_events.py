"""Intégration Meta "Prospects qualifiés" (CRM integration, API Conversions)
— distincte de services/meta_capi.py (Pixel du site public, action_source
"website") : celle-ci relie les changements de statut d'un prospect dans
notre CRM à l'ensemble de données Meta Lead Ads, pour que Meta sache quels
leads se sont réellement convertis et optimise la diffusion des pubs en
conséquence (Gestionnaire d'événements Meta > Prospects qualifiés).

Format de charge utile imposé par Meta pour ce dataset précis (action_source
toujours "system_generated", custom_data.event_source toujours "crm") — voir
les instructions fournies dans l'écran de configuration de l'intégration."""
import asyncio
import hashlib
import logging
import time
import uuid
from typing import Optional

import requests

from core.config import META_LEAD_LINK_ACCESS_TOKEN, META_CRM_DATASET_ID
from core.database import db
from core.utils import now_iso

logger = logging.getLogger(__name__)

GRAPH_VERSION = "v26.0"
LEAD_EVENT_SOURCE = "TDL CRM"


def _hash(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


def configured() -> bool:
    return bool(META_LEAD_LINK_ACCESS_TOKEN and META_CRM_DATASET_ID)


async def send_crm_lead_event(
    event_name: str,
    meta_lead_id: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
) -> dict:
    """Envoie un évènement "changement de statut de prospect" à Meta.
    `meta_lead_id` est l'identifiant généré par Meta pour ce lead (15-17
    chiffres, voir le champ `meta_lead_id` déjà stocké sur
    db.meta_lead_imports) — sans lui, Meta ne peut rattacher l'évènement au
    bon prospect que par email/téléphone haché, moins fiable."""
    if not configured():
        detail = "META_LEAD_LINK_ACCESS_TOKEN non configuré"
        await _log(event_name, meta_lead_id, email, phone, "not_configured", detail)
        return {"status": "not_configured", "detail": detail}

    user_data = {}
    if email:
        user_data["em"] = [_hash(email)]
    if phone:
        user_data["ph"] = [_hash(phone)]
    if meta_lead_id:
        try:
            user_data["lead_id"] = int(meta_lead_id)
        except (TypeError, ValueError):
            user_data["lead_id"] = meta_lead_id

    payload = {
        "data": [{
            "action_source": "system_generated",
            "event_name": event_name,
            "event_time": int(time.time()),
            "custom_data": {"event_source": "crm", "lead_event_source": LEAD_EVENT_SOURCE},
            "user_data": user_data,
        }],
    }

    try:
        resp = await asyncio.to_thread(
            requests.post,
            f"https://graph.facebook.com/{GRAPH_VERSION}/{META_CRM_DATASET_ID}/events",
            params={"access_token": META_LEAD_LINK_ACCESS_TOKEN},
            json=payload,
            timeout=10,
        )
        body_text = resp.text[:800]
        if resp.status_code >= 400:
            logger.warning(f"Meta CRM event failed ({event_name}): {resp.status_code} {body_text}")
            await _log(event_name, meta_lead_id, email, phone, "failed", body_text)
            return {"status": "failed", "http_status": resp.status_code, "detail": body_text}
        resp_json = resp.json() if resp.content else {}
        events_received = resp_json.get("events_received")
        await _log(event_name, meta_lead_id, email, phone, "sent", f"events_received={events_received}")
        return {"status": "sent", "events_received": events_received, "raw": resp_json}
    except Exception as e:
        logger.warning(f"Meta CRM event error ({event_name}): {e}")
        await _log(event_name, meta_lead_id, email, phone, "error", str(e)[:500])
        return {"status": "error", "detail": str(e)}


async def _log(event_name, meta_lead_id, email, phone, status, detail):
    try:
        await db.meta_crm_events_log.insert_one({
            "id": str(uuid.uuid4()), "event_name": event_name, "meta_lead_id": meta_lead_id,
            "email": email, "phone": phone, "status": status, "detail": detail, "created_at": now_iso(),
        })
    except Exception as e:
        logger.warning(f"Meta CRM event log échec — {e}")
