import asyncio
import hashlib
import logging
import time
import uuid
from typing import Optional

import requests

from core.config import META_PIXEL_ID, META_API_TOKEN, META_PIXEL_TEST_ID
from core.database import db
from core.utils import now_iso

logger = logging.getLogger(__name__)

GRAPH_URL = "https://graph.facebook.com/v19.0"


def _hash(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


async def send_capi_event(
    event_name: str,
    event_id: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    custom_data: Optional[dict] = None,
    event_source_url: Optional[str] = None,
    client_ip_address: Optional[str] = None,
    client_user_agent: Optional[str] = None,
    fbc: Optional[str] = None,
    fbp: Optional[str] = None,
    external_id: Optional[str] = None,
) -> None:
    """Envoie un événement de conversion côté serveur (Meta Conversions API) —
    doublon fiable de l'événement navigateur (lib/metaPixel.js), non bloqué
    par un ad-blocker. `event_id` doit être identique à celui du pixel
    navigateur pour la même action afin que Meta déduplique les deux envois
    (voir trackMetaEvent côté frontend, qui prend le même eventID en 3e argument
    de fbq). `client_ip_address`/`client_user_agent` améliorent la qualité de
    correspondance des évènements quand ils sont disponibles (ex: requête
    directe du navigateur) — absents pour les évènements déclenchés par un
    webhook serveur-à-serveur (Stripe) qui n'a pas ce contexte.
    No-op silencieux si les identifiants ne sont pas configurés (dev/local) —
    mais journalisé quand même (voir _log_event) pour pouvoir vérifier
    facilement, depuis le dashboard (Marketing > Événements Meta), que
    chaque prospect déclenche bien un envoi, sans dépendre uniquement de
    l'interface (parfois déroutante) du Gestionnaire d'événements Meta."""
    if not META_PIXEL_ID or not META_API_TOKEN:
        logger.info(f"Meta CAPI event NON envoyé ({event_name}) : META_PIXEL_ID/META_API_TOKEN non configurés")
        await _log_event(event_name, event_id, email, phone, custom_data, status="not_configured")
        return
    user_data = {}
    if email:
        user_data["em"] = [_hash(email)]
    if phone:
        user_data["ph"] = [_hash(phone)]
    if client_ip_address:
        user_data["client_ip_address"] = client_ip_address
    if client_user_agent:
        user_data["client_user_agent"] = client_user_agent
    # fbc/fbp sont des tokens opaques déjà formatés par Meta — envoyés tels
    # quels, jamais hachés (contrairement à em/ph/external_id).
    if fbc:
        user_data["fbc"] = fbc
    if fbp:
        user_data["fbp"] = fbp
    if external_id:
        user_data["external_id"] = [_hash(external_id)]

    payload = {
        "data": [{
            "event_name": event_name,
            "event_time": int(time.time()),
            "event_id": event_id or str(uuid.uuid4()),
            "action_source": "website",
            "event_source_url": event_source_url or "",
            "user_data": user_data,
            "custom_data": custom_data or {},
        }],
    }
    if META_PIXEL_TEST_ID:
        payload["test_event_code"] = META_PIXEL_TEST_ID

    try:
        resp = await asyncio.to_thread(
            requests.post,
            f"{GRAPH_URL}/{META_PIXEL_ID}/events",
            params={"access_token": META_API_TOKEN},
            json=payload,
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.warning(f"Meta CAPI event failed ({event_name}): {resp.status_code} {resp.text}")
            await _log_event(event_name, event_id, email, phone, custom_data, status="failed", detail=resp.text[:500])
        else:
            events_received = (resp.json() or {}).get("events_received")
            logger.info(f"Meta CAPI event envoyé ({event_name}) — events_received={events_received} — {email or phone or 'sans contact'}")
            await _log_event(event_name, event_id, email, phone, custom_data, status="sent", detail=f"events_received={events_received}")
    except Exception as e:
        logger.warning(f"Meta CAPI event error ({event_name}): {e}")
        await _log_event(event_name, event_id, email, phone, custom_data, status="error", detail=str(e)[:500])


async def _log_event(event_name, event_id, email, phone, custom_data, status, detail=None):
    """Trace interne (indépendante de Meta) de chaque tentative d'envoi —
    volontairement en clair (email/téléphone non hachés) puisque c'est pour
    un usage interne dashboard, où le but est justement de retrouver le
    prospect concerné. Voir GET /marketing/meta-events."""
    try:
        await db.meta_events_log.insert_one({
            "id": str(uuid.uuid4()), "event_name": event_name, "event_id": event_id,
            "email": email, "phone": phone, "custom_data": custom_data or {},
            "status": status, "detail": detail, "created_at": now_iso(),
        })
    except Exception as e:
        logger.warning(f"Meta event log (Mongo) échec — {e}")
