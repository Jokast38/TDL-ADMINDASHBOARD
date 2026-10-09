"""One-off: remplit heure_debut/heure_fin sur les sessions (stages) déjà en
base qui n'ont pas encore ce champ (ajouté après coup à models/stage.py) —
JOUR -> 09:00/17:00, SOIR -> 18:00/21:30 (horaire fixe des sessions VTC/Taxi
en soirée), et 09:00/17:00 par défaut pour les sessions sans rythme précis.
Lancer une seule fois : `python scripts/backfill_stage_hours.py`.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import db

HOURS = {"SOIR": ("18:00", "21:30"), "JOUR": ("09:00", "17:00")}


async def main():
    cursor = db.stages.find({"heure_debut": {"$exists": False}}, {"_id": 0, "id": 1, "creneau": 1})
    n = 0
    async for s in cursor:
        heure_debut, heure_fin = HOURS.get(s.get("creneau"), HOURS["JOUR"])
        await db.stages.update_one({"id": s["id"]}, {"$set": {"heure_debut": heure_debut, "heure_fin": heure_fin}})
        n += 1
    print(f"{n} session(s) mises à jour (horaires).")

    # Adresse de Creil manquante sur les sessions déjà importées (le fichier
    # Excel VTC_TAXI n'avait pas l'adresse renseignée — voir routers/vtc_import.py).
    r = await db.stages.update_many(
        {"lieu_ville": "Creil", "$or": [{"lieu_adresse": ""}, {"lieu_adresse": {"$exists": False}}]},
        {"$set": {"lieu_adresse": "27 Place Saint-Médard"}},
    )
    print(f"{r.modified_count} session(s) Creil mises à jour (adresse).")


if __name__ == "__main__":
    asyncio.run(main())
