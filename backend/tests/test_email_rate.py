"""Plafonnage des envois d'emails (demande du 2026-11-12) : débit par minute
sous la limite o2switch, part réservée aux emails importants, plafond
horaire du marketing et file des campagnes qui reprend où elle s'est arrêtée."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services import email_campaigns, email_rate  # noqa: E402


def test_reglages_bornes_a_la_limite_o2switch():
    assert email_rate.limits({}) == {"par_minute": 28, "reserve_transactionnel": 10, "marketing_par_minute": 18, "marketing_par_heure": 300}
    lim = email_rate.limits({"smtp_rate_per_minute": 60, "smtp_reserve_transactional": 99, "marketing_per_hour": -5})
    assert lim["par_minute"] == 28 and lim["marketing_par_minute"] == 1 and lim["marketing_par_heure"] == 0


def test_type_d_envoi():
    assert email_rate.kind_of({"automation_id": "a"}) == "marketing"
    assert email_rate.kind_of({"campaign": True}) == "marketing"
    assert email_rate.kind_of({"inscription_id": "i"}) == "transactionnel"
    assert email_rate.kind_of(None, "marketing") == "marketing"


def test_reserve_pour_les_emails_importants(monkeypatch):
    """Sur une même minute : le marketing s'arrête à 18 envois, les emails
    importants passent jusqu'à 28."""
    clock = {"t": 1000.0}
    sleeps = []
    monkeypatch.setattr(email_rate.time, "monotonic", lambda: clock["t"])

    async def shared(*_a):
        return True

    async def fake_sleep(s):
        sleeps.append(s)
        clock["t"] += s
    monkeypatch.setattr(email_rate, "_shared_take", shared)
    monkeypatch.setattr(email_rate.asyncio, "sleep", fake_sleep)
    email_rate._all_times.clear()
    email_rate._mkt_times.clear()

    async def run():
        for _ in range(18):
            await email_rate.acquire_slot("marketing", {})
        assert not sleeps
        for _ in range(10):  # la réserve reste disponible
            await email_rate.acquire_slot("transactionnel", {})
        assert not sleeps
        await email_rate.acquire_slot("marketing", {})  # 19e marketing : attente
        assert sleeps and clock["t"] >= 1060
    asyncio.run(run())


class _Coll:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, q, _p=None):
        docs = [d for d in self.docs if all(d.get(k) == v for k, v in q.items() if not k.startswith("$"))]

        class C:
            def sort(self, *_a):
                return self

            async def to_list(self, _n):
                return [dict(d) for d in docs]
        return C()

    async def find_one(self, q, _p=None):
        return next((dict(d) for d in self.docs if all(d.get(k) == v for k, v in q.items() if not k.startswith("$"))), None)

    async def update_one(self, q, u):
        class R:
            matched_count = 0
            modified_count = 0
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items() if not k.startswith("$")):
                d.update(u.get("$set", {}))
                R.matched_count = R.modified_count = 1
                break
        return R()


def test_campagne_plafonnee_puis_reprise(monkeypatch):
    people = [{"id": f"l{i}", "email": f"p{i}@x.fr", "name": f"P{i}"} for i in range(5)]

    class Db:
        pass
    Db.email_campaigns = _Coll([{"id": "c1", "type": "broadcast", "subject": "S", "body": "B {{name}}", "status": "en_cours",
                                 "lead_ids": [p["id"] for p in people], "total": 5, "next_index": 0, "sent": 0, "failed": 0,
                                 "created_at": "1", "mark_contacted": True}])
    Db.leads = _Coll([dict(p) for p in people])

    quota = {"n": 2}
    sent_to = []

    async def remaining():
        return quota["n"]

    async def send_one(_c, lead):
        sent_to.append(lead["email"])
        quota["n"] -= 1
        return True
    monkeypatch.setattr(email_campaigns, "db", Db)
    monkeypatch.setattr(email_campaigns, "marketing_quota_remaining", remaining)
    monkeypatch.setattr(email_campaigns, "_send_one", send_one)
    import routers.leads as leads_router
    monkeypatch.setattr(leads_router, "_leads_cache_clear", lambda: None)

    assert asyncio.run(email_campaigns.process_campaigns()) == 2  # plafond horaire atteint
    c = Db.email_campaigns.docs[0]
    assert c["next_index"] == 2 and c["status"] == "en_cours"
    quota["n"] = 10  # l'heure suivante
    assert asyncio.run(email_campaigns.process_campaigns()) == 3
    assert c["status"] == "terminee" and c["sent"] == 5
    assert sent_to == [f"p{i}@x.fr" for i in range(5)]  # chacun une seule fois
    assert Db.leads.docs[0]["status"] == "contacte"
