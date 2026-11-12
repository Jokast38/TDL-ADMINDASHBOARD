import asyncio
import re
import time
import uuid
import logging
import urllib.parse
import requests

from core.config import BREVO_SENDER_EMAIL, OUTBOUND_DISABLED
from core.database import db
from core.utils import now_iso
from core.config import PUBLIC_BACKEND_URL
from services import email_rate

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Débit d'envoi o2switch (30/min pour tout le domaine) : voir
# services/email_rate.py — réserve pour les emails importants, plafond horaire
# du marketing et compteur partagé entre serveurs (demande du 2026-11-12).
async def _throttle_smtp_rate(kind: str = email_rate.TRANSACTIONNEL, s: dict = None):
    await email_rate.acquire_slot(kind, s)


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


def _http_get(url: str, headers: dict):
    return requests.get(url, headers=headers, timeout=15)


# Brevo accepte l'appel API (201) puis rejette le mail en différé si
# l'expéditeur n'est pas validé chez eux : le journal affichait "sent" pour
# plus de 9 000 mails jamais délivrés (octobre 2026). On vérifie donc avant
# d'envoyer, avec un cache pour ne pas interroger Brevo à chaque mail.
_BREVO_SENDER_CACHE_S = 3600
_brevo_sender_cache: dict = {}


def _brevo_sender_validated(api_key: str, from_addr: str) -> bool:
    cached = _brevo_sender_cache.get((api_key, from_addr))
    if cached and time.monotonic() - cached[1] < _BREVO_SENDER_CACHE_S:
        return cached[0]
    headers = {"api-key": api_key, "Accept": "application/json"}
    email = from_addr.strip().lower()
    domain = email.rsplit("@", 1)[-1]
    def _fetch(path: str, key: str) -> list:
        r = _http_get(f"https://api.brevo.com/v3/{path}", headers)
        r.raise_for_status()
        return r.json().get(key) or []

    try:
        senders = _fetch("senders", "senders")
        ok = any((s.get("email") or "").lower() == email and s.get("active") for s in senders)
        if not ok:
            domains = _fetch("senders/domains", "domains")
            ok = any((d.get("domain_name") or "").lower() == domain and d.get("authenticated") for d in domains)
    except Exception as e:
        # Brevo injoignable pour la vérification : on tente l'envoi plutôt que
        # de perdre le mail, sans mettre ce résultat en cache.
        logger.warning(f"Vérification de l'expéditeur Brevo impossible ({e})")
        return True
    _brevo_sender_cache[(api_key, from_addr)] = (ok, time.monotonic())
    return ok


# Refus d'o2switch qu'un nouvel essai ne fait qu'aggraver : identifiants
# refusés (souvent un blocage temporaire anti-abus de l'hébergeur, qu'une
# nouvelle connexion prolonge) ou domaine suspendu pour volume d'envoi.
_SMTP_NO_RETRY_MARKERS = ("535", "has been suspended")


async def _send_via_resend(api_key: str, from_addr: str, to: str, subject: str, body: str, attachment: dict = None, cc: list = None) -> str:
    """Envoie via l'API HTTP Resend et renvoie le statut ('sent' ou 'failed: ...')."""
    try:
        payload = {"from": from_addr, "to": [to], "subject": subject, "html": body}
        if cc:
            payload["cc"] = cc
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
               from_addr: str, to: str, subject: str, body: str, attachment: dict = None, cc: list = None):
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
    if cc:
        msg["Cc"] = ", ".join(cc)
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
    server.sendmail(from_addr, [to, *(cc or [])], msg.as_string())
    server.quit()


async def _send_via_sendgrid(api_key: str, from_addr: str, to: str, subject: str, body: str, attachment: dict = None, cc: list = None) -> str:
    try:
        personalization = {"to": [{"email": to}]}
        if cc:
            personalization["cc"] = [{"email": c} for c in cc]
        payload = {
            "personalizations": [personalization],
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


async def _send_via_brevo(api_key: str, from_addr: str, to: str, subject: str, body: str, attachment: dict = None, cc: list = None) -> str:
    """Envoie via l'API HTTP Brevo (ex-Sendinblue) — comme Resend/SendGrid,
    en HTTPS, donc non bloqué par les hébergeurs qui coupent le SMTP sortant.
    from_addr devient le Reply-To : l'expéditeur est BREVO_SENDER_EMAIL."""
    try:
        payload = {
            "sender": {"email": BREVO_SENDER_EMAIL, "name": "TDL Formation"},
            "replyTo": {"email": from_addr},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": body,
        }
        if cc:
            payload["cc"] = [{"email": c} for c in cc]
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


async def _send_via_smtp(s: dict, to: str, subject: str, body: str, attachment: dict = None, cc: list = None,
                         kind: str = email_rate.TRANSACTIONNEL) -> str:
    """Envoie en SMTP avec retry (Gmail depuis un hébergeur cloud échoue parfois
    de façon aléatoire — IP partagée méfiante — sans être bloqué à 100%)."""
    max_attempts = 3
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            await _throttle_smtp_rate(kind, s)
            await asyncio.to_thread(
                _smtp_send,
                s.get("smtp_host", "smtp.gmail.com"),
                int(s.get("smtp_port") or 587),
                bool(s.get("smtp_tls", True)),
                s["smtp_user"],
                s["smtp_password"],
                s.get("email_from") or s.get("smtp_user"),
                to, subject, body, attachment, cc
            )
            return "sent"
        except Exception as e:
            last_error = e
            if any(marker in str(e) for marker in _SMTP_NO_RETRY_MARKERS):
                break
            if attempt < max_attempts:
                logger.warning(f"SMTP tentative {attempt}/{max_attempts} échouée pour {to} ({e}), nouvel essai...")
                await asyncio.sleep(2 * attempt)
    return f"smtp_error: {last_error}"


# ---- Expéditeur selon le type d'email (demande du 2026-11-12) ------------
# - « equipe »    : destinataire = compte du personnel ou formateur
#                   -> Paramètres « email_from_equipe » (ex. dashboard@)
# - « marketing » : relances et campagnes -> « email_from_marketing » (ex. info@)
# - « clients »   : tout le reste (apprenants, prospects en transactionnel)
#                   -> expéditeur principal (contact@)
# Mot de passe des boîtes dédiées : Paramètres « smtp_password_dedie », sinon
# la variable MAILBOX_PASSWORD (même mot de passe pour dashboard@ et info@,
# différent de celui de contact@ — vérifié le 2026-11-12). Si la connexion
# d'une boîte échoue, l'email repart depuis la boîte principale avant tout secours.
# Le plafond d'envoi reste commun (même domaine o2switch, services/email_rate.py).
_STAFF_CACHE: dict = {}
_STAFF_CACHE_S = 600


async def _is_staff(email: str) -> bool:
    key = (email or "").strip().lower()
    cached = _STAFF_CACHE.get(key)
    if cached and time.monotonic() - cached[1] < _STAFF_CACHE_S:
        return cached[0]
    try:
        user = await db.users.find_one({"email": key, "role": {"$ne": "etudiant"}}, {"_id": 0, "id": 1})
        ok = bool(user)
    except Exception:
        ok = False
    _STAFF_CACHE[key] = (ok, time.monotonic())
    return ok


async def _audience(to: str, kind: str) -> str:
    if kind == email_rate.MARKETING:
        return "marketing"
    return "equipe" if await _is_staff(to) else "clients"


def _sender_settings(s: dict, audience: str) -> dict:
    """Réglages d'envoi pour ce type d'email : expéditeur et compte SMTP de
    la boîte dédiée si elle est renseignée, sinon la boîte principale."""
    addr = (s.get(f"email_from_{audience}") or "").strip() if audience != "clients" else ""
    if not addr:
        return s
    from core.config import MAILBOX_PASSWORD
    password = s.get("smtp_password_dedie") or MAILBOX_PASSWORD or s.get("smtp_password")
    return {**s, "email_from": addr, "smtp_user": addr, "smtp_password": password}


def _smtp_configured(s: dict) -> bool:
    return bool(s.get("smtp_host") and s.get("smtp_user") and s.get("smtp_password"))


async def send_email(to: str, subject: str, body: str, extra: dict = None, attachment: dict = None, cc: list = None,
                     kind: str = None) -> dict:
    """attachment (optionnel) : {"filename": str, "content_b64": str} — utilisé
    par le composeur d'email personnalisé pour joindre un fichier.
    cc (optionnel) : liste d'adresses en copie — utilisé par le composeur
    personnalisé pour mettre l'expéditeur et une adresse de suivi en copie,
    afin que les réponses de l'apprenant restent tracées."""
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    provider = "mock" if OUTBOUND_DISABLED else s.get("email_provider", "mock")
    from_addr = s.get("email_from", "noreply@tdlformation.fr")
    # Clé Resend : celle du fournisseur principal si provider="resend", sinon
    # celle dédiée au secours (utilisable même quand le principal est le SMTP).
    resend_key = s.get("email_api_key") if provider == "resend" else s.get("resend_fallback_api_key")
    log_id = str(uuid.uuid4())
    log = {
        "id": log_id, "to": to, "cc": cc or [], "subject": subject, "body": body,
        "provider": provider, "status": "queued", "created_at": now_iso(),
        "opened": False, "opened_at": None, "open_count": 0,
        "clicked": False, "clicked_at": None, "click_count": 0,
        "attachment_filename": attachment["filename"] if attachment else None,
        # « marketing » (relances, campagnes) ou « transactionnel » : sert au
        # plafonnage (services/email_rate.py) et aux chiffres des Paramètres.
        "kind": email_rate.kind_of(extra, kind),
        **(extra or {}),
    }

    # Sans cette vérification, une adresse invalide (erreur d'import, ex: "adresse
    # email", "bensaadservices") était retentée à chaque envoi/relance sans jamais
    # aboutir, côté API (Brevo/Resend/SendGrid) puis côté SMTP de secours — pour
    # rien, puisqu'aucun serveur mail ne peut délivrer à une adresse mal formée.
    if not _EMAIL_RE.match((to or "").strip()):
        log["status"] = "invalid_email"
        await db.email_logs.insert_one(log)
        return log

    # Expéditeur selon le type d'email (voir _sender_settings).
    audience = await _audience(to, log["kind"])
    main_settings = s
    s = _sender_settings(s, audience)
    from_addr = s.get("email_from", from_addr)
    log["audience"], log["sender"] = audience, from_addr

    if provider != "mock":
        tracked_body = _with_click_tracking(body, log_id)
        tracked_body = _with_tracking_pixel(tracked_body, log_id)
    else:
        tracked_body = body

    if provider == "resend" and resend_key:
        log["status"] = await _send_via_resend(resend_key, from_addr, to, subject, tracked_body, attachment, cc)
        if log["status"] != "sent" and _smtp_configured(s):
            logger.warning(f"Resend en échec pour {to} ({log['status']}), tentative SMTP en secours...")
            log["resend_error"] = log["status"]
            log["status"] = await _send_via_smtp(s, to, subject, tracked_body, attachment, cc, log["kind"])
            log["fallback_provider"] = "smtp"

    elif provider == "sendgrid" and s.get("email_api_key"):
        log["status"] = await _send_via_sendgrid(s["email_api_key"], from_addr, to, subject, tracked_body, attachment, cc)

    elif provider == "brevo" and s.get("email_api_key"):
        log["status"] = await _send_via_brevo(s["email_api_key"], from_addr, to, subject, tracked_body, attachment, cc)
        if log["status"] != "sent" and _smtp_configured(s):
            logger.warning(f"Brevo en échec pour {to} ({log['status']}), tentative SMTP en secours...")
            log["brevo_error"] = log["status"]
            log["status"] = await _send_via_smtp(s, to, subject, tracked_body, attachment, cc, log["kind"])
            log["fallback_provider"] = "smtp"

    elif provider == "smtp" and _smtp_configured(s):
        log["status"] = await _send_via_smtp(s, to, subject, tracked_body, attachment, cc, log["kind"])
        if log["status"] != "sent" and s is not main_settings and _smtp_configured(main_settings):
            # Boîte dédiée refusée (mot de passe, boîte absente…) : on repart
            # depuis la boîte principale avant de passer au secours Brevo.
            logger.warning(f"Boîte {s.get('smtp_user')} en échec pour {to} ({log['status']}), envoi depuis la boîte principale")
            log["sender_error"] = log["status"]
            s = main_settings
            log["sender"] = from_addr = s.get("email_from", from_addr)
            log["status"] = await _send_via_smtp(s, to, subject, tracked_body, attachment, cc, log["kind"])
        if log["status"] != "sent" and s.get("brevo_fallback_api_key"):
            logger.warning(f"SMTP définitivement en échec pour {to} ({log['status']}), tentative Brevo en secours...")
            log["smtp_error"] = log["status"]
            log["fallback_provider"] = "brevo"
            if await asyncio.to_thread(_brevo_sender_validated, s["brevo_fallback_api_key"], BREVO_SENDER_EMAIL):
                log["status"] = await _send_via_brevo(s["brevo_fallback_api_key"], from_addr, to, subject, tracked_body, attachment, cc)
            else:
                logger.error(f"Secours Brevo inutilisable : l'expéditeur {BREVO_SENDER_EMAIL} n'est pas validé chez Brevo — mail pour {to} non envoyé")
                log["status"] = f"failed: expéditeur {BREVO_SENDER_EMAIL} non validé chez Brevo"
        elif log["status"] != "sent" and s.get("resend_fallback_api_key"):
            logger.warning(f"SMTP définitivement en échec pour {to} ({log['status']}), tentative Resend en secours...")
            log["smtp_error"] = log["status"]
            log["status"] = await _send_via_resend(s["resend_fallback_api_key"], from_addr, to, subject, tracked_body, attachment, cc)
            log["fallback_provider"] = "resend"

    else:
        log["status"] = "mocked"
        logger.info(f"[EMAIL MOCK] to={to} subject={subject}")

    await db.email_logs.insert_one(log)
    return log
