"""Renseigne la ville des prospects Meta qui n'en ont pas (demande du
2026-11-03), avec la détection de core/meta_ville.py — y compris pour ceux
repris de l'ancienne collection meta_lead_imports, dont le détail de la
publicité n'a été gardé que sur l'import d'origine.

Ne remplit que les villes vides, n'en modifie jamais une déjà renseignée.
L'onglet Prospects Meta n'en a pas besoin (ville calculée à l'affichage),
mais le filtre ville de la page Prospects lit le champ en base.

Usage (depuis backend/) :
    python scripts/backfill_meta_ville.py           # simulation, n'écrit rien
    python scripts/backfill_meta_ville.py --apply   # écrit en base
"""
import asyncio
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from motor.motor_asyncio import AsyncIOMotorClient

from core.meta_ville import meta_ville_of


async def main(apply: bool) -> None:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    leads = await db.leads.find(
        {"$or": [{"source": "meta"}, {"sources": "meta"}], "$and": [{"$or": [{"ville": None}, {"ville": ""}, {"ville": {"$exists": False}}]}]},
        {"_id": 0},
    ).to_list(100000)
    origin_ids = [(l.get("legacy_ids") or {}).get("meta_lead_imports") for l in leads]
    origins = await db.meta_lead_imports.find({"id": {"$in": [i for i in origin_ids if i]}}, {"_id": 0}).to_list(100000)
    origin_by_id = {o["id"]: o for o in origins}

    found = Counter()
    for lead in leads:
        origin = origin_by_id.get((lead.get("legacy_ids") or {}).get("meta_lead_imports"))
        ville = meta_ville_of(lead) or (meta_ville_of(origin) if origin else None)
        found[ville or "inconnue"] += 1
        if ville and apply:
            await db.leads.update_one({"id": lead["id"], "$or": [{"ville": None}, {"ville": ""}, {"ville": {"$exists": False}}]}, {"$set": {"ville": ville}})

    print(f"{len(leads)} prospect(s) Meta sans ville : {dict(found)}")
    print("Écrit en base." if apply else "Simulation : rien n'a été écrit (ajoutez --apply).")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
