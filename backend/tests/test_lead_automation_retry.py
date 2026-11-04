"""Un envoi d'automatisation en échec n'est pas retenté avant 24 h — voir
_RETRY_AFTER_FAILURE_HOURS dans routers/lead_automations.py."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routers import lead_automations as la

RULE = {"id": "r1", "subject": "Sujet", "body": "Bonjour {{name}}", "frequency_days": 0}


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _n):
        return [dict(d) for d in self.docs]


class _Leads:
    def __init__(self, docs):
        self.docs = docs

    def find(self, *_a, **_k):
        return _Cursor(self.docs)

    async def update_one(self, query, update):
        for d in self.docs:
            if d["id"] == query["id"]:
                for k, v in update.get("$set", {}).items():
                    if "." in k:
                        top, sub = k.split(".", 1)
                        d.setdefault(top, {})[sub] = v
                    else:
                        d[k] = v


class _Rules:
    async def update_one(self, *_a, **_k):
        return None


class _Db:
    def __init__(self, leads):
        self.leads = _Leads(leads)
        self.lead_automations = _Rules()


def _run(monkeypatch, leads, status):
    calls = []

    async def _send(to, *_a, **_k):
        calls.append(to)
        return {"status": status}

    monkeypatch.setattr(la, "db", _Db(leads))
    monkeypatch.setattr(la, "send_email", _send)
    monkeypatch.setattr(la, "_leads_cache_clear", lambda: None)
    asyncio.run(la._run_rule(RULE))
    return calls


def test_echec_note_puis_pas_retente_au_passage_suivant(monkeypatch):
    leads = [{"id": "l1", "email": "a@b.fr", "name": "A"}]
    assert _run(monkeypatch, leads, "smtp_error: timed out") == ["a@b.fr"]
    assert "r1" in leads[0]["automation_failed_at"]
    assert _run(monkeypatch, leads, "smtp_error: timed out") == []


def test_retente_apres_24_heures(monkeypatch):
    old = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    leads = [{"id": "l1", "email": "a@b.fr", "name": "A", "automation_failed_at": {"r1": old}}]
    assert _run(monkeypatch, leads, "sent") == ["a@b.fr"]
