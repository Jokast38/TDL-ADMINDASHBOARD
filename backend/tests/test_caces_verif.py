"""Vérification publique d'un CACES par numéro + nom — voir
core/caces_verif.py."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.caces_verif import name_matches, normalize_numero


def test_numero_tel_qu_imprime_ou_saisi_librement():
    assert normalize_numero("C1B.000000000012") == "C1B.000000000012"
    assert normalize_numero(" c1b. 000000000012 ") == "C1B.000000000012"
    assert normalize_numero("C1B000000000012") == "C1B.000000000012"
    assert normalize_numero("1B-000000000012") == "C1B.000000000012"
    assert normalize_numero("C3.000000000007") == "C3.000000000007"


def test_numero_externe_compare_sans_ponctuation():
    assert normalize_numero("ab-123 45") == normalize_numero("AB12345")


def test_nom_sans_accents_ni_casse():
    assert name_matches("Karim BENALI", "benali")
    assert name_matches("Hélène Lefèvre", "LEFEVRE")
    assert name_matches("Jean De La Fontaine", "de la fontaine")


def test_nom_partiel_ou_vide_refuse():
    assert not name_matches("Karim BENALI", "ben")
    assert not name_matches("Karim BENALI", "")
    assert not name_matches("Karim BENALI", "Dupont")
