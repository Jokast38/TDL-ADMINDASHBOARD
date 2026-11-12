"""Plafonnage des envois d'emails (demande du 2026-11-12).

o2switch limite l'envoi SMTP à 30 emails/minute pour TOUT le domaine
tdl-formation.fr (toutes boîtes confondues) et suspend le domaine entier en
cas de dépassement (confirmé par leur support le 2026-10-23). D'où :

1. Débit par minute (réglable, 28 max) pour tous les envois SMTP — boîte du
   dashboard ET boîte de la Messagerie / Offre flash.
2. Part réservée aux emails « transactionnels » (convocations, RDV,
   paiements, notifications de l'équipe…) : le marketing (relances
   automatiques, campagnes, relances manuelles, emails groupés) ne peut
   utiliser que `débit - réserve` envois par minute ; les emails importants
   ne font donc jamais la queue derrière une campagne.
3. Plafond horaire du marketing (réglable) : relances automatiques et
   campagnes s'arrêtent au plafond et reprennent au passage suivant.
4. Compteur partagé en base (une ligne par minute calendaire) en plus du
   compteur local : la limite tient même quand deux serveurs tournent en
   même temps (déploiement en cours). Si la base ne répond pas, le compteur
   local suffit.

Réglages : Paramètres → Email → « Débit d'envoi » (`settings.global`)."""
import asyncio
import logging
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from pymongo import ReturnDocument

from core.database import db

logger = logging.getLogger(__name__)

O2SWITCH_MAX_PAR_MINUTE = 28  # marge de sécurité sous les 30/min d'o2switch
DEFAULTS = {"smtp_rate_per_minute": 28, "smtp_reserve_transactional": 10, "marketing_per_hour": 300}

MARKETING = "marketing"
TRANSACTIONNEL = "transactionnel"
# Clés de `extra` (send_email) qui signalent un envoi marketing.
_MARKETING_KEYS = ("automation_id", "campaign", "campaign_id", "bulk_compose", "relance_manuelle", "flash_campaign")

_WINDOW_S = 60
_all_times: deque = deque()
_mkt_times: deque = deque()
_lock = asyncio.Lock()


def kind_of(extra: Optional[dict] = None, kind: Optional[str] = None) -> str:
    if kind in (MARKETING, TRANSACTIONNEL):
        return kind
    return MARKETING if any(k in (extra or {}) for k in _MARKETING_KEYS) else TRANSACTIONNEL


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def limits(s: Optional[dict]) -> dict:
    """Réglages bornés : jamais au-dessus de la limite o2switch, toujours au
    moins 1 envoi/minute pour le marketing quand la réserve est trop grande."""
    s = s or {}
    rate = min(max(_int(s.get("smtp_rate_per_minute"), DEFAULTS["smtp_rate_per_minute"]), 1), O2SWITCH_MAX_PAR_MINUTE)
    reserve = min(max(_int(s.get("smtp_reserve_transactional"), DEFAULTS["smtp_reserve_transactional"]), 0), rate - 1)
    hourly = max(_int(s.get("marketing_per_hour"), DEFAULTS["marketing_per_hour"]), 0)
    return {"par_minute": rate, "reserve_transactionnel": reserve, "marketing_par_minute": rate - reserve,
            "marketing_par_heure": hourly}


async def _settings() -> dict:
    try:
        return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    except Exception:
        return {}


def _minute_key(now: Optional[datetime] = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M")


async def _shared_take(kind: str, lim: dict) -> bool:
    """Réserve une place dans le compteur partagé de la minute en cours ;
    False si la minute est pleine (pour ce type d'envoi)."""
    key = _minute_key()
    inc = {"total": 1, MARKETING: 1 if kind == MARKETING else 0}
    try:
        doc = await db.smtp_rate.find_one_and_update(
            {"id": key}, {"$inc": inc}, upsert=True, return_document=ReturnDocument.AFTER)
        if not doc:
            return True
        over = doc.get("total", 0) > lim["par_minute"] or (
            kind == MARKETING and doc.get(MARKETING, 0) > lim["marketing_par_minute"])
        if over:
            await db.smtp_rate.update_one({"id": key}, {"$inc": {k: -v for k, v in inc.items()}})
            return False
        return True
    except Exception as e:  # base indisponible : le compteur local suffit
        logger.debug(f"Compteur d'envoi partagé indisponible ({e})")
        return True


async def acquire_slot(kind: str = TRANSACTIONNEL, s: Optional[dict] = None) -> None:
    """Attend qu'un envoi SMTP soit possible sans dépasser les limites.
    Le verrou n'est jamais gardé pendant l'attente : un email important
    n'attend pas derrière une campagne en pause."""
    lim = limits(s if s is not None else await _settings())
    while True:
        async with _lock:
            now = time.monotonic()
            for q in (_all_times, _mkt_times):
                while q and now - q[0] >= _WINDOW_S:
                    q.popleft()
            local_ok = len(_all_times) < lim["par_minute"] and (
                kind != MARKETING or len(_mkt_times) < lim["marketing_par_minute"])
            if local_ok and await _shared_take(kind, lim):
                _all_times.append(now)
                if kind == MARKETING:
                    _mkt_times.append(now)
                return
            if local_ok:  # minute pleine côté compteur partagé
                wait = 60 - datetime.now(timezone.utc).second + 0.2
            else:
                full = _mkt_times if kind == MARKETING and len(_mkt_times) >= lim["marketing_par_minute"] else _all_times
                wait = _WINDOW_S - (now - full[0]) + 0.1
        logger.info(f"Débit d'envoi atteint ({kind}) — pause {wait:.1f}s")
        await asyncio.sleep(min(max(wait, 0.1), 61))


def _since(**delta) -> str:
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


async def marketing_sent_last_hour() -> int:
    return await db.email_logs.count_documents({"kind": MARKETING, "created_at": {"$gte": _since(hours=1)}})


async def marketing_quota_remaining(s: Optional[dict] = None) -> int:
    lim = limits(s if s is not None else await _settings())
    return max(lim["marketing_par_heure"] - await marketing_sent_last_hour(), 0)


async def cleanup_old_buckets() -> None:
    try:
        await db.smtp_rate.delete_many({"id": {"$lt": _minute_key(datetime.now(timezone.utc) - timedelta(hours=2))}})
    except Exception:
        pass


async def stats() -> dict:
    """Chiffres affichés dans Paramètres → Email → « Débit d'envoi »."""
    s = await _settings()
    lim = limits(s)
    minute = _since(minutes=1)
    hour = _since(hours=1)
    day = _since(hours=24)
    count = db.email_logs.count_documents
    return {
        **lim,
        "derniere_minute": await count({"created_at": {"$gte": minute}}),
        "derniere_minute_marketing": await count({"kind": MARKETING, "created_at": {"$gte": minute}}),
        "derniere_heure": await count({"created_at": {"$gte": hour}}),
        "derniere_heure_marketing": await count({"kind": MARKETING, "created_at": {"$gte": hour}}),
        "dernieres_24h": await count({"created_at": {"$gte": day}}),
        "dernieres_24h_marketing": await count({"kind": MARKETING, "created_at": {"$gte": day}}),
        "relances_auto_actives": await db.lead_automations.count_documents({"active": True}),
    }
