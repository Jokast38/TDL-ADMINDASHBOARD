import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db
from services.candidate_automation import convocation_message
from services.email_template import render_branded_email
from services.email import send_email


async def main():
    insc = await db.inscriptions.find_one({"student_email": "bah.abdoulaye92@outlook.fr"}, {"_id": 0})
    stage = await db.stages.find_one({"id": insc["stage_id"]}, {"_id": 0})
    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0, "category": 1})
    stage["formation_category"] = formation.get("category")

    message = convocation_message(stage, insc)
    subject = f"[TEST] Convocation — {stage.get('formation_titre', '')}"
    result = await send_email("jokast38@gmail.com", subject, render_branded_email(message))
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
