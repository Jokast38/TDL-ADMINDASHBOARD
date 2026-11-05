"""Tests de core/pgdoc.py (adaptateur Motor -> Postgres) sur une vraie base
Postgres, dans un schéma jetable `tdl_test` — jamais dans `tdl`.

Lancés seulement si PGDOC_TEST_URL (ou SUPABASE_DB2_URL dans .env) est
défini ; sinon ignorés.
"""
import asyncio
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values  # noqa: E402

DSN = os.getenv("PGDOC_TEST_URL") or dotenv_values(Path(__file__).resolve().parent.parent / ".env").get("SUPABASE_DB2_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="pas de base Postgres de test")

from bson import ObjectId  # noqa: E402
from pymongo import ReturnDocument  # noqa: E402
from pymongo.errors import DuplicateKeyError  # noqa: E402

from core import pgdoc  # noqa: E402

SCHEMA = "tdl_test"


def run(coro_fn):
    async def wrapper():
        client = pgdoc.PgClient(DSN, schema=SCHEMA, max_size=4)
        pool = await client._pool()
        await pool.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
        await pool.execute(f"CREATE SCHEMA {SCHEMA}")
        client._known_tables.clear()
        try:
            await coro_fn(client[SCHEMA])
        finally:
            await pool.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
            await pool.close()
    asyncio.run(wrapper())


LEADS = [
    {"id": "l1", "name": "Alice", "status": "nouveau", "tags": ["vtc", "taxi"], "price": 199, "created_at": "2026-10-01T10:00:00",
     "notes": [{"by": "a", "n": 1}, {"by": "b", "n": 2}], "meta": {"city": "Paris"}},
    {"id": "l2", "name": "bob", "status": "inscrit", "tags": ["permis"], "price": 259.5, "created_at": "2026-10-03T09:00:00",
     "notes": [], "meta": {"city": "Creil"}, "email": None},
    {"id": "l3", "name": "Chloé", "status": "nouveau", "tags": [], "price": 0, "created_at": "2026-09-15T08:00:00", "email": "c@x.fr"},
    {"id": "l4", "name": "David", "status": "perdu", "price": "gratuit", "created_at": "2026-11-01T12:00:00"},
]


async def _seed(db):
    await db.leads.insert_many([dict(d) for d in LEADS])


def test_insert_find_projection_et_id():
    async def t(db):
        doc = {"id": "x", "a": 1}
        res = await db.things.insert_one(doc)
        assert isinstance(doc["_id"], ObjectId) and res.inserted_id == doc["_id"]
        assert await db.things.find_one({"id": "x"}, {"_id": 0}) == {"id": "x", "a": 1}
        assert await db.things.find_one({"id": "x"}, {"_id": 0, "a": 1}) == {"a": 1}
        assert await db.things.find_one({"id": "absent"}) is None
        assert (await db.things.find_one({"id": "x"}))["_id"] == str(doc["_id"])
    run(t)


def test_filtres_comme_mongodb():
    async def t(db):
        await _seed(db)

        async def ids(q, **kw):
            return [d["id"] for d in await db.leads.find(q, {"_id": 0}).to_list(None)]

        assert await ids({"tags": "vtc"}) == ["l1"]                     # tableau qui contient
        assert await ids({"tags": ["permis"]}) == ["l2"]                # tableau égal
        assert await ids({"status": {"$in": ["nouveau", "perdu"]}}) == ["l1", "l3", "l4"]
        assert await ids({"status": {"$nin": ["nouveau"]}}) == ["l2", "l4"]
        assert await ids({"status": {"$ne": "nouveau"}}) == ["l2", "l4"]
        assert await ids({"email": None}) == ["l1", "l2", "l4"]         # absent ou null
        assert await ids({"email": {"$exists": True}}) == ["l2", "l3"]
        assert await ids({"email": {"$ne": None}}) == ["l3"]
        assert await ids({"price": {"$gte": 199}}) == ["l1", "l2"]      # "gratuit" (texte) ignoré
        assert await ids({"price": {"$gt": 0, "$lt": 200}}) == ["l1"]
        assert await ids({"created_at": {"$gte": "2026-10-01", "$lt": "2026-11-01"}}) == ["l1", "l2"]
        assert await ids({"$or": [{"status": "perdu"}, {"tags": "permis"}]}) == ["l2", "l4"]
        assert await ids({"$and": [{"status": "nouveau"}, {"price": {"$gt": 0}}]}) == ["l1"]
        assert await ids({"name": {"$regex": "^b", "$options": "i"}}) == ["l2"]
        assert await ids({"name": re.compile("^c", re.I)}) == ["l3"]
        assert await ids({"meta.city": "Creil"}) == ["l2"]              # chemin pointé
        assert await ids({"notes.by": "b"}) == ["l1"]                   # à travers un tableau
        assert await ids({"notes": {"$elemMatch": {"by": "a", "n": 1}}}) == ["l1"]
        assert await ids({"tags": {"$size": 0}}) == ["l3"]
        assert await ids({"id": {"$in": []}}) == []
        assert await db.leads.count_documents({"status": "nouveau"}) == 2
        assert await db.leads.count_documents({"name": {"$regex": "a"}}) == 1  # David (sensible à la casse)
        assert await db.leads.count_documents({"name": {"$regex": "a", "$options": "i"}}) == 2  # Alice, David
        assert sorted(await db.leads.distinct("tags")) == ["permis", "taxi", "vtc"]
        assert await db.leads.distinct("status", {"price": {"$gt": 0}}) == ["nouveau", "inscrit"]
    run(t)


def test_tri_skip_limit():
    async def t(db):
        await _seed(db)
        rows = await db.leads.find({}, {"_id": 0, "id": 1}).sort("created_at", -1).to_list(None)
        assert [r["id"] for r in rows] == ["l4", "l2", "l1", "l3"]
        rows = await db.leads.find({}, {"_id": 0, "id": 1}).sort("created_at", 1).skip(1).limit(2).to_list(None)
        assert [r["id"] for r in rows] == ["l1", "l2"]
        rows = await db.leads.find({"status": "nouveau"}).sort([("status", 1), ("created_at", -1)]).to_list(1)
        assert rows[0]["id"] == "l1"
        # Tri sur un champ de types mélangés : nombres avant textes, comme MongoDB.
        rows = await db.leads.find({}, {"_id": 0, "id": 1}).sort("price", 1).to_list(None)
        assert [r["id"] for r in rows] == ["l3", "l1", "l2", "l4"]
        # Tri sur un champ absent de certains documents : absents en premier.
        rows = await db.leads.find({}, {"_id": 0, "id": 1}).sort("email", 1).to_list(None)
        assert [r["id"] for r in rows][-1] == "l3"
        latest = await db.leads.find_one({"status": "nouveau"}, {"_id": 0}, sort=[("created_at", -1)])
        assert latest["id"] == "l1"
        out = [d["id"] async for d in db.leads.find({"status": "nouveau"})]
        assert out == ["l1", "l3"]
    run(t)


def test_mises_a_jour():
    async def t(db):
        await _seed(db)
        r = await db.leads.update_one({"id": "l1"}, {"$set": {"status": "inscrit", "meta.zip": "75001"}, "$inc": {"relances": 1}})
        assert (r.matched_count, r.modified_count) == (1, 1)
        d = await db.leads.find_one({"id": "l1"}, {"_id": 0})
        assert d["status"] == "inscrit" and d["meta"] == {"city": "Paris", "zip": "75001"} and d["relances"] == 1
        r = await db.leads.update_one({"id": "l1"}, {"$set": {"status": "inscrit"}})
        assert (r.matched_count, r.modified_count) == (1, 0)  # rien n'a changé
        await db.leads.update_one({"id": "l1"}, {"$unset": {"meta": ""}, "$addToSet": {"tags": "vtc"}})
        await db.leads.update_one({"id": "l1"}, {"$addToSet": {"tags": {"$each": ["vtc", "new"]}}})
        await db.leads.update_one({"id": "l1"}, {"$push": {"notes": {"$each": [{"by": "c", "n": 3}], "$slice": -2}}})
        await db.leads.update_one({"id": "l1"}, {"$pull": {"notes": {"by": "b"}}})
        await db.leads.update_one({"id": "l1"}, {"$pull": {"tags": "taxi"}})
        d = await db.leads.find_one({"id": "l1"}, {"_id": 0})
        assert "meta" not in d and d["tags"] == ["vtc", "new"] and d["notes"] == [{"by": "c", "n": 3}]
        r = await db.leads.update_many({"status": "nouveau"}, {"$set": {"status": "a_rappeler"}})
        assert (r.matched_count, r.modified_count) == (1, 1)
        r = await db.leads.update_one({"id": "zz"}, {"$set": {"name": "Zed"}, "$setOnInsert": {"created_at": "now"}}, upsert=True)
        assert r.upserted_id is not None
        z = await db.leads.find_one({"id": "zz"}, {"_id": 0})
        assert z == {"id": "zz", "name": "Zed", "created_at": "now"}
        await db.leads.update_one({"id": "zz"}, {"$set": {"name": "Z"}, "$setOnInsert": {"created_at": "jamais"}}, upsert=True)
        assert (await db.leads.find_one({"id": "zz"}))["created_at"] == "now"
        with pytest.raises(ValueError):
            await db.leads.update_one({"id": "zz"}, {"name": "sans opérateur"})
        assert (await db.leads.delete_one({"id": "zz"})).deleted_count == 1
        assert (await db.leads.delete_many({"status": {"$in": ["inscrit", "perdu"]}})).deleted_count == 3
        assert await db.leads.count_documents({}) == 1
    run(t)


def test_garde_fou_sur_ecritures_simultanees():
    """Deux formateurs se placent en même temps sur la même session : le
    filtre sur la liste lue juste avant ne laisse passer qu'une écriture
    (services/formateur_placement._write_team)."""
    async def t(db):
        await db.stages.insert_one({"id": "s1", "animateur_ids": []})
        results = await asyncio.gather(*[
            db.stages.update_one({"id": "s1", "animateur_ids": []}, {"$set": {"animateur_ids": [who]}})
            for who in ("bafm1", "bafm2")
        ])
        assert sorted(r.modified_count for r in results) == [0, 1]
        assert len((await db.stages.find_one({"id": "s1"}))["animateur_ids"]) == 1
    run(t)


def test_compteur_atomique_et_index_unique():
    async def t(db):
        nums = await asyncio.gather(*[
            db.counters.find_one_and_update({"id": "caces_numero"}, {"$inc": {"value": 1}}, upsert=True,
                                            return_document=ReturnDocument.AFTER)
            for _ in range(1)
        ])
        assert nums[0]["value"] == 1
        values = []
        for _ in range(5):
            d = await db.counters.find_one_and_update({"id": "caces_numero"}, {"$inc": {"value": 1}}, upsert=True,
                                                      return_document=ReturnDocument.AFTER)
            values.append(d["value"])
        assert values == [2, 3, 4, 5, 6]
        before = await db.counters.find_one_and_update({"id": "caces_numero"}, {"$inc": {"value": 1}})
        assert before["value"] == 6
        await db.users.create_index("email", unique=True)
        await db.users.insert_one({"email": "a@x.fr"})
        with pytest.raises(DuplicateKeyError):
            await db.users.insert_one({"email": "a@x.fr"})
        await db.users.create_index([("role", 1), ("created_at", -1)])
    run(t)


def test_aggregation():
    async def t(db):
        await _seed(db)
        rows = await db.leads.aggregate([
            {"$match": {"created_at": {"$gte": "2026-09-01"}}},
            {"$group": {
                "_id": "$status",
                "n": {"$sum": 1},
                "prix": {"$sum": "$price"},
                "chers": {"$sum": {"$cond": [{"$in": ["$id", ["l1", "l2"]]}, 1, 0]}},
                "premier": {"$min": "$created_at"},
                "dernier": {"$max": "$created_at"},
                "noms": {"$addToSet": "$name"},
            }},
            {"$sort": {"n": -1}},
            {"$limit": 2},
        ]).to_list(None)
        assert rows[0] == {"_id": "nouveau", "n": 2, "prix": 199, "chers": 1, "premier": "2026-09-15T08:00:00",
                           "dernier": "2026-10-01T10:00:00", "noms": ["Alice", "Chloé"]}
        assert len(rows) == 2
        days = await db.leads.aggregate([
            {"$group": {"_id": {"$substrCP": ["$created_at", 0, 7]}, "n": {"$sum": 1}}}, {"$sort": {"_id": 1}},
        ]).to_list(None)
        assert days == [{"_id": "2026-09", "n": 1}, {"_id": "2026-10", "n": 2}, {"_id": "2026-11", "n": 1}]
        avg = await db.leads.aggregate([{"$match": {"price": {"$gt": 0}}}, {"$group": {"_id": None, "avg": {"$avg": "$price"}}}]).to_list(1)
        assert avg == [{"_id": None, "avg": (199 + 259.5) / 2}]
        both = await db.leads.aggregate([{"$group": {"_id": {"s": "$status", "c": "$meta.city"}, "n": {"$sum": 1}}}]).to_list(None)
        assert {"_id": {"s": "nouveau", "c": "Paris"}, "n": 1} in both
    run(t)


def test_types_conserves():
    async def t(db):
        when = datetime(2026, 11, 5, 14, 30)
        await db.misc.insert_one({"id": "d", "when": when, "raw": b"\x00\x01", "txt": "a\x00b"})
        d = await db.misc.find_one({"id": "d"}, {"_id": 0})
        assert d == {"id": "d", "when": when, "raw": b"\x00\x01", "txt": "ab"}
        assert await db.misc.find_one({"when": {"$gte": datetime(2026, 1, 1)}}) is not None
        assert "misc" in await db.list_collection_names()
    run(t)
