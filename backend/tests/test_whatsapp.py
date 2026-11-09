"""Envoi WhatsApp en plus du mail — voir services/whatsapp.py et
core/whatsapp_templates.py. Aucun appel réseau réel : API Meta et base
sont simulées."""
import asyncio
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from core import whatsapp_templates as wa
from services import whatsapp


class _Response:
    def __init__(self, data, status=200):
        self._data, self.status_code, self.text = data, status, str(data)

    def json(self):
        return self._data


class _Collection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query, *_a, **_k):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(doc)

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update.get("$set", {}))
                return
        if upsert:
            self.docs.append({**query, **update.get("$setOnInsert", {}), **update.get("$set", {})})


class _Db:
    def __init__(self, settings=None, opt_outs=None):
        self.settings = _Collection([{"id": "global", **(settings or {})}])
        self.whatsapp_logs = _Collection()
        self.whatsapp_opt_outs = _Collection(opt_outs)
        self.whatsapp_inbound = _Collection()


@pytest.fixture
def env(monkeypatch):
    fake = _Db()
    sent = []

    def _post(url, headers, json_data):
        sent.append((url, json_data))
        return _Response({"messages": [{"id": "wamid.1"}]})

    monkeypatch.setattr(whatsapp, "db", fake)
    monkeypatch.setattr(whatsapp, "META_WHATSAPP_TOKEN", "jeton")
    monkeypatch.setattr(whatsapp, "META_WHATSAPP_PHONE_NUMBER_ID", "123")
    monkeypatch.setattr(whatsapp, "_http_post", _post)
    return fake, sent


def _send(template=wa.RAPPEL_VEILLE, params=None, **kw):
    params = params or ["Karim", "VTC", "lundi 16 novembre 2026", "9h", "Épinay"]
    return asyncio.run(whatsapp.send_whatsapp("06 12 34 56 78", template, params, **kw))


def test_chaque_modele_a_un_exemple_par_variable_et_ne_finit_pas_par_une_variable():
    for name, spec in wa.TEMPLATES.items():
        found = sorted({int(n) for n in re.findall(r"\{\{(\d+)\}\}", spec["body"])})
        assert found == list(range(1, len(spec["examples"]) + 1)), name
        assert not spec["body"].strip().startswith("{{") and not spec["body"].strip().endswith("}}"), name


def test_envoi_du_modele_au_numero_normalise(env):
    fake, sent = env
    log = _send()
    assert log["status"] == "sent" and log["wa_message_id"] == "wamid.1"
    url, body = sent[0]
    assert url.endswith("/123/messages") and body["to"] == "33612345678"
    assert body["template"]["name"] == wa.RAPPEL_VEILLE and body["template"]["language"]["code"] == "fr"
    assert fake.whatsapp_logs.docs[0]["status"] == "sent"


def test_variables_nettoyees_pour_whatsapp(env):
    _fake, sent = env
    _send(params=["Karim\nBenali", "", "lundi", "9h", "59  avenue\tJoffre"])
    texts = [p["text"] for p in sent[0][1]["template"]["components"][0]["parameters"]]
    assert texts == ["Karim Benali", "-", "lundi", "9h", "59 avenue Joffre"]


def test_bouton_avis_google_recoit_l_identifiant_de_la_fiche(env):
    _fake, sent = env
    _send(wa.AVIS_GOOGLE, ["Karim", "VTC"], button_param="PLACE")
    button = sent[0][1]["template"]["components"][1]
    assert button["sub_type"] == "url" and button["parameters"][0]["text"] == "PLACE"


def test_apprenant_desinscrit_ne_recoit_plus_rien(env):
    fake, sent = env
    fake.whatsapp_opt_outs.docs.append({"phone": "+33612345678"})
    assert _send()["status"] == "opted_out" and not sent


def test_desactive_dans_les_parametres(env):
    fake, sent = env
    fake.settings.docs[0]["whatsapp_enabled"] = False
    assert _send()["status"] == "disabled" and not sent


def test_refus_meta_journalise_avec_la_raison(env, monkeypatch):
    fake, _sent = env
    monkeypatch.setattr(whatsapp, "_http_post", lambda *a: _Response(
        {"error": {"code": 132001, "message": "Template name does not exist in the translation"}}, 404))
    log = _send()
    assert log["status"].startswith("failed: 132001") and fake.whatsapp_logs.docs[0]["status"] == log["status"]


def test_sms_seulement_si_whatsapp_echoue(env, monkeypatch):
    _fake, _sent = env
    sms = []

    async def _sms(phone, text, extra=None, category=None):
        sms.append(text)

    import services.sms
    monkeypatch.setattr(services.sms, "send_sms", _sms)
    params = ["Karim", "VTC", "lundi", "vendredi", "de 9h à 17h", "Épinay"]
    asyncio.run(whatsapp.send_whatsapp_or_sms("0612345678", wa.CONVOCATION, params, sms_text="SMS"))
    assert sms == []
    monkeypatch.setattr(whatsapp, "META_WHATSAPP_TOKEN", None)
    asyncio.run(whatsapp.send_whatsapp_or_sms("0612345678", wa.CONVOCATION, params, sms_text="SMS"))
    assert sms == ["SMS"]


def test_stop_desinscrit_et_statut_de_remise_enregistre(env):
    fake, _sent = env
    _send()
    asyncio.run(whatsapp.record_status({"id": "wamid.1", "status": "read"}))
    assert fake.whatsapp_logs.docs[0]["delivery_status"] == "read"
    asyncio.run(whatsapp.record_inbound({"from": "33612345678", "id": "m", "type": "text", "text": {"body": " Stop "}}))
    assert fake.whatsapp_opt_outs.docs[0]["phone"] == "+33612345678"
    asyncio.run(whatsapp.record_inbound({"from": "33698765432", "id": "m2", "type": "text", "text": {"body": "Je serai en retard"}}))
    assert len(fake.whatsapp_opt_outs.docs) == 1


def test_creation_des_modeles_conforme_meta():
    payload = wa.creation_payload(wa.DOCUMENTS_MANQUANTS, "https://www.tdl-formation.fr/")
    kinds = [c["type"] for c in payload["components"]]
    assert kinds == ["BODY", "FOOTER", "BUTTONS"]
    assert payload["components"][2]["buttons"][0]["url"] == "https://www.tdl-formation.fr/espace-etudiant"
    avis = wa.creation_payload(wa.AVIS_GOOGLE, "https://www.tdl-formation.fr", "PLACE")
    assert avis["components"][2]["buttons"][0]["url"].endswith("placeid={{1}}")
