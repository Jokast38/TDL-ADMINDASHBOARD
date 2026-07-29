import asyncio
import logging
from typing import Any, Dict, List, Optional

import requests

from core.database import db
from core.config import LIMOVA_API_KEY as ENV_LIMOVA_API_KEY

logger = logging.getLogger(__name__)

BASE_URL = "https://api.new.limova.ai"


class LimovaNotConfigured(Exception):
    """Levée quand la clé API ou l'ID d'agent nécessaire n'est pas encore
    renseigné dans Paramètres → Limova. Les routeurs la traduisent en 400."""


class LimovaError(Exception):
    """Erreur renvoyée par l'API Limova elle-même (ex: crédits insuffisants,
    agent introuvable) — le message contient le détail retourné par Limova."""


async def _settings() -> dict:
    return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}


async def _api_key() -> str:
    s = await _settings()
    # Priorité à la clé saisie dans Paramètres → Limova ; sinon celle posée en
    # variable d'environnement côté serveur (LIMOVA_API_KEY dans .env).
    key = s.get("limova_api_key") or ENV_LIMOVA_API_KEY
    if not key:
        raise LimovaNotConfigured("Clé API Limova non configurée (Paramètres → Limova ou LIMOVA_API_KEY)")
    return key


async def api_key_configured() -> bool:
    s = await _settings()
    return bool(s.get("limova_api_key") or ENV_LIMOVA_API_KEY)


def _request(method: str, path: str, api_key: str, **kwargs) -> requests.Response:
    return requests.request(
        method, f"{BASE_URL}{path}",
        headers={"x-api-key": api_key, "Content-Type": "application/json"},
        timeout=20, **kwargs,
    )


async def _call(method: str, path: str, **kwargs) -> Any:
    api_key = await _api_key()
    try:
        r = await asyncio.to_thread(_request, method, path, api_key, **kwargs)
    except Exception as e:
        raise LimovaError(f"Erreur réseau Limova : {e}")
    if r.status_code == 402:
        raise LimovaError("Crédits Limova insuffisants pour cette action")
    if r.status_code >= 300:
        raise LimovaError(f"Limova a renvoyé une erreur ({r.status_code}) : {r.text[:300]}")
    return r.json() if r.content else None


async def get_phone_agent_id() -> str:
    s = await _settings()
    agent_id = s.get("limova_phone_agent_id")
    if not agent_id:
        raise LimovaNotConfigured("Aucun agent téléphonique Limova configuré (Paramètres → Limova)")
    return agent_id


async def get_linkedin_agent_id() -> str:
    s = await _settings()
    agent_id = s.get("limova_marketing_agent_id")
    if not agent_id:
        raise LimovaNotConfigured("Aucun agent marketing/LinkedIn Limova configuré (Paramètres → Limova)")
    return agent_id


# ── Campagnes (appels téléphoniques) ──────────────────────────────────────────

async def create_campaign(name: str, agent_id: str, channel: str = "phone") -> dict:
    return await _call("POST", "/campaigns", json={"name": name, "agentId": agent_id, "channel": channel})


async def add_prospects(campaign_id: str, prospects: List[Dict[str, Any]]) -> dict:
    """prospects: [{"name": str, "phone": str, ...}]"""
    return await _call("POST", f"/campaigns/{campaign_id}/prospects", json={"prospects": prospects})


async def start_campaign(campaign_id: str) -> dict:
    return await _call("POST", f"/campaigns/{campaign_id}/start")


async def pause_campaign(campaign_id: str) -> dict:
    return await _call("POST", f"/campaigns/{campaign_id}/pause")


async def campaign_statistics(campaign_id: str) -> dict:
    return await _call("GET", f"/campaigns/{campaign_id}/statistics")


async def list_campaigns() -> list:
    data = await _call("GET", "/campaigns")
    return data if isinstance(data, list) else data.get("data", [])


# ── Agent d'accueil (réception d'appels entrants) ─────────────────────────────
# Principe Limova : on achète un numéro dédié (Twilio) qui reçoit les appels et
# les transfère vers le vrai numéro (userPhoneNumber). Une fois un agent
# téléphonique connecté à ce numéro, il répond automatiquement si l'appel
# transféré reste sans réponse — c'est l'"agent d'accueil" demandé.
# ⚠️ register_inbound_number() achète un numéro réel (coût : 3600 crédits Limova,
# action facturée et non réversible) — ne jamais l'appeler sans confirmation
# explicite de l'utilisateur dans l'interface.

async def register_inbound_number(user_phone_number: str, friendly_name: Optional[str] = None) -> dict:
    payload = {"userPhoneNumber": user_phone_number}
    if friendly_name:
        payload["friendlyName"] = friendly_name
    return await _call("POST", "/phone/numbers/registry/inbound", json=payload)


async def list_inbound_numbers(page: int = 1, limit: int = 20) -> dict:
    return await _call("GET", "/phone/numbers/registry", params={"page": page, "limit": limit})


async def connect_agent_phone(agent_id: str, public_integration_id: Optional[str] = None) -> dict:
    """Connecte un agent autonome (téléphonique) à la réception d'appels — il
    répond alors aux appels entrants sur les numéros enregistrés pour ce
    workspace lorsqu'ils ne sont pas décrochés."""
    payload = {"type": "phone"}
    if public_integration_id:
        payload["publicIntegrationId"] = public_integration_id
    return await _call("POST", f"/autonomous-agents/{agent_id}/connections", json=payload)


# ── Appels téléphoniques ───────────────────────────────────────────────────────

async def list_calls(phone_agent_id: str, page: int = 1, page_size: int = 50) -> dict:
    return await _call("GET", f"/phone-agents/{phone_agent_id}/calls", params={"page": page, "pageSize": page_size})


async def phone_metrics(phone_agent_id: str) -> dict:
    return await _call("GET", f"/phone-agents/{phone_agent_id}/metrics")


# ── LinkedIn ───────────────────────────────────────────────────────────────────

async def linkedin_auth_status() -> dict:
    return await _call("GET", "/linkedin/auth/status")


async def linkedin_auth_initiate() -> dict:
    return await _call("POST", "/linkedin/auth/initiate")


async def linkedin_send_message(profile_url: str, message: str) -> dict:
    return await _call("POST", "/linkedin/message", json={"profileUrl": profile_url, "message": message})


async def linkedin_connection_request(profile_url: str, message: Optional[str] = None) -> dict:
    payload = {"profileUrl": profile_url}
    if message:
        payload["message"] = message
    return await _call("POST", "/linkedin/connection-request", json=payload)


# ── Instagram / Facebook ───────────────────────────────────────────────────────
# Limova ne documente, à ce jour, que la connexion OAuth pour ces deux réseaux —
# pas de publication ou de programmation de post via l'API (contrairement à
# LinkedIn qui permet aussi l'envoi de messages).

async def instagram_auth_status() -> dict:
    return await _call("GET", "/instagram/auth/status")


async def instagram_auth_initiate() -> dict:
    return await _call("POST", "/instagram/auth/initiate")


async def facebook_auth_status() -> dict:
    return await _call("GET", "/facebook/auth/status")


async def facebook_auth_initiate() -> dict:
    return await _call("POST", "/facebook/auth/initiate")
