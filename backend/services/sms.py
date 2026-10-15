"""Envoi de SMS transactionnels via l'API Brevo (ex-Sendinblue) — canal de
secours quand l'email n'arrive pas (liens de paiement, relances de documents
manquants...). Même logique de settings/logs que services/email.py."""
import asyncio
import logging
import re
import uuid

from core.database import db
from core.utils import now_iso

logger = logging.getLogger(__name__)

_DIGITS_RE = re.compile(r"[^\d+]")


def normalize_phone_fr(raw: str) -> str | None:
    """Normalise un numéro français vers le format E.164 (+33...) attendu par
    Brevo. Renvoie None si le numéro est manifestement invalide plutôt que
    d'appeler l'API pour rien (coût + logs pollués)."""
    if not raw:
        return None
    cleaned = _DIGITS_RE.sub("", raw.strip())
    if cleaned.startswith("+"):
        return cleaned if len(cleaned) >= 8 else None
    if cleaned.startswith("0033"):
        return "+33" + cleaned[4:]
    if cleaned.startswith("33"):
        return "+" + cleaned
    if cleaned.startswith("0") and len(cleaned) == 10:
        return "+33" + cleaned[1:]
    return None


def _http_post(url: str, headers: dict, json_data: dict):
    import requests
    return requests.post(url, headers=headers, json=json_data, timeout=15)


async def _send_via_brevo_sms(api_key: str, sender: str, to: str, content: str) -> str:
    try:
        r = await asyncio.to_thread(
            _http_post,
            "https://api.brevo.com/v3/transactionalSMS/sms",
            {"api-key": api_key, "Content-Type": "application/json", "Accept": "application/json"},
            {"sender": sender, "recipient": to, "content": content, "type": "transactional"},
        )
        return "sent" if r.status_code < 300 else f"failed: {r.text[:200]}"
    except Exception as e:
        return f"error: {e}"


async def send_sms(to_phone: str, content: str, extra: dict = None) -> dict:
    """Best-effort : n'importe quel appelant peut ignorer le résultat sans
    casser son propre flux (l'email reste le canal principal, le SMS un
    secours), mais le statut est toujours loggé pour diagnostiquer les ratés."""
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    log_id = str(uuid.uuid4())
    log = {
        "id": log_id, "to": to_phone, "content": content,
        "status": "queued", "created_at": now_iso(), **(extra or {}),
    }

    if not s.get("sms_enabled"):
        log["status"] = "disabled"
        await db.sms_logs.insert_one(log)
        return log

    phone = normalize_phone_fr(to_phone)
    if not phone:
        log["status"] = "invalid_phone"
        await db.sms_logs.insert_one(log)
        return log
    log["to"] = phone

    api_key = s.get("email_api_key") if s.get("email_provider") == "brevo" else s.get("brevo_fallback_api_key")
    if not api_key:
        log["status"] = "no_api_key"
        await db.sms_logs.insert_one(log)
        return log

    sender = (s.get("sms_sender") or "TDLFORMA")[:11]
    log["status"] = await _send_via_brevo_sms(api_key, sender, phone, content)
    await db.sms_logs.insert_one(log)
    return log
