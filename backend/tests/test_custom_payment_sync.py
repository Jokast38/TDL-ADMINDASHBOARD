"""Statut des liens de paiement personnalisés relu sur Stripe
(routers/payments.py, 2026-11-27) — base et Stripe simulés."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from test_caces_session_flow import _Db  # noqa: E402
from routers import payments as pay  # noqa: E402

SESSIONS = {
    "cs_paye": {"payment_status": "paid", "status": "complete", "amount_total": 15900, "payment_intent": "pi_1"},
    "cs_expire": {"payment_status": "unpaid", "status": "expired"},
    "cs_ouvert": {"payment_status": "unpaid", "status": "open"},
}


def run(c):
    return asyncio.run(c)


@pytest.fixture
def db(monkeypatch):
    d = _Db()
    monkeypatch.setattr(pay, "db", d)
    lus = []

    async def retrieve(sid):
        lus.append(sid)
        return SESSIONS[sid]

    async def no_sync(**_k):
        return None
    monkeypatch.setattr(pay.stripe_service, "retrieve_checkout_session", retrieve)
    monkeypatch.setattr(pay, "sync_lead_payment", no_sync)
    for i, sid in enumerate(SESSIONS):
        d.custom_payments.docs.append({"id": f"p{i}", "status": "pending", "stripe_session_id": sid})
    d.lus = lus
    return d


def test_liens_relus_sur_stripe(db):
    assert run(pay.sync_pending_custom_payments()) == 1
    p0, p1, p2 = db.custom_payments.docs
    assert p0["status"] == "paid" and p0["amount_paid"] == 159.0 and p0["paid_at"]
    assert p1["status"] == "pending" and p1["stripe_status"] == "expired"
    assert p2["status"] == "pending" and p2["stripe_status"] == "unpaid"
    # Deuxième passage : ni le lien payé ni le lien expiré ne sont relus.
    db.lus.clear()
    assert run(pay.sync_pending_custom_payments()) == 0
    assert db.lus == ["cs_ouvert"]
    # Le webhook sur un lien déjà payé ne refait rien.
    assert run(pay.mark_custom_payment_paid("p0", 15900, "pi_1")) is False
