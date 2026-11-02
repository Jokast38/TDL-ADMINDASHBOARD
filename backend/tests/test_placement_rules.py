"""Tests unitaires des règles de placement des formateurs, sans accès base —
voir core/placement_rules.py."""
import sys
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.placement_rules import (
    formateur_is_permis, place_for, places_occupees, places_of_category, planning_deadline,
    planning_year, quota_depasse, reminder_window_open, stage_nb_jours, stages_overlap,
)


def _stage(debut, fin):
    return {"date_debut": debut, "date_fin": fin}


def test_recuperation_de_points_a_une_place_bafm_et_une_place_psy():
    assert places_of_category("PERMIS") == ("BAFM", "PSY")
    assert place_for("Formateur BAFM", "PERMIS") == "BAFM"
    assert place_for("Psychologue", "PERMIS") == "PSY"


def test_titre_vide_vaut_bafm_comme_la_convention():
    assert place_for(None, "PERMIS") == "BAFM"


def test_caces_a_une_place_formateur_et_une_place_testeur():
    assert places_of_category("CACES") == ("FORMATEUR", "TESTEUR")
    assert place_for("Testeur CACES", "CACES") == "TESTEUR"
    assert place_for("Formateur CACES", "CACES") == "FORMATEUR"


def test_autres_formations_une_seule_place():
    assert places_of_category("SSIAP") == ("FORMATEUR",)
    assert place_for("Formateur SSIAP", "SSIAP") == "FORMATEUR"


def test_un_bafm_n_occupe_pas_la_place_psy():
    assert "PSY" not in places_occupees(["Formateur BAFM"], "PERMIS")
    assert places_occupees(["Formateur BAFM", "Psychologue"], "PERMIS") == {"BAFM", "PSY"}


def test_ancien_formateur_sans_type_reste_en_recuperation_de_points():
    assert formateur_is_permis({"assigned_categories": []})
    assert formateur_is_permis({"assigned_categories": ["PERMIS", "SSIAP"]})
    assert not formateur_is_permis({"assigned_categories": ["SSIAP"]})


def test_nombre_de_jours_d_une_session():
    assert stage_nb_jours(_stage("2027-03-01", "2027-03-02")) == 2
    assert stage_nb_jours(_stage("2027-03-01", "2027-03-01")) == 1
    assert stage_nb_jours({}) == 1


def test_chevauchement_de_sessions():
    assert stages_overlap(_stage("2027-03-01", "2027-03-02"), _stage("2027-03-02", "2027-03-03"))
    assert not stages_overlap(_stage("2027-03-01", "2027-03-02"), _stage("2027-03-03", "2027-03-04"))


def test_quota():
    assert not quota_depasse(38, 2, 40)
    assert quota_depasse(39, 2, 40)
    assert not quota_depasse(500, 2, None)
    assert quota_depasse(0, 2, 0)


def test_date_limite_30_novembre_de_l_annee_precedente():
    assert planning_year(date(2026, 11, 2)) == 2027
    assert planning_deadline(2027) == date(2026, 11, 30)


def test_periode_de_rappel():
    assert not reminder_window_open(date(2026, 7, 31))
    assert reminder_window_open(date(2026, 8, 1))
    assert reminder_window_open(date(2026, 11, 30))
    assert not reminder_window_open(date(2026, 12, 1))
    assert not reminder_window_open(date(2027, 1, 15))
