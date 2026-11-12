"""Revue des questions théoriques CACES par le formateur (2026-11-12)."""
import asyncio
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from routers import caces_exam as ce  # noqa: E402


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _n):
        return [dict(d) for d in self.docs]


class _Coll:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, q=None, _p=None):
        return _Cursor([d for d in self.docs if all(d.get(k) == v for k, v in (q or {}).items() if not isinstance(v, dict))])

    async def find_one(self, q, _p=None):
        return next((dict(d) for d in self.docs if all(d.get(k) == v for k, v in q.items())), None)

    async def update_one(self, q, u, upsert=False):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items()):
                d.update(u["$set"])
                return
        if upsert:
            self.docs.append({**q, **u["$set"]})

    async def delete_one(self, q):
        self.docs = [d for d in self.docs if not all(d.get(k) == v for k, v in q.items())]

    async def insert_one(self, d):
        self.docs.append(dict(d))


Q1 = {"theme": "generales", "enonce": "Le CACES est obligatoire.", "reponse": False}
Q2 = {"theme": "abaque", "enonce": "La charge nominale dépend du centre de gravité.", "reponse": True}
ANAS = {"id": "an", "name": "Anas", "role": "animateur", "titre": "Testeur CACES", "assigned_categories": ["CACES"]}


def _db(monkeypatch):
    class Db:
        caces_theorie_grilles = _Coll([{"numero": "1", "questions": [dict(Q1), dict(Q2)]}])
        caces_question_reviews = _Coll()
        caces_revue_envois = _Coll()
        users = _Coll([{"id": "ad", "role": "admin", "email": "admin@tdl.fr", "active": True}])
    monkeypatch.setattr(ce, "db", Db)
    return Db


def test_valider_signaler_et_question_modifiee(monkeypatch):
    Db = _db(monkeypatch)
    data = asyncio.run(ce.revue_grilles(ANAS))
    g1 = data["grilles"][0]
    assert g1["stats"] == {"valide": 0, "a_corriger": 0, "a_revoir": 2}
    q1, q2 = g1["questions"]
    asyncio.run(ce.revue_question("1", q1["qid"], ce.RevueIn(statut="valide"), ANAS))
    with pytest.raises(HTTPException):  # « à corriger » sans remarque
        asyncio.run(ce.revue_question("1", q2["qid"], ce.RevueIn(statut="a_corriger"), ANAS))
    asyncio.run(ce.revue_question("1", q2["qid"], ce.RevueIn(statut="a_corriger", commentaire="Réponse : vrai seulement si..."), ANAS))
    stats = asyncio.run(ce.revue_grilles(ANAS))["grilles"][0]["stats"]
    assert stats == {"valide": 1, "a_corriger": 1, "a_revoir": 0}

    # L'équipe corrige la question 2 : elle repasse « à revoir ».
    Db.caces_theorie_grilles.docs[0]["questions"][1]["enonce"] = "La capacité dépend du centre de gravité de la charge."
    stats = asyncio.run(ce.revue_grilles(ANAS))["grilles"][0]["stats"]
    assert stats == {"valide": 1, "a_corriger": 0, "a_revoir": 1}


def test_envoi_recapitulatif_et_droits(monkeypatch):
    _db(monkeypatch)
    sent = []

    async def fake_send(to, subject, body, *a, **k):
        sent.append((to, subject, body))
    import services.email as em
    monkeypatch.setattr(em, "send_email", fake_send)
    q2 = asyncio.run(ce.revue_grilles(ANAS))["grilles"][0]["questions"][1]
    asyncio.run(ce.revue_question("1", q2["qid"], ce.RevueIn(statut="a_corriger", commentaire="Ambigu"), ANAS))
    res = asyncio.run(ce.envoyer_revue(ANAS))
    assert res["a_corriger"] == 1 and len(sent) == 1 and "Ambigu" in sent[0][2]

    autre = {**ANAS, "id": "x", "assigned_categories": ["PERMIS"], "titre": "Formateur BAFM"}
    with pytest.raises(HTTPException):
        asyncio.run(ce.revue_grilles(autre))
