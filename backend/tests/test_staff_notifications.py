"""Tests de la politique d'emails à l'équipe sur une base simulée en mémoire —
voir core/notification_rules.py et services/staff_notify.py."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from test_formateur_placement import _Collection, _Result, _matches
from core.notification_rules import (
    inscription_needs_reminder, is_business_hours, is_public_inscription, payment_label, reminder_age_due,
)
from services import staff_notify

# Lundi 2 novembre 2026, 11h à Paris.
NOW = datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc)
AGENT = {"id": "a1", "role": "agent_admin", "active": True, "email": "agent@test", "name": "Agent", "assigned_categories": ["PERMIS"]}
AGENT_CACES = {"id": "a2", "role": "agent_admin", "active": True, "email": "caces@test", "name": "Agent 2", "assigned_categories": ["CACES"]}


class _Events(_Collection):
    async def insert_one(self, doc):
        self.docs.append(doc)

    async def update_many(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
        return _Result(1)


class _Db:
    def __init__(self):
        self.users = _Collection([dict(AGENT), dict(AGENT_CACES)])
        self.dossiers = _Collection()
        self.inscriptions = _Collection()
        self.callback_requests = _Collection()
        self.settings = _Collection()
        self.staff_recap_events = _Events()


@pytest.fixture
def env(monkeypatch):
    fake = _Db()
    sent = []
    pushed = []

    async def _send(to, subject, body, *_a, **_k):
        sent.append({"to": to, "subject": subject, "body": body})

    async def _push(ids, title, body, url=None):
        pushed.append({"ids": ids, "title": title})

    monkeypatch.setattr(staff_notify, "db", fake)
    monkeypatch.setattr(staff_notify, "send_email", _send)
    monkeypatch.setattr(staff_notify, "send_push_to_users", _push)
    return fake, sent, pushed


def _run(coro):
    return asyncio.run(coro)


def _inscription(**extra):
    return {
        "id": "i1", "student_name": "Lea Martin", "student_email": "lea+test@mail.fr", "student_phone": "0600000000",
        "formation_title": "Stage points", "category": "PERMIS", "payment_status": "pending", "status": "active",
        "contact_status": "en_cours", "source": "inscription_publique", **extra,
    }


def _dossier(age_hours=5, **extra):
    return {"id": "d1", "inscription_id": "i1", "student_name": "Lea Martin", "formation_title": "Stage points",
            "category": "PERMIS", "status": "nouveau", "created_at": (NOW - timedelta(hours=age_hours)).isoformat(), **extra}


def test_seules_les_inscriptions_du_site_sont_publiques():
    assert is_public_inscription({"source": "inscription_publique"})
    assert is_public_inscription({"source": ""})
    assert not is_public_inscription({"source": "admin_walkin"})
    assert not is_public_inscription({"source": "excel_import_vtc_taxi_2026"})
    assert not is_public_inscription({"source": "centre_appel", "created_by": "agent"})


def test_inscription_traitee_ne_declenche_pas_de_rappel():
    assert inscription_needs_reminder(_inscription(), _dossier())
    assert not inscription_needs_reminder(_inscription(contact_status="finalisee"), _dossier())
    assert not inscription_needs_reminder(_inscription(), _dossier(status="en_verification"))
    assert not inscription_needs_reminder(_inscription(status="annulee"), _dossier())


def test_delai_et_horaires_du_rappel():
    assert not reminder_age_due(NOW - timedelta(hours=3), NOW)
    assert reminder_age_due(NOW - timedelta(hours=4), NOW)
    assert not reminder_age_due(NOW - timedelta(days=8), NOW)
    assert is_business_hours(NOW)
    assert not is_business_hours(datetime(2026, 11, 2, 22, 0, tzinfo=timezone.utc))
    assert not is_business_hours(datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc))  # dimanche


def test_statut_de_paiement():
    assert payment_label("pending") == "Non payé"
    assert payment_label("paid") == "Payé"


def test_inscription_publique_email_immediat_avec_paiement_et_bouton(env):
    _fake, sent, pushed = env
    _run(staff_notify.notify_public_inscription(_inscription()))
    assert [m["to"] for m in sent] == ["agent@test"]
    assert "Non payé" in sent[0]["subject"] and "Non payé" in sent[0]["body"]
    assert "Traiter l&#x27;inscription" in sent[0]["body"]
    assert "/admin/inscriptions?q=lea%2Btest%40mail.fr" in sent[0]["body"]
    assert pushed


def test_paiement_recu_prevenu_une_seule_fois(env):
    fake, sent, _pushed = env
    fake.inscriptions.docs = [_inscription(payment_status="paid")]
    fake.dossiers.docs = [_dossier()]
    _run(staff_notify.notify_inscription_paid(fake.inscriptions.docs[0]))
    _run(staff_notify.notify_inscription_paid(fake.inscriptions.docs[0]))
    assert len(sent) == 1 and "Paiement reçu" in sent[0]["subject"]


def test_pas_d_alerte_paiement_pour_une_inscription_sur_place_ou_deja_traitee(env):
    fake, sent, _pushed = env
    fake.inscriptions.docs = [_inscription(source="admin_walkin", created_by="a1")]
    fake.dossiers.docs = [_dossier()]
    _run(staff_notify.notify_inscription_paid(fake.inscriptions.docs[0]))
    fake.inscriptions.docs = [_inscription()]
    fake.dossiers.docs = [_dossier(status="en_verification")]
    _run(staff_notify.notify_inscription_paid(fake.inscriptions.docs[0]))
    assert sent == []


def test_nouveau_lead_email_avec_bouton(env):
    _fake, sent, _pushed = env
    _run(staff_notify.notify_new_lead({"name": "Sam", "phone": "+33600000000", "email": None, "category": "PERMIS", "interest": "Stage"}))
    assert [m["to"] for m in sent] == ["agent@test"]
    assert "/admin/leads?q=%2B33600000000" in sent[0]["body"]


def test_le_reste_passe_au_recap_sans_email_mais_avec_push(env):
    fake, sent, pushed = env
    _run(staff_notify.notify_new_contact(
        "PERMIS", ("agent_admin",), "📎 Document déposé", "", "Document", "Lea", "/admin/dossiers", email_now=False,
    ))
    assert sent == []
    assert pushed
    assert fake.staff_recap_events.docs[0]["label"] == "📎 Document déposé"


def test_resultat_examen_passe_au_recap(env):
    fake, sent, pushed = env
    _run(staff_notify.notify_staff_exam_theorique_result({"student_name": "Lea", "category": "PERMIS"}, "reussi"))
    assert sent == []
    assert pushed
    assert len(fake.staff_recap_events.docs) == 1


def test_recap_reprend_les_evenements_une_seule_fois_et_par_categorie(env):
    fake, sent, _pushed = env
    _run(staff_notify.queue_recap_event("PERMIS", "📎 Document déposé", "/admin/dossiers"))
    _run(staff_notify.send_daily_pending_dossiers_digest())
    assert [m["to"] for m in sent] == ["agent@test"]
    assert "Document déposé" in sent[0]["body"] and "Ouvrir les inscriptions" in sent[0]["body"]
    sent.clear()
    _run(staff_notify.send_daily_pending_dossiers_digest())
    assert sent == []


def test_evenement_formateur_reserve_aux_roles_concernes(env):
    fake, sent, _pushed = env
    fake.users.docs.append({"id": "t1", "role": "agent_telephonique", "active": True, "email": "tel@test", "name": "Tel"})
    _run(staff_notify.queue_recap_event(None, "Convention signée", "/admin/formateurs", ["agent_admin"]))
    _run(staff_notify.send_daily_pending_dossiers_digest())
    assert "tel@test" not in [m["to"] for m in sent]


def test_rappel_inscription_non_traitee_une_seule_fois(env):
    fake, sent, _pushed = env
    fake.inscriptions.docs = [_inscription()]
    fake.dossiers.docs = [_dossier()]
    assert _run(staff_notify.send_pending_inscription_reminders(NOW)) == 1
    assert [m["to"] for m in sent] == ["agent@test"]
    assert "Traiter les inscriptions" in sent[0]["body"] and "Non payé" in sent[0]["body"]
    assert _run(staff_notify.send_pending_inscription_reminders(NOW)) == 0
    assert len(sent) == 1


def test_pas_de_rappel_pour_sur_place_trop_recent_ou_hors_horaires(env):
    fake, sent, _pushed = env
    fake.inscriptions.docs = [_inscription(source="admin_walkin", created_by="a1")]
    fake.dossiers.docs = [_dossier()]
    assert _run(staff_notify.send_pending_inscription_reminders(NOW)) == 0
    fake.inscriptions.docs = [_inscription()]
    fake.dossiers.docs = [_dossier(age_hours=1)]
    assert _run(staff_notify.send_pending_inscription_reminders(NOW)) == 0
    fake.dossiers.docs = [_dossier()]
    assert _run(staff_notify.send_pending_inscription_reminders(datetime(2026, 11, 2, 22, 0, tzinfo=timezone.utc))) == 0
    assert sent == []


def test_rappel_vers_le_contact_generique_si_personne_n_est_assigne(env):
    fake, sent, _pushed = env
    fake.users.docs = []
    fake.inscriptions.docs = [_inscription()]
    fake.dossiers.docs = [_dossier()]
    _run(staff_notify.send_pending_inscription_reminders(NOW))
    assert [m["to"] for m in sent] == [staff_notify.CONTACT_EMAIL]
