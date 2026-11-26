"""Bouton vert des demandes de rappel (page Inscriptions, 2026-11-26) : prise
en charge puis suivi dans la page Rappels, et statut synchronisé quand une
demande est marquée traitée par l'ancienne route — base simulée."""
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
from routers import call_center as cc  # noqa: E402
from routers import callback as cb  # noqa: E402
from models.callback import CallbackRequestUpdate  # noqa: E402

LYDIA = {"id": "u1", "name": "Lydia", "role": "admin"}


def run(c):
    return asyncio.run(c)


@pytest.fixture
def db(monkeypatch):
    d = _Db()
    for mod in (cc, cb):
        monkeypatch.setattr(mod, "db", d)

    async def no_log(*_a, **_k):
        return None
    monkeypatch.setattr(cc, "log_action", no_log)
    monkeypatch.setattr(cb, "log_action", no_log)
    monkeypatch.setattr(cb, "check_dossier_milestone", no_log)
    d.callback_requests.docs.append({"id": "c1", "prenom": "Awa", "nom": "Diallo", "telephone": "0600000000",
                                     "handled": False, "created_at": "2026-11-26T09:00:00+00:00"})
    d.callback_requests.docs.append({"id": "c2", "prenom": "Paul", "nom": "Martin", "statut": "a_rappeler",
                                     "handled": False, "created_at": "2026-11-26T09:00:00+00:00"})
    return d


def test_prise_en_charge(db):
    r = run(cc.prendre_en_charge_rappel("c1", LYDIA))
    assert r["statut"] == "en_cours" and r["assigned_to"] == "u1" and r["handled"] is False
    assert run(cc.get_rappel("c1", LYDIA))["nom_complet"] == "Awa Diallo"
    # Toujours ouvert dans Rappels jusqu'à ce qu'un résultat soit saisi.
    ouverts = run(cc.list_rappels("ouverts", None, None, LYDIA))["items"]
    assert "c1" in [x["id"] for x in ouverts]


def test_traite_par_ancienne_route_synchronise(db):
    run(cb.update_callback_request("c2", CallbackRequestUpdate(handled=True), LYDIA))
    doc = db.callback_requests.docs[1]
    assert doc["statut"] == "traite" and doc["handled_by_name"] == "Lydia"
    assert "c2" not in [x["id"] for x in run(cc.list_rappels("ouverts", None, None, LYDIA))["items"]]
    run(cb.update_callback_request("c2", CallbackRequestUpdate(handled=False), LYDIA))
    assert db.callback_requests.docs[1]["statut"] == "a_rappeler"
