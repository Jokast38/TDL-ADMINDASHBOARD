import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db
from services.candidate_automation import convocation_message


async def main():
    insc = await db.inscriptions.find_one({"student_email": "bah.abdoulaye92@outlook.fr"}, {"_id": 0})
    stage = await db.stages.find_one({"id": insc["stage_id"]}, {"_id": 0})
    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0, "category": 1})
    stage["formation_category"] = formation.get("category")

    print("=" * 70)
    print(f"Sujet : Convocation — {stage.get('formation_titre')}")
    print("=" * 70)
    print(convocation_message(stage, insc))
    print("=" * 70)

    # Récupère l'id de la session VTC JOUR du 12->16 octobre (Épinay) pour
    # rattacher les 2 candidats manquants/orphelins.
    jour_stage = await db.stages.find_one(
        {"date_debut": "2026-10-12", "date_fin": "2026-10-16", "creneau": "JOUR", "lieu_ville": "Épinay-sur-Seine"},
        {"_id": 0},
    )
    print("\nSession JOUR ciblée pour le rattachement :", jour_stage["id"] if jour_stage else None, jour_stage)


if __name__ == "__main__":
    asyncio.run(main())
