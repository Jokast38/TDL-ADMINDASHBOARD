# Admin Dashboard — TDL Formation & KAMI Street

Tableau de bord d'administration full-stack pour **TDL Formation** (centre de formation professionnelle) et **KAMI Street** (mobilité électrique). Gestion des formations, stagiaires, leads CRM, documents, blog et intégrations tierces.

---

## Stack technique

| Couche | Technologies |
|---|---|
| **Frontend** | React 19, React Router 7, Tailwind CSS 3, shadcn/ui (Radix UI), Axios, Recharts, Framer Motion |
| **Backend** | Python 3, FastAPI 0.110, Motor 3 (MongoDB async), Uvicorn |
| **Base de données** | MongoDB (via Motor — driver asyncio) |
| **Auth** | JWT (PyJWT) + bcrypt |
| **PDF** | ReportLab (attestations), xhtml2pdf (modèles HTML) |
| **Email** | Resend / SendGrid / SMTP (configurable) |
| **Intégrations** | WooCommerce REST, WordPress REST, Google Analytics 4, Trello, n8n webhooks |
| **IA** | Google Gemini / LiteLLM |
| **Stockage** | Stockage objet (Emergent Storage) |
| **Build** | CRACO (Create React App + surcouche) |

---

## Architecture

```
PROJET-ADMINDASHBOARD/
├── backend/                          # API FastAPI
│   ├── server.py                     # Point d'entrée — app FastAPI, routers, startup
│   ├── requirements.txt
│   ├── .env                          # Variables d'environnement (non versionné)
│   ├── seed_doc_templates.py         # Script de seed des modèles de documents
│   ├── tdl-analytics-reader-*.json  # Clé service account Google Analytics
│   │
│   ├── core/                         # Infrastructure transversale
│   │   ├── config.py                 # Lecture .env, constantes, rôles
│   │   ├── database.py               # Client MongoDB Motor (AsyncIOMotorClient)
│   │   ├── security.py               # JWT, hash bcrypt, dépendances require_role()
│   │   ├── storage.py                # Client stockage objet (put_object / get_object)
│   │   └── utils.py                  # now_iso() et autres helpers
│   │
│   ├── models/                       # Schémas Pydantic (validation requêtes)
│   │   ├── auth.py                   # LoginIn, TokenOut
│   │   ├── blog.py                   # BlogPostIn, BlogPostUpdate
│   │   ├── document.py               # GeneratedDocIn
│   │   ├── employee.py               # EmployeeIn, AccountStatusIn
│   │   ├── formation.py              # FormationIn, FormationUpdate
│   │   ├── inscription.py            # InscriptionIn
│   │   ├── lead.py                   # LeadIn, LeadUpdate, LeadImportJsonIn, LeadRelanceIn
│   │   ├── product.py                # ProductIn
│   │   ├── settings.py               # SettingsIn
│   │   └── stage.py                  # StageIn, EmargementIn
│   │
│   ├── routers/                      # Routes API (un fichier par domaine)
│   │   ├── ai.py                     # POST /api/ai/chat — assistant IA (Gemini/LiteLLM)
│   │   ├── auth.py                   # POST /api/auth/login — authentification JWT
│   │   ├── blog.py                   # CRUD /api/blog — articles blog
│   │   ├── dashboard.py              # GET /api/dashboard/stats — KPIs agrégés
│   │   ├── doc_templates.py          # CRUD /api/doc-templates — modèles de documents
│   │   ├── documents.py              # /api/dossiers/:id/documents — upload/download
│   │   ├── emargements.py            # POST /api/emargements — signature + PDF attestation
│   │   ├── employees.py              # CRUD /api/employees — gestion collaborateurs
│   │   ├── formations.py             # CRUD /api/formations — catalogue formations
│   │   ├── generated_docs.py         # POST /api/documents-generated — génération PDF
│   │   ├── health.py                 # GET /api/health — healthcheck
│   │   ├── inscriptions.py           # CRUD /api/inscriptions — inscriptions stagiaires
│   │   ├── leads.py                  # CRUD /api/leads — CRM + import Excel/JSON
│   │   ├── products.py               # CRUD /api/products — catalogue KAMI Street
│   │   ├── settings.py               # GET/PUT /api/settings — paramètres globaux
│   │   ├── stages.py                 # CRUD /api/stages — sessions de formation
│   │   └── wordpress.py              # /api/wordpress/* — WooCommerce, WP, GA4
│   │
│   ├── services/                     # Logique métier externe (tous non-bloquants)
│   │   ├── email.py                  # send_email() — Resend / SendGrid / SMTP
│   │   ├── n8n.py                    # trigger_n8n() — webhooks n8n
│   │   ├── pdf.py                    # generate_attestation_pdf(), render_html_pdf()
│   │   ├── trello.py                 # TrelloService — création/déplacement de cartes
│   │   └── wordpress.py              # fetch_wp_content_stats(), fetch_ga4_traffic()
│   │
│   └── tests/
│       ├── backend_test.py
│       ├── test_blog.py
│       ├── test_seo_smtp.py
│       └── test_sprint3.py
│
└── frontend/                         # SPA React
    ├── package.json
    ├── craco.config.js               # Surcouche webpack (chemins absolus @/)
    ├── tailwind.config.js
    ├── jsconfig.json
    ├── .env                          # REACT_APP_API_URL (non versionné)
    ├── postcss.config.js
    │
    ├── public/
    │   ├── index.html
    │   ├── tdl.png                   # Logo TDL
    │   ├── vtc-reussir.webp
    │   └── doc/                      # Documents PDF publics
    │
    ├── plugins/
    │   └── health-check/             # Plugin webpack healthcheck dev
    │
    └── src/
        ├── App.js                    # Routing React Router (toutes les routes)
        ├── index.js
        ├── index.css                 # Variables Tailwind globales
        ├── App.css
        │
        ├── lib/
        │   ├── api.js                # Instance Axios + intercepteurs JWT auto
        │   └── utils.js              # cn() (clsx + tailwind-merge)
        │
        ├── contexts/
        │   └── AuthContext.jsx       # Contexte global user/token + login/logout
        │
        ├── hooks/
        │   └── use-toast.js          # Hook toast (sonner)
        │
        ├── constants/
        │   └── testIds/              # IDs pour tests E2E
        │
        ├── components/
        │   ├── Layout.jsx            # Shell : sidebar, navbar, navigation par rôle
        │   ├── AnalyticsLoader.jsx   # Injection script analytics
        │   └── ui/                   # 35 composants shadcn/ui (Radix UI)
        │       ├── button.jsx
        │       ├── card.jsx
        │       ├── dialog.jsx
        │       ├── table.jsx
        │       ├── select.jsx
        │       ├── badge.jsx
        │       ├── toast.jsx / toaster.jsx / sonner.jsx
        │       └── ...               # accordion, alert, avatar, calendar, etc.
        │
        └── pages/
            ├── Login.jsx             # Page de connexion
            ├── Dashboard.jsx         # Vue d'ensemble : KPIs, produits, commandes WooCommerce
            ├── Formations.jsx        # Catalogue et gestion des formations TDL
            ├── Inscriptions.jsx      # Inscriptions stagiaires + dossiers
            ├── Dossiers.jsx          # Suivi dossiers administratifs
            ├── Stages.jsx            # Sessions de formation + planning formateurs
            ├── Employees.jsx         # Gestion équipe (admin)
            ├── Leads.jsx             # CRM : liste, filtres, relance email, import Excel
            ├── Marketing.jsx         # Outils marketing et communication
            ├── Settings.jsx          # Paramètres : email, Trello, n8n, WooCommerce…
            ├── AIAssistant.jsx       # Assistant IA (Gemini)
            ├── AdminBlog.jsx         # Gestion des articles blog (admin)
            ├── Blog.jsx              # Blog public TDL
            ├── BlogPost.jsx          # Article blog individuel
            ├── DocTemplates.jsx      # Éditeur de modèles de documents HTML
            ├── DocumentsLibrary.jsx  # Bibliothèque des documents générés
            ├── Orders.jsx            # Commandes WooCommerce KAMI Street
            ├── KamiStreet.jsx        # Dashboard KAMI Street (admin)
            ├── PublicKamiStreet.jsx  # Vitrine publique KAMI Street
            ├── AnimateurSpace.jsx    # Espace formateur : stages, émargements, attestations
            ├── StudentSpace.jsx      # Espace étudiant : dossier, documents
            ├── PublicInscription.jsx # Formulaire d'inscription public
            └── Landing.jsx           # Page d'accueil publique TDL
```

---

## Modules fonctionnels

| Module | Description |
|---|---|
| **Authentification** | Login JWT, rôles : `admin`, `employe`, `animateur`, `etudiant`, `responsable_admission`, `commercial` |
| **Dashboard** | KPIs temps réel : inscriptions, chiffre d'affaires, dossiers, commandes WooCommerce |
| **Formations** | Catalogue CACES, VTC/Taxi, SSIAP, Permis B, récupération de points |
| **Inscriptions & Dossiers** | Cycle complet admission → vérification → soumission ANTS |
| **Stages & Émargements** | Planning sessions, signature électronique, attestations PDF auto |
| **CRM Leads** | Import Excel (TDL multi-format, auto-détection colonnes), relance email groupée, dédoublonnage |
| **Documents** | Upload/download sécurisé, modèles HTML variables, génération PDF à la demande |
| **Collaborateurs** | Création comptes staff, gestion rôles, profils + documents RH |
| **Blog** | Rédaction, SEO (slug auto), publication/dépublication |
| **KAMI Street** | Catalogue produits, commandes WooCommerce, stats site WordPress + GA4 |
| **Intégrations** | Email (Resend/SendGrid/SMTP), Trello, n8n, WooCommerce, Google Analytics 4 |
| **IA** | Assistant Gemini contextualisé (formations, inscriptions, leads) |

---

## Principales routes API

```
POST   /api/auth/login
GET    /api/dashboard/stats

GET    /api/formations
POST   /api/formations
PUT    /api/formations/:id
DELETE /api/formations/:id

GET    /api/inscriptions
POST   /api/inscriptions

GET    /api/leads
POST   /api/leads
PUT    /api/leads/:id
DELETE /api/leads/:id
POST   /api/leads/bulk-delete
POST   /api/leads/import/xlsx
POST   /api/leads/import/json
POST   /api/leads/import/from-inscriptions
POST   /api/leads/relance
POST   /api/leads/relance/single

GET    /api/stages
POST   /api/stages
POST   /api/emargements
GET    /api/stages/:id/emargement-pdf

GET    /api/doc-templates
POST   /api/doc-templates
POST   /api/documents-generated
GET    /api/documents-generated/:id/download

GET    /api/employees
POST   /api/employees
GET    /api/users

GET    /api/settings
PUT    /api/settings

GET    /api/wordpress/kami/products
GET    /api/wordpress/kami/orders
GET    /api/wordpress/stats/kami
GET    /api/wordpress/stats/tdl
GET    /api/integrations/status

POST   /api/ai/chat
GET    /api/blog
POST   /api/blog
GET    /api/health
```

---

## Installation

### Prérequis

- Python 3.11+
- Node.js 18+ / Yarn
- MongoDB (local ou Atlas)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Copier et renseigner les variables d'env
copy .env.example .env

# Démarrer le serveur (hot reload)
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
yarn install

# Copier et renseigner les variables d'env
copy .env.example .env

yarn start          # http://localhost:3000
yarn build          # Build production → build/
```

---

## Variables d'environnement

### Backend — `backend/.env`

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=tdl_dashboard

JWT_SECRET=<secret>
ADMIN_EMAIL=admin@tdlformation.fr
ADMIN_PASSWORD=<mot_de_passe>

EMERGENT_LLM_KEY=<cle_emergent>
STORAGE_URL=https://...

# Optionnel — configurables aussi depuis l'UI Settings
TRELLO_API_KEY=
TRELLO_API_TOKEN=
```

### Frontend — `frontend/.env`

```env
REACT_APP_API_URL=http://localhost:8000
```

---

## Rôles et accès

| Rôle | Accès |
|---|---|
| `admin` | Accès total |
| `employe` | Dashboard, formations, inscriptions, leads, blog |
| `responsable_admission` | Dossiers, inscriptions, leads |
| `commercial` | Leads, marketing |
| `animateur` | Ses propres stages, émargements, attestations |
| `agent_admin` | Dossiers, documents |
| `etudiant` | Son propre espace, ses documents |

---

## Import Excel Leads

Le module CRM détecte automatiquement le format du fichier Excel importé :

1. **Format TDL planning** — colonnes `FORMATION / VILLE / PROVENANCE / PRENOM / NOM / @ / TEL / ... / COMMENTAIRE` (avec ou sans en-têtes)
2. **Format générique avec en-têtes** — détection par nom de colonne (prenom, nom, email, tel…)
3. **Sans en-têtes** — détection par contenu : colonne `@` → email, ≥ 8 chiffres → téléphone, colonnes juste avant l'email → nom/prénom, colonne 0 si mots-clés formation → intérêt

Les intérêts sont normalisés automatiquement : `vtc`, `VTC`, `VTC ` → **VTC** ; `PASSERELLE TAXI`, `passerelle taxi` → **Passerelle Taxi** ; etc.

Les doublons sont ignorés à l'import (dédoublonnage par email puis par téléphone).

---

## Notes techniques

- Tous les appels réseau et CPU-bound dans les handlers `async` sont wrappés avec `asyncio.to_thread()` pour ne jamais bloquer l'event loop asyncio.
- Le démarrage du serveur est non-bloquant : indexes MongoDB et seed des données se font en tâche de fond (`asyncio.create_task`).
- Le dashboard React charge les données critiques (stats, users) en premier, puis les données secondaires (WooCommerce, WordPress) en arrière-plan sans bloquer l'affichage.
- Les actions partielles du dashboard (afficher plus de produits, changer statut commande, sauvegarder produit) font des mises à jour optimistes sans recharger toute la page.
