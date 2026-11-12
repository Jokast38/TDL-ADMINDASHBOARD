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


async def gateway_config() -> dict:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    url = (s.get("smsgate_url") or DEFAULT_URL).strip().rstrip("/")
    if url in ("https://sms-gate.app", "https://dashboard.sms-gate.app"):
        url = DEFAULT_URL  # URL du tableau de bord saisie par erreur
    return {
        "url": url,
        "user": (s.get("smsgate_user") or os.getenv("SMSGATE_USER", "")).strip(),
        "password": (s.get("smsgate_password") or os.getenv("SMSGATE_PASSWORD", "")).strip(),
        "webhook_secret": (s.get("smsgate_webhook_secret") or os.getenv("SMSGATE_WEBHOOK_SECRET", "")).strip(),
        "prefix": s.get("sms_campaign_prefix") if s.get("sms_campaign_prefix") is not None else "TDL Formation : ",
        "stop_text": s.get("sms_campaign_stop_text") if s.get("sms_campaign_stop_text") is not None else "STOP SMS : répondez STOP",
        "daily_cap": int(s.get("sms_campaign_daily_cap") or 100),
    }


def _request(method: str, url: str, auth: tuple, json_data: dict | None = None):
    import requests
    return requests.request(method, url, auth=auth, json=json_data, timeout=20)


async def call(cfg: dict, method: str, path: str, json_data: dict | None = None):
    if not (cfg["user"] and cfg["password"]):
        raise GatewayError("Passerelle SMS non configurée (Paramètres → SMS)", retryable=False)
    try:
        r = await asyncio.to_thread(_request, method, cfg["url"] + path, (cfg["user"], cfg["password"]), json_data)
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
    """Confie le SMS au cloud : il le garde tant que le téléphone est hors ligne,
    et c'est le téléphone qui espace les envois (réglage de l'appli)."""
    return await call(cfg, "POST", "/messages", {
        "id": msg_id, "textMessage": {"text": text}, "phoneNumbers": [phone], "withDeliveryReport": True,
    })


async def status(cfg: dict, msg_id: str) -> dict:
    return await call(cfg, "GET", f"/messages/{msg_id}")


def extract_state(res: dict) -> tuple[str | None, str | None]:
    recips = (res or {}).get("recipients") or []
    if recips:
        return recips[0].get("state") or res.get("state"), recips[0].get("error")
    return (res or {}).get("state"), None


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
