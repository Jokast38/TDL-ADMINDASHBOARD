"""Calendrier type des stages de récupération de points (2026-11-12)."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.recup_calendar import jours_feries, sessions_recup  # noqa: E402


def test_paques_et_feries_mobiles():
    f = jours_feries(2027)
    assert f[date(2027, 3, 29)] == "Lundi de Pâques"
    assert f[date(2027, 5, 6)] == "Ascension"
    assert f[date(2027, 5, 17)] == "Lundi de Pentecôte"
    assert jours_feries(2028)[date(2028, 4, 17)] == "Lundi de Pâques"


def test_regles_2027():
    s = {x["date_debut"]: x for x in sessions_recup(2027)}
    # Semaine normale : lundi-mardi et vendredi-samedi.
    assert s[date(2027, 1, 4)]["date_fin"] == date(2027, 1, 5)
    assert s[date(2027, 1, 8)]["date_fin"] == date(2027, 1, 9)
    # Lundi férié : mercredi-jeudi, et pas de lundi-mardi.
    assert date(2027, 3, 29) not in s and s[date(2027, 3, 31)]["date_fin"] == date(2027, 4, 1)
    assert s[date(2027, 3, 31)]["note"]
    assert date(2027, 11, 1) not in s and date(2027, 11, 3) in s
    # Vendredi ou samedi férié : semaine suivante.
    assert date(2027, 1, 1) not in s            # vendredi 1er janvier
    assert date(2027, 4, 30) not in s           # samedi 1er mai
    assert date(2027, 12, 24) not in s          # samedi 25 décembre
    assert date(2027, 12, 31) not in s          # samedi 1er janvier 2028
    assert len(s) == 100
    assert all(d.year == 2027 for d in s)


def test_mercredi_jeudi_ferie_aussi():
    # Ascension (jeudi) + lundi férié la même semaine n'arrive pas en 2027 :
    # on vérifie que la règle « pas de session » s'applique bien.
    for year in range(2026, 2040):
        feries = jours_feries(year)
        for x in sessions_recup(year):
            assert x["date_debut"] not in feries and x["date_fin"] not in feries
