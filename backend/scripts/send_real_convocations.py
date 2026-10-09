import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db
from core.utils import now_iso
from services.candidate_automation import convocation_message
from services.email_template import render_branded_email
from services.email import send_email

CC = ["ricardo_bah@live.fr", "bouchra.tdlformation@gmail.com"]
STAGE_IDS = [
    "4c609253-eadf-40e9-8a6f-b338dbedadb4",  # VTC JOUR 12->16 oct
    "f51509ce-c7be-4aa1-91d2-dac08ebebadc",  # VTC SOIR 12->23 oct
]


async def main():
    stages = {}
    for sid in STAGE_IDS:
        stage = await db.stages.find_one({"id": sid}, {"_id": 0})
        formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0, "category": 1})
        stage["formation_category"] = formation.get("category")
        stages[sid] = stage

    inscriptions = await db.inscriptions.find(
        {"stage_id": {"$in": STAGE_IDS}, "status": "active", "convocation_sent_at": {"$exists": False}},
        {"_id": 0},
    ).to_list(100)

    print(f"{len(inscriptions)} convocation(s) à envoyer.\n")
    sent = 0
    for insc in inscriptions:
        if not insc.get("student_email"):
            print(f"SKIP (pas d'email) : {insc.get('student_name')}")
            continue
        stage = stages[insc["stage_id"]]
        message = convocation_message(stage, insc)
        subject = f"Convocation — {stage.get('formation_titre', '')}"
        result = await send_email(insc["student_email"], subject, render_branded_email(message), cc=CC)
        await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"convocation_sent_at": now_iso()}})
        sent += 1
        print(f"OK -> {insc['student_email']} ({insc.get('student_name')}) : {result.get('status')}")

    print(f"\n{sent} convocation(s) envoyée(s).")


if __name__ == "__main__":
    asyncio.run(main())
