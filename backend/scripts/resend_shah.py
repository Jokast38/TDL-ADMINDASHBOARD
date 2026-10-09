import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db
from core.utils import now_iso
from services.candidate_automation import convocation_message
from services.email_template import render_branded_email
from services.email import send_email

SOIR_STAGE = "f51509ce-c7be-4aa1-91d2-dac08ebebadc"  # VTC SOIR 12->23 oct
CC = ["ricardo_bah@live.fr", "bouchra.tdlformation@gmail.com"]


async def main():
    insc = await db.inscriptions.find_one({"student_email": "shah95200@gmail.com"}, {"_id": 0})
    print("Avant :", insc.get("stage_id"), insc.get("convocation_sent_at"))

    await db.inscriptions.update_one(
        {"id": insc["id"]},
        {"$set": {"stage_id": SOIR_STAGE, "session": SOIR_STAGE}, "$unset": {"convocation_sent_at": ""}},
    )
    insc = await db.inscriptions.find_one({"id": insc["id"]}, {"_id": 0})

    stage = await db.stages.find_one({"id": SOIR_STAGE}, {"_id": 0})
    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0, "category": 1})
    stage["formation_category"] = formation.get("category")

    message = convocation_message(stage, insc)
    subject = f"Convocation — {stage.get('formation_titre', '')}"
    result = await send_email(insc["student_email"], subject, render_branded_email(message), cc=CC)
    await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"convocation_sent_at": now_iso()}})
    print("Envoyé :", result.get("status"), "| id:", result.get("id"))


if __name__ == "__main__":
    asyncio.run(main())
