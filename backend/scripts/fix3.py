import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db

DUPLICATE_ID = "f2c3c73c-2c28-4265-9ac2-74465d92d26a"  # ancien lead manuel FRITZ PIERRE (avant import, jamais finalisé)
SOFOOD_ID = "de9654df-8d4d-4c64-ace1-80705c093b5d"
OCTOBRE_SOIR_STAGE = "f51509ce-c7be-4aa1-91d2-dac08ebebadc"


async def main():
    # 1) Supprime le doublon FRITZ PIERRE : l'inscription réelle (issue de
    # l'import Excel, avec n° de dossier CMA et convocation déjà envoyée)
    # reste seule source de vérité.
    dup = await db.inscriptions.find_one({"id": DUPLICATE_ID}, {"_id": 0})
    if dup and dup.get("student_email") == "fritzpiere92@gmail.com" and not dup.get("source"):
        await db.inscriptions.delete_one({"id": DUPLICATE_ID})
        print(f"Doublon supprimé : {DUPLICATE_ID} (ancien lead manuel FRITZ PIERRE)")
    else:
        print("Rien supprimé — le doublon ne correspond plus au filtre attendu :", dup)

    # 2) Sehili OUSSAMA (contact.sofood92) : rattaché par erreur à la session
    # de septembre (déjà passée) — on le bascule sur la vraie session SOIR
    # d'octobre.
    res = await db.inscriptions.update_one(
        {"id": SOFOOD_ID},
        {"$set": {"stage_id": OCTOBRE_SOIR_STAGE, "session": OCTOBRE_SOIR_STAGE}},
    )
    print(f"Sehili OUSSAMA rattaché à la session SOIR octobre : modified={res.modified_count}")


if __name__ == "__main__":
    asyncio.run(main())
