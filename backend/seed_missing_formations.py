# seed_missing_formations.py - Ajoute les formations manquantes en base
# (CACES 3, SSIAP 1/2/3) sans dupliquer celles qui existent déjà.
# Usage : python seed_missing_formations.py
import os
import asyncio
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# Prix/durées repris de backend/knowledge/tarifs.md (grille tarifaire
# officielle) — jamais de montant inventé. SSIAP 2/3 : aucun tarif documenté
# nulle part dans le projet, donc price=0 ("sur devis", paiement en ligne
# désactivé automatiquement, cf. backend/routers/payments.py).
FORMATIONS = [
    {
        "title": "CACES R489 Cat. 3 - Chariot élévateur",
        "category": "CACES",
        "description": "Formation à la conduite en sécurité d'un chariot élévateur en porte-à-faux jusqu'à 6 tonnes (CACES R489 catégorie 3), théorie et pratique, avec passage de l'examen en fin de formation.",
        "duration_hours": 35,
        "price": 850,
        "sessions_per_month": 4,
        "active": True,
        "documents_requis": ["identite", "photo"],
        "cpf_eligible": True,
    },
    {
        "title": "SSIAP 1 - Agent de sécurité incendie",
        "category": "SSIAP",
        "description": "Formation d'agent de sécurité incendie en ERP (Établissement Recevant du Public) et IGH (Immeuble de Grande Hauteur) : réglementation incendie, manipulation des équipements, mises en situation, examen final.",
        "duration_hours": 67,
        "price": 720,
        "sessions_per_month": 2,
        "active": True,
        "documents_requis": ["identite", "photo"],
        "cpf_eligible": True,
    },
    {
        "title": "SSIAP 2 - Chef d'équipe sécurité incendie",
        "category": "SSIAP",
        "description": "Formation de chef d'équipe de sécurité incendie (nécessite le SSIAP 1 et une expérience professionnelle minimale). Tarif communiqué sur devis selon votre profil.",
        "duration_hours": 0,
        "price": 0,
        "sessions_per_month": 1,
        "active": True,
        "documents_requis": ["identite", "photo"],
        "cpf_eligible": None,
    },
    {
        "title": "SSIAP 3 - Chef de service sécurité incendie",
        "category": "SSIAP",
        "description": "Formation de chef de service de sécurité incendie (nécessite le SSIAP 2 et une expérience professionnelle minimale). Tarif communiqué sur devis selon votre profil.",
        "duration_hours": 0,
        "price": 0,
        "sessions_per_month": 1,
        "active": True,
        "documents_requis": ["identite", "photo"],
        "cpf_eligible": None,
    },
]


async def seed():
    created, skipped = [], []
    for f in FORMATIONS:
        existing = await db.formations.find_one({"title": f["title"]})
        if existing:
            skipped.append(f["title"])
            continue
        doc = dict(f)
        doc["id"] = str(uuid.uuid4())
        doc["image_url"] = None
        doc["created_at"] = now_iso()
        await db.formations.insert_one(doc)
        created.append(f["title"])

    print(f"✅ Créées ({len(created)}):")
    for t in created:
        print(f"   - {t}")
    print(f"⏭️  Déjà existantes, ignorées ({len(skipped)}):")
    for t in skipped:
        print(f"   - {t}")


if __name__ == "__main__":
    asyncio.run(seed())
