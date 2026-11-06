"""Messages au prospect pour un RDV placé (services/appointment_notify.py) :
heure lisible en heure de Paris, confirmation, rappel la veille 17h-21h."""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

import services.appointment_notify as an  # noqa: E402

APPT = {"id": "a1", "status": "planifie", "kind": "appel", "lead_name": "Jimmy",
        "lead_email": "jimmy@example.com", "lead_phone": "+33612345678",
        "scheduled_at": "2026-11-09T09:00:00.000Z"}  # lundi 10h00 à Paris


def paris(day, hhmm):
    h, m = map(int, hhmm.split(":"))
    return datetime.fromisoformat(day).replace(hour=h, minute=m, tzinfo=an.PARIS).astimezone(timezone.utc)


def test_heure_de_paris_lisible():
    assert an.format_rdv("2026-11-06T13:30:00.000Z") == "vendredi 6 novembre à 14h30"
    assert an.format_rdv("2026-11-09T10:00:00") == "lundi 9 novembre à 10h00"  # sans fuseau = Paris


def test_rappel_la_veille_entre_17h_et_21h():
    assert not an.reminder_due(APPT, paris("2026-11-08", "16:59"))
    assert an.reminder_due(APPT, paris("2026-11-08", "17:00"))
    assert not an.reminder_due(APPT, paris("2026-11-08", "21:00"))
    assert not an.reminder_due(APPT, paris("2026-11-07", "18:00"))  # avant-veille
    assert not an.reminder_due(APPT, paris("2026-11-09", "08:00"))  # le jour même : non
    # Confirmation partie à 15h la veille : pas de second message à 17h…
    recent = {**APPT, "prospect_confirmation_at": paris("2026-11-08", "15:00").isoformat()}
    assert not an.reminder_due(recent, paris("2026-11-08", "17:30"))
    # … mais une confirmation du matin n'empêche pas le rappel du soir.
    matin = {**APPT, "prospect_confirmation_at": paris("2026-11-08", "09:00").isoformat()}
    assert an.reminder_due(matin, paris("2026-11-08", "17:30"))


def test_messages_envoyes_au_prospect(monkeypatch):
    sent = []

    async def fake_email(to, subject, html):
        sent.append(("email", to, subject))
        return {"status": "sent"}

    async def fake_sms(to, text, extra=None):
        sent.append(("sms", to, text))
        return {"status": "sent"}

    monkeypatch.setattr(an, "send_email", fake_email)
    monkeypatch.setattr(an, "send_sms", fake_sms)
    assert asyncio.run(an.notify_prospect(APPT, "confirmation"))
    assert sent[0][2] == "✅ Rendez-vous confirmé le lundi 9 novembre à 10h00"
    assert sent[1][0] == "sms" and "lun. 09/11 à 10h00" in sent[1][2] and len(sent[1][2]) <= 160
    sent.clear()
    physique = {**APPT, "kind": "physique", "location": "TDL Creil", "lead_email": None}
    asyncio.run(an.notify_prospect(physique, "rappel"))
    assert len(sent) == 1 and "Lieu : TDL Creil" in sent[0][2] and len(sent[0][2]) <= 160
