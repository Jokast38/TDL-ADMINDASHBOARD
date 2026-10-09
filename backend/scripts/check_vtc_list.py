import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db

EMAILS = [
    "bah.abdoulaye92@outlook.fr", "habr1383@gmail.com", "elimanekone9223@gmail.com",
    "fritzpiere92@gmail.com", "silvia.adriana@hotmail.fr", "adil.mahzoum@gmail.com",
    "contact.sofood92@gmail.com", "shah95200@gmail.com", "meriavagyan12@icloud.com",
    "1makbutt@gmail.com", "massinisahalli@gmail.com", "kantesamouka48@gmail.com",
    "gueyemamadou2021@outlook.fr", "tarik791112@gmail.com", "imane.elbakhare@hotmail.fr",
    "hfotso@gmail.com", "petrerednic2@yahoo.com", "ayoubax93@yahoo.com", "semy932@gmail.com",
    "boucharimounir@gmail.com", "blocusse@gmail.com", "issa.tounkara@gmail.com",
    "dahbio.omar@gmail.com", "hamidibrahimissa8@gmail.com",
]


async def main():
    found = 0
    missing = []
    for email in EMAILS:
        insc = await db.inscriptions.find_one({"student_email": email}, {"_id": 0})
        if not insc:
            missing.append(email)
            continue
        found += 1
        stage = None
        if insc.get("stage_id"):
            stage = await db.stages.find_one({"id": insc["stage_id"]}, {"_id": 0})
        stage_info = "aucune session affectée"
        if stage:
            stage_info = (
                f"{stage.get('formation_titre')} | {stage.get('date_debut')} -> {stage.get('date_fin')} "
                f"| {stage.get('lieu_ville')} | creneau={stage.get('creneau')} "
                f"| heures={stage.get('heure_debut')}-{stage.get('heure_fin')}"
            )
        convoc = insc.get("convocation_sent_at") or "PAS ENVOYEE"
        print(f"{email} | {insc.get('student_name')} | status={insc.get('status')} | {stage_info} | convocation={convoc}")

    print(f"\n{found}/{len(EMAILS)} trouvés en base.")
    if missing:
        print("Introuvables :")
        for m in missing:
            print(f"  - {m}")


if __name__ == "__main__":
    asyncio.run(main())
