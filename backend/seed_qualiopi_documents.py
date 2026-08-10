# seed_qualiopi_documents.py - Upload les documents Qualiopi de référence
# (frontend/public/doc/qualiopi/) dans la bibliothèque "Documents entreprise"
# du dashboard (collection company_documents + stockage objet), idempotent
# (skip si un document du même nom existe déjà).
#
# Usage : python seed_qualiopi_documents.py
import os
import asyncio
import uuid
import mimetypes
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

from core.storage import put_object  # noqa: E402
from core.utils import now_iso  # noqa: E402
from core.config import APP_NAME  # noqa: E402

DOC_DIR = ROOT_DIR.parent / "frontend" / "public" / "doc" / "qualiopi"

# nom de fichier (sans extension) -> (nom affiché, catégorie, description)
DOCS = {
    "Procedure_veille_pedagogique_TDL_Formation": ("Procédure de veille pédagogique", "programme", "Procédure qualité — veille pédagogique"),
    "Tableau_veille_reglementaire_TDL_Formation": ("Tableau de veille réglementaire", "programme", "Suivi des évolutions réglementaires applicables aux formations"),
    "Fiche_impact_programme_formation_VTC_TDL": ("Fiche d'impact — Programme formation VTC", "programme", "Analyse d'impact du programme sur le contenu de formation VTC"),
    "Cartographie_fonctions_competences_TDL_Formation": ("Cartographie des fonctions et compétences", "autre", "Cartographie qualité des fonctions et compétences internes"),
    "Tableau_suivi_indicateurs_VTC_TDL_2026_session_sans_mentions": ("Tableau de suivi des indicateurs — VTC 2026", "autre", "Suivi des indicateurs qualité de la session VTC 2026"),
    "Registre_difficultes_incidents_aleas_VTC_TDL": ("Registre des difficultés, incidents et aléas", "autre", "Registre qualité des incidents et aléas rencontrés en formation VTC"),
    "Fiche_intervenant_formateur_VTC_TDL": ("Fiche intervenant / formateur VTC", "autre", "Fiche de présentation d'un formateur intervenant sur la formation VTC"),
    "Fiche_analyse_innovation_pedagogique_TDL": ("Fiche d'analyse — Innovation pédagogique", "autre", "Analyse qualité des innovations pédagogiques mises en œuvre"),
    "Registre_sources_professionnelles_partenaires_metiers_TDL": ("Registre des sources professionnelles et partenaires métiers", "autre", "Registre qualité des sources professionnelles et partenaires"),
    "Programme_Formation_VTC_TDL_2026": ("Programme de formation VTC 2026", "programme", "Programme détaillé de la formation VTC"),
    "Planning_detaille_VTC_9_au_20_fevrier_2026_TDL": ("Planning détaillé VTC — 9 au 20 février 2026", "calendrier", "Planning détaillé d'une session VTC"),
    "Fiche_ressources_pedagogiques_VTC_TDL": ("Fiche des ressources pédagogiques VTC", "programme", "Liste des ressources pédagogiques mobilisées pour la formation VTC"),
    "Fiche_moyens_materiels_locaux_VTC_TDL (1)": ("Fiche des moyens matériels et locaux VTC", "programme", "Description des moyens matériels et locaux utilisés"),
    "Procedure_veille_legale_reglementaire_TDL_Formation": ("Procédure de veille légale et réglementaire", "programme", "Procédure qualité — veille légale et réglementaire"),
    "Procedure_veille_metiers_emplois_competences_TDL_Formation": ("Procédure de veille métiers, emplois et compétences", "programme", "Procédure qualité — veille métiers/emplois/compétences"),
}


async def seed():
    if not DOC_DIR.exists():
        print(f"❌ Dossier introuvable : {DOC_DIR}")
        return

    created, skipped, missing = 0, 0, []
    for stem, (nom, category, description) in DOCS.items():
        path = DOC_DIR / f"{stem}.pdf"
        if not path.exists():
            missing.append(str(path.name))
            continue

        existing = await db.company_documents.find_one({"nom": nom})
        if existing:
            skipped += 1
            continue

        data = path.read_bytes()
        content_type = mimetypes.guess_type(str(path))[0] or "application/pdf"
        storage_path = f"{APP_NAME}/company-documents/{uuid.uuid4()}.pdf"
        result = await put_object(storage_path, data, content_type)

        doc = {
            "id": str(uuid.uuid4()),
            "nom": nom,
            "description": description,
            "category": category,
            "storage_path": result["path"],
            "original_filename": path.name,
            "content_type": content_type,
            "size": result["size"],
            "uploaded_by": "seed_script",
            "created_at": now_iso(),
        }
        await db.company_documents.insert_one(doc)
        created += 1
        print(f"✅ {nom}")

    print(f"\n{created} créé(s), {skipped} déjà présent(s) (ignorés)")
    if missing:
        print(f"⚠️ Fichiers non trouvés sur disque : {missing}")


if __name__ == "__main__":
    asyncio.run(seed())
