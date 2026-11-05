"""Accès formateur aux sessions (core/session_access.py) : fermée par défaut,
ouverte le jour même par un agent ou automatiquement à 9h30, fermée à 16h45
(heure de Paris)."""
import os
import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from fastapi import HTTPException  # noqa: E402

from core.session_access import PARIS, access_status  # noqa: E402
import routers.stages as stages_router  # noqa: E402

STAGE = {"id": "s1", "date_debut": "2026-11-09", "date_fin": "2026-11-10", "statut": "planifie", "animateur_ids": ["f1"]}


def at(day: str, hhmm: str) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return datetime.fromisoformat(day).replace(hour=h, minute=m, tzinfo=PARIS)


def test_fermee_avant_et_apres_les_jours_de_session():
    assert access_status(STAGE, at("2026-11-08", "10:00"))["raison"] == "pas_le_jour"
    assert access_status(STAGE, at("2026-11-11", "10:00"))["raison"] == "terminee"
    assert not access_status({**STAGE, "statut": "annule"}, at("2026-11-09", "10:00"))["ouvert"]


def test_ouverture_automatique_a_9h30_et_fermeture_a_16h45():
    assert access_status(STAGE, at("2026-11-09", "09:29"))["raison"] == "en_attente"
    assert access_status(STAGE, at("2026-11-09", "09:30"))["raison"] == "ouverte_auto"
    assert access_status(STAGE, at("2026-11-10", "16:44"))["ouvert"]
    assert access_status(STAGE, at("2026-11-10", "16:45"))["raison"] == "fermee_auto"


def test_ouverture_et_fermeture_par_un_agent_le_jour_meme():
    ouverte = {**STAGE, "acces": {"2026-11-09": {"ouvert_at": at("2026-11-09", "08:10").isoformat(), "ouvert_par": "Lina"}}}
    assert access_status(ouverte, at("2026-11-09", "08:15"))["raison"] == "ouverte_agent"
    # L'ouverture d'un jour ne vaut pas pour le lendemain.
    assert access_status(ouverte, at("2026-11-10", "08:15"))["raison"] == "en_attente"
    # Une ouverture manuelle ne dépasse pas 16h45.
    assert access_status(ouverte, at("2026-11-09", "17:00"))["raison"] == "fermee_auto"

    fermee = {**STAGE, "acces": {"2026-11-09": {"ferme_at": at("2026-11-09", "11:00").isoformat()}}}
    # Fermée par un agent : l'ouverture automatique de 9h30 ne la rouvre pas.
    assert access_status(fermee, at("2026-11-09", "11:30"))["raison"] == "fermee_agent"
    rouverte = {**STAGE, "acces": {"2026-11-09": {"ferme_at": at("2026-11-09", "11:00").isoformat(),
                                                   "ouvert_at": at("2026-11-09", "12:00").isoformat()}}}
    assert access_status(rouverte, at("2026-11-09", "12:30"))["ouvert"]


def test_le_formateur_est_bloque_quand_la_session_est_fermee(monkeypatch):
    formateur = {"id": "f1", "role": "animateur"}
    monkeypatch.setattr(stages_router, "access_status", lambda s: access_status(s, at("2026-11-09", "08:00")))
    with pytest.raises(HTTPException) as e:
        stages_router.require_formateur_access(formateur, STAGE, "2026-11-09")
    assert e.value.status_code == 403 and "fermée" in e.value.detail

    monkeypatch.setattr(stages_router, "access_status", lambda s: access_status(s, at("2026-11-09", "10:00")))
    stages_router.require_formateur_access(formateur, STAGE, "2026-11-09")  # ouverte : passe
    with pytest.raises(HTTPException):
        stages_router.require_formateur_access(formateur, STAGE, "2026-11-10")  # pas le jour en cours
    with pytest.raises(HTTPException):
        stages_router.require_formateur_access({"id": "autre", "role": "animateur"}, STAGE, "2026-11-09")
    # L'équipe TDL n'est jamais bloquée.
    monkeypatch.setattr(stages_router, "access_status", lambda s: access_status(s, at("2026-11-09", "20:00")))
    stages_router.require_formateur_access({"id": "a", "role": "admin"}, STAGE, "2026-11-10")


def test_l_apprenant_ne_peut_plus_signer_une_fois_la_session_fermee(monkeypatch):
    import routers.emargements as em
    monkeypatch.setattr(em, "access_status", lambda s: access_status(s, at("2026-11-09", "11:00")))
    assert em._signable(STAGE, "2026-11-09")            # ouverte (9h30 passé), jour en cours
    assert not em._signable(STAGE, "2026-11-10")        # demande pour un autre jour
    monkeypatch.setattr(em, "access_status", lambda s: access_status(s, at("2026-11-09", "16:50")))
    assert not em._signable(STAGE, "2026-11-09")        # fermée à 16h45 : trop tard
    fermee = {**STAGE, "acces": {"2026-11-09": {"ferme_at": at("2026-11-09", "10:00").isoformat()}}}
    monkeypatch.setattr(em, "access_status", lambda s: access_status(s, at("2026-11-09", "11:00")))
    assert not em._signable(fermee, "2026-11-09")       # fermée par un agent
