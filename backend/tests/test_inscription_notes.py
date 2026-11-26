"""Notes datées et signées des inscriptions et catégories CACES modifiables
(routers/inscriptions.py, demande du 2026-11-26) — base simulée."""
import asyncio
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from test_caces_session_flow import _Db  # noqa: E402
from routers import inscriptions as ins  # noqa: E402
from models.inscription import InscriptionUpdate  # noqa: E402

LYDIA = {"id": "u1", "name": "Lydia", "role": "admin"}
HABIBA = {"id": "u2", "name": "Habiba", "role": "admin"}


def run(c):
    return asyncio.run(c)


@pytest.fixture
def db(monkeypatch):
    d = _Db()
    monkeypatch.setattr(ins, "db", d)

    async def no_log(*_a, **_k):
        return None
    monkeypatch.setattr(ins, "log_action", no_log)
    d.inscriptions.docs.append({"id": "i1", "student_name": "Candidat", "notes": "Appelé lundi", "created_at": "2026-11-20T10:00:00",
                                "created_by_name": "Anaïs", "category": "CACES", "caces_categories": ["3"]})
    return d


def test_historique_des_notes(db):
    hist = run(ins.list_inscription_notes("i1", LYDIA))
    assert hist == [{"id": "origine", "text": "Appelé lundi", "at": "2026-11-20T10:00:00", "by_name": "Anaïs"}]
    hist = run(ins.add_inscription_note("i1", ins.InscriptionNoteIn(text="  Dossier complet  "), LYDIA))
    assert [n["text"] for n in hist] == ["Appelé lundi", "Dossier complet"]
    assert hist[-1]["by_name"] == "Lydia" and hist[-1]["at"]
    doc = db.inscriptions.docs[0]
    assert doc["notes"] == "Dossier complet" and doc["notes_updated_by_name"] == "Lydia"

    # Modification : texte corrigé, auteur d'origine gardé, correction signée.
    nid = hist[-1]["id"]
    hist = run(ins.edit_inscription_note("i1", nid, ins.InscriptionNoteIn(text="Dossier complet, payé"), HABIBA))
    assert hist[-1]["text"] == "Dossier complet, payé" and hist[-1]["by_name"] == "Lydia" and hist[-1]["edited_by_name"] == "Habiba"
    assert db.inscriptions.docs[0]["notes"] == "Dossier complet, payé"
    hist = run(ins.edit_inscription_note("i1", "origine", ins.InscriptionNoteIn(text="Appelé lundi matin"), HABIBA))
    assert hist[0]["text"] == "Appelé lundi matin" and db.inscriptions.docs[0]["notes"] == "Dossier complet, payé"
    with pytest.raises(HTTPException):
        run(ins.add_inscription_note("i1", ins.InscriptionNoteIn(text="  "), LYDIA))


def test_categories_caces_modifiables(db):
    run(ins.update_inscription("i1", InscriptionUpdate(caces_categories=["5", "1B"]), LYDIA))
    assert db.inscriptions.docs[0]["caces_categories"] == ["1B", "5"]
    with pytest.raises(HTTPException):
        run(ins.update_inscription("i1", InscriptionUpdate(caces_categories=["7"]), LYDIA))
    # L'ancien champ « notes » du formulaire passe aussi par l'historique.
    run(ins.update_inscription("i1", InscriptionUpdate(notes="Rappeler vendredi"), LYDIA))
    assert [n["text"] for n in db.inscriptions.docs[0]["notes_history"]] == ["Appelé lundi", "Rappeler vendredi"]
