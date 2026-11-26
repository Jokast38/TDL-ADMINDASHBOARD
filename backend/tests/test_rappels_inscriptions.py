"""Lien demandes de rappel / inscriptions (services/rappels_inscriptions.py,
demande du 2026-11-26) — base simulée."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from test_caces_session_flow import _Db  # noqa: E402
from services import rappels_inscriptions as ri  # noqa: E402
from routers import call_center as cc  # noqa: E402

LYDIA = {"id": "u1", "name": "Lydia", "role": "admin"}


def run(c):
    return asyncio.run(c)


@pytest.fixture
def db(monkeypatch):
    d = _Db()
    monkeypatch.setattr(ri, "db", d)
    monkeypatch.setattr(cc, "db", d)

    async def no_log(*_a, **_k):
        return None
    monkeypatch.setattr(cc, "log_action", no_log)
    d.callback_requests.docs.extend([
        {"id": "c1", "prenom": "Awa", "nom": "Diallo", "telephone": "06 12 34 56 78", "handled": False,
         "statut": "a_rappeler", "created_at": "2026-11-20T09:00:00+00:00"},
        {"id": "c2", "prenom": "Paul", "nom": "Martin", "telephone": "0700000000", "email": "Paul@Mail.fr",
         "handled": False, "created_at": "2026-11-20T09:00:00+00:00"},
        {"id": "c3", "prenom": "Zoé", "nom": "Roy", "telephone": "0711111111", "handled": False,
         "created_at": "2026-11-25T09:00:00+00:00"},
    ])
    return d


def test_inscription_clot_la_demande(db):
    insc = {"id": "i1", "student_phone": "+33612345678", "student_email": "awa@x.fr",
            "formation_title": "CACES R489", "created_at": "2026-11-22T10:00:00+00:00"}
    assert run(ri.cloturer_rappels_inscrit(insc, LYDIA)) == 1
    c1 = db.callback_requests.docs[0]
    assert c1["statut"] == "traite" and c1["handled"] and c1["inscription_id"] == "i1"
    assert c1["tentatives"][-1]["resultat"] == "inscrit" and c1["handled_by_name"] == "Lydia"
    # Inscription antérieure à la demande : pas de lien.
    insc_avant = {"id": "i0", "student_phone": "0711111111", "created_at": "2026-11-24T10:00:00+00:00"}
    assert run(ri.cloturer_rappels_inscrit(insc_avant, LYDIA)) == 0


def test_demandes_deja_ouvertes(db):
    db.inscriptions.docs.append({"id": "i2", "student_phone": "", "student_email": "paul@mail.fr", "formation_title": "VTC",
                                 "created_at": "2026-11-21T10:00:00+00:00", "created_by_name": "Habiba"})
    liees = run(ri.inscriptions_liees(db.callback_requests.docs))
    assert set(liees) == {"c2"}
    assert run(cc.cloturer_rappels_inscrits(LYDIA)) == {"clos": 1}
    assert db.callback_requests.docs[1]["statut"] == "traite"
