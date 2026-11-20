"""Grilles officielles CACES® R.489 V1 - 12/2024 (2026-11-19) : contenu
extrait des PDF, impression à l'identique et correction VRAI / FAUX."""
import os
import sys
from pathlib import Path

import pymupdf as fitz
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from core.caces_grilles import GRILLES_THEORIE, score_theorie  # noqa: E402
from services import caces_r489_pdf as r489  # noqa: E402

# Corrigé officiel (reponses.pdf), grille 1 thème 1 et grille 5 thème 3.
G1_T1 = "FVFFVVVFVFFVFVF"
G5_T3 = "FVVFFFVVVF"


@pytest.mark.parametrize("numero", GRILLES_THEORIE)
def test_cent_questions_par_grille_avec_reponses(numero):
    qs = r489.official_questions(numero)
    assert [sum(1 for q in qs if q["theme_num"] == t) for t in (1, 2, 3, 4)] == [15, 25, 10, 50]
    assert all(q["enonce"] and q["reponse"] is not None for q in qs)
    assert len({r489.qkey(q) for q in qs}) == 100
    for q in qs:
        if q.get("illustration"):
            assert (r489.BASE / "images" / q["illustration"]).exists()


def test_reponses_conformes_au_corrige_officiel():
    lettre = lambda qs, t: "".join("V" if q["reponse"] else "F" for q in qs if q["theme_num"] == t)  # noqa: E731
    assert lettre(r489.official_questions("1"), 1) == G1_T1
    assert lettre(r489.official_questions("5"), 3) == G5_T3


def test_enonces_et_illustrations():
    g1 = {r489.qkey(q): q for q in r489.official_questions("1")}
    assert g1["t1_1"]["enonce"] == "Le constructeur est responsable du maintien en état de conformité du chariot"
    assert g1["t2_11"]["enonce"] == "Le dispositif [D] est le vérin hydraulique de levage"
    assert g1["t2_11"]["illustration"] and g1["t1_6"]["illustration"]  # schéma hydraulique, pictogramme
    # Le tableau de charges n°1 sert aux questions 1 à 4 du thème 3.
    assert len({g1[f"t3_{n}"]["illustration"] for n in (1, 2, 3, 4)}) == 1
    assert g1["t1_2"]["points"] == 2 and g1["t1_3"]["points"] == 7


@pytest.mark.parametrize("mode", ["vierge", "corrige", "copie"])
def test_pdf_a_l_identique(mode):
    qs = r489.official_questions("2")
    reps = {r489.qkey(q): q["reponse"] for q in qs}
    reps["t1_1"] = not reps["t1_1"]
    res = {"bonnes": 99, "total": 100, "passed": True, "par_theme": {}}
    doc = fitz.open(stream=r489.pdf_bytes(r489.render("2", mode, {"candidat": "DUPONT Karim"}, reponses_candidat=reps, resultat=res)),
                    filetype="pdf")
    assert len(doc) == len(fitz.open(r489.BASE / "templates" / "grille_2.pdf"))
    text = doc[0].get_text()
    assert "TDL Formation" in text and "DUPONT Karim" in text and "VRAI" in text and "FAUX" in text
    # Le contenu officiel est repris tel quel.
    assert "EPREUVE THEORIQUE CACES® R.489 - [Grille 2]" in text
    drawn = len(doc[0].get_drawings())
    base = len(fitz.open(r489.BASE / "templates" / "grille_2.pdf")[0].get_drawings())
    # Vierge : seulement les pointillés des champs vides du bandeau ; sinon des croix en plus.
    assert (drawn > base + 4) == (mode != "vierge")


def test_correction_par_cases_vrai_faux():
    qs = r489.official_questions("3")
    reps = {r489.qkey(q): q["reponse"] for q in qs}
    reps["t4_1"] = not reps["t4_1"]   # une erreur
    reps["t2_3"] = None                # une non-réponse
    erreurs = [i for i, q in enumerate(qs, start=1)
               if reps.get(r489.qkey(q)) is None or reps[r489.qkey(q)] != q["reponse"]]
    r = score_theorie(qs, erreurs)
    assert r["bonnes"] == 98 and r["passed"]
    assert r["par_theme"]["technologie"]["bonnes"] == 24 and r["par_theme"]["exploitation"]["bonnes"] == 49


def test_examen_adequation_document_officiel():
    from services import caces_adequation_pdf as A
    keys = [c["key"] for c in A.checklist()]
    assert len(keys) == len(set(keys)) == 64
    # Catégorie 3 : surface, sol, pente, dévers, 3 charges standard, masquant, dépassant,
    # pour palettier, empilables, spécifique, camion + 3 documents (pas de case « palettier » en 3 sur le document).
    assert len(A.required_for(["3"])) == 14
    cases = ["cat_3"] + A.required_for(["3"])
    assert A.summary(cases) == {"categories": ["3"], "manquantes": []}
    assert A.summary(["cat_3", "doc_ce"])["manquantes"]
    doc = fitz.open(stream=A.render(cases, "Anas TESTEUR", "19/11/2026"), filetype="pdf")
    assert len(doc) == 1 and "Anas TESTEUR" in doc[0].get_text() and "19/11/2026" in doc[0].get_text()
    base = len(fitz.open(A.BASE / "templates" / "examen_adequation.pdf")[0].get_drawings())
    assert len(doc[0].get_drawings()) == base + len(cases)  # une coche par case


@pytest.mark.parametrize("category", ["1B", "3", "5"])
def test_fiche_pratique_officielle_remplie(category):
    from core.caces_grilles import grille_pratique, score_pratique
    from services import caces_pratique_pdf as P
    g = grille_pratique(category)
    notes = {f"0:{c['id']}": c["max"] for t in g["volets"][0]["themes"] for p in t["points"] for c in p["criteres"]}
    sc = score_pratique(category, notes)
    pdf = P.render(category, g, notes, sc, {"candidat": "DUPONT Karim", "date": "19/11/2026", "testeur": "Anas"}, {"T1": "4 min"})
    assert pdf, "la fiche doit correspondre au barème du code"
    text = fitz.open(stream=pdf, filetype="pdf")[0].get_text()
    assert "DUPONT Karim" in text and "100 / 100" in text and "ADMIS" in text and "4 min" in text
    assert P.render("2A", grille_pratique("2A"), {}, sc, {}) is None  # pas de fiche officielle : PDF générique
