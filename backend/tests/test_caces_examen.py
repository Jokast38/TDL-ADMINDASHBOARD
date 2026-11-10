"""Épreuves CACES R.489 (demande du 2026-11-10) : barèmes de l'annexe 3,
règles de réussite et lecture des fichiers de questions importés."""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from core.caces_grilles import (  # noqa: E402
    answer_from_label, grille_pratique, score_pratique, score_theorie, theme_from_label,
)
from models.caces import CACES_CATEGORIES  # noqa: E402

# Barème des thèmes de chaque grille pratique (annexe A3/2).
ATTENDU = {
    "1A": [10, 20, 55, 15], "1B": [10, 20, 55, 15], "2A": [10, 40, 35, 15], "2B": [10, 40, 35, 15],
    "3": [10, 20, 55, 15], "4": [10, 20, 55, 15], "5": [10, 20, 55, 15], "6": [10, 30, 45, 15], "7": [10, 40, 35, 15],
}


def _full(category):
    g = grille_pratique(category)
    return {f"{vi}:{c['id']}": c["max"] for vi, v in enumerate(g["volets"])
            for t in v["themes"] for p in t["points"] for c in p["criteres"]}


@pytest.mark.parametrize("category", CACES_CATEGORIES)
def test_grilles_pratiques_conformes_a_l_annexe(category):
    g = grille_pratique(category)
    for volet in g["volets"]:
        assert [t["max"] for t in volet["themes"]] == ATTENDU[category]
    assert len(g["volets"]) == (2 if category == "7" else 1)
    assert score_pratique(category, _full(category))["passed"]


def test_pratique_point_a_zero_fait_echouer():
    notes = _full("3")
    notes["0:4.1"] = 0  # plan incliné : seul critère du point 4
    s = score_pratique("3", notes)
    assert s["total"] == 96 and not s["passed"] and s["volets"][0]["points_a_zero"] == [4]


def test_pratique_theme_sous_la_moyenne_fait_echouer():
    notes = _full("1B")
    for k in ("0:2.1", "0:3.1"):  # conduite : 0/20 -> point à zéro aussi
        notes[k] = 0
    assert not score_pratique("1B", notes)["passed"]


def test_pratique_categorie_7_les_deux_chariots():
    notes = _full("7")
    notes = {k: v for k, v in notes.items() if k.startswith("0:")}
    assert not score_pratique("7", notes)["passed"]


def test_pratique_note_hors_bareme_refusee():
    with pytest.raises(ValueError):
        score_pratique("3", {"0:1.1": 5})


def _questions():
    themes = ["generales"] * 15 + ["technologie"] * 25 + ["abaque"] * 10 + ["exploitation"] * 50
    return [{"theme": t, "enonce": "x", "reponse": True} for t in themes]


def test_theorie_seuils():
    qs = _questions()
    assert score_theorie(qs, list(range(1, 31)))["passed"] is False  # 70 % mais généralités à 0
    ok = score_theorie(qs, list(range(41, 71)))  # 30 erreurs en exploitation : 70 %, exploitation 40 %
    assert ok["pct"] == 70 and not ok["passed"]
    r = score_theorie(qs, [1, 2, 16, 41, 60])
    assert r["pct"] == 95 and r["passed"] and r["par_theme"]["generales"]["bonnes"] == 13


def test_lecture_import():
    assert theme_from_label("Connaissances générales") == "generales"
    assert theme_from_label("Tableau / abaque de charges") == "abaque"
    assert theme_from_label("Exploitation des chariots") == "exploitation"
    assert theme_from_label("2") == "technologie"
    assert theme_from_label("cuisine") is None
    assert answer_from_label("Vrai") is True and answer_from_label("f") is False and answer_from_label("?") is None
