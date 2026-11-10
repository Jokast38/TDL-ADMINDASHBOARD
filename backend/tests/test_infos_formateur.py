"""Le formateur ne complète que ses informations manquantes (nom, prénom,
matricule) ; une fois remplies, elles sont verrouillées (demande du 2026-11-10)."""
import asyncio
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from models.employee import MesInfosFormateurIn  # noqa: E402
from routers import employees  # noqa: E402


class _Users:
    def __init__(self, doc):
        self.doc = doc

    async def update_one(self, _q, update):
        self.doc.update(update["$set"])

    async def find_one(self, *_a, **_k):
        return dict(self.doc)


class _Db:
    def __init__(self, doc):
        self.users = _Users(doc)


def test_seuls_les_champs_vides_sont_enregistres(monkeypatch):
    user = {"id": "u1", "prenom": "Karima", "nom": "", "matricule": None}
    db = _Db(user)
    monkeypatch.setattr(employees, "db", db)
    out = asyncio.run(employees.update_my_formateur_infos(
        MesInfosFormateurIn(prenom="Autre", nom="HADJARENE", matricule="B-1"), dict(user)))
    assert out["prenom"] == "Karima" and out["nom"] == "HADJARENE" and out["matricule"] == "B-1"
    assert out["name"] == "Karima HADJARENE"
    # Tout est rempli : plus aucune modification possible par le formateur.
    with pytest.raises(HTTPException):
        asyncio.run(employees.update_my_formateur_infos(MesInfosFormateurIn(nom="X", matricule="B-2"), out))
