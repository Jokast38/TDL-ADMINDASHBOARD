from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
APP_NAME = os.environ.get('APP_NAME', 'tdl-formation')

WORDPRESS_USER = os.getenv("WORDPRESS_USER")
WORDPRESS_SITE = os.getenv("WORDPRESS_SITE")
WORDPRESS_APP_PASSWORD = os.getenv("WORDPRESS_APP_PASSWORD")
WORDPRESS_SITE_K = os.getenv("WORDPRESS_SITE_K")
WORDPRESS_APP_PASSWORD_K = os.getenv("WORDPRESS_APP_PASSWORD_K")
WPCOM_CLIENT_ID = os.getenv("WORDPRESS_CLIENT_ID")
WPCOM_CLIENT_SECRET = os.getenv("WORDPRESS_CLIENT_SECRET")

GA4_PROPERTY_ID = os.getenv("GA4_PROPERTY_ID")
GA4_PROPERTY_ID_K = os.getenv("GA4_PROPERTY_ID_K")
GA4_SERVICE_ACCOUNT_PATH = os.getenv("GA4_SERVICE_ACCOUNT_PATH")
# On hosts without a local key file (e.g. Render), paste the full JSON key as an env var instead.
GA4_SERVICE_ACCOUNT_JSON = os.getenv("GA4_SERVICE_ACCOUNT_JSON")

GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
GOOGLE_PLACE_ID = os.getenv("GOOGLE_PLACE_ID")

# Agents IA (Limova) — la clé peut être posée ici en env (serveur) ou dans
# Paramètres → Limova (db.settings) ; ce dernier a priorité s'il est renseigné.
LIMOVA_API_KEY = os.getenv("LIMOVA_API_KEY")

# Paiement des inscriptions (formations non éligibles CPF) — mêmes priorités :
# Paramètres → Stripe (db.settings) prioritaire si renseigné, sinon ces env vars.
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Notifications push navigateur (Web Push / VAPID).
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_CLAIM_EMAIL = os.getenv("VAPID_CLAIM_EMAIL", "mailto:contact@tdl-formation.fr")

# Chatbot commercial — Ollama hébergé (ollama.com), modèle Mistral Nemo 12B.
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "https://ollama.com")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:31b")

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# URL publique du backend, utilisée pour construire des liens absolus dans les
# emails envoyés (ex: pixel de tracking d'ouverture) — un email ouvert dans
# une boîte mail externe ne peut pas pointer vers "localhost".
PUBLIC_BACKEND_URL = os.environ.get("PUBLIC_BACKEND_URL", "https://tdl-admindashboard.onrender.com")

# URL publique du FRONTEND, utilisée pour construire les liens absolus envoyés
# par email (connexion, réinitialisation de mot de passe...). En local ce sera
# http://localhost:3000 (à définir dans .env) ; en prod, le domaine change
# potentiellement — un seul endroit à mettre à jour, jamais de lien codé en dur
# qui finirait en 404 après un changement de nom de domaine.
PUBLIC_FRONTEND_URL = os.environ.get("PUBLIC_FRONTEND_URL", "https://tdl-formation.fr").rstrip("/")

# Permission groups
ROLES_ALL_STAFF = ("admin", "employe", "animateur", "responsable_admission", "agent_admin", "commercial", "responsable_commercial")
ROLES_ADMIN_STAFF = ("admin", "responsable_admission", "agent_admin")
ROLES_DOSSIERS_MGMT = ("admin", "employe", "responsable_admission", "agent_admin")
ROLES_DOCS_VIEW = ("admin", "employe", "responsable_admission", "agent_admin")
ROLES_ANIMATEUR_PLUS = ("admin", "animateur")
ROLES_LEADS = ("admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial")
ROLES_TEAM_MGMT = ("admin", "responsable_commercial")
ROLES_KAMI_STREET = ("admin", "employe", "commercial", "responsable_commercial")
