import asyncio
import logging
from typing import Any, Dict, List, Optional

import requests

from core.config import TDL_BRAIN_API_URL, TDL_BRAIN_API_KEY

logger = logging.getLogger(__name__)


class TdlBrainNotConfigured(Exception):
    """TDL_BRAIN_API_KEY absent de l'environnement (voir .env.example)."""


class TdlBrainError(Exception):
    """Erreur renvoyée par l'API TDL Brain elle-même."""


def _api_key() -> str:
    if not TDL_BRAIN_API_KEY:
        raise TdlBrainNotConfigured("TDL_BRAIN_API_KEY non configurée (voir .env)")
    return TDL_BRAIN_API_KEY


def _request(method: str, path: str, **kwargs) -> requests.Response:
    return requests.request(
        method, f"{TDL_BRAIN_API_URL}{path}",
        headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
        timeout=20, **kwargs,
    )


async def _call(method: str, path: str, **kwargs) -> Any:
    try:
        r = await asyncio.to_thread(_request, method, path, **kwargs)
    except Exception as e:
        raise TdlBrainError(f"Erreur réseau TDL Brain : {e}")
    if r.status_code >= 300:
        raise TdlBrainError(f"TDL Brain a renvoyé une erreur ({r.status_code}) : {r.text[:300]}")
    return r.json() if r.content else None


async def list_apprenants(
    email: Optional[str] = None,
    pending: Optional[bool] = None,
    tier: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {"limit": limit, "offset": offset}
    if email:
        params["email"] = email
    if pending is not None:
        params["pending"] = "true" if pending else "false"
    if tier:
        params["tier"] = tier
    return await _call("GET", "/api/v1/apprenants", params=params)


async def get_apprenant(apprenant_id: str) -> Dict[str, Any]:
    data = await _call("GET", f"/api/v1/apprenants/{apprenant_id}")
    return data["apprenant"]


async def create_or_match_apprenant(
    email: str,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    partner_code: Optional[str] = None,
    elearning_tier: Optional[str] = None,
) -> Dict[str, Any]:
    """Inscription manuelle depuis le dashboard (staff choisit directement le niveau) -
    ou simple création/retrouvaille d'un apprenant. Ne lève pas d'erreur si l'email
    existe déjà (matched=true, fiche existante renvoyée telle quelle)."""
    payload: Dict[str, Any] = {"email": email}
    if first_name:
        payload["firstName"] = first_name
    if last_name:
        payload["lastName"] = last_name
    if partner_code:
        payload["partnerCode"] = partner_code
    if elearning_tier:
        payload["elearningTier"] = elearning_tier
    return await _call("POST", "/api/v1/apprenants", json=payload)


async def update_apprenant(
    apprenant_id: str,
    elearning_tier: Optional[str] = None,
    active: Optional[bool] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    if elearning_tier:
        payload["elearningTier"] = elearning_tier
    if active is not None:
        payload["active"] = active
    if reason:
        payload["reason"] = reason
    data = await _call("PATCH", f"/api/v1/apprenants/{apprenant_id}", json=payload)
    return data["apprenant"]


# ── Compteur SMTP partagé (26/11/2026) ─────────────────────────────────────────
# TDL Brain (contact@) et ce dashboard (administration@ / boîte Messagerie) envoient
# tous les deux sur le même domaine o2switch tdl-formation.fr, plafonné à 30
# emails/minute TOUTES BOITES CONFONDUES (confirmé par o2switch le 23/10/2026). Chaque
# app a déjà sa propre file locale (~28/min, voir services/email_rate.py), mais
# totalement indépendante - les deux en même temps pouvaient dépasser 30/min à elles
# deux. TDL Brain héberge la vérité (Postgres, voir supabase/schema.sql côté TDL
# Brain) ; ce dashboard réserve un créneau ici avant chaque envoi SMTP.
async def acquire_smtp_slot() -> bool:
    """Réserve 1 créneau dans le compteur SMTP domaine-wide partagé avec TDL Brain.
    Best-effort : si TDL Brain est inaccessible ou la clé API non configurée, on
    renvoie True plutôt que de bloquer l'envoi d'email du dashboard pour autant (même
    philosophie que le compteur Mongo local dans services/email_rate.py)."""
    try:
        data = await _call("POST", "/api/internal/smtp-rate/acquire", json={})
    except (TdlBrainNotConfigured, TdlBrainError) as e:
        logger.warning(f"Compteur SMTP partagé avec TDL Brain indisponible ({e}) - on continue sans lui")
        return True
    return bool(data.get("ok", True))
