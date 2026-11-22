"""Leads Meta : formulaires en français et synchronisation (2026-11-17)."""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from routers.meta_leads import _extract_fields
from services import meta_leads_sync as sync


def test_champs_des_formulaires_en_francais():
    parsed = _extract_fields([
        {"name": "nom_complet", "values": ["Jean Test"]},
        {"name": "e-mail", "values": ["jean@test.fr"]},
        {"name": "numéro_de_téléphone", "values": ["+33612345678"]},
        {"name": "quand_avez-vous_effectué_votre_dernier_stage_?", "values": ["jamais"]},
    ])
    assert (parsed["name"], parsed["email"], parsed["phone"]) == ("Jean Test", "jean@test.fr", "+33612345678")
    assert list(parsed["answers"]) == ["quand_avez-vous_effectué_votre_dernier_stage_?"]


def test_champs_anglais_toujours_reconnus():
    parsed = _extract_fields([
        {"name": "first_name", "values": ["Ana"]}, {"name": "last_name", "values": ["B"]},
        {"name": "email", "values": ["a@b.fr"]}, {"name": "phone_number", "values": ["0600000000"]},
    ])
    assert (parsed["name"], parsed["email"], parsed["phone"]) == ("Ana B", "a@b.fr", "0600000000")


class _Settings:
    def __init__(self):
        self.doc = {"id": "global"}

    async def find_one(self, *_a, **_k):
        return dict(self.doc)

    async def update_one(self, _q, update, upsert=False):
        self.doc.update(update["$set"])


class _Db:
    def __init__(self):
        self.settings = _Settings()


def test_synchro_cree_les_nouveaux_avance_le_curseur_et_notifie(monkeypatch):
    fake = _Db()
    # Curseur fixé : sans lui, la 1re synchro part de « maintenant - 3 jours » et le test dépendrait de la date du jour.
    fake.settings.doc["meta_leads_sync_since"] = "2026-11-16T00:00:00+0000"
    monkeypatch.setattr(sync, "db", fake)
    leads = [({"name": "Épinay | Stage points"}, {"id": str(i), "created_time": f"2026-11-17T0{i}:00:00+0000"}) for i in range(3)]
    monkeypatch.setattr(sync, "_fetch_new_leads", lambda since: leads)

    async def _ingest(form, lead):  # le 1er est déjà connu
        return None if lead["id"] == "0" else {"id": lead["id"], "name": f"L{lead['id']}"}
    notified = []

    async def _notify(new):
        notified.extend(new)
    monkeypatch.setattr(sync, "_ingest", _ingest)
    monkeypatch.setattr(sync, "_notify", _notify)
    import routers.leads as rl
    monkeypatch.setattr(rl, "_leads_cache_clear", lambda: None)

    result = asyncio.run(sync.sync_meta_leads())
    assert result["lus"] == 3 and result["crees"] == 2
    assert [l["id"] for l in notified] == ["1", "2"]
    since = datetime.strptime(fake.settings.doc["meta_leads_sync_since"], "%Y-%m-%dT%H:%M:%S%z")
    assert since == datetime(2026, 11, 17, 1, 30, tzinfo=timezone.utc)  # dernier lead - 30 min de marge
