import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db


async def main():
    print("=== Doublons FRITZ PIERRE ===")
    cursor = db.inscriptions.find({"student_email": "fritzpiere92@gmail.com"}, {"_id": 0})
    async for d in cursor:
        print(d)

    print("\n=== Inscription contact.sofood92 actuelle ===")
    sofood = await db.inscriptions.find_one({"student_email": "contact.sofood92@gmail.com"}, {"_id": 0})
    print(sofood)

    print("\n=== Session SOIR octobre (référence via gueyemamadou2021) ===")
    ref = await db.inscriptions.find_one({"student_email": "gueyemamadou2021@outlook.fr"}, {"_id": 0, "stage_id": 1})
    soir_stage = await db.stages.find_one({"id": ref["stage_id"]}, {"_id": 0})
    print(soir_stage)


if __name__ == "__main__":
    asyncio.run(main())
