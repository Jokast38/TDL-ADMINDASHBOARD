"""Base de données du backend. DB_BACKEND choisit le moteur (migration du
2026-11-05) :
  - "mongo" (défaut) : MongoDB via Motor (MONGO_URL / DB_NAME) ;
  - "supabase" : Postgres Supabase via core/pgdoc.py (SUPABASE_DB2_URL),
    même interface que Motor, données dans le schéma `tdl`.
Revenir en arrière = remettre DB_BACKEND=mongo."""
import logging
import os

from .config import DB_NAME, MONGO_URL

DB_BACKEND = (os.getenv("DB_BACKEND") or "mongo").strip().lower()

if DB_BACKEND == "supabase":
    from .pgdoc import PgClient

    _dsn = os.getenv("SUPABASE_DB2_URL")
    if not _dsn:
        raise RuntimeError("DB_BACKEND=supabase mais SUPABASE_DB2_URL est vide")
    client = PgClient(_dsn, schema=os.getenv("SUPABASE_DB_SCHEMA", "tdl"))
    db = client[DB_NAME]
    logging.getLogger(__name__).info("Base de données : Supabase (schéma %s)", client.schema)
elif DB_BACKEND == "mongo":
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
else:
    raise RuntimeError(f"DB_BACKEND inconnu : {DB_BACKEND!r} (attendu : mongo ou supabase)")
