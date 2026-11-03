"""Envoi SMTP puis secours Brevo — voir services/email.py. Aucun appel réseau
réel : SMTP, API Brevo et base sont simulés."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import email

SETTINGS = {
    "id": "global", "email_provider": "smtp", "email_from": "contact@tdl-formation.fr",
    "smtp_host": "smtp.test", "smtp_port": 465, "smtp_tls": False, "smtp_user": "u", "smtp_password": "p",
    "brevo_fallback_api_key": "cle",
}


class _Response:
    def __init__(self, data, status=200):
        self._data, self.status_code = data, status

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 300:
            raise RuntimeError(f"HTTP {self.status_code}")


class _Logs:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(doc)


class _Settings:
    async def find_one(self, *_a, **_k):
        return dict(SETTINGS)


class _Db:
    def __init__(self):
        self.settings = _Settings()
        self.email_logs = _Logs()


@pytest.fixture
def env(monkeypatch):
    fake = _Db()
    calls = {"smtp": 0, "brevo": 0}
    email._brevo_sender_cache.clear()

    async def _no_throttle():
        return None

    async def _no_sleep(_s):
        return None

    async def _brevo(*_a, **_k):
        calls["brevo"] += 1
        return "sent"

    monkeypatch.setattr(email, "db", fake)
    monkeypatch.setattr(email, "_throttle_smtp_rate", _no_throttle)
    monkeypatch.setattr(email.asyncio, "sleep", _no_sleep)
    monkeypatch.setattr(email, "_send_via_brevo", _brevo)
    return fake, calls


def _smtp_failing(monkeypatch, calls, error):
    def _fail(*_a, **_k):
        calls["smtp"] += 1
        raise Exception(error)

    monkeypatch.setattr(email, "_smtp_send", _fail)


def _brevo_senders(monkeypatch, senders, domains=(), status=200):
    def _get(url, _headers):
        if url.endswith("/domains"):
            return _Response({"domains": list(domains)}, status)
        return _Response({"senders": list(senders)}, status)

    monkeypatch.setattr(email, "_http_get", _get)


def _send():
    return asyncio.run(email.send_email("eleve@test.fr", "Sujet", "<p>Bonjour</p>"))


def test_smtp_reussi_pas_de_secours(env, monkeypatch):
    _fake, calls = env
    monkeypatch.setattr(email, "_smtp_send", lambda *a, **k: None)
    assert _send()["status"] == "sent"
    assert calls["brevo"] == 0


def test_identifiants_refuses_pas_de_nouvel_essai(env, monkeypatch):
    _fake, calls = env
    _smtp_failing(monkeypatch, calls, "(535, b'Incorrect authentication data')")
    _brevo_senders(monkeypatch, [{"email": "contact@tdl-formation.fr", "active": True}])
    _send()
    assert calls["smtp"] == 1


def test_domaine_suspendu_pas_de_nouvel_essai(env, monkeypatch):
    _fake, calls = env
    _smtp_failing(monkeypatch, calls, "{'x@y.fr': (550, b'Outgoing mail from \"tdl-formation.fr\" has been suspended.')}")
    _brevo_senders(monkeypatch, [{"email": "contact@tdl-formation.fr", "active": True}])
    _send()
    assert calls["smtp"] == 1


def test_delai_depasse_trois_essais(env, monkeypatch):
    _fake, calls = env
    _smtp_failing(monkeypatch, calls, "timed out")
    _brevo_senders(monkeypatch, [{"email": "contact@tdl-formation.fr", "active": True}])
    _send()
    assert calls["smtp"] == 3


def test_secours_brevo_si_expediteur_valide(env, monkeypatch):
    _fake, calls = env
    _smtp_failing(monkeypatch, calls, "timed out")
    _brevo_senders(monkeypatch, [{"email": "contact@tdl-formation.fr", "active": True}])
    log = _send()
    assert log["status"] == "sent" and log["fallback_provider"] == "brevo" and calls["brevo"] == 1


def test_secours_brevo_si_domaine_authentifie(env, monkeypatch):
    _fake, calls = env
    _smtp_failing(monkeypatch, calls, "timed out")
    _brevo_senders(monkeypatch, [], domains=[{"domain_name": "tdl-formation.fr", "authenticated": True}])
    assert _send()["status"] == "sent"


def test_expediteur_non_valide_chez_brevo_echec_visible(env, monkeypatch):
    fake, calls = env
    _smtp_failing(monkeypatch, calls, "timed out")
    _brevo_senders(monkeypatch, [{"email": "tdlparisformation@gmail.com", "active": True}])
    log = _send()
    assert log["status"].startswith("failed") and "non validé chez Brevo" in log["status"]
    assert calls["brevo"] == 0
    assert fake.email_logs.docs[0]["status"] == log["status"]


def test_verification_brevo_impossible_on_tente_quand_meme(env, monkeypatch):
    _fake, calls = env
    _smtp_failing(monkeypatch, calls, "timed out")
    _brevo_senders(monkeypatch, [], status=401)
    assert _send()["status"] == "sent"
    assert calls["brevo"] == 1
