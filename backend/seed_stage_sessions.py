# seed_stage_sessions.py - Crée en base les sessions de "Stage récupération de
# points" affichées sur la landing page publique (frontend/src/constants/
# stageSessions2026.js), pour qu'elles apparaissent aussi dans le dashboard
# admin (page "Sessions de stage" -> collection `stages`).
#
# Ces deux listes sont aujourd'hui deux sources de vérité séparées : la page
# publique lit STAGE_SESSIONS_2026 (constante JS statique), le dashboard lit
# la collection Mongo `stages`. Ce script copie la première dans la seconde.
# Idempotent : ne recrée pas une session déjà présente (même formation +
# mêmes dates).
#
# Usage : python seed_stage_sessions.py
import os
import asyncio
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

FORMATION_ID = "e22bcca0-6656-4335-b6a6-8a06235a2770"  # "Stage récupération de points", cf. StageRecuperationPointsLanding.jsx
FORMATION_TITLE = "Stage récupération de points"

EPINAY = {"lieu_adresse": "59 avenue Joffre", "lieu_ville": "Épinay-sur-Seine (93)"}
CREIL = {"lieu_adresse": "27 Place Saint-Médard", "lieu_ville": "Creil (60)"}

# Copie de frontend/src/constants/stageSessions2026.js — à garder synchronisée
# manuellement si de nouvelles sessions sont ajoutées côté frontend.
STAGE_SESSIONS_2026 = [
    {"start": "2026-07-17", "end": "2026-07-18"},
    {"start": "2026-07-24", "end": "2026-07-25"},
    {"start": "2026-07-29", "end": "2026-07-30", "lieu": "Creil (60)"},
    {"start": "2026-08-10", "end": "2026-08-11"},
    {"start": "2026-09-04", "end": "2026-09-05"},
    {"start": "2026-09-09", "end": "2026-09-10"},
    {"start": "2026-09-11", "end": "2026-09-12"},
    {"start": "2026-09-14", "end": "2026-09-15"},
    {"start": "2026-09-18", "end": "2026-09-19"},
    {"start": "2026-09-21", "end": "2026-09-22"},
    {"start": "2026-09-23", "end": "2026-09-24"},
    {"start": "2026-09-25", "end": "2026-09-26"},
    {"start": "2026-09-28", "end": "2026-09-29"},
    {"start": "2026-10-02", "end": "2026-10-03"},
    {"start": "2026-10-05", "end": "2026-10-06"},
    {"start": "2026-10-09", "end": "2026-10-10"},
    {"start": "2026-10-12", "end": "2026-10-13"},
    {"start": "2026-10-14", "end": "2026-10-15"},
    {"start": "2026-10-16", "end": "2026-10-17"},
    {"start": "2026-10-19", "end": "2026-10-20"},
    {"start": "2026-10-21", "end": "2026-10-22"},
    {"start": "2026-10-23", "end": "2026-10-24"},
    {"start": "2026-10-26", "end": "2026-10-27"},
    {"start": "2026-10-30", "end": "2026-10-31"},
    {"start": "2026-11-02", "end": "2026-11-03"},
    {"start": "2026-11-04", "end": "2026-11-05"},
    {"start": "2026-11-06", "end": "2026-11-07"},
    {"start": "2026-11-09", "end": "2026-11-10"},
    {"start": "2026-11-13", "end": "2026-11-14"},
    {"start": "2026-11-16", "end": "2026-11-17"},
    {"start": "2026-11-20", "end": "2026-11-21"},
    {"start": "2026-11-25", "end": "2026-11-26"},
    {"start": "2026-11-27", "end": "2026-11-28"},
    {"start": "2026-11-30", "end": "2026-12-01"},
    {"start": "2026-12-04", "end": "2026-12-05"},
    {"start": "2026-12-07", "end": "2026-12-08"},
    {"start": "2026-12-09", "end": "2026-12-10"},
    {"start": "2026-12-11", "end": "2026-12-12"},
    {"start": "2026-12-14", "end": "2026-12-15"},
    {"start": "2026-12-18", "end": "2026-12-19"},
    {"start": "2026-12-21", "end": "2026-12-22"},
    {"start": "2026-12-28", "end": "2026-12-29"},
]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def seed():
    formation = await db.formations.find_one({"id": FORMATION_ID})
    if not formation:
        formation = await db.formations.find_one({"title": FORMATION_TITLE})
    if not formation:
        print(f"❌ Formation '{FORMATION_TITLE}' introuvable en base (id attendu: {FORMATION_ID}).")
        print("   Créez-la d'abord dans le dashboard admin, puis relancez ce script.")
        return

    formation_id = formation["id"]
    created, skipped = 0, 0

    for s in STAGE_SESSIONS_2026:
        existing = await db.stages.find_one({
            "formation_id": formation_id,
            "date_debut": s["start"],
            "date_fin": s["end"],
        })
        if existing:
            skipped += 1
            continue

        lieu = CREIL if s.get("lieu") == "Creil (60)" else EPINAY
        doc = {
            "id": str(uuid.uuid4()),
            "formation_id": formation_id,
            "formation_titre": formation.get("title", FORMATION_TITLE),
            "date_debut": s["start"],
            "date_fin": s["end"],
            "lieu_adresse": lieu["lieu_adresse"],
            "lieu_ville": lieu["lieu_ville"],
            "capacite_max": 20,
            "animateur_id": None,
            "statut": "planifie",
            "nb_inscrits": 0,
            "notes": "",
            "created_at": now_iso(),
        }
        await db.stages.insert_one(doc)
        created += 1

    print(f"✅ Sessions créées : {created}")
    print(f"⏭️  Déjà existantes, ignorées : {skipped}")


if __name__ == "__main__":
    asyncio.run(seed())
