"""Tests du placement des formateurs et du rappel annuel sur une base simulée
en mémoire (aucune connexion réelle) — voir services/formateur_placement.py."""
import asyncio
import json
import os
import sys
from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import formateur_placement as fp
from services import staff_notify


def _matches(doc, query):
    for key, cond in query.items():
        if key == "$or":
            if not any(_matches(doc, q) for q in cond):
                return False
            continue
        value = doc.get(key)
        if isinstance(cond, dict):
            if "$in" in cond and not (value in cond["$in"]):
                return False
            if "$ne" in cond and value == cond["$ne"]:
                return False
            if "$gte" in cond and not (value is not None and value >= cond["$gte"]):
                return False
            if "$lt" in cond and not (value is not None and value < cond["$lt"]):
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

    def sort(self, field, direction):
        self.docs = sorted(self.docs, key=lambda d: d.get(field), reverse=direction < 0)
        return self

    async def to_list(self, _length):
        return [dict(d) for d in self.docs]


class _Result:
    def __init__(self, modified_count):
        self.modified_count = modified_count


class _Collection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query=None, _projection=None):
        return _Cursor([d for d in self.docs if _matches(d, query or {})])

    async def find_one(self, query, _projection=None):
        found = [d for d in self.docs if _matches(d, query)]
        return dict(found[0]) if found else None

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
                return _Result(1)
        if upsert:
            self.docs.append({**query, **update["$set"]})
        return _Result(0)


class _Db:
    def __init__(self):
        self.formations = _Collection([
            {"id": "f-permis", "category": "PERMIS"}, {"id": "f-caces", "category": "CACES"}, {"id": "f-ssiap", "category": "SSIAP"},
        ])
        self.stages = _Collection()
        self.users = _Collection()
        self.settings = _Collection()


TODAY = date(2026, 11, 2)
BAFM = {"id": "bafm", "name": "Alex Bafm", "titre": "Formateur BAFM", "role": "animateur", "active": True, "email": "bafm@test", "assigned_categories": ["PERMIS"]}
BAFM2 = {**BAFM, "id": "bafm2", "name": "Sam Bafm", "email": "bafm2@test"}
PSY = {"id": "psy", "name": "Lou Psy", "titre": "Psychologue", "role": "animateur", "active": True, "email": "psy@test", "assigned_categories": ["PERMIS"]}
SSIAP = {"id": "ssiap", "name": "Noa Ssiap", "titre": "Formateur SSIAP", "role": "animateur", "active": True, "email": "ssiap@test", "assigned_categories": ["SSIAP"]}


def _stage(sid, debut="2027-03-01", fin="2027-03-02", formation="f-permis", ids=None):
    return {"id": sid, "formation_id": formation, "formation_titre": sid, "date_debut": debut, "date_fin": fin,
            "statut": "planifie", "lieu_ville": "Epinay", "animateur_ids": ids if ids is not None else [], "animateur_id": None}


@pytest.fixture
def db(monkeypatch):
    fake = _Db()
    fake.users.docs = [dict(BAFM), dict(BAFM2), dict(PSY), dict(SSIAP)]

    async def _noop(*_a, **_k):
        return None

    monkeypatch.setattr(fp, "db", fake)
    monkeypatch.setattr(fp, "_today", lambda: TODAY)
    monkeypatch.setattr(fp, "regenerate_convention_pdf", _noop)
    monkeypatch.setattr(fp, "log_action", _noop)
    monkeypatch.setattr(fp, "send_push_to_users", _noop)
    monkeypatch.setattr(staff_notify, "db", fake)
    monkeypatch.setattr(staff_notify, "send_push_to_users", _noop)
    return fake


def _run(coro):
    return asyncio.run(coro)


def _status(coro):
    with pytest.raises(HTTPException) as exc:
        _run(coro)
    return exc.value.status_code


def test_le_formateur_voit_si_la_place_est_libre_jamais_qui_l_occupe(db):
    db.stages.docs = [_stage("s1", ids=["bafm2"])]
    planning = _run(fp.planning_for(PSY, 2027))
    session = planning["sessions"][0]
    assert session["places"] == {"BAFM": False, "PSY": True}
    assert session["peut_choisir"]
    dump = json.dumps(planning)
    assert "bafm2" not in dump and "Sam Bafm" not in dump and "animateur" not in dump


def test_placement_ecrit_dans_la_session_comme_un_agent(db):
    db.stages.docs = [_stage("s1")]
    _run(fp.place_formateur(BAFM, "s1"))
    assert db.stages.docs[0]["animateur_ids"] == ["bafm"]
    assert db.stages.docs[0]["animateur_id"] == "bafm"


def test_bafm_et_psy_se_placent_ensemble_mais_pas_deux_bafm(db):
    db.stages.docs = [_stage("s1")]
    _run(fp.place_formateur(BAFM, "s1"))
    assert _status(fp.place_formateur(BAFM2, "s1")) == 409
    _run(fp.place_formateur(PSY, "s1"))
    assert db.stages.docs[0]["animateur_ids"] == ["bafm", "psy"]


def test_deux_formateurs_en_meme_temps_le_second_ne_prend_pas_la_place(db):
    db.stages.docs = [_stage("s1")]
    perime = dict(db.stages.docs[0])
    db.stages.docs[0]["animateur_ids"] = ["bafm"]
    assert _status(fp._write_team(perime, ["bafm2"], "pris")) == 409
    assert db.stages.docs[0]["animateur_ids"] == ["bafm"]


def test_quota_bloque_le_formateur_mais_pas_au_dela_de_sa_limite(db):
    db.stages.docs = [_stage("s1"), _stage("s2", "2027-04-01", "2027-04-02")]
    limite = {**BAFM, "quota_jours_annuel": 2}
    _run(fp.place_formateur(limite, "s1"))
    assert not _run(fp.planning_for(limite, 2027))["sessions"][1]["peut_choisir"]
    assert _status(fp.place_formateur(limite, "s2")) == 409


def test_session_placee_par_un_agent_au_dela_du_quota_reste_comptee(db):
    db.stages.docs = [_stage("s1", ids=["bafm"]), _stage("s2", "2027-04-01", "2027-04-02", ids=["bafm"])]
    planning = _run(fp.planning_for({**BAFM, "quota_jours_annuel": 2}, 2027))
    assert planning["jours_places"] == 4


def test_pas_deux_sessions_aux_memes_dates(db):
    db.stages.docs = [_stage("s1"), _stage("s2", "2027-03-02", "2027-03-03")]
    _run(fp.place_formateur(BAFM, "s1"))
    assert _status(fp.place_formateur(BAFM, "s2")) == 409


def test_formation_hors_de_ses_types(db):
    db.stages.docs = [_stage("s1", formation="f-ssiap")]
    assert _run(fp.planning_for(BAFM, 2027))["sessions"] == []
    assert _status(fp.place_formateur(BAFM, "s1")) == 403


def test_session_commencee_ou_annulee(db):
    db.stages.docs = [_stage("passee", "2026-10-01", "2026-10-02"), {**_stage("annulee"), "statut": "annule"}]
    assert _status(fp.place_formateur(BAFM, "passee")) == 400
    assert _status(fp.place_formateur(BAFM, "annulee")) == 404


def test_retrait_possible_seulement_avant_la_date_limite(db, monkeypatch):
    db.stages.docs = [_stage("s1", ids=["bafm"])]
    monkeypatch.setattr(fp, "_today", lambda: date(2026, 12, 1))
    assert _status(fp.retirer_formateur(BAFM, "s1")) == 403
    monkeypatch.setattr(fp, "_today", lambda: date(2026, 11, 30))
    _run(fp.retirer_formateur(BAFM, "s1"))
    assert db.stages.docs[0]["animateur_ids"] == []


def _capture_emails(monkeypatch):
    sent = []

    async def _send(to, subject, body, *_a, **_k):
        sent.append((to, subject))

    monkeypatch.setattr(staff_notify, "send_email", _send)
    return sent


def _freeze_notify(monkeypatch, day):
    class _Datetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)

    monkeypatch.setattr(staff_notify, "datetime", _Datetime)


def test_rappel_uniquement_a_ceux_sans_date_et_recap_aux_agents(db, monkeypatch):
    sent = _capture_emails(monkeypatch)
    _freeze_notify(monkeypatch, TODAY)
    db.users.docs.append({"id": "agent", "role": "agent_admin", "active": True, "email": "agent@test"})
    db.stages.docs = [_stage("s1", ids=["bafm"]), _stage("s2", "2027-04-01", "2027-04-02")]
    assert _run(staff_notify.send_formateur_planning_reminders()) == 2
    destinataires = {to for to, _ in sent}
    assert destinataires == {"bafm2@test", "psy@test", "agent@test"}


def test_pas_de_rappel_sans_date_ouverte_ni_deux_fois_la_meme_semaine(db, monkeypatch):
    sent = _capture_emails(monkeypatch)
    _freeze_notify(monkeypatch, TODAY)
    assert _run(staff_notify.send_formateur_planning_reminders()) == 0
    assert sent == []
    db.stages.docs = [_stage("s1")]
    assert _run(staff_notify.send_formateur_planning_reminders()) > 0
    nb = len(sent)
    assert _run(staff_notify.send_formateur_planning_reminders()) == 0
    assert len(sent) == nb


def test_pas_de_rappel_apres_le_30_novembre(db, monkeypatch):
    sent = _capture_emails(monkeypatch)
    _freeze_notify(monkeypatch, date(2026, 12, 1))
    db.stages.docs = [_stage("s1", "2027-03-01", "2027-03-02")]
    assert _run(staff_notify.send_formateur_planning_reminders()) == 0
    assert sent == []
