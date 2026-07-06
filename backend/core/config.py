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

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# Permission groups
ROLES_ALL_STAFF = ("admin", "employe", "animateur", "responsable_admission", "agent_admin", "commercial")
ROLES_ADMIN_STAFF = ("admin", "responsable_admission", "agent_admin")
ROLES_DOSSIERS_MGMT = ("admin", "employe", "responsable_admission", "agent_admin")
ROLES_DOCS_VIEW = ("admin", "employe", "responsable_admission", "agent_admin")
ROLES_ANIMATEUR_PLUS = ("admin", "animateur")
ROLES_LEADS = ("admin", "employe", "responsable_admission", "agent_admin", "commercial")
