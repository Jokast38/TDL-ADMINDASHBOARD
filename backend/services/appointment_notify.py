"""Messages au prospect pour un rendez-vous placé (db.call_appointments) —
demande du 2026-11-06 : jusqu'ici seul l'agent était rappelé, le prospect
ne recevait rien.

  - confirmation dès que le RDV est placé ou déplacé ;
  - rappel la veille, entre 17h et 21h (heure de Paris), sauf si la
    confirmation vient de partir (moins de 6 h) : inutile d'envoyer deux
    messages dans l'après-midi.

Email + SMS (best-effort, comme le reste : un échec ne bloque jamais la
prise de RDV). Les drapeaux `prospect_confirmation_at` /
`prospect_reminder_sent` sont stockés sur le RDV, donc un redémarrage du
serveur ne renvoie rien en double."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from core.database import db
from core.utils import now_iso
from services.email import send_email
from services.email_template import TDL_PHONE, render_branded_email
from services.sms import send_sms

logger = logging.getLogger(__name__)

PARIS = ZoneInfo("Europe/Paris")
RAPPEL_DEBUT, RAPPEL_FIN = 17, 21  # heures de Paris pour le rappel de la veille
DELAI_APRES_CONFIRMATION = timedelta(hours=6)

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]


def parse_rdv(value) -> Optional[datetime]:
    """`scheduled_at` en heure de Paris. Le dashboard envoie de l'UTC
    ("…Z") ; une heure sans fuseau est lue comme heure de Paris."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=PARIS)
    return dt.astimezone(PARIS)


def format_rdv(value) -> str:
    """« vendredi 6 novembre à 14h30 »."""
    dt = parse_rdv(value)
    if not dt:
        return str(value or "")
    return f"{JOURS[dt.weekday()]} {dt.day} {MOIS[dt.month - 1]} à {dt.hour}h{dt.minute:02d}"


def _format_court(dt: datetime) -> str:
    return f"{JOURS[dt.weekday()][:3]}. {dt.day:02d}/{dt.month:02d} à {dt.hour}h{dt.minute:02d}"


def _lieu(appt: dict) -> tuple[str, str]:
    """(phrase pour l'email, mention courte pour le SMS)."""
    if appt.get("kind") == "physique":
        lieu = (appt.get("location") or "").strip() or "au centre TDL Formation"
        return f"Le rendez-vous a lieu : <b>{lieu}</b>.", f"Lieu : {lieu}"
    tel = appt.get("lead_phone")
    phrase = "Un conseiller TDL Formation vous appellera" + (f" au <b>{tel}</b>" if tel else "") + "."
    return phrase, "Un conseiller vous appellera"


async def notify_prospect(appt: dict, kind: str = "confirmation") -> bool:
    """`kind` : "confirmation", "modification" ou "rappel". Renvoie True si
    au moins un message est parti (email ou SMS)."""
    dt = parse_rdv(appt.get("scheduled_at"))
    if not dt:
        return False
    nom = (appt.get("lead_name") or "").strip()
    quand = format_rdv(appt.get("scheduled_at"))
    phrase_lieu, sms_lieu = _lieu(appt)
    formation = appt.get("formation_titre")
    sujet_formation = f" — {formation}" if formation else ""

    if kind == "annulation":
        sujet = f"❌ Votre rendez-vous du {quand} est annulé"
        intro = f"Votre rendez-vous avec TDL Formation prévu le <b>{quand}</b>{sujet_formation} est annulé."
        sms_debut = "RDV annulé du"
        phrase_lieu, sms_lieu = "Pour en fixer un nouveau, appelez-nous ou répondez à cet email.", "Pour un nouveau RDV"
    elif kind == "rappel":
        sujet = f"⏰ Rappel : votre rendez-vous demain à {dt.hour}h{dt.minute:02d}"
        intro = f"Petit rappel : vous avez rendez-vous avec TDL Formation <b>demain, {quand}</b>{sujet_formation}."
        sms_debut = "Rappel RDV demain"
    elif kind == "modification":
        sujet = f"📅 Votre rendez-vous a été déplacé au {quand}"
        intro = f"Votre rendez-vous avec TDL Formation a été déplacé au <b>{quand}</b>{sujet_formation}."
        sms_debut = "RDV déplacé au"
    else:
        sujet = f"✅ Rendez-vous confirmé le {quand}"
        intro = f"Votre rendez-vous avec TDL Formation est confirmé le <b>{quand}</b>{sujet_formation}."
        sms_debut = "RDV confirmé le"

    message = (
        f"Bonjour {nom},\n\n{intro}\n\n{phrase_lieu}\n\n"
        + ("" if kind == "annulation" else f"Un empêchement ? Prévenez-nous au {TDL_PHONE} pour le déplacer.\n\n") +
        "À bientôt,\nL'équipe TDL Formation"
    )
    sent = False
    extra = {"appointment_id": appt.get("id"), "type": f"rdv_{kind}"}
    if appt.get("lead_email"):
        try:
            log = await send_email(appt["lead_email"], sujet, render_branded_email(message))
            sent = sent or log.get("status") in ("sent", "mocked")
        except Exception as e:
            logger.warning(f"RDV prospect : email non envoyé — {e}")
    if appt.get("lead_phone"):
        quand_court = "" if kind == "rappel" else f" {_format_court(dt)}"
        heure = f" à {dt.hour}h{dt.minute:02d}" if kind == "rappel" else ""
        fin = f"{sms_lieu} : {TDL_PHONE}" if kind == "annulation" else f"{sms_lieu}. Empechement : {TDL_PHONE}"
        texte = f"TDL Formation : {sms_debut}{quand_court}{heure}. {fin}"
        try:
            log = await send_sms(appt["lead_phone"], texte, extra=extra, category="rdv_prospect")
            sent = sent or log.get("status") == "sent"
        except Exception as e:
            logger.warning(f"RDV prospect : SMS non envoyé — {e}")
    return sent


async def confirm_to_prospect(appt: dict, kind: str = "confirmation") -> None:
    """Confirmation (ou déplacement) d'un RDV planifié, puis réarme le rappel
    de la veille. Ne lève jamais : la prise de RDV ne doit pas échouer pour
    un message."""
    if appt.get("status") != "planifie":
        return
    try:
        await notify_prospect(appt, kind)
        await db.call_appointments.update_one({"id": appt["id"]}, {"$set": {
            "prospect_confirmation_at": now_iso(), "prospect_reminder_sent": False,
        }})
    except Exception as e:
        logger.warning(f"RDV prospect : confirmation impossible — {e}")


async def cancel_to_prospect(appt: dict) -> None:
    """Annulation d'un RDV planifié : le prospect est prévenu (demande du
    2026-11-06). Ne lève jamais."""
    try:
        await notify_prospect(appt, "annulation")
        await db.call_appointments.update_one({"id": appt["id"]}, {"$set": {"prospect_cancellation_at": now_iso()}})
    except Exception as e:
        logger.warning(f"RDV prospect : annulation non envoyée — {e}")


def reminder_due(appt: dict, now: Optional[datetime] = None) -> bool:
    """Le rappel de la veille est-il à envoyer maintenant ?"""
    now = (now or datetime.now(timezone.utc)).astimezone(PARIS)
    dt = parse_rdv(appt.get("scheduled_at"))
    if not dt or dt <= now:
        return False
    if not (RAPPEL_DEBUT <= now.hour < RAPPEL_FIN):
        return False
    if dt.date() != now.date() + timedelta(days=1):
        return False
    confirmed = appt.get("prospect_confirmation_at")
    if confirmed:
        try:
            if now - datetime.fromisoformat(confirmed.replace("Z", "+00:00")) < DELAI_APRES_CONFIRMATION:
                return False
        except ValueError:
            pass
    return True


async def send_prospect_appointment_reminders(now: Optional[datetime] = None) -> int:
    """Rappel la veille au prospect — appelé toutes les 15 min avec le rappel
    agent (server.py::_call_appointment_reminders_loop)."""
    now = now or datetime.now(timezone.utc)
    debut = now.isoformat()
    fin = (now + timedelta(hours=30)).isoformat()
    appts = await db.call_appointments.find(
        {"status": "planifie", "prospect_reminder_sent": {"$ne": True}, "scheduled_at": {"$gte": debut[:10], "$lte": fin}},
        {"_id": 0},
    ).to_list(500)
    notified = 0
    for appt in appts:
        if not reminder_due(appt, now):
            continue
        # Drapeau posé avant l'envoi : en cas d'erreur, pas de rafale de rappels.
        await db.call_appointments.update_one({"id": appt["id"]}, {"$set": {
            "prospect_reminder_sent": True, "prospect_reminder_at": now_iso(),
        }})
        if await notify_prospect(appt, "rappel"):
            notified += 1
    return notified
