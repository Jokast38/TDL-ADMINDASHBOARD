import asyncio
import uuid
import logging
import requests

from core.database import db
from core.utils import now_iso

logger = logging.getLogger(__name__)


def _http_post(url: str, headers: dict, json_data: dict):
    return requests.post(url, headers=headers, json=json_data, timeout=15)


def _smtp_send(host: str, port: int, use_tls: bool, user: str, password: str,
               from_addr: str, to: str, subject: str, body: str):
    import socket
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.attach(MIMEText(body, "html"))

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


async def send_email(to: str, subject: str, body: str) -> dict:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    provider = s.get("email_provider", "mock")
    log = {
        "id": str(uuid.uuid4()), "to": to, "subject": subject, "body": body,
        "provider": provider, "status": "queued", "created_at": now_iso()
    }

    if provider == "resend" and s.get("email_api_key"):
        try:
            r = await asyncio.to_thread(
                _http_post,
                "https://api.resend.com/emails",
                {"Authorization": f"Bearer {s['email_api_key']}", "Content-Type": "application/json"},
                {"from": s.get("email_from", "noreply@tdlformation.fr"), "to": [to], "subject": subject, "html": body}
            )
            log["status"] = "sent" if r.status_code < 300 else f"failed: {r.text[:200]}"
        except Exception as e:
            log["status"] = f"error: {e}"

    elif provider == "sendgrid" and s.get("email_api_key"):
        try:
            r = await asyncio.to_thread(
                _http_post,
                "https://api.sendgrid.com/v3/mail/send",
                {"Authorization": f"Bearer {s['email_api_key']}", "Content-Type": "application/json"},
                {
                    "personalizations": [{"to": [{"email": to}]}],
                    "from": {"email": s.get("email_from", "noreply@tdlformation.fr")},
                    "subject": subject,
                    "content": [{"type": "text/html", "value": body}]
                }
            )
            log["status"] = "sent" if r.status_code < 300 else f"failed: {r.text[:200]}"
        except Exception as e:
            log["status"] = f"error: {e}"

    elif provider == "smtp" and s.get("smtp_host") and s.get("smtp_user") and s.get("smtp_password"):
        # Gmail depuis un hébergeur cloud (IP partagée) échoue parfois de façon
        # aléatoire (timeout) sans être bloqué à 100% — on retente donc quelques
        # fois avant d'abandonner, au lieu d'échouer dès le premier essai.
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
                    to, subject, body
                )
                log["status"] = "sent"
                if attempt > 1:
                    log["retries"] = attempt - 1
                last_error = None
                break
            except Exception as e:
                last_error = e
                if attempt < max_attempts:
                    logger.warning(f"SMTP tentative {attempt}/{max_attempts} échouée pour {to} ({e}), nouvel essai...")
                    await asyncio.sleep(2 * attempt)
        if last_error is not None:
            log["status"] = f"smtp_error: {last_error}"
            log["retries"] = max_attempts - 1

    else:
        log["status"] = "mocked"
        logger.info(f"[EMAIL MOCK] to={to} subject={subject}")

    await db.email_logs.insert_one(log)
    return log
