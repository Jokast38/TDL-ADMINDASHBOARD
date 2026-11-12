"""Passerelle SMS personnelle pour les campagnes SMS (demande du 2026-11-12).

Les SMS de campagne partent par un téléphone Android (appli « SMS Gateway for
Android ») relié au cloud SMS Gate (api.sms-gate.app) : gratuit, sans crédit
Brevo. Les SMS transactionnels restent sur services/sms.py (Brevo).

Configuration : Paramètres → SMS → « Passerelle SMS (campagnes) »
  smsgate_user / smsgate_password : identifiants « Cloud Server » de l'appli
  smsgate_url                     : défaut https://api.sms-gate.app/3rdparty/v1
  smsgate_webhook_secret          : appli → Paramètres → Webhooks → Signing Key
Repli possible sur les variables d'environnement SMSGATE_USER / SMSGATE_PASSWORD."""
import asyncio
import hashlib
import hmac
import os
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from core.database import db

DEFAULT_URL = "https://api.sms-gate.app/3rdparty/v1"
PARIS = ZoneInfo("Europe/Paris")


class GatewayError(Exception):
    def __init__(self, message: str, retryable: bool = True, status: int | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.status = status


def _env(*names: str) -> str:
    """Premier nom de variable défini. Mêmes noms que la plateforme jakal-shop
    (SMS_GATEWAY_API_URL, SMS_GATEWAY_USERNAME/PASSWORD ou GATEWAY_USER/PASSWORD)
    pour pouvoir recopier sa configuration telle quelle."""
    for n in names:
        if os.getenv(n, "").strip():
            return os.getenv(n).strip()
    return ""


async def gateway_config() -> dict:
    """Paramètres du CRM d'abord (Paramètres → SMS), sinon variables d'environnement.

    Deux modes :
      - « smsgate »    : API SMS Gate directe (identifiant + mot de passe), comme jakal-shop ;
      - « dispatcher » : notre serveur SMS personnel (SMS-SERVER), avec une clé API sk_...
                         propre à TDL ; smsgate_url = adresse publique de ce serveur."""
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    api_key = (s.get("smsgate_api_key") or _env("SMS_DISPATCHER_API_KEY")).strip()
    mode = "dispatcher" if api_key else "smsgate"
    if mode == "dispatcher":
        url = (s.get("smsgate_url") or _env("SMS_DISPATCHER_URL")).strip().rstrip("/")
    else:
        url = (s.get("smsgate_url") or _env("SMS_GATEWAY_API_URL", "SMSGATE_URL") or DEFAULT_URL).strip().rstrip("/")
        if url in ("https://sms-gate.app", "https://dashboard.sms-gate.app"):
            url = DEFAULT_URL  # URL du tableau de bord saisie par erreur
    return {
        "mode": mode,
        "api_key": api_key,
        "url": url,
        "user": (s.get("smsgate_user") or _env("SMS_GATEWAY_USERNAME", "GATEWAY_USER", "SMSGATE_USER")).strip(),
        "password": (s.get("smsgate_password") or _env("SMS_GATEWAY_PASSWORD", "GATEWAY_PASSWORD", "SMSGATE_PASSWORD")).strip(),
        "webhook_secret": (s.get("smsgate_webhook_secret") or _env("SMS_GATEWAY_WEBHOOK_SECRET", "SMSGATE_WEBHOOK_SECRET")).strip(),
        "prefix": s.get("sms_campaign_prefix") if s.get("sms_campaign_prefix") is not None else "TDL Formation : ",
        "stop_text": s.get("sms_campaign_stop_text") if s.get("sms_campaign_stop_text") is not None else "STOP SMS : répondez STOP",
        "daily_cap": int(s.get("sms_campaign_daily_cap") or 100),
    }


def is_configured(cfg: dict) -> bool:
    if cfg.get("mode") == "dispatcher":
        return bool(cfg["api_key"] and cfg["url"])
    return bool(cfg["user"] and cfg["password"])


def _request(method: str, url: str, auth, json_data: dict | None = None, headers: dict | None = None):
    import requests
    return requests.request(method, url, auth=auth, json=json_data, headers=headers, timeout=20)


async def call(cfg: dict, method: str, path: str, json_data: dict | None = None):
    if not is_configured(cfg):
        raise GatewayError("Passerelle SMS non configurée (Paramètres → SMS)", retryable=False)
    if cfg.get("mode") == "dispatcher":
        auth, headers = None, {"X-API-Key": cfg["api_key"]}
    else:
        auth, headers = (cfg["user"], cfg["password"]), None
    try:
        r = await asyncio.to_thread(_request, method, cfg["url"] + path, auth, json_data, headers)
    except Exception as e:
        raise GatewayError(f"Passerelle injoignable : {e.__class__.__name__}")
    if r.status_code == 401:
        raise GatewayError("Identifiants de la passerelle refusés (401)", retryable=False, status=401)
    if r.status_code >= 500 or r.status_code == 429:
        raise GatewayError(f"Passerelle indisponible (HTTP {r.status_code})", status=r.status_code)
    if r.status_code >= 400:
        raise GatewayError(f"Refusé par la passerelle (HTTP {r.status_code}) : {r.text[:200]}", retryable=False, status=r.status_code)
    return r.json() if r.content else {}


async def send(cfg: dict, msg_id: str, phone: str, text: str) -> dict:
    """Confie le SMS à la passerelle, qui le garde tant que le téléphone est hors
    ligne. Renvoie {"id": identifiant à suivre pour les statuts}."""
    if cfg.get("mode") == "dispatcher":
        # Le préfixe « TDL Formation : » est déjà dans le texte : pas de second préfixe
        res = await call(cfg, "POST", "/api/v1/sms", {"to": phone, "message": text, "use_prefix": False, "reference": msg_id})
        return {"id": ((res.get("messages") or [{}])[0]).get("id") or msg_id}
    res = await call(cfg, "POST", "/messages", {
        "id": msg_id, "textMessage": {"text": text}, "phoneNumbers": [phone], "withDeliveryReport": True,
    })
    return {"id": res.get("id") or msg_id}


async def status(cfg: dict, msg_id: str) -> dict:
    if cfg.get("mode") == "dispatcher":
        return await call(cfg, "GET", f"/api/v1/sms/{msg_id}")
    return await call(cfg, "GET", f"/messages/{msg_id}")


def extract_state(res: dict) -> tuple[str | None, str | None]:
    res = res or {}
    if "status" in res and "state" not in res:  # format du serveur SMS personnel
        return res.get("status"), res.get("error")
    recips = res.get("recipients") or []
    if recips:
        return recips[0].get("state") or res.get("state"), recips[0].get("error")
    return res.get("state"), None


def valid_signature(secret: str, raw: bytes, ts: str | None, sig: str | None) -> bool:
    if not (ts and sig and ts.isdigit()) or abs(time.time() - int(ts)) > 300:
        return False
    expected = hmac.new(secret.encode(), raw + ts.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


# ── Créneaux autorisés pour la prospection par SMS ──────────────────────────
# Pas d'envoi le dimanche, les jours fériés, ni avant 8h / après 20h (heure de Paris).

def _easter(year: int) -> date:
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 19 * l) // 433
    month = (h + l - 7 * m + 90) // 25
    return date(year, month, (h + l - 7 * m + 33 * month + 19) % 32)


def jours_feries(year: int) -> set[date]:
    p = _easter(year)
    fixes = [(1, 1), (5, 1), (5, 8), (7, 14), (8, 15), (11, 1), (11, 11), (12, 25)]
    return {date(year, m, d) for m, d in fixes} | {p + timedelta(days=1), p + timedelta(days=39), p + timedelta(days=50)}


def sending_window_open(now: datetime | None = None) -> tuple[bool, str]:
    now = (now or datetime.now(PARIS)).astimezone(PARIS)
    if now.weekday() == 6:
        return False, "dimanche"
    if now.date() in jours_feries(now.year):
        return False, "jour férié"
    if not (8 <= now.hour < 20):
        return False, "hors 8h-20h"
    return True, ""
