"""Recopie la base MongoDB dans le nouveau projet Supabase (SUPABASE_DB2_URL)
— demande du 2026-11-05 : quitter MongoDB (plan gratuit) pour une base
Supabase payée appartenant à TDL. Les fichiers restent dans le premier
projet Supabase (core/storage.py).

MongoDB reste la base en service : ce script ne fait que lire MongoDB et
peut être relancé autant de fois que voulu. Chaque collection devient une
table `tdl."<collection>"` (_id, doc jsonb), recopiée en entier dans une
transaction : la table est toujours le reflet exact de MongoDB au moment de
la copie.

Le schéma `tdl` n'est pas exposé par l'API Supabase (seul `public` l'est) et
les droits des rôles anon/authenticated y sont retirés : seul le backend, avec
l'URL de connexion directe, y accède.

Les types sans équivalent JSON sont conservés sous une forme reconnaissable
pour l'adaptateur : datetime -> {"$date": iso}, bytes -> {"$binary": base64}.

Usage (depuis backend/) :
    python scripts/migrate_to_supabase.py           # copie tout
    python scripts/migrate_to_supabase.py --status  # compare les nombres de documents
"""
import asyncio
import base64
import os
import sys
from collections import Counter
from datetime import date, datetime
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from bson import Decimal128, ObjectId
from dotenv import dotenv_values
from psycopg2.extras import Json, execute_values

from motor.motor_asyncio import AsyncIOMotorClient

from core.config import DB_NAME, MONGO_URL

# Toujours MongoDB, même si DB_BACKEND=supabase : c'est la source de la copie.
db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]

SCHEMA = "tdl"
BATCH = 500


def _pg():
    url = os.getenv("SUPABASE_DB2_URL") or dotenv_values(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")).get("SUPABASE_DB2_URL")
    if not url:
        sys.exit("SUPABASE_DB2_URL manquant dans .env")
    return psycopg2.connect(url, connect_timeout=20)


def to_json(value, types: Counter):
    if isinstance(value, dict):
        return {str(k): to_json(v, types) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json(v, types) for v in value]
    if isinstance(value, datetime):
        types["datetime"] += 1
        return {"$date": value.isoformat()}
    if isinstance(value, date):
        types["date"] += 1
        return {"$date": value.isoformat()}
    if isinstance(value, ObjectId):
        types["ObjectId"] += 1
        return str(value)
    if isinstance(value, bytes):
        types["bytes"] += 1
        return {"$binary": base64.b64encode(value).decode()}
    if isinstance(value, (Decimal128, Decimal)):
        types["decimal"] += 1
        return float(str(value))
    if isinstance(value, str):
        return value.replace("\x00", "")  # Postgres refuse \u0000 dans un jsonb
    return value


def _ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def prepare_schema(cur) -> None:
    cur.execute(f"create schema if not exists {SCHEMA}")
    cur.execute(f"revoke all on schema {SCHEMA} from anon, authenticated, public")
    cur.execute(f"alter default privileges in schema {SCHEMA} revoke all on tables from anon, authenticated, public")


def prepare_table(cur, name: str) -> None:
    table = f"{SCHEMA}.{_ident(name)}"
    # seq : ordre d'insertion, l'« ordre naturel » de MongoDB (core/pgdoc.py).
    cur.execute(f"create table if not exists {table} (_id text primary key, doc jsonb not null, seq bigserial)")
    cur.execute(f"alter table {table} add column if not exists seq bigserial")
    cur.execute(f"create index if not exists {_ident(name[:40] + '_seq_idx')} on {table} (seq)")
    cur.execute(f"alter table {table} enable row level security")
    cur.execute(f"revoke all on {table} from anon, authenticated, public")
    cur.execute(f"create index if not exists {_ident(name[:40] + '_doc_gin')} on {table} using gin (doc jsonb_path_ops)")
    cur.execute(f"create index if not exists {_ident(name[:40] + '_id_idx')} on {table} ((doc->>'id'))")


async def copy_all() -> None:
    names = sorted(n for n in await db.list_collection_names() if not n.startswith("system."))
    conn = _pg()
    with conn, conn.cursor() as cur:
        prepare_schema(cur)
    total = 0
    for name in names:
        types = Counter()
        rows = []
        async for d in db[name].find({}):
            _id = d.pop("_id")
            rows.append((str(_id), Json(to_json(d, types))))
        with conn, conn.cursor() as cur:
            prepare_table(cur, name)
            cur.execute(f"truncate {SCHEMA}.{_ident(name)} restart identity")
            for i in range(0, len(rows), BATCH):
                execute_values(cur, f"insert into {SCHEMA}.{_ident(name)} (_id, doc) values %s", rows[i:i + BATCH])
        total += len(rows)
        extra = f"  (types convertis : {dict(types)})" if types else ""
        print(f"{name}: {len(rows)}{extra}", flush=True)
    conn.close()
    print(f"\n{len(names)} collections, {total} documents recopiés dans {SCHEMA}.*")


async def status() -> None:
    conn = _pg()
    names = sorted(n for n in await db.list_collection_names() if not n.startswith("system."))
    ecarts = 0
    with conn, conn.cursor() as cur:
        for name in names:
            mongo = await db[name].count_documents({})
            cur.execute("select to_regclass(%s)", (f"{SCHEMA}.{_ident(name)}",))
            if cur.fetchone()[0] is None:
                pg = "absente"
            else:
                cur.execute(f"select count(*) from {SCHEMA}.{_ident(name)}")
                pg = cur.fetchone()[0]
            if pg != mongo:
                ecarts += 1
            print(f"{'OK ' if pg == mongo else '≠  '} {name}: MongoDB {mongo} / Supabase {pg}")
    conn.close()
    print(f"\n{ecarts} collection(s) différente(s)")


if __name__ == "__main__":
    asyncio.run(status() if "--status" in sys.argv else copy_all())
