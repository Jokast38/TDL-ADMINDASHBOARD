"""Cartes CACES générées par le testeur (routers/caces_cartes.py) et
modification des cartes par l'équipe (routers/caces.py) — demande du
2026-11-26. Base simulée en mémoire, aucune connexion réelle."""
import asyncio
import io
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
from routers import caces_exam as ce  # noqa: E402
from routers import caces_cartes as cc  # noqa: E402
from routers import caces as caces_router  # noqa: E402
from routers import stages as stages_router  # noqa: E402
from services import caces as caces_service  # noqa: E402
from models.caces import CacesCategoriesIn, CacesCategoryEntryIn  # noqa: E402

EXAM = "2026-11-25"
TESTEUR = {"id": "t1", "name": "Anas", "role": "animateur", "titre": "Testeur CACES"}
ADMIN = {"id": "a1", "name": "Admin", "role": "admin"}


def run(coro):
    return asyncio.run(coro)


def _png() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (60, 80), (200, 180, 160)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def env(monkeypatch):
    db = _Db()
    store = {"photo.png": _png()}
    for mod in (ce, cc, caces_router, caces_service):
        monkeypatch.setattr(mod, "db", db)

    async def put(path, data, _ct):
        store[path] = data
        return {"path": path}

    async def get(path):
        return store[path], "image/png"
    for mod in (ce, caces_router, cc):
        monkeypatch.setattr(mod, "get_object", get, raising=False)
    monkeypatch.setattr(ce, "put_object", put)
    monkeypatch.setattr(caces_router, "put_object", put)
    today = {"value": EXAM}
    monkeypatch.setattr(ce, "_today", lambda: today["value"])
    monkeypatch.setattr(cc, "_today", lambda: today["value"])
    monkeypatch.setattr(stages_router, "access_status", lambda s: {"ouvert": False, "jour": today["value"], "message": "fermée"})

    db.formations.docs.append({"id": "fc", "category": "CACES"})
    db.stages.docs.append({"id": "s1", "formation_id": "fc", "formation_titre": "CACES R489", "date_debut": "2026-11-23",
                           "date_fin": EXAM, "lieu_ville": "Épinay", "animateur_ids": ["t1"]})
    for i in (1, 2):
        db.inscriptions.docs.append({"id": f"i{i}", "stage_id": "s1", "status": "active", "student_id": f"u{i}",
                                     "student_name": f"Candidat {i}", "student_email": f"c{i}@x.fr",
                                     "formation_title": "CACES R489 Cat. 3 - Chariot élévateur"})
        db.dossiers.docs.append({"id": f"d{i}", "inscription_id": f"i{i}", "student_id": f"u{i}", "student_name": f"Candidat {i}"})
    return db, today


def test_fenetre_24h_apres_examen():
    s = {"date_debut": "2026-11-23", "date_fin": EXAM}
    assert not cc.fenetre_cartes(s, "2026-11-24", False)["ouvert"]
    assert cc.fenetre_cartes(s, EXAM, False)["ouvert"]
    assert cc.fenetre_cartes(s, "2026-11-26", False)["ouvert"]
    assert not cc.fenetre_cartes(s, "2026-11-27", False)["ouvert"]
    # Rouverte si le testeur est placé sur une autre session CACES.
    assert cc.fenetre_cartes(s, "2026-11-27", True)["ouvert"]
    # Bouton de l'équipe.
    assert cc.fenetre_cartes({**s, "cartes_testeur": "autorise"}, "2026-12-20", False)["ouvert"]
    assert not cc.fenetre_cartes({**s, "cartes_testeur": "bloque"}, EXAM, False)["ouvert"]
    # Jour d'examen fixé sur la page CACES.
    assert not cc.fenetre_cartes({**s, "date_examen_caces": "2026-11-24"}, "2026-11-26", False)["ouvert"]


def test_categories_lues_dans_l_intitule():
    f = caces_service.categories_inscription
    assert f({"formation_title": "CACES R489 Cat. 3 - Chariot élévateur"}) == ["3"]
    assert f({"formation_title": "CACES cat 1B, 3 et 5"}) == ["1B", "3", "5"]
    assert f({"formation_title": "CACES R489"}) == []
    assert f({"caces_categories": ["1B", "5"], "formation_title": "Cat. 3"}) == ["1B", "5"]


def test_parcours_testeur_jusqu_a_la_carte(env):
    db, today = env
    etat = run(cc.mes_cartes(TESTEUR))["sessions"][0]
    assert etat["fenetre"]["ouvert"] and etat["candidats"][0]["categories"] == ["3"]

    # Pas de carte sans déclaration.
    with pytest.raises(HTTPException):
        run(cc.generer_carte("s1", "i1", TESTEUR))

    etat = run(cc.declarer("s1", "i1", cc.DeclarationIn(resultats={"3": "admis"}), TESTEUR))
    run(cc.declarer("s1", "i2", cc.DeclarationIn(resultats={"3": "ajourne"}), TESTEUR))
    cert = db.caces_certificates.docs[0]
    assert len(db.caces_certificates.docs) == 1 and cert["student_id"] == "u1"
    assert cert["categories"][0]["category"] == "3" and cert["categories"][0]["date_obtention"] == EXAM
    assert cert["categories"][0]["testeur_name"] == "Anas" and cert["expiration_date"] == "2031-11-25"
    c1 = next(c for c in etat["candidats"] if c["inscription_id"] == "i1")
    assert set(c1["manque"]) == {"date de naissance", "signataire", "photo"}
    att2 = next(a for a in db.caces_exam_attempts.docs if a["student_id"] == "u2")
    assert att2["pratique"]["passed"] is False and not att2.get("finalized_certificate_id")

    with pytest.raises(HTTPException) as e:
        run(cc.generer_carte("s1", "i1", TESTEUR))
    assert "date de naissance" in e.value.detail

    run(cc.infos_carte("s1", "i1", cc.CarteInfosIn(date_naissance="1990-04-12", signataire_name="Jean Dupont",
                                                   signataire_qualite="Directeur"), TESTEUR))
    db.dossiers.docs[0]["id_photo_path"] = "photo.png"
    r = run(cc.generer_carte("s1", "i1", TESTEUR))
    assert r.body[:4] == b"%PDF"
    assert any(d["type"] == "carte_caces" and d["testeur_id"] == "t1" for d in db.caces_documents.docs)
    assert db.caces_certificates.docs[0]["carte_generee_par"] == "Anas"

    # 48 h après l'examen : fermé pour le testeur, sauf autorisation de l'équipe.
    today["value"] = "2026-11-27"
    with pytest.raises(HTTPException) as e:
        run(cc.generer_carte("s1", "i1", TESTEUR))
    assert e.value.status_code == 403
    run(cc.set_mode("s1", cc.ModeIn(mode="autorise"), ADMIN))
    assert run(cc.generer_carte("s1", "i1", TESTEUR)).body[:4] == b"%PDF"
    # L'équipe génère toujours.
    run(cc.set_mode("s1", cc.ModeIn(mode="bloque"), ADMIN))
    assert run(cc.generer_carte("s1", "i1", ADMIN)).body[:4] == b"%PDF"


def test_modification_des_categories_par_l_equipe(env):
    db, _ = env
    run(cc.declarer("s1", "i1", cc.DeclarationIn(resultats={"3": "admis"}), TESTEUR))
    cert = db.caces_certificates.docs[0]
    numero_3 = cert["categories"][0]["numero_caces"]
    out = run(caces_router.set_certificate_categories(cert["id"], CacesCategoriesIn(categories=[
        CacesCategoryEntryIn(category="3"),
        CacesCategoryEntryIn(category="1B", date_obtention="2026-11-25", testeur_name="Anas"),
    ]), ADMIN))
    cats = {c["category"]: c for c in out["categories"]}
    assert cats["3"]["numero_caces"] == numero_3 and cats["3"]["exam_attempt_id"]
    assert cats["1B"]["numero_caces"].startswith("C1B.")
    with pytest.raises(HTTPException):
        run(caces_router.set_certificate_categories(cert["id"], CacesCategoriesIn(categories=[]), ADMIN))
    # Carte créée à la main pour le 2e candidat (examen fait sur papier).
    c2 = run(caces_router.create_certificate(caces_router.CacesCertificateCreateIn(
        dossier_id="d2", categories=[CacesCategoryEntryIn(category="5", numero_caces="C5.000000000777", date_obtention="2026-11-25")]), ADMIN))
    assert c2["categories"][0]["numero_caces"] == "C5.000000000777" and c2["expiration_date"] == "2031-11-25"
    with pytest.raises(HTTPException):
        run(caces_router.create_certificate(caces_router.CacesCertificateCreateIn(
            dossier_id="d2", categories=[CacesCategoryEntryIn(category="3")]), ADMIN))
