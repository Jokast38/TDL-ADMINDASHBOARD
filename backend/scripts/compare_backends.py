"""Compare MongoDB et Supabase (via core/pgdoc.py) sur les vraies données —
vérification de la migration du 2026-11-05. Lecture seule des deux côtés.

À lancer juste après `python scripts/migrate_to_supabase.py` : les deux bases
sont alors identiques, et toute différence de réponse vient de l'adaptateur
(sauf sur les collections qui bougent en continu, signalées à part).

Pour chaque collection :
  1. tous les documents sont comparés un par un ;
  2. des requêtes sont générées à partir des données (égalité, $in, $ne,
     $exists, comparaisons, $or, tri + limite, count, distinct, $group) et
     leurs réponses comparées.

Usage (depuis backend/) :
    python scripts/compare_backends.py
"""
import asyncio
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

from core.config import DB_NAME, MONGO_URL
from core.pgdoc import PgClient, encode

ENV = dotenv_values(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
mongo = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
pg = PgClient(os.getenv("SUPABASE_DB2_URL") or ENV["SUPABASE_DB2_URL"], schema="tdl")[DB_NAME]

VIVANTES = {"user_sessions", "activity_log", "email_logs", "sms_logs", "whatsapp_logs", "meta_events_log", "leads",
            "meta_lead_imports", "push_subscriptions", "settings", "chat_sessions", "ai_messages"}
random.seed(42)


def canon(v):
    return json.dumps(encode(v), sort_keys=True, ensure_ascii=False, default=str)


def scalar_fields(docs):
    fields = {}
    for d in docs:
        for k, v in d.items():
            if k == "_id":
                continue
            if isinstance(v, (str, int, float, bool)) or v is None or (isinstance(v, list) and all(isinstance(x, str) for x in v)):
                fields.setdefault(k, []).append(v)
    return fields


async def compare(name):
    problems = []
    m_docs = await mongo[name].find({}).to_list(None)
    p_docs = await pg[name].find({}).to_list(None)
    m_by = {str(d["_id"]): canon({k: v for k, v in d.items() if k != "_id"}) for d in m_docs}
    p_by = {d["_id"]: canon({k: v for k, v in d.items() if k != "_id"}) for d in p_docs}
    diff_docs = [k for k in m_by if p_by.get(k) != m_by[k]] + [k for k in p_by if k not in m_by]
    if diff_docs:
        problems.append(f"{len(diff_docs)} document(s) différent(s) (ex. {diff_docs[:2]})")
    if [str(d["_id"]) for d in m_docs] != [d["_id"] for d in p_docs]:
        problems.append("ordre naturel différent")

    queries = []
    fields = scalar_fields(m_docs[:500])
    for f, vals in list(fields.items())[:12]:
        flat = [x for v in vals for x in (v if isinstance(v, list) else [v])]
        if not flat:
            continue
        sample = random.sample(flat, min(3, len(flat)))
        queries += [{f: sample[0]}, {f: {"$in": sample}}, {f: {"$ne": sample[0]}}, {f: {"$nin": sample}},
                    {f: {"$exists": True}}, {f: {"$exists": False}}, {f: None}]
        cmp_vals = [x for x in flat if isinstance(x, (str, int, float)) and not isinstance(x, bool)]
        if cmp_vals:
            pivot = sorted(cmp_vals, key=lambda x: (isinstance(x, str), x))[len(cmp_vals) // 2]
            queries += [{f: {"$gte": pivot}}, {f: {"$lt": pivot}}, {"$or": [{f: {"$gt": pivot}}, {f: sample[0]}]}]
    for q in queries:
        mq = await mongo[name].find(q, {"_id": 0}).to_list(None)
        pq = await pg[name].find(q, {"_id": 0}).to_list(None)
        if [canon(x) for x in mq] != [canon(x) for x in pq]:
            problems.append(f"find {q} : MongoDB {len(mq)} / Supabase {len(pq)}")
        mc, pc = await mongo[name].count_documents(q), await pg[name].count_documents(q)
        if mc != pc:
            problems.append(f"count {q} : {mc} / {pc}")
    for f in list(fields)[:8]:
        if all(isinstance(v, str) or v is None for v in fields[f]):
            ms = await mongo[name].find({}, {"_id": 0}).sort(f, -1).limit(20).to_list(None)
            ps = await pg[name].find({}, {"_id": 0}).sort(f, -1).limit(20).to_list(None)
            # À valeur égale, MongoDB ne garantit pas l'ordre : on compare la séquence des valeurs triées.
            if [x.get(f) for x in ms] != [x.get(f) for x in ps]:
                problems.append(f"sort {f} desc limit 20 différent")
        md = sorted(map(canon, await mongo[name].distinct(f)))
        pd = sorted(map(canon, await pg[name].distinct(f)))
        if md != pd:
            problems.append(f"distinct {f} : {len(md)} / {len(pd)}")
        pipe = [{"$group": {"_id": f"${f}", "n": {"$sum": 1}}}]
        mg = sorted(map(canon, await mongo[name].aggregate(pipe).to_list(None)))
        pg_ = sorted(map(canon, await pg[name].aggregate(pipe).to_list(None)))
        if mg != pg_:
            problems.append(f"$group {f} différent")
    return len(m_docs), len(queries), problems


async def main():
    names = sorted(n for n in await mongo.list_collection_names() if not n.startswith("system."))
    total_q, bad = 0, 0
    for name in names:
        n, nq, problems = await compare(name)
        total_q += nq
        tag = " (collection vivante : écarts possibles depuis la copie)" if name in VIVANTES and problems else ""
        if problems:
            bad += 1
            print(f"≠ {name} ({n} docs){tag}")
            for p in problems[:8]:
                print(f"    - {p}")
        else:
            print(f"OK {name} ({n} docs, {nq} requêtes)")
    print(f"\n{len(names)} collections, {total_q} requêtes comparées, {bad} collection(s) avec écart")


if __name__ == "__main__":
    asyncio.run(main())
