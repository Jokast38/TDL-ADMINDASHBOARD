"""Suivi des prospects, classement de l'équipe, rapprochement Meta /
inscriptions sur place et rappels téléphoniques (demande du 2026-11-24)."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import suivi_prospects as sp  # noqa: E402
from services import meta_rapprochement as mr  # noqa: E402
import routers.call_center as cc  # noqa: E402
from models.call_appointment import RappelTentativeIn  # noqa: E402


def e(action, user, lead, at, target="lead", **meta):
    return {"action": action, "user_id": user, "user_name": user.title(), "target_id": lead,
            "target_type": target, "at": at, "meta": meta}


JOURNAL = [
    e("lead_note", "sarah", "L1", "2026-11-23T09:00:00+00:00", note="Pas dispo"),
    e("lead_qualifie", "sarah", "L1", "2026-11-23T09:01:00+00:00", qualification="a_relancer"),
    e("lead_note", "karim", "L1", "2026-11-24T10:00:00+00:00", note="Rappel OK"),
    e("rdv_appel_cree", "karim", "L1", "2026-11-24T10:02:00+00:00"),
    e("lead_note", "karim", "L2", "2026-11-24T11:00:00+00:00", target="meta_lead"),
    e("lead_note", "karim", "L2", "2026-11-24T23:30:00+00:00", target="meta_lead"),  # 00h30 à Paris : jour suivant
    e("inscription_creee", "karim", "I1", "2026-11-24T12:00:00+00:00", target="inscription"),  # pas un traitement de prospect
]


def test_contacts_numerotes_une_personne_un_jour():
    contacts = sp.contacts_from_entries([x for x in JOURNAL if x["target_id"] == "L1"])
    assert [(c["numero"], c["by_name"], c["jour"], len(c["actions"])) for c in contacts] == [
        (1, "Sarah", "2026-11-23", 2), (2, "Karim", "2026-11-24", 2)]
    assert contacts[0]["actions"][0]["detail"] == "Pas dispo"


def test_classement_par_leads_traites_et_par_jour():
    res = sp.classement_from_entries(JOURNAL)
    karim, sarah = res["classement"]
    assert (karim["user_name"], karim["rang"], karim["leads_traites"], karim["notes"], karim["rdv"]) == ("Karim", 1, 3, 3, 1)
    assert [(d["jour"], d["leads_traites"]) for d in karim["par_jour"]] == [("2026-11-25", 1), ("2026-11-24", 2)]
    assert (sarah["leads_traites"], sarah["qualifications"], sarah["moyenne_par_jour"]) == (1, 1, 1.0)


def test_rapprochement_meta_par_email_ou_telephone_et_anteriorite():
    prospects = [
        {"id": "M1", "email": "Ali@Mail.fr", "phone": "+33 6 12 34 56 78", "created_at": "2026-11-01T10:00:00+00:00", "_collection": "leads"},
        {"id": "M2", "email": "tard@mail.fr", "phone": "", "created_at": "2026-11-20T10:00:00+00:00", "_collection": "leads"},
    ]
    idx = mr._index(prospects)
    sur_place = {"student_email": "autre@mail.fr", "student_phone": "06.12.34.56.78", "created_at": "2026-11-10T10:00:00+00:00"}
    assert mr.match(sur_place, *idx)["id"] == "M1"
    assert mr.match({"student_email": "ali@mail.fr", "created_at": "2026-11-10T10:00:00+00:00"}, *idx)["id"] == "M1"
    # Formulaire Meta rempli après l'inscription : l'origine ne change pas.
    assert mr.match({"student_email": "tard@mail.fr", "created_at": "2026-11-10T10:00:00+00:00"}, *idx) is None
    assert mr.norm_phone("+33 (0)6 12 34 56 78") == "612345678"


class _Coll:
    def __init__(self, docs=None):
        self.docs = docs or []

    async def find_one(self, q, _p=None):
        return next((dict(d) for d in self.docs if all(d.get(k) == v for k, v in q.items())), None)

    async def update_one(self, q, upd):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items()):
                d.update(upd.get("$set", {}))
                for k, v in upd.get("$push", {}).items():
                    items = v["$each"] if isinstance(v, dict) and "$each" in v else [v]
                    d.setdefault(k, []).extend(items)
                for k, v in upd.get("$inc", {}).items():
                    d[k] = (d.get(k) or 0) + v

                class R:
                    matched_count = 1
                return R()

        class R0:
            matched_count = 0
        return R0()


def test_tentatives_de_rappel_et_historique_du_prospect(monkeypatch):
    class Db:
        callback_requests = _Coll([{"id": "R1", "prenom": "Ali", "nom": "B", "telephone": "0612345678",
                                    "lead_id": "L1", "handled": False, "statut": "a_rappeler", "tentatives": []}])
        leads = _Coll([{"id": "L1", "name": "Ali B"}])
        meta_lead_imports = _Coll()

    logs = []

    async def log(user, action, *a, **k):
        logs.append(action)

    monkeypatch.setattr(cc, "db", Db)
    monkeypatch.setattr(cc, "log_action", log)
    import routers.leads as lr
    monkeypatch.setattr(lr, "_leads_cache_clear", lambda: None)
    user = {"id": "u1", "name": "Sarah", "role": "commercial"}

    r = asyncio.run(cc.add_rappel_tentative("R1", RappelTentativeIn(resultat="messagerie", note="Message laissé"), user))
    assert (r["statut"], r["nb_tentatives"], r["handled"]) == ("en_cours", 1, False)
    r = asyncio.run(cc.add_rappel_tentative("R1", RappelTentativeIn(resultat="joint"), user))
    assert (r["statut"], r["nb_tentatives"], r["handled"], r["handled_by_name"]) == ("traite", 2, True, "Sarah")
    lead = Db.leads.docs[0]
    assert lead["relance_count"] == 2 and "Message laissé" in lead["notes_history"][0]["text"]
    assert logs == ["rappel_tentative", "rappel_tentative", "rappel_traite"]


def test_statut_des_anciennes_demandes_de_rappel():
    assert cc.rappel_statut({"handled": True}) == "traite"
    assert cc.rappel_statut({}) == "a_rappeler"
