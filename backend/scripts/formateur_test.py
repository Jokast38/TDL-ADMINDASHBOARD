"""Compte formateur de test pour essayer le choix des dates (espace
animateur > Planning) et l'agenda des placements (page Formateurs) —
demande du 2026-11-04. Formateur BAFM en récupération de points, adresse
en example.com : aucun email ne part vers une vraie boîte.

Ses placements sont de vrais placements : ils prennent la place BAFM de la
session tant qu'ils ne sont pas retirés. --delete les retire tous avec le
compte.

--sessions crée des sessions de récupération de points en 2027 à des dates
aléatoires (demande du 2026-11-04), marquées `is_test` : seul le compte de
test les voit dans son planning, et le statut "complet" les retire de la
réservation publique.

Usage (depuis backend/) :
    python scripts/formateur_test.py             # crée le compte (ou redonne un mot de passe)
    python scripts/formateur_test.py --sessions  # ajoute des sessions de test en 2027
    python scripts/formateur_test.py --delete    # supprime le compte, ses placements et les sessions de test
"""
import asyncio
import os
import random
import secrets
import sys
import uuid
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import db
from core.security import hash_password
from core.utils import now_iso
from services.convention import _stage_animateur_ids

EMAIL = "formateur.test@example.com"
NB_SESSIONS = 16
LIEUX = [("Épinay-sur-Seine (93)", "59 avenue Joffre", "09:00", "17:00")] * 3 + [("Creil", "", "08:30", "16:30")]


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


async def create_sessions() -> None:
    formation = await db.formations.find_one({"category": "PERMIS"}, {"_id": 0, "id": 1, "title": 1})
    debuts = set()
    while len(debuts) < NB_SESSIONS:
        jour = date(2027, 1, 4) + timedelta(days=random.randrange(0, 357))
        if jour.weekday() in (0, 4):  # stages du lundi-mardi ou du vendredi-samedi
            debuts.add(jour)
    for debut in sorted(debuts):
        ville, adresse, heure_debut, heure_fin = random.choice(LIEUX)
        await db.stages.insert_one({
            "id": str(uuid.uuid4()), "formation_id": formation["id"], "formation_titre": formation["title"],
            "date_debut": debut.isoformat(), "date_fin": (debut + timedelta(days=1)).isoformat(),
            "lieu_ville": ville, "lieu_adresse": adresse, "heure_debut": heure_debut, "heure_fin": heure_fin,
            "capacite_max": 20, "nb_inscrits": 0, "animateur_ids": [], "animateur_id": None,
            "statut": "complet", "is_test": True, "notes": "SESSION DE TEST — scripts/formateur_test.py --delete",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
    print(f"{NB_SESSIONS} sessions de test créées en 2027 : " + ", ".join(d.strftime("%d/%m") for d in sorted(debuts)))


async def delete() -> None:
    result = await db.stages.delete_many({"is_test": True})
    print(f"{result.deleted_count} session(s) de test supprimée(s).")
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
    if "--delete" in sys.argv:
        asyncio.run(delete())
    elif "--sessions" in sys.argv:
        asyncio.run(create_sessions())
    else:
        asyncio.run(create())
