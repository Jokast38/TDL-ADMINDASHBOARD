import asyncio
import hashlib
import logging
import time
import uuid
from typing import Optional

import requests

from core.config import META_PIXEL_ID, META_API_TOKEN, META_PIXEL_TEST_ID

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
    No-op silencieux si les identifiants ne sont pas configurés (dev/local)."""
    if not META_PIXEL_ID or not META_API_TOKEN:
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
    except Exception as e:
        logger.warning(f"Meta CAPI event error ({event_name}): {e}")
