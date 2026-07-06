import asyncio
import os
import logging
import uuid

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from core.database import client, db
from core.security import hash_password, verify_password
from core.storage import init_storage
from core.utils import now_iso

from routers import (
    auth, formations, inscriptions, documents, products,
    leads, employees, settings, dashboard, ai, blog,
    wordpress, stages, emargements, doc_templates,
    generated_docs, health,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

app = FastAPI(title="TDL Formation API")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', 'https://tdl-admindashboard.vercel.app').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

_PREFIX = "/api"
app.include_router(auth.router,           prefix=_PREFIX)
app.include_router(formations.router,     prefix=_PREFIX)
app.include_router(inscriptions.router,   prefix=_PREFIX)
app.include_router(documents.router,      prefix=_PREFIX)
app.include_router(products.router,       prefix=_PREFIX)
app.include_router(leads.router,          prefix=_PREFIX)
app.include_router(employees.router,      prefix=_PREFIX)
app.include_router(settings.router,       prefix=_PREFIX)
app.include_router(dashboard.router,      prefix=_PREFIX)
app.include_router(ai.router,             prefix=_PREFIX)
app.include_router(blog.router,           prefix=_PREFIX)
app.include_router(wordpress.router,      prefix=_PREFIX)
app.include_router(stages.router,         prefix=_PREFIX)
app.include_router(emargements.router,    prefix=_PREFIX)
app.include_router(doc_templates.router,  prefix=_PREFIX)
app.include_router(generated_docs.router, prefix=_PREFIX)
app.include_router(health.router,         prefix=_PREFIX)


async def _background_init():
    log = logging.getLogger(__name__)
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.formations.create_index("id", unique=True)
        await db.dossiers.create_index("id", unique=True)
        await db.inscriptions.create_index("id", unique=True)
        await db.products.create_index("id", unique=True)
        await db.orders.create_index("id", unique=True)
        await db.blog_posts.create_index("id", unique=True)
        await db.blog_posts.create_index("slug", unique=True)
        await db.stages.create_index("id", unique=True)
        await db.stages.create_index([("animateur_id", 1), ("date_debut", -1)])
        try:
            await db.emargements.drop_index("stage_id_1_inscription_id_1")
        except Exception:
            pass
        await db.emargements.create_index(
            [("stage_id", 1), ("inscription_id", 1), ("session_date", 1)], unique=True
        )
        await db.doc_templates.create_index("id", unique=True)
        await db.generated_docs.create_index("id", unique=True)
        await db.generated_docs.create_index([("dossier_id", 1), ("generated_at", -1)])
        await db.leads.create_index("id", unique=True)
        await db.leads.create_index("email")
        await db.leads.create_index("phone")
        await db.leads.create_index("status")
    except Exception as e:
        log.warning(f"Index creation: {e}")

    try:
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@tdlformation.fr").lower()
        admin_pwd = os.environ.get("ADMIN_PASSWORD", "admin123")
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "email": admin_email, "name": "Admin TDL",
                "role": "admin", "password_hash": hash_password(admin_pwd),
                "created_at": now_iso(), "active": True
            })
        elif not verify_password(admin_pwd, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pwd)}})

        if await db.formations.count_documents({}) == 0:
            seed_formations = [
                {"title": "CACES R489 Cat. 3 - Chariot élévateur", "category": "CACES", "description": "Formation initiale CACES catégorie 3 - chariot élévateur en porte-à-faux jusqu'à 6 tonnes.", "duration_hours": 35, "price": 850, "sessions_per_month": 4, "active": True, "image_url": "https://images.unsplash.com/photo-1532635026-d12867005472?w=800"},
                {"title": "CACES R486 Cat. B - Nacelle élévatrice", "category": "CACES", "description": "Formation conduite nacelle élévatrice multidirectionnelle.", "duration_hours": 21, "price": 650, "sessions_per_month": 3, "active": True, "image_url": "https://images.unsplash.com/photo-1532635026-d12867005472?w=800"},
                {"title": "Récupération points de permis", "category": "PERMIS", "description": "Stage agréé de récupération de 4 points sur 2 jours.", "duration_hours": 14, "price": 240, "sessions_per_month": 6, "active": True, "image_url": "https://images.unsplash.com/photo-1578041262130-633307b3bfd6?w=800"},
                {"title": "Permis B - Forfait complet", "category": "AUTO_ECOLE", "description": "Code + 20h de conduite, accompagnement ANTS inclus.", "duration_hours": 20, "price": 1290, "sessions_per_month": 8, "active": True, "image_url": "https://images.unsplash.com/photo-1578041262130-633307b3bfd6?w=800"},
                {"title": "SSIAP 1 - Agent de sécurité incendie", "category": "SSIAP", "description": "Formation initiale SSIAP 1 (67h) + examen.", "duration_hours": 67, "price": 720, "sessions_per_month": 2, "active": True, "image_url": "https://images.unsplash.com/photo-1599666433232-44c20a7b5e93?w=800"},
                {"title": "Formation VTC - Capacité professionnelle", "category": "VTC_TAXI", "description": "Préparation complète à l'examen VTC: théorique + conduite.", "duration_hours": 70, "price": 990, "sessions_per_month": 2, "active": True, "image_url": "https://images.unsplash.com/photo-1597260491619-bab87197869f?w=800"},
            ]
            for f in seed_formations:
                f["id"] = str(uuid.uuid4()); f["created_at"] = now_iso()
            await db.formations.insert_many(seed_formations)

        if await db.products.count_documents({}) == 0:
            seed_products = [
                {"name": "KAMI Urban Pro - Scooter électrique", "category": "scooter", "description": "Scooter urbain 45 km/h, autonomie 80 km, batterie amovible.", "price": 2490, "stock": 12, "active": True, "image_url": "https://images.unsplash.com/photo-1597260491619-bab87197869f?w=800"},
                {"name": "KAMI City - Vélo électrique pliant", "category": "velo", "description": "Vélo VAE pliant 250W, autonomie 60 km, 16kg.", "price": 1190, "stock": 24, "active": True, "image_url": "https://images.unsplash.com/photo-1571333250630-f0230c320b6d?w=800"},
                {"name": "KAMI Street X1 - Scooter sport", "category": "scooter", "description": "Scooter haute performance, accélération rapide, ABS.", "price": 3490, "stock": 6, "active": True, "image_url": "https://images.unsplash.com/photo-1597260491619-bab87197869f?w=800"},
            ]
            for p in seed_products:
                p["id"] = str(uuid.uuid4()); p["created_at"] = now_iso()
            await db.products.insert_many(seed_products)

        if await db.doc_templates.count_documents({}) == 0:
            await db.doc_templates.insert_many([
                {
                    "id": str(uuid.uuid4()), "nom": "Attestation de suivi de formation", "type_doc": "attestation",
                    "description": "Attestation simple de suivi remise au stagiaire en fin de formation.",
                    "contenu_html": "<h1>Attestation de suivi de formation</h1><p>Je soussigné(e) {{ animateur_nom }}, atteste que <b>{{ stagiaire_nom }}</b> a suivi la formation <b>{{ formation_titre }}</b> du {{ date_debut }} au {{ date_fin }} (durée : {{ duree }} heures) au sein de TDL Formation.</p><p>Fait à {{ ville }}, le {{ date_emission }}.</p>",
                    "variables": ["stagiaire_nom", "formation_titre", "date_debut", "date_fin", "duree", "animateur_nom", "ville", "date_emission"],
                    "actif": True, "created_at": now_iso(),
                },
                {
                    "id": str(uuid.uuid4()), "nom": "Convention de formation professionnelle", "type_doc": "convention",
                    "description": "Convention type entre l'organisme et le stagiaire.",
                    "contenu_html": "<h1>Convention de formation professionnelle</h1><p>Entre : <b>TDL Formation</b> et <b>{{ stagiaire_nom }}</b> ({{ stagiaire_email }}).</p><h2>Objet</h2><p>Formation : {{ formation_titre }} — {{ duree }} heures, du {{ date_debut }} au {{ date_fin }}.</p><h2>Tarif</h2><p>{{ prix }} € TTC.</p><h2>Lieu</h2><p>{{ lieu }}</p>",
                    "variables": ["stagiaire_nom", "stagiaire_email", "formation_titre", "duree", "date_debut", "date_fin", "prix", "lieu"],
                    "actif": True, "created_at": now_iso(),
                },
                {
                    "id": str(uuid.uuid4()), "nom": "Facture standard TDL", "type_doc": "facture",
                    "description": "Modèle de facture simple.",
                    "contenu_html": "<h1>Facture {{ numero }}</h1><p>Date : {{ date_emission }}</p><p>Client : {{ client_nom }} — {{ client_email }}</p><h2>Détail</h2><p>{{ description }} — {{ montant_ht }} € HT (TVA 20%) — Total TTC : <b>{{ montant_ttc }} €</b></p>",
                    "variables": ["numero", "date_emission", "client_nom", "client_email", "description", "montant_ht", "montant_ttc"],
                    "actif": True, "created_at": now_iso(),
                },
            ])
    except Exception as e:
        log.warning(f"Seeding: {e}")


@app.on_event("startup")
async def startup():
    asyncio.create_task(_background_init())
    asyncio.create_task(asyncio.to_thread(init_storage))


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
