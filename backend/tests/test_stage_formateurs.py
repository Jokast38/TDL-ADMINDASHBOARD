"""Correction des formateurs d'une session par l'équipe (2026-11-12) : on peut
retirer le premier formateur placé (bug de l'ancien champ animateur_id) et le
remplacer, avec les places BAFM / PSY indiquées."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from routers import stages  # noqa: E402
from models.stage import StageFormateursIn, StageUpdate  # noqa: E402


def _match(d, q):
    for k, v in q.items():
        if isinstance(v, dict):
            val = d.get(k)
            if "$in" in v:
                if isinstance(val, list):
                    if not set(val) & set(v["$in"]):
                        return False
                elif val not in v["$in"]:
                    return False
            if "$ne" in v and val == v["$ne"]:
                return False
            if "$lte" in v and not (val is not None and val <= v["$lte"]):
                return False
            if "$gte" in v and not (val is not None and val >= v["$gte"]):
                return False
        elif d.get(k) != v:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_a):
        return self

    async def to_list(self, _n):
        return [dict(d) for d in self.docs]


class _Coll:
    def __init__(self, docs):
        self.docs = docs

    def find(self, q, _p=None):
        return _Cursor([d for d in self.docs if _match(d, q)])

    async def find_one(self, q, _p=None):
        return next((dict(d) for d in self.docs if _match(d, q)), None)

    async def update_one(self, q, u):
        for d in self.docs:
            if _match(d, q):
                d.update(u["$set"])


NASSERA = {"id": "n", "name": "Nassera", "role": "animateur", "titre": "Formateur BAFM", "assigned_categories": ["PERMIS"]}
NADIA = {"id": "d", "name": "Nadia", "role": "animateur", "titre": "Psychologue", "assigned_categories": ["PERMIS"]}
MALIK = {"id": "m", "name": "Malik", "role": "animateur", "titre": "Formateur BAFM", "assigned_categories": ["PERMIS"]}


def _setup(monkeypatch):
    class Db:
        stages = _Coll([
            {"id": "s1", "formation_id": "f", "formation_titre": "Récup", "date_debut": "2027-05-19", "date_fin": "2027-05-20",
             "statut": "planifie", "animateur_ids": ["n", "d"], "animateur_id": "n"},
            {"id": "s2", "formation_id": "f", "formation_titre": "Récup", "date_debut": "2027-05-20", "date_fin": "2027-05-21",
             "statut": "planifie", "animateur_ids": ["m"], "animateur_id": "m"},
        ])
        users = _Coll([NASSERA, NADIA, MALIK])
        formations = _Coll([{"id": "f", "category": "PERMIS"}])

    calls = {"push": [], "conv": []}

    async def noop(*_a, **_k):
        return None

    async def push(ids, title, *_a, **_k):
        calls["push"].append((tuple(ids), title))

    async def conv(fid):
        calls["conv"].append(fid)
    monkeypatch.setattr(stages, "db", Db)
    monkeypatch.setattr(stages, "log_action", noop)
    monkeypatch.setattr(stages, "send_push_to_users", push)
    monkeypatch.setattr(stages, "regenerate_convention_pdf", conv)
    return Db, calls


def test_remplacer_le_premier_formateur(monkeypatch):
    Db, calls = _setup(monkeypatch)
    user = {"id": "e1", "name": "Employé", "role": "employe"}
    opts = asyncio.run(stages.get_stage_formateurs("s1", user))
    by = {f["id"]: f for f in opts["formateurs"]}
    assert opts["places"] == ["BAFM", "PSY"] and by["d"]["place"] == "PSY" and by["m"]["place"] == "BAFM"
    assert "Récup" in by["m"]["deja_place"]  # Malik est sur une session qui chevauche

    out = asyncio.run(stages.set_stage_formateurs("s1", StageFormateursIn(animateur_ids=["d", "m"]), user))
    s1 = Db.stages.docs[0]
    assert s1["animateur_ids"] == ["d", "m"] and s1["animateur_id"] == "d"
    assert out["animateur_ids"] == ["d", "m"]
    assert (("m",), "Nouvelle session assignée") in calls["push"]
    assert (("n",), "Session retirée de votre planning") in calls["push"]
    assert set(calls["conv"]) == {"n", "m"}


def test_modification_complete_ne_remet_plus_l_ancien_formateur(monkeypatch):
    Db, _ = _setup(monkeypatch)
    admin = {"id": "a", "name": "Admin", "role": "admin"}
    asyncio.run(stages.update_stage("s1", StageUpdate(animateur_ids=["d"]), admin))
    assert Db.stages.docs[0]["animateur_ids"] == ["d"] and Db.stages.docs[0]["animateur_id"] == "d"
