# backfill_lead_dates.py - Reconstitue created_at pour les leads/demandes de
# rappel qui en sont dépourvus, en lisant l'horodatage intégré dans l'_id
# ObjectId généré automatiquement par MongoDB à l'insertion (les 4 premiers
# octets d'un ObjectId encodent le timestamp Unix de création — ça marche
# tant que le document n'a jamais eu son _id forcé manuellement, ce qui est
# le cas ici : le code applicatif utilise un champ `id` uuid séparé, jamais
# `_id`). C'est une vraie date de création, pas une approximation.
#
# Usage : python backfill_lead_dates.py
import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def backfill(collection_name: str):
    coll = db[collection_name]
    cursor = coll.find({"$or": [{"created_at": {"$exists": False}}, {"created_at": None}, {"created_at": ""}]})
    updated = 0
    async for doc in cursor:
        ts = doc["_id"].generation_time  # datetime tz-aware (UTC), fiable
        await coll.update_one({"_id": doc["_id"]}, {"$set": {"created_at": ts.isoformat()}})
        updated += 1
    print(f"✅ {collection_name}: {updated} document(s) mis à jour avec une date reconstituée")
    return updated


async def main():
    total = 0
    for name in ("leads", "callback_requests"):
        total += await backfill(name)
    print(f"🎉 Terminé — {total} document(s) au total")


if __name__ == "__main__":
    asyncio.run(main())
