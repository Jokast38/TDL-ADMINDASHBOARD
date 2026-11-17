"""Qualification des prospects par SMS (2026-11-17) sur une base simulée en
mémoire — voir services/sms_qualification.py."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import sms_campaigns, sms_qualification as q, smsgate, staff_notify
import routers.leads as leads_router


def _get(doc, key):
    for part in key.split("."):
        doc = (doc or {}).get(part) if isinstance(doc, dict) else None
    return doc


def _matches(doc, query):
    for key, cond in query.items():
        value = _get(doc, key)
        if isinstance(cond, dict):
            if "$in" in cond and value not in cond["$in"]:
                return False
        elif value != cond:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, field, direction):
        self.docs = sorted(self.docs, key=lambda d: d.get(field) or "", reverse=direction < 0)
        return self

    async def to_list(self, _n):
        return [dict(d) for d in self.docs]


class _Collection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query=None, _p=None):
        return _Cursor([d for d in self.docs if _matches(d, query or {})])

    async def find_one(self, query, _p=None):
        found = [d for d in self.docs if _matches(d, query)]
        return dict(found[0]) if found else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
                return


class _Db:
    def __init__(self):
        self.leads = _Collection([{"id": "L1", "name": "Karim Test", "phone": "0612345678", "statut": "a_contacter", "notes": ""}])
        self.settings = _Collection([{"id": "global"}])
        for name in ("sms_conversations", "sms_campaigns", "sms_logs", "sms_inbound", "sms_optouts", "callback_requests"):
            setattr(self, name, _Collection())


PHONE = "+33612345678"


def _setup(monkeypatch):
    fake = _Db()
    for mod in (q, sms_campaigns):
        monkeypatch.setattr(mod, "db", fake)
    sent, notified = [], []

    async def _cfg():
        return {"mode": "dispatcher"}

    async def _send(cfg, msg_id, phone, text):
        sent.append((phone, text))
        return {"id": msg_id}

    async def _notify(**kw):
        notified.append(kw)

    monkeypatch.setattr(smsgate, "gateway_config", _cfg)
    monkeypatch.setattr(smsgate, "send", _send)
    monkeypatch.setattr(staff_notify, "notify_new_contact", _notify)
    monkeypatch.setattr(leads_router, "_leads_cache_clear", lambda: None)
    campaign = {"id": "C1", "scenario_key": "vtc", "scenario": q.DEFAULT_SCENARIOS["vtc"]}
    fake.sms_campaigns.docs.append(dict(campaign))
    asyncio.run(q.start_conversation(campaign, {"lead_id": "L1", "phone": PHONE, "prenom": "Karim"}))
    return fake, sent, notified


def _reply(text):
    return asyncio.run(sms_campaigns.handle_inbound("06 12 34 56 78", text))


def test_reconnaissance_des_reponses():
    step = q.DEFAULT_SCENARIOS["vtc"]["steps"][1]
    assert q.match_option(step, " Oui ! ") == "oui"
    assert q.match_option(step, "ok merci") == "oui"
    assert q.match_option(step, "Non merci") == "non"
    assert q.match_option(step, "plus intéressé") == "non"
    assert q.match_option(step, "toujours pas") is None
    assert q.match_option(q.DEFAULT_SCENARIOS["vtc"]["steps"][0], "j'ai le 2 et le 3") is None


def test_parcours_complet_qualifie_et_alerte_equipe(monkeypatch):
    fake, sent, notified = _setup(monkeypatch)
    assert _reply("1")
    assert "toujours intéressé" in sent[-1][1]
    assert _reply("OUI")
    lead = fake.leads.docs[0]
    assert lead["sms_qualification"]["status"] == "qualifie"
    assert [a["label"] for a in lead["sms_qualification"]["answers"]] == ["CPF + compte CMA", "Toujours intéressé"]
    assert (lead["statut"], lead["chaleur"]) == ("a_relancer", "chaud")
    assert "Qualification SMS" in lead["notes"]
    cb = fake.callback_requests.docs[0]
    assert cb["telephone"] == PHONE and cb["handled"] is False and cb["interest"] == "VTC_TAXI"
    assert notified and "à rappeler" in notified[0]["push_title"]
    assert q.WHATSAPP_LINK in sent[-1][1] and q.CONTACT_PHONE in sent[-1][1]
    assert fake.sms_conversations.docs[0]["status"] == "qualifie"
    assert len(fake.sms_inbound.docs) == 2


def test_refus_classe_non_interesse_sans_alerte(monkeypatch):
    fake, sent, notified = _setup(monkeypatch)
    _reply("3")
    _reply("non")
    lead = fake.leads.docs[0]
    assert (lead["statut"], lead["motif_cloture"]) == ("non_interesse", "plus_interesse")
    assert not notified and not fake.callback_requests.docs
    assert "ne vous relancerons plus" in sent[-1][1]


def test_reponse_incomprise_deux_fois_transmise_a_l_equipe(monkeypatch):
    fake, sent, notified = _setup(monkeypatch)
    _reply("c'est combien ?")
    assert "pas compris" in sent[-1][1]
    _reply("je veux juste le prix")
    assert fake.sms_conversations.docs[0]["status"] == "a_rappeler"
    assert "je veux juste le prix" in fake.callback_requests.docs[0]["message"]
    assert notified


def test_stop_ferme_la_conversation_et_exclut_le_numero(monkeypatch):
    fake, sent, notified = _setup(monkeypatch)
    _reply("STOP")
    assert fake.sms_conversations.docs[0]["status"] == "stop"
    assert fake.sms_optouts.docs[0]["phone"] == PHONE
    assert not sent and not notified


def test_fiche_inscrite_jamais_declassee(monkeypatch):
    fake, sent, notified = _setup(monkeypatch)
    fake.leads.docs[0]["statut"] = "paye"
    _reply("2")
    _reply("non")
    assert fake.leads.docs[0]["statut"] == "paye"


def test_reponses_automatiques_desactivees_rien_ne_repart(monkeypatch):
    fake, sent, notified = _setup(monkeypatch)
    fake.settings.docs[0]["sms_qualification_enabled"] = False
    _reply("1")
    assert not sent  # aucun SMS automatique
    assert fake.sms_conversations.docs[0]["status"] == "en_attente"
    assert notified and "Réponse SMS" in notified[0]["push_title"]  # l'équipe est quand même prévenue
    assert fake.sms_inbound.docs[0]["message"] == "1"


def test_scenarios_personnalises_remplacent_les_modeles(monkeypatch):
    fake = _Db()
    monkeypatch.setattr(q, "db", fake)
    assert set(asyncio.run(q.scenarios())) == {"vtc", "caces"}
    fake.settings.docs[0]["sms_scenarios"] = {"taxi": {"label": "Taxi", "actif": False, "steps": [], "final": "x", "refus": "y"}}
    assert set(asyncio.run(q.scenarios())) == {"taxi"}
    assert asyncio.run(q.scenarios(active_only=True)) == {}
    opts = q.build_options([{"code": "OUI", "label": "Intéressé"}, {"code": "Non", "label": "Pas intéressé", "fin": True}])
    assert opts["oui"]["keys"][0] == "oui" and "ok" in opts["oui"]["keys"] and opts["non"]["fin"] == "refus"


def test_caracteres_adaptes_pour_rester_a_160_par_sms():
    out = smsgate.gsm_safe("Répondez STOP pour arrêter · l\u2019offre « VTC » \u2026 🚗 Garçon é è à")
    assert out == "Répondez STOP pour arreter - l'offre \" VTC \" ...  Garcon é è à"
    assert all(c in smsgate.GSM7 or c in smsgate.GSM7_EXT for c in out)
    text = sms_campaigns.render_text({"prefix": "TDL FORMATION", "stop_text": "STOP SMS: Répondez STOP pour arrêter"}, "Bonjour {prenom}", "Jérôme")
    assert text == "TDL FORMATION : Bonjour Jérome\nSTOP SMS: Répondez STOP pour arreter"
