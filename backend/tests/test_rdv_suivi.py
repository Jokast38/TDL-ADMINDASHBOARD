"""Suivi des rendez-vous du CRM (cahier des charges du 2026-11-10) : créneaux,
statut « Retour à renseigner » et critère de validation de la notification
« Rendez-vous sans retour »."""
import asyncio
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from core import rdv_suivi  # noqa: E402
from core.rdv_suivi import PARIS  # noqa: E402
from services import staff_notify  # noqa: E402

JEUDI = date(2026, 11, 12)
# Jeudi 14h30 à Paris, enregistré en UTC comme le fait le dashboard.
RDV = {"id": "r1", "lead_name": "Karim", "commercial_id": "a1", "commercial_name": "Agent",
       "status": "planifie", "scheduled_at": "2026-11-12T13:30:00.000Z"}


def at(day, hhmm):
    h, m = map(int, hhmm.split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=PARIS)


def test_creneaux_30_min_9h_18h_lundi_samedi():
    s = rdv_suivi.creneaux(JEUDI, [RDV], at(JEUDI, "08:00"))
    assert len(s) == 18 and s[0]["heure"] == "09:00" and s[-1]["heure"] == "17:30"
    pris = [c["heure"] for c in s if c["pris"]]
    assert pris == ["14:30"]
    assert rdv_suivi.creneaux(date(2026, 11, 15), [], at(JEUDI, "08:00")) == []  # dimanche
    # Créneaux déjà passés : non proposés.
    assert not next(c for c in rdv_suivi.creneaux(JEUDI, [], at(JEUDI, "10:10")) if c["heure"] == "10:00")["disponible"]


def test_conflit_a_la_confirmation():
    assert rdv_suivi.en_conflit("2026-11-12T13:30:00.000Z", [RDV])
    assert rdv_suivi.en_conflit("2026-11-12T14:45:00+01:00", [RDV])  # chevauche 14h30-15h
    assert not rdv_suivi.en_conflit("2026-11-12T15:00:00+01:00", [RDV])
    assert not rdv_suivi.en_conflit("2026-11-12T13:30:00.000Z", [RDV], exclude_id="r1")


def test_statut_retour_a_renseigner():
    assert rdv_suivi.statut_suivi(RDV, at(JEUDI, "14:45")) == "planifie"
    assert rdv_suivi.statut_suivi(RDV, at(JEUDI, "15:00")) == "retour_a_renseigner"
    assert rdv_suivi.statut_suivi({**RDV, "status": "effectue"}, at(JEUDI, "18:00")) == "effectue"


class _Coll:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query, _proj=None):
        docs = [d for d in self.docs if all(d.get(k) == v or (isinstance(v, dict) and d.get(k) in v.get("$in", [])) for k, v in query.items())]

        class C:
            async def to_list(self, _n):
                return [dict(d) for d in docs]
        return C()

    async def find_one(self, query, _proj=None):
        return next((dict(d) for d in self.docs if all(d.get(k) == v for k, v in query.items())), None)

    async def update_one(self, query, update):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update["$set"])


class _Db:
    def __init__(self, appts):
        self.call_appointments = _Coll(appts)
        self.users = _Coll([
            {"id": "a1", "email": "agent@tdl.fr", "name": "Agent", "role": "agent_telephonique", "active": True},
            {"id": "m1", "email": "chef@tdl.fr", "name": "Chef", "role": "responsable_admission", "active": True},
        ])


def _run(monkeypatch, appts, now):
    sent, pushes = [], []

    async def email(to, subject, *_a, **_k):
        sent.append((to, subject))

    async def push(ids, *_a, **_k):
        pushes.append(ids)
    db = _Db(appts)
    monkeypatch.setattr(staff_notify, "db", db)
    monkeypatch.setattr(staff_notify, "send_email", email)
    monkeypatch.setattr(staff_notify, "send_push_to_users", push)
    n = asyncio.run(staff_notify.send_rdv_sans_retour_notifications(now))
    return n, sent, db


def test_critere_de_validation(monkeypatch):
    vendredi = date(2026, 11, 13)
    # Résultat saisi avant le contrôle du vendredi matin : rien.
    n, sent, _ = _run(monkeypatch, [{**RDV, "status": "effectue"}], at(vendredi, "09:00"))
    assert n == 0 and not sent
    # Vendredi 8h : pas encore l'heure.
    n, sent, _ = _run(monkeypatch, [dict(RDV)], at(vendredi, "08:45"))
    assert n == 0
    # Retour manquant : notification à 9h, à la personne assignée + responsables.
    appts = [dict(RDV)]
    n, sent, db = _run(monkeypatch, appts, at(vendredi, "09:00"))
    assert n == 1 and {to for to, _ in sent} == {"agent@tdl.fr", "chef@tdl.fr"}
    # Une seule fois.
    n, sent, _ = _run(monkeypatch, appts, at(vendredi, "09:15"))
    assert n == 0 and not sent
    # Jeudi même : jamais le jour du RDV.
    n, _, _ = _run(monkeypatch, [dict(RDV)], at(JEUDI, "19:00"))
    assert n == 0


def test_qualification_rdv_pris():
    from services.lead_migration import map_legacy_status, statut_to_qualification
    assert map_legacy_status("rdv_pris")["statut"] == "rendez_vous"
    assert statut_to_qualification({"statut": "rendez_vous"}) == "rdv_pris"


def test_rdv_qualifie_le_prospect_sans_retrograder(monkeypatch):
    from routers import call_center

    class Coll:
        def __init__(self, docs):
            self.docs = docs

        async def find_one(self, q, _p=None):
            return next((dict(d) for d in self.docs if d["id"] == q["id"]), None)

        async def update_one(self, q, u):
            for d in self.docs:
                if d["id"] == q["id"]:
                    d.update(u["$set"])

    class Db:
        leads = Coll([{"id": "l1", "statut": "a_contacter"}, {"id": "l2", "statut": "paye"}])
        meta_lead_imports = Coll([{"id": "m1", "qualification": "interesse"}])

    async def noop(*_a, **_k):
        return None
    monkeypatch.setattr(call_center, "db", Db)
    monkeypatch.setattr(call_center, "log_action", noop)
    user = {"id": "a1", "name": "Agent"}
    for lid in ("l1", "l2", "m1"):
        asyncio.run(call_center._qualifier_rdv_pris(lid, user))
    assert Db.leads.docs[0]["statut"] == "rendez_vous" and Db.leads.docs[0]["qualified_by"] == "a1"
    assert Db.leads.docs[1]["statut"] == "paye"
    assert Db.meta_lead_imports.docs[0]["qualification"] == "rdv_pris"
