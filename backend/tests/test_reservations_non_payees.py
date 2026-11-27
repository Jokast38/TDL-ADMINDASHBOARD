"""Stages de récupération de points réservés sur le site sans payer
(services/reservations_non_payees.py, règle du 2026-11-27) — base simulée."""
import asyncio
import os
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from test_caces_session_flow import _Db  # noqa: E402
from services import reservations_non_payees as rnp  # noqa: E402
from services import staff_notify, candidate_automation  # noqa: E402
from routers import payments  # noqa: E402

SITE = {"category": "PERMIS", "status": "active", "source": "inscription_publique", "student_email": "a@x.fr"}
NOW = datetime(2026, 11, 28, 10, 0, tzinfo=rnp.PARIS)


def run(c):
    return asyncio.run(c)


@pytest.fixture
def db(monkeypatch):
    d = _Db()
    for mod in (rnp, staff_notify, candidate_automation, payments):
        monkeypatch.setattr(mod, "db", d)

    async def capacite(_stage):
        return 2
    monkeypatch.setattr(rnp, "_capacite", capacite)
    monkeypatch.setattr(rnp, "_aujourdhui", lambda now=None: (now or NOW).date().isoformat())
    d.convoques, d.mails = [], []

    async def convoquer(iid):
        d.convoques.append(iid)
        return True
    monkeypatch.setattr(candidate_automation, "convoquer_apres_paiement", convoquer)
    d.stages.docs.append({"id": "s1", "date_debut": "2026-12-04", "formation_titre": "Récupération de points"})
    d.stages.docs.append({"id": "s0", "date_debut": "2026-11-28", "formation_titre": "Récupération de points"})
    return d


def test_qui_est_concerne():
    assert rnp.reservation_non_payee({"payment_status": "pending", **SITE})
    assert not rnp.reservation_non_payee({"payment_status": "paid", **SITE})
    assert not rnp.reservation_non_payee({"payment_status": "pending", **SITE, "created_by": "u1"})
    assert not rnp.reservation_non_payee({"payment_status": "pending", **SITE, "category": "VTC_TAXI"})


def test_entre_dans_la_session_au_paiement(db):
    db.inscriptions.docs.append({"id": "a", "stage_choisi_id": "s1", "stage_id": None, "payment_status": "paid", **SITE})
    assert run(rnp.placer_apres_paiement("a")) == "place"
    a = db.inscriptions.docs[0]
    assert a["stage_id"] == "s1" and a["stage_choisi_id"] is None and db.convoques == ["a"]


def test_session_complete_attente_placement(db):
    db.inscriptions.docs.extend([{"id": f"p{i}", "stage_id": "s1", "status": "active"} for i in range(2)])
    db.inscriptions.docs.append({"id": "a", "stage_choisi_id": "s1", "stage_id": None, "payment_status": "paid", **SITE})
    assert run(rnp.placer_apres_paiement("a")) == "attente"
    a = db.inscriptions.docs[-1]
    assert a["stage_id"] is None and a["en_attente_placement"] and db.convoques == []


def test_retrait_le_jour_de_la_session_et_reprise_des_anciennes(db):
    db.inscriptions.docs.extend([
        # Ancienne réservation placée dans une session à venir : sortie, gardée comme choisie.
        {"id": "old", "stage_id": "s1", "payment_status": "pending", "convocation_sent_at": "x", **SITE},
        # Session choisie aujourd'hui, pas payé : retirée.
        {"id": "jourj", "stage_choisi_id": "s0", "stage_id": None, "payment_status": "processing", **SITE},
        # Session choisie plus tard : on attend.
        {"id": "tard", "stage_choisi_id": "s1", "stage_id": None, "payment_status": "pending", **SITE},
    ])
    assert run(rnp.retirer_sessions_non_payees(NOW)) == 2
    old, jourj, tard = db.inscriptions.docs
    assert old["stage_id"] is None and old["stage_choisi_id"] == "s1" and "convocation_sent_at" not in old
    assert jourj["stage_choisi_id"] is None and jourj["en_attente_placement"]
    assert tard["stage_choisi_id"] == "s1" and not tard.get("en_attente_placement")


def test_relances_5_min_puis_24_h(db, monkeypatch):
    async def settings():
        return {"payments_enabled": True}
    monkeypatch.setattr(payments, "_settings", settings)

    async def retrieve(_sid):
        return {"payment_status": "unpaid"}
    monkeypatch.setattr(payments.stripe_service, "retrieve_checkout_session", retrieve)

    async def mail(to, subject, body, **_k):
        db.mails.append(subject)
    import services.email as email_mod
    monkeypatch.setattr(email_mod, "send_email", mail)
    debut = NOW - timedelta(minutes=6)
    db.inscriptions.docs.append({"id": "a", "payment_status": "processing", "stripe_session_id": "cs_1",
                                 "checkout_started_at": debut.isoformat(), "formation_title": "Stage", **SITE})
    assert run(rnp.relancer_paiements_abandonnes(NOW)) == 1
    assert run(rnp.relancer_paiements_abandonnes(NOW + timedelta(minutes=1))) == 0  # pas deux fois
    assert run(rnp.relancer_paiements_abandonnes(debut + timedelta(hours=24, minutes=1))) == 1
    assert run(rnp.relancer_paiements_abandonnes(debut + timedelta(hours=30))) == 0  # puis plus rien
    assert len(db.mails) == 2
