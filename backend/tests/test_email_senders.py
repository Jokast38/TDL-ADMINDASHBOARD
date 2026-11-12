"""Expéditeur selon le type d'email (demande du 2026-11-12) : équipe ->
dashboard@, relances et campagnes -> info@, le reste -> boîte principale ;
repli sur la boîte principale si une boîte dédiée refuse la connexion."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import email  # noqa: E402

SETTINGS = {
    "id": "global", "email_provider": "smtp", "email_from": "contact@tdl-formation.fr",
    "smtp_host": "smtp.test", "smtp_port": 465, "smtp_tls": False, "smtp_user": "contact@tdl-formation.fr",
    "smtp_password": "p", "smtp_password_dedie": "p2", "email_from_equipe": "dashboard@tdl-formation.fr", "email_from_marketing": "info@tdl-formation.fr",
}


class _Db:
    class settings:
        @staticmethod
        async def find_one(*_a, **_k):
            return dict(SETTINGS)

    class users:
        @staticmethod
        async def find_one(q, _p=None):
            return {"id": "u1"} if q["email"] == "agent@tdl-formation.fr" else None

    class email_logs:
        docs = []

        @classmethod
        async def insert_one(cls, doc):
            cls.docs.append(doc)


def _setup(monkeypatch, refuse=()):
    used = []

    async def smtp(s, to, *_a, **_k):
        used.append(s["smtp_user"])
        # contact@ avec son mot de passe, les boîtes dédiées avec le leur.
        assert s["smtp_password"] == ("p" if s["smtp_user"] == "contact@tdl-formation.fr" else "p2")
        return "smtp_error: (535, b'Incorrect authentication data')" if s["smtp_user"] in refuse else "sent"
    monkeypatch.setattr(email, "db", _Db)
    monkeypatch.setattr(email, "_send_via_smtp", smtp)
    monkeypatch.setattr(email, "OUTBOUND_DISABLED", False)
    email._STAFF_CACHE.clear()
    return used


def test_expediteur_selon_le_type(monkeypatch):
    used = _setup(monkeypatch)
    equipe = asyncio.run(email.send_email("agent@tdl-formation.fr", "Notif", "<p>x</p>"))
    client = asyncio.run(email.send_email("eleve@gmail.com", "Convocation", "<p>x</p>"))
    relance = asyncio.run(email.send_email("prospect@gmail.com", "Relance", "<p>x</p>", extra={"automation_id": "a"}))
    assert (equipe["audience"], equipe["sender"]) == ("equipe", "dashboard@tdl-formation.fr")
    assert (client["audience"], client["sender"]) == ("clients", "contact@tdl-formation.fr")
    assert (relance["audience"], relance["sender"]) == ("marketing", "info@tdl-formation.fr")
    assert used == ["dashboard@tdl-formation.fr", "contact@tdl-formation.fr", "info@tdl-formation.fr"]


def test_repli_sur_la_boite_principale(monkeypatch):
    used = _setup(monkeypatch, refuse=("info@tdl-formation.fr",))
    log = asyncio.run(email.send_email("prospect@gmail.com", "Relance", "<p>x</p>", extra={"campaign": True}))
    assert log["status"] == "sent" and log["sender"] == "contact@tdl-formation.fr" and "sender_error" in log
    assert used == ["info@tdl-formation.fr", "contact@tdl-formation.fr"]
