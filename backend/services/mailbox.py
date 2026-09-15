"""Messagerie interne du dashboard (type Gmail) sur le compte
contact@tdl-formation.fr — lecture IMAP (réception) + envoi SMTP avec
archivage dans "Envoyés". Distinct du SMTP de secours (services/email.py,
compte administration@) utilisé pour les envois automatiques transactionnels.

Tout est en imaplib/smtplib (stdlib) — pas de dépendance externe, même
approche que services/email.py.
"""
import asyncio
import email
import imaplib
import logging
import smtplib
import socket
import time
from email.header import decode_header, make_header
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parsedate_to_datetime, formatdate, make_msgid

from core.config import IMAP_HOST, IMAP_PORT, SMTP2_HOST, SMTP2_PORT, MAILBOX_USER, MAILBOX_PASSWORD

logger = logging.getLogger(__name__)

INBOX = "INBOX"
SENT = "INBOX.Sent"


def mailbox_configured() -> bool:
    return bool(IMAP_HOST and SMTP2_HOST and MAILBOX_USER and MAILBOX_PASSWORD)


def _force_ipv4():
    """Comme pour le SMTP de secours : certains hébergeurs résolvent le host
    mail en IPv6 sans route sortante IPv6 disponible sur Render, ce qui casse
    la connexion. Retourne la fonction de résolution d'origine à restaurer."""
    original = socket.getaddrinfo

    def _v4(host_, port_, family=0, type_=0, proto=0, flags=0):
        return original(host_, port_, socket.AF_INET, type_, proto, flags)

    socket.getaddrinfo = _v4
    return original


def _decode(value) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _imap_connect() -> imaplib.IMAP4_SSL:
    original = _force_ipv4()
    try:
        m = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, timeout=20)
    finally:
        socket.getaddrinfo = original
    m.login(MAILBOX_USER, MAILBOX_PASSWORD)
    return m


def _iter_leaf_parts(msg):
    """Parcourt les parties non-multipart d'un message, dans un ordre stable
    — utilisé à la fois pour lister les pièces jointes et pour les
    retélécharger individuellement (même index des deux côtés)."""
    idx = 0
    for part in msg.walk():
        if part.is_multipart():
            continue
        yield idx, part
        idx += 1


def _parse_date(date_str):
    try:
        dt = parsedate_to_datetime(date_str) if date_str else None
        return dt.isoformat() if dt else None
    except Exception:
        return None


def _parse_summary(uid: bytes, raw_header: bytes, flags: bytes) -> dict:
    msg = email.message_from_bytes(raw_header)
    return {
        "uid": uid.decode(),
        "from": _decode(msg.get("From")),
        "to": _decode(msg.get("To")),
        "subject": _decode(msg.get("Subject")) or "(sans objet)",
        "date": _parse_date(msg.get("Date")),
        "seen": b"\\Seen" in (flags or b""),
    }


def _list_messages_sync(folder: str, limit: int, offset: int) -> dict:
    m = _imap_connect()
    try:
        m.select(folder, readonly=True)
        typ, data = m.uid("search", None, "ALL")
        if typ != "OK" or not data or not data[0]:
            return {"messages": [], "total": 0}
        uids = data[0].split()
        total = len(uids)
        # Les UID IMAP sont croissants (le plus récent est le dernier) — on
        # prend la tranche demandée en partant de la fin pour avoir les
        # messages les plus récents en premier, comme dans un vrai webmail.
        uids_desc = list(reversed(uids))
        page = uids_desc[offset: offset + limit]
        messages = []
        for uid in page:
            typ, msg_data = m.uid(
                "fetch", uid, "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])"
            )
            flags, raw_header = b"", b""
            for part in msg_data:
                if isinstance(part, tuple):
                    raw_header = part[1]
                elif isinstance(part, bytes) and b"FLAGS" in part:
                    flags = part
            messages.append(_parse_summary(uid, raw_header, flags))
        return {"messages": messages, "total": total}
    finally:
        m.logout()


def _fetch_raw(m: imaplib.IMAP4_SSL, uid: str) -> bytes:
    typ, msg_data = m.uid("fetch", uid.encode(), "(RFC822)")
    for part in msg_data:
        if isinstance(part, tuple):
            return part[1]
    return b""


def _get_message_sync(folder: str, uid: str, mark_read: bool) -> dict:
    m = _imap_connect()
    try:
        m.select(folder, readonly=not mark_read)
        raw = _fetch_raw(m, uid)
        if not raw:
            return None
        if mark_read:
            m.uid("store", uid.encode(), "+FLAGS", "\\Seen")
        msg = email.message_from_bytes(raw)

        html_body, text_body = None, None
        attachments = []
        for idx, part in _iter_leaf_parts(msg):
            content_type = part.get_content_type()
            disp = str(part.get("Content-Disposition") or "")
            filename = part.get_filename()
            if filename:
                attachments.append({
                    "part_index": idx,
                    "filename": _decode(filename),
                    "content_type": content_type,
                    "size": len(part.get_payload(decode=True) or b""),
                })
            elif content_type == "text/html" and "attachment" not in disp:
                try:
                    html_body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                except Exception:
                    pass
            elif content_type == "text/plain" and "attachment" not in disp and text_body is None:
                try:
                    text_body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                except Exception:
                    pass

        return {
            "uid": uid,
            "from": _decode(msg.get("From")),
            "to": _decode(msg.get("To")),
            "cc": _decode(msg.get("Cc")),
            "subject": _decode(msg.get("Subject")) or "(sans objet)",
            "date": _parse_date(msg.get("Date")),
            "body_html": html_body,
            "body_text": text_body,
            "attachments": attachments,
        }
    finally:
        m.logout()


def _get_attachment_sync(folder: str, uid: str, part_index: int):
    m = _imap_connect()
    try:
        m.select(folder, readonly=True)
        raw = _fetch_raw(m, uid)
        if not raw:
            return None
        msg = email.message_from_bytes(raw)
        for idx, part in _iter_leaf_parts(msg):
            if idx == part_index and part.get_filename():
                content = part.get_payload(decode=True)
                return content, _decode(part.get_filename()), part.get_content_type()
        return None
    finally:
        m.logout()


def _send_and_save_sync(to: str, subject: str, body_html: str, attachments: list, cc: list = None) -> dict:
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = MAILBOX_USER
    msg["To"] = to
    # smtplib n'ajoute ni Date ni Message-ID automatiquement — sans ça, le
    # message archivé dans "Envoyés" ressort sans date (donc trié n'importe
    # où) et sans identifiant pour les clients mail qui le liraient.
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="tdl-formation.fr")
    if cc:
        msg["Cc"] = ", ".join(cc)
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body_html, "html"))
    msg.attach(alt)
    for att in attachments or []:
        part = MIMEApplication(att["content"], Name=att["filename"])
        part["Content-Disposition"] = f'attachment; filename="{att["filename"]}"'
        msg.attach(part)
    raw = msg.as_bytes()

    original = _force_ipv4()
    try:
        s = smtplib.SMTP_SSL(SMTP2_HOST, SMTP2_PORT, timeout=20)
    finally:
        socket.getaddrinfo = original
    s.login(MAILBOX_USER, MAILBOX_PASSWORD)
    s.sendmail(MAILBOX_USER, [to, *(cc or [])], raw)
    s.quit()

    # Archive dans "Envoyés" — smtplib n'écrit pas ce dossier automatiquement
    # (contrairement à un vrai client mail), sinon le message envoyé
    # n'apparaîtrait nulle part côté IMAP.
    try:
        m = _imap_connect()
        try:
            m.append(SENT, "\\Seen", imaplib.Time2Internaldate(time.time()), raw)
        finally:
            m.logout()
    except Exception as e:
        logger.warning(f"Email envoyé mais échec de l'archivage dans Envoyés: {e}")

    return {"status": "sent"}


async def list_messages(folder: str, limit: int = 30, offset: int = 0) -> dict:
    return await asyncio.to_thread(_list_messages_sync, folder, limit, offset)


async def get_message(folder: str, uid: str, mark_read: bool = True) -> dict:
    return await asyncio.to_thread(_get_message_sync, folder, uid, mark_read)


async def get_attachment(folder: str, uid: str, part_index: int):
    return await asyncio.to_thread(_get_attachment_sync, folder, uid, part_index)


async def send_and_save(to: str, subject: str, body_html: str, attachments: list = None, cc: list = None) -> dict:
    return await asyncio.to_thread(_send_and_save_sync, to, subject, body_html, attachments, cc)
