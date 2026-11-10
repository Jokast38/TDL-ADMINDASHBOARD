"""Parcours complet du testeur CACES sur une base simulée en mémoire (aucune
connexion réelle) — routers/caces_exam.py (demande du 2026-11-10)."""
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
from routers import caces as caces_router  # noqa: E402
from routers import stages as stages_router  # noqa: E402
from services import caces as caces_service  # noqa: E402


def _get(doc, key):
    for part in key.split("."):
        if not isinstance(doc, dict):
            return None
        doc = doc.get(part)
    return doc


def _matches(doc, query):
    for key, cond in query.items():
        if key == "$or":
            if not any(_matches(doc, q) for q in cond):
                return False
            continue
        value = _get(doc, key)
        if isinstance(cond, dict):
            if "$in" in cond and value not in cond["$in"]:
                return False
            if "$ne" in cond and value == cond["$ne"]:
                return False
        elif isinstance(value, list) and not isinstance(cond, list):
            if cond not in value:
                return False
        elif value != cond:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, field, direction=1):
        self.docs = sorted(self.docs, key=lambda d: (_get(d, field) is None, _get(d, field) or 0), reverse=direction < 0)
        return self

    async def to_list(self, _n):
        return [dict(d) for d in self.docs]


class _Coll:
    def __init__(self):
        self.docs = []

    def find(self, query=None, _proj=None):
        return _Cursor([d for d in self.docs if _matches(d, query or {})])

    async def find_one(self, query, _proj=None, sort=None):
        docs = [d for d in self.docs if _matches(d, query)]
        if sort:
            field, direction = sort[0]
            docs.sort(key=lambda d: _get(d, field) or "", reverse=direction < 0)
        return dict(docs[0]) if docs else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def count_documents(self, query):
        return len([d for d in self.docs if _matches(d, query)])

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update.get("$set", {}))
                for k, v in update.get("$push", {}).items():
                    d.setdefault(k, []).append(v)
                return
        if upsert:
            self.docs.append({**query, **update.get("$set", {})})

    async def replace_one(self, query, doc, upsert=False):
        for i, d in enumerate(self.docs):
            if _matches(d, query):
                self.docs[i] = dict(doc)
                return
        if upsert:
            self.docs.append(dict(doc))

    async def find_one_and_update(self, query, update, upsert=False, return_document=None):
        d = await self.find_one(query)
        if not d:
            d = dict(query)
            self.docs.append(d)
        else:
            d = next(x for x in self.docs if _matches(x, query))
        for k, v in update.get("$inc", {}).items():
            d[k] = d.get(k, 0) + v
        return dict(d)


class _Db:
    def __init__(self):
        self._c = {}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._c.setdefault(name, _Coll())


EXAM_DAY = "2026-11-12"
TESTEUR = {"id": "t1", "name": "Testeur Un", "role": "animateur", "titre": "Testeur CACES"}
FORMATEUR = {"id": "f1", "name": "Formateur Deux", "role": "animateur", "titre": "Formateur"}
ADMIN = {"id": "a1", "name": "Admin", "role": "admin"}


@pytest.fixture
def env(monkeypatch):
    db = _Db()
    store = {}
    for mod in (ce, caces_router, caces_service):
        monkeypatch.setattr(mod, "db", db)

    async def put(path, data, _ct):
        store[path] = data
        return {"path": path}

    async def get(path):
        return store[path], "application/pdf"
    monkeypatch.setattr(ce, "put_object", put)
    monkeypatch.setattr(ce, "get_object", get)
    today = {"value": EXAM_DAY}
    monkeypatch.setattr(ce, "_today", lambda: today["value"])
    monkeypatch.setattr(stages_router, "access_status", lambda s: {"ouvert": True, "jour": today["value"], "message": ""})

    db.formations.docs.append({"id": "fc", "category": "CACES"})
    db.stages.docs.append({"id": "s1", "formation_id": "fc", "formation_titre": "CACES R489", "date_debut": "2026-11-10",
                           "date_fin": EXAM_DAY, "lieu_ville": "Épinay", "animateur_ids": ["f1", "t1"]})
    for i in (1, 2):
        db.inscriptions.docs.append({"id": f"i{i}", "stage_id": "s1", "status": "active", "student_id": f"u{i}",
                                     "student_name": f"Candidat {i}", "student_email": f"c{i}@x.fr"})
        db.dossiers.docs.append({"id": f"d{i}", "inscription_id": f"i{i}", "student_id": f"u{i}"})
    themes = ["generales"] * 15 + ["technologie"] * 25 + ["abaque"] * 10 + ["exploitation"] * 50
    for g in ("1", "2"):
        db.caces_theorie_grilles.docs.append({"numero": g, "questions": [
            {"theme": t, "enonce": f"G{g} Q{n}", "reponse": n % 2 == 0} for n, t in enumerate(themes, start=1)]})
    return db, today


def run(coro):
    return asyncio.run(coro)


def test_parcours_complet(env):
    db, today = env

    # Questionnaires : testeur uniquement, jour de l'examen uniquement.
    with pytest.raises(HTTPException) as e:
        run(ce.generate_papers("s1", ce.GenerateIn(), FORMATEUR))
    assert e.value.status_code == 403
    today["value"] = "2026-11-11"
    with pytest.raises(HTTPException) as e:
        run(ce.generate_papers("s1", ce.GenerateIn(), TESTEUR))
    assert "jour de l'examen" in e.value.detail
    today["value"] = EXAM_DAY

    state = run(ce.generate_papers("s1", ce.GenerateIn(), TESTEUR))
    copies = db.caces_theorie_copies.docs
    assert len(copies) == 2 and {c["grille"] for c in copies} <= {"1", "2"}
    assert sorted(c["numero_copie"] for c in copies) == [1, 2]
    assert all(len(c["questions"]) == 100 for c in copies)
    assert all(c["copie"]["nb_questions"] == 100 and "questions" not in c["copie"] for c in state["candidats"])
    assert {d["type"] for d in db.caces_documents.docs} == {"questionnaires", "corriges"}

    # Un 2e tirage sans « regenerer » garde les mêmes copies.
    before = [(c["id"], c["grille"]) for c in copies]
    run(ce.generate_papers("s1", ce.GenerateIn(), TESTEUR))
    assert [(c["id"], c["grille"]) for c in db.caces_theorie_copies.docs] == before

    # Correction : 5 erreurs -> 95 %, réussite.
    c1 = next(c for c in copies if c["inscription_id"] == "i1")
    result = run(ce.correct_paper("s1", c1["id"], ce.CorrectionIn(erreurs=[1, 2, 3, 4, 5]), TESTEUR))
    assert result["passed"] and result["pct"] == 95
    # Une copie corrigée n'est jamais retirée au sort.
    run(ce.generate_papers("s1", ce.GenerateIn(regenerer=True), TESTEUR))
    assert next(c for c in db.caces_theorie_copies.docs if c["id"] == c1["id"])["resultat"]["passed"]

    # Pratique cat. 3 au maximum : l'examen est créé avec la théorie reportée,
    # puis la carte est délivrée.
    g = ce.grille_pratique("3")
    notes = {f"0:{c['id']}": c["max"] for t in g["volets"][0]["themes"] for p in t["points"] for c in p["criteres"]}
    ev = run(ce.record_practical("s1", ce.PratiqueIn(inscription_id="i1", category="3", notes=notes, chariot="Linde H25"), TESTEUR))
    assert ev["passed"] and ev["total"] == 100
    attempt = db.caces_exam_attempts.docs[0]
    assert attempt["theorie"]["source"] == "copie" and attempt["pratique"]["passed"]
    cert = db.caces_certificates.docs[0]
    assert cert["student_id"] == "u1" and cert["categories"][0]["category"] == "3"
    with pytest.raises(HTTPException):  # catégorie déjà obtenue
        run(ce.record_practical("s1", ce.PratiqueIn(inscription_id="i1", category="3", notes=notes), TESTEUR))

    # Examen d'adéquation : apte seulement si tout est coché.
    with pytest.raises(HTTPException):
        run(ce.record_adequation("s1", ce.AdequationIn(chariot_modele="H25", checks={"notice": True}, conforme=True), TESTEUR))
    entry = run(ce.record_adequation("s1", ce.AdequationIn(
        chariot_modele="H25", checks={k: True for k, _, _ in ce.ADEQUATION_CHECKLIST}, conforme=True), TESTEUR))
    assert entry["document_id"]

    # Archives : le testeur ne revoit les questionnaires que le jour de l'examen.
    q_doc = next(d for d in db.caces_documents.docs if d["type"] == "questionnaires")
    assert run(ce.download_document(q_doc["id"], TESTEUR)).status_code == 200
    today["value"] = "2026-11-20"
    with pytest.raises(HTTPException):
        run(ce.download_document(q_doc["id"], TESTEUR))
    assert run(ce.download_document(q_doc["id"], ADMIN)).status_code == 200
    with pytest.raises(HTTPException):
        run(ce.download_document(q_doc["id"], FORMATEUR))


def test_import_csv():
    data = "Grille;Numéro;Thème;Question;Réponse\n1;2;Exploitation;Deuxième;F\n1;1;Connaissances générales;Première;V\n".encode("cp1252")
    rows = ce._rows_from_upload("questions.csv", data)
    assert rows[0][0] == "Grille" and rows[1][2] == "Exploitation"
