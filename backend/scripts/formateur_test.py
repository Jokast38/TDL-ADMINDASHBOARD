"""Compte formateur de test pour essayer le choix des dates (espace
animateur > Planning) et l'agenda des placements (page Formateurs) —
demande du 2026-11-04. Formateur BAFM en récupération de points, adresse
en example.com : aucun email ne part vers une vraie boîte.

Ses placements sont de vrais placements : ils prennent la place BAFM de la
session tant qu'ils ne sont pas retirés. --delete les retire tous avec le
compte.

Usage (depuis backend/) :
    python scripts/formateur_test.py           # crée le compte (ou redonne un mot de passe)
    python scripts/formateur_test.py --delete  # supprime le compte et ses placements
"""
import asyncio
import os
import secrets
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import db
from core.security import hash_password
from core.utils import now_iso
from services.convention import _stage_animateur_ids

EMAIL = "formateur.test@example.com"


async def create() -> None:
    password = secrets.token_urlsafe(9)
    existing = await db.users.find_one({"email": EMAIL}, {"_id": 0, "id": 1})
    if existing:
        await db.users.update_one({"id": existing["id"]}, {"$set": {"password_hash": hash_password(password)}})
        print("Compte déjà présent, nouveau mot de passe défini.")
    else:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": EMAIL, "name": "Formateur TEST",
            "nom": "TEST", "prenom": "Formateur", "role": "animateur", "titre": "Formateur BAFM",
            "assigned_categories": ["PERMIS"], "matricule": "F-TEST", "is_test": True,
            "password_hash": hash_password(password), "created_at": now_iso(),
            "active": True, "account_status": "actif", "must_change_password": False,
        })
        print("Compte créé.")
    print(f"Email : {EMAIL}\nMot de passe : {password}")


async def delete() -> None:
    user = await db.users.find_one({"email": EMAIL}, {"_id": 0, "id": 1})
    if not user:
        print("Aucun compte de test.")
        return
    uid = user["id"]
    stages = await db.stages.find({"$or": [{"animateur_ids": uid}, {"animateur_id": uid}]}, {"_id": 0}).to_list(1000)
    for s in stages:
        ids = [i for i in _stage_animateur_ids(s) if i != uid]
        await db.stages.update_one({"id": s["id"]}, {"$set": {"animateur_ids": ids, "animateur_id": ids[0] if ids else None, "updated_at": now_iso()}})
    await db.users.delete_one({"id": uid})
    print(f"Compte supprimé, retiré de {len(stages)} session(s).")


if __name__ == "__main__":
    asyncio.run(delete() if "--delete" in sys.argv else create())
