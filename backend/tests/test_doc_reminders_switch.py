"""Relances « documents manquants » : coupées tant que l'interrupteur des
Paramètres n'est pas activé (demande du 2026-11-10)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import staff_notify  # noqa: E402


class _Settings:
    def __init__(self, doc):
        self.doc = doc

    async def find_one(self, *_a, **_k):
        return self.doc


class _Dossiers:
    called = False

    def find(self, *_a, **_k):
        _Dossiers.called = True
        raise AssertionError("aucun dossier ne doit être lu quand les relances sont coupées")


class _Db:
    def __init__(self, settings):
        self.settings = _Settings(settings)
        self.dossiers = _Dossiers()


def test_relances_coupees_par_defaut_et_si_desactivees(monkeypatch):
    for settings in (None, {}, {"doc_reminders_enabled": False}):
        monkeypatch.setattr(staff_notify, "db", _Db(settings))
        assert asyncio.run(staff_notify.send_document_reminders()) == 0
    assert not _Dossiers.called


def test_relances_formateurs_coupees_par_defaut(monkeypatch):
    class _Users:
        def find(self, *_a, **_k):
            raise AssertionError("aucun formateur ne doit être lu quand les relances sont coupées")

    for settings in (None, {"formateur_doc_reminders_enabled": False}):
        db = _Db(settings)
        db.users = _Users()
        monkeypatch.setattr(staff_notify, "db", db)
        assert asyncio.run(staff_notify.send_formateur_dossier_reminders()) == 0
        assert asyncio.run(staff_notify.send_convention_session_reminders()) == 0
