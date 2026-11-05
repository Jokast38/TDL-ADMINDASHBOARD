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
    python scripts/migrate_to_supabase.py              # copie tout (ÉCRASE Supabase)
    python scripts/migrate_to_supabase.py --final      # copie de bascule : tout, sauf email_logs
                                                       # synchronisé par _id (bien moins à lire)
    python scripts/migrate_to_supabase.py --status     # compare les nombres de documents
    python scripts/migrate_to_supabase.py --rattrapage # après la bascule : ajoute dans Supabase
                                                       # les documents de MongoDB qui n'y sont pas
    python scripts/migrate_to_supabase.py --retour     # retour arrière : ajoute dans MongoDB
                                                       # les documents de Supabase qui n'y sont pas

--rattrapage et --retour n'écrasent jamais un document existant : ils
n'ajoutent que les documents manquants (repérés par leur _id). Ils servent à
ne rien perdre de ce qui a été écrit dans l'ancienne base pendant les
quelques minutes de la bascule (inscription, paiement Stripe, lead Meta...).
Un document MODIFIÉ (et non créé) pendant ce laps de temps est signalé, pas
fusionné : à vérifier à la main.
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

SCHEMA = os.getenv("MIGRATE_SCHEMA", "tdl")  # autre schéma : copie de vérification (scripts/compare_backends.py)
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


# Collections volumineuses où l'on ne fait qu'ajouter (le corps des emails :
# 184 Mo sur ~200). Le plan gratuit d'Atlas limite le volume lu par semaine
# (dépassé le 2026-11-05 : débit bridé à ~0,1 Mo/s) : pour elles, --final ne
# relit que les _id puis les documents manquants, au lieu de tout retélécharger.
AJOUT_SEUL = {"email_logs"}


def _oid(_id: str):
    return ObjectId(_id) if ObjectId.is_valid(_id) else _id


async def _mongo_ids(name: str) -> list:
    return [str(d["_id"]) async for d in db[name].find({}, {"_id": 1})]


async def _mongo_docs_by_ids(name: str, ids: list) -> list:
    rows = []
    for i in range(0, len(ids), BATCH):
        async for d in db[name].find({"_id": {"$in": [_oid(x) for x in ids[i:i + BATCH]]}}):
            _id = d.pop("_id")
            rows.append((str(_id), Json(to_json(d, Counter()))))
    order = {x: n for n, x in enumerate(ids)}
    return sorted(rows, key=lambda r: order.get(r[0], 0))


async def _copy_collection(conn, name: str) -> int:
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
    extra = f"  (types convertis : {dict(types)})" if types else ""
    print(f"{name}: {len(rows)}{extra}", flush=True)
    return len(rows)


async def _sync_ajout_seul(conn, name: str) -> int:
    """Supabase = MongoDB pour une collection où l'on ne fait qu'ajouter :
    supprime ce qui n'existe pas dans MongoDB (ex. écrit par un serveur de
    test), ajoute ce qui manque. Les documents déjà présents ne sont pas
    relus (les compteurs d'ouverture/clic d'un vieil email peuvent donc avoir
    quelques heures de retard)."""
    mongo_ids = await _mongo_ids(name)
    with conn, conn.cursor() as cur:
        prepare_table(cur, name)
        cur.execute(f"select _id from {SCHEMA}.{_ident(name)}")
        pg_ids = {r[0] for r in cur.fetchall()}
    mongo_set = set(mongo_ids)
    en_trop = list(pg_ids - mongo_set)
    manquants = [x for x in mongo_ids if x not in pg_ids]
    rows = await _mongo_docs_by_ids(name, manquants)
    with conn, conn.cursor() as cur:
        if en_trop:
            cur.execute(f"delete from {SCHEMA}.{_ident(name)} where _id = any(%s)", (en_trop,))
        for i in range(0, len(rows), BATCH):
            execute_values(cur, f"insert into {SCHEMA}.{_ident(name)} (_id, doc) values %s on conflict (_id) do nothing", rows[i:i + BATCH])
    print(f"{name}: {len(mongo_ids)} (+{len(rows)} ajouté(s), -{len(en_trop)} retiré(s))", flush=True)
    return len(mongo_ids)


async def copy_all(final: bool = False) -> None:
    """Copie complète. final=True : les collections AJOUT_SEUL déjà présentes
    sont synchronisées par _id au lieu d'être retéléchargées."""
    names = sorted(n for n in await db.list_collection_names() if not n.startswith("system."))
    conn = _pg()
    with conn, conn.cursor() as cur:
        prepare_schema(cur)
    total = 0
    for name in names:
        if final and name in AJOUT_SEUL:
            total += await _sync_ajout_seul(conn, name)
        else:
            total += await _copy_collection(conn, name)
    conn.close()
    print(f"\n{len(names)} collections, {total} documents dans {SCHEMA}.*")


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


async def _pg_docs(cur, name: str) -> dict:
    cur.execute("select to_regclass(%s)", (f"{SCHEMA}.{_ident(name)}",))
    if cur.fetchone()[0] is None:
        return {}
    cur.execute(f"select _id, doc from {SCHEMA}.{_ident(name)}")
    return {r[0]: r[1] for r in cur.fetchall()}


async def rattrapage() -> None:
    """MongoDB -> Supabase, documents manquants seulement. Ne relit en entier
    que les petites collections (pour signaler les documents modifiés) ; pour
    les AJOUT_SEUL, seulement les _id puis les documents manquants."""
    names = sorted(n for n in await db.list_collection_names() if not n.startswith("system."))
    conn = _pg()
    ajoutes, modifies = 0, []
    with conn, conn.cursor() as cur:
        prepare_schema(cur)
    for name in names:
        with conn, conn.cursor() as cur:
            prepare_table(cur, name)
            if name in AJOUT_SEUL:
                cur.execute(f"select _id from {SCHEMA}.{_ident(name)}")
                pg_ids = {r[0] for r in cur.fetchall()}
                rows = await _mongo_docs_by_ids(name, [x for x in await _mongo_ids(name) if x not in pg_ids])
            else:
                pg_docs = await _pg_docs(cur, name)
                rows = []
                async for d in db[name].find({}):
                    _id = str(d.pop("_id"))
                    body = to_json(d, Counter())
                    if _id not in pg_docs:
                        rows.append((_id, Json(body)))
                    elif pg_docs[_id] != body:
                        modifies.append(f"{name}/{_id}")
            if rows:
                execute_values(cur, f"insert into {SCHEMA}.{_ident(name)} (_id, doc) values %s on conflict (_id) do nothing", rows)
                print(f"{name}: {len(rows)} document(s) ajouté(s)", flush=True)
                ajoutes += len(rows)
    conn.close()
    print(f"\n{ajoutes} document(s) ajouté(s) dans Supabase.")
    if modifies:
        print(f"{len(modifies)} document(s) différent(s) entre les deux bases (modifiés d'un côté, non fusionnés) : {modifies[:20]}")


async def retour() -> None:
    """Supabase -> MongoDB, documents manquants seulement (retour arrière)."""
    from core.pgdoc import decode
    conn = _pg()
    ajoutes = 0
    with conn, conn.cursor() as cur:
        cur.execute("select table_name from information_schema.tables where table_schema = %s", (SCHEMA,))
        for (name,) in sorted(cur.fetchall()):
            pg_docs = await _pg_docs(cur, name)
            existants = {str(d["_id"]) async for d in db[name].find({}, {"_id": 1})}
            manquants = []
            for _id, doc in pg_docs.items():
                if _id in existants:
                    continue
                d = decode(doc)
                d["_id"] = ObjectId(_id) if ObjectId.is_valid(_id) else _id
                manquants.append(d)
            if manquants:
                await db[name].insert_many(manquants)
                print(f"{name}: {len(manquants)} document(s) ajouté(s) dans MongoDB", flush=True)
                ajoutes += len(manquants)
    conn.close()
    print(f"\n{ajoutes} document(s) ajouté(s) dans MongoDB.")


if __name__ == "__main__":
    if "--status" in sys.argv:
        asyncio.run(status())
    elif "--rattrapage" in sys.argv:
        asyncio.run(rattrapage())
    elif "--retour" in sys.argv:
        asyncio.run(retour())
    elif "--final" in sys.argv:
        asyncio.run(copy_all(final=True))
    else:
        asyncio.run(copy_all())
