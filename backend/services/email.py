import asyncio
import re
import uuid
import logging
import urllib.parse
import requests

from core.database import db
from core.utils import now_iso
from core.config import PUBLIC_BACKEND_URL

logger = logging.getLogger(__name__)


def _with_tracking_pixel(body: str, log_id: str) -> str:
    """Ajoute une image invisible 1x1 en fin de corps HTML : quand le client
    mail la charge (email ouvert), le serveur reçoit la requête et marque
    l'email comme ouvert. Best-effort : beaucoup de clients (Gmail proxy,
    Apple Mail Privacy Protection, images bloquées par défaut...) faussent
    ce signal, donc c'est un indicateur, pas une preuve fiable à 100%."""
    pixel_url = f"{PUBLIC_BACKEND_URL}/api/track/open/{log_id}.gif"
    return body + f'<img src="{pixel_url}" width="1" height="1" alt="" style="display:none;border:0;" />'


_HREF_RE = re.compile(r'href="(https?://[^"]+)"')


def _with_click_tracking(body: str, log_id: str) -> str:
    """Remplace chaque lien http(s) du corps par une redirection via le
    backend, pour compter les clics avant de renvoyer vers l'URL réelle.
    Les liens mailto:/tel: ne sont pas concernés (regex limitée à http(s))."""
    def _rewrite(match):
        original_url = match.group(1)
        redirect = f"{PUBLIC_BACKEND_URL}/api/track/click/{log_id}?url={urllib.parse.quote(original_url, safe='')}"
        return f'href="{redirect}"'
    return _HREF_RE.sub(_rewrite, body)


def _http_post(url: str, headers: dict, json_data: dict):
    return requests.post(url, headers=headers, json=json_data, timeout=15)


async def _send_via_resend(api_key: str, from_addr: str, to: str, subject: str, body: str, attachment: dict = None) -> str:
    """Envoie via l'API HTTP Resend et renvoie le statut ('sent' ou 'failed: ...')."""
    try:
        payload = {"from": from_addr, "to": [to], "subject": subject, "html": body}
        if attachment:
            payload["attachments"] = [{"filename": attachment["filename"], "content": attachment["content_b64"]}]
        r = await asyncio.to_thread(
            _http_post,
            "https://api.resend.com/emails",
            {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            payload
        )
        return "sent" if r.status_code < 300 else f"failed: {r.text[:200]}"
    except Exception as e:
        return f"error: {e}"


def _smtp_send(host: str, port: int, use_tls: bool, user: str, password: str,
               from_addr: str, to: str, subject: str, body: str, attachment: dict = None):
    import base64
    import socket
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.mime.application import MIMEApplication
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body, "html"))
    msg.attach(alt)
    if attachment:
        part = MIMEApplication(base64.b64decode(attachment["content_b64"]), Name=attachment["filename"])
        part["Content-Disposition"] = f'attachment; filename="{attachment["filename"]}"'
        msg.attach(part)

    # Sur certains hébergeurs (Render notamment), smtp.gmail.com se résout
    # parfois en IPv6 alors que la route sortante IPv6 n'est pas disponible,
    # ce qui fait échouer la connexion avec "Network is unreachable" même si
    # l'IPv4 fonctionne très bien. On force donc la résolution DNS en IPv4
    # uniquement, le temps d'établir la connexion.
    original_getaddrinfo = socket.getaddrinfo

    def _ipv4_only_getaddrinfo(host_, port_, family=0, type_=0, proto=0, flags=0):
        return original_getaddrinfo(host_, port_, socket.AF_INET, type_, proto, flags)

    socket.getaddrinfo = _ipv4_only_getaddrinfo
    try:
        if use_tls:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
    finally:
        socket.getaddrinfo = original_getaddrinfo

    server.login(user, password)
    server.sendmail(from_addr, [to], msg.as_string())
    server.quit()


async def _send_via_sendgrid(api_key: str, from_addr: str, to: str, subject: str, body: str, attachment: dict = None) -> str:
    try:
        payload = {
            "personalizations": [{"to": [{"email": to}]}],
            "from": {"email": from_addr},
            "subject": subject,
            "content": [{"type": "text/html", "value": body}]
        }
        if attachment:
            payload["attachments"] = [{"content": attachment["content_b64"], "filename": attachment["filename"]}]
        r = await asyncio.to_thread(
            _http_post,
            "https://api.sendgrid.com/v3/mail/send",
            {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            payload
        )
        return "sent" if r.status_code < 300 else f"failed: {r.text[:200]}"
    except Exception as e:
        return f"error: {e}"


async def _send_via_brevo(api_key: str, from_addr: str, to: str, subject: str, body: str, attachment: dict = None) -> str:
    """Envoie via l'API HTTP Brevo (ex-Sendinblue) — comme Resend/SendGrid,
    en HTTPS, donc non bloqué par les hébergeurs qui coupent le SMTP sortant."""
    try:
        payload = {
            "sender": {"email": from_addr},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": body,
        }
        if attachment:
            payload["attachment"] = [{"content": attachment["content_b64"], "name": attachment["filename"]}]
        r = await asyncio.to_thread(
            _http_post,
            "https://api.brevo.com/v3/smtp/email",
            {"api-key": api_key, "Content-Type": "application/json", "Accept": "application/json"},
            payload
        )
        return "sent" if r.status_code < 300 else f"failed: {r.text[:200]}"
    except Exception as e:
        return f"error: {e}"


async def _send_via_smtp(s: dict, to: str, subject: str, body: str, attachment: dict = None) -> str:
    """Envoie en SMTP avec retry (Gmail depuis un hébergeur cloud échoue parfois
    de façon aléatoire — IP partagée méfiante — sans être bloqué à 100%)."""
    max_attempts = 3
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            await asyncio.to_thread(
                _smtp_send,
                s.get("smtp_host", "smtp.gmail.com"),
                int(s.get("smtp_port") or 587),
                bool(s.get("smtp_tls", True)),
                s["smtp_user"],
                s["smtp_password"],
                s.get("email_from") or s.get("smtp_user"),
                to, subject, body, attachment
            )
            return "sent"
        except Exception as e:
            last_error = e
            if attempt < max_attempts:
                logger.warning(f"SMTP tentative {attempt}/{max_attempts} échouée pour {to} ({e}), nouvel essai...")
                await asyncio.sleep(2 * attempt)
    return f"smtp_error: {last_error}"


def _smtp_configured(s: dict) -> bool:
    return bool(s.get("smtp_host") and s.get("smtp_user") and s.get("smtp_password"))


async def send_email(to: str, subject: str, body: str, extra: dict = None, attachment: dict = None) -> dict:
    """attachment (optionnel) : {"filename": str, "content_b64": str} — utilisé
    par le composeur d'email personnalisé pour joindre un fichier."""
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    provider = s.get("email_provider", "mock")
    from_addr = s.get("email_from", "noreply@tdlformation.fr")
    # Clé Resend : celle du fournisseur principal si provider="resend", sinon
    # celle dédiée au secours (utilisable même quand le principal est le SMTP).
    resend_key = s.get("email_api_key") if provider == "resend" else s.get("resend_fallback_api_key")
    log_id = str(uuid.uuid4())
    log = {
        "id": log_id, "to": to, "subject": subject, "body": body,
        "provider": provider, "status": "queued", "created_at": now_iso(),
        "opened": False, "opened_at": None, "open_count": 0,
        "clicked": False, "clicked_at": None, "click_count": 0,
        "attachment_filename": attachment["filename"] if attachment else None,
        **(extra or {}),
    }
    if provider != "mock":
        tracked_body = _with_click_tracking(body, log_id)
        tracked_body = _with_tracking_pixel(tracked_body, log_id)
    else:
        tracked_body = body

    if provider == "resend" and resend_key:
        log["status"] = await _send_via_resend(resend_key, from_addr, to, subject, tracked_body, attachment)
        if log["status"] != "sent" and _smtp_configured(s):
            logger.warning(f"Resend en échec pour {to} ({log['status']}), tentative SMTP en secours...")
            log["resend_error"] = log["status"]
            log["status"] = await _send_via_smtp(s, to, subject, tracked_body, attachment)
            log["fallback_provider"] = "smtp"

    elif provider == "sendgrid" and s.get("email_api_key"):
        log["status"] = await _send_via_sendgrid(s["email_api_key"], from_addr, to, subject, tracked_body, attachment)

    elif provider == "brevo" and s.get("email_api_key"):
        log["status"] = await _send_via_brevo(s["email_api_key"], from_addr, to, subject, tracked_body, attachment)
        if log["status"] != "sent" and _smtp_configured(s):
            logger.warning(f"Brevo en échec pour {to} ({log['status']}), tentative SMTP en secours...")
            log["brevo_error"] = log["status"]
            log["status"] = await _send_via_smtp(s, to, subject, tracked_body, attachment)
            log["fallback_provider"] = "smtp"

    elif provider == "smtp" and _smtp_configured(s):
        log["status"] = await _send_via_smtp(s, to, subject, tracked_body, attachment)
        if log["status"] != "sent" and s.get("resend_fallback_api_key"):
            logger.warning(f"SMTP définitivement en échec pour {to} ({log['status']}), tentative Resend en secours...")
            log["smtp_error"] = log["status"]
            log["status"] = await _send_via_resend(s["resend_fallback_api_key"], from_addr, to, subject, tracked_body, attachment)
            log["fallback_provider"] = "resend"

    else:
        log["status"] = "mocked"
        logger.info(f"[EMAIL MOCK] to={to} subject={subject}")

    await db.email_logs.insert_one(log)
    return log
