"""Rendez-vous : qui l'a placé et quand (2026-11-19)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

import routers.call_center as cc


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _n):
        return self.docs


class _Users:
    def find(self, query, _p=None):
        ids = query["id"]["$in"]
        return _Cursor([u for u in [{"id": "u1", "name": "Sarah Agent"}] if u["id"] in ids])


class _Db:
    users = _Users()


def test_auteur_et_horodatage_du_rendez_vous(monkeypatch):
    monkeypatch.setattr(cc, "db", _Db())
    appts = [
        {"id": "a", "created_by": "u1", "created_at": "2026-11-18T13:32:00+00:00"},  # ancien RDV : nom retrouvé
        {"id": "b", "created_by": "u2", "created_by_name": "Karim", "created_at": "2026-11-19T08:00:00+00:00"},
        {"id": "c", "created_by": "import", "created_at": "2026-11-01T00:00:00+00:00",
         "claimed_at": "2026-11-02T09:15:00+00:00", "commercial_name": "Nadia"},  # créneau Cosmosia attribué
    ]
    asyncio.run(cc._avec_auteur(appts))
    assert [(a["place_par_name"], a["place_le"]) for a in appts] == [
        ("Sarah Agent", "2026-11-18T13:32:00+00:00"),
        ("Karim", "2026-11-19T08:00:00+00:00"),
        ("Nadia", "2026-11-02T09:15:00+00:00"),
    ]
