import asyncio
import secrets
import sys
import os
import uuid
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import db
from core.security import hash_password
from core.utils import now_iso


async def main():
    # Stage VTC JOUR du 12->16 octobre, identifié via l'inscription correcte
    # d'un autre candidat du même groupe (bah.abdoulaye92) plutôt que par
    # date/créneau seuls, car plusieurs stages (VTC, Taxi, Passerelle)
    # partagent les mêmes dates/créneau à Épinay.
    ref_insc = await db.inscriptions.find_one({"student_email": "bah.abdoulaye92@outlook.fr"}, {"_id": 0, "stage_id": 1, "formation_id": 1, "formation_title": 1, "category": 1, "price": 1, "center": 1})
    stage_id = ref_insc["stage_id"]
    stage = await db.stages.find_one({"id": stage_id}, {"_id": 0})
    print("Stage VTC JOUR cible :", stage["formation_titre"], stage["date_debut"], "->", stage["date_fin"], stage["lieu_ville"])

    # 1) FRITZ PIERRE — déjà inscrit mais sans session : on le rattache.
    fritz = await db.inscriptions.find_one({"student_email": "fritzpiere92@gmail.com"}, {"_id": 0})
    if fritz and not fritz.get("stage_id"):
        await db.inscriptions.update_one(
            {"id": fritz["id"]},
            {"$set": {"stage_id": stage_id, "session": stage_id, "center": ref_insc.get("center")}},
        )
        print(f"OK : {fritz['student_email']} rattaché à la session {stage_id}")
    else:
        print("FRITZ PIERRE : rien à faire (déjà rattaché ou introuvable) ->", fritz)

    # 2) MASSINISSA HALLI — absent de la base : on le crée comme les autres
    # lignes de cet import (même schéma que l'import Excel VTC_TAXI 2026).
    email = "massinisahalli@gmail.com"
    existing = await db.inscriptions.find_one({"student_email": email}, {"_id": 0})
    if existing:
        print("MASSINISSA HALLI existe déjà :", existing)
    else:
        name = "MASSINISSA HALLI"
        user = await db.users.find_one({"email": email})
        if user:
            user_id = user["id"]
        else:
            user_id = str(uuid.uuid4())
            await db.users.insert_one({
                "id": user_id, "email": email, "name": name, "role": "etudiant",
                "phone": "650327075", "password_hash": hash_password(secrets.token_urlsafe(12)),
                "created_at": now_iso(), "active": True,
            })

        insc_id = str(uuid.uuid4())
        inscription = {
            "id": insc_id, "formation_id": ref_insc["formation_id"], "formation_title": ref_insc["formation_title"],
            "category": ref_insc["category"], "student_id": user_id, "student_name": name,
            "student_email": email, "student_phone": "650327075",
            "price": ref_insc.get("price", 0),
            "payment_status": "cpf_attente", "status": "active", "contact_status": "a_contacter",
            "notes": "N° dossier : 98683 · Chargé(e) : BOUCHRA · Créneau : JOUR — importé de la liste VTC_TAXI 2026 (Feuille 19)",
            "created_at": now_iso(), "source": "excel_import_vtc_taxi_2026", "session": stage_id,
            "stage_id": stage_id, "center": ref_insc.get("center"),
            "cma_dossier_number": "98683",
        }
        await db.inscriptions.insert_one(inscription)

        dossier_id = str(uuid.uuid4())
        await db.dossiers.insert_one({
            "id": dossier_id, "inscription_id": insc_id, "student_id": user_id,
            "formation_id": ref_insc["formation_id"], "formation_title": ref_insc["formation_title"],
            "category": ref_insc["category"], "student_name": name, "student_email": email,
            "status": "nouveau", "notes": "", "assigned_to": None,
            "documents_requis": [], "trello_card_id": None, "trello_card_url": None,
            "documents": [], "created_at": now_iso(), "updated_at": now_iso(),
            "source": "excel_import_vtc_taxi_2026",
        })
        print(f"OK : {email} créé et rattaché à la session {stage_id} (inscription {insc_id})")


if __name__ == "__main__":
    asyncio.run(main())
