# Déploiement — Backend sur Render, Frontend sur Vercel

## 0. Prérequis
- Le code doit être dans un repo Git (GitHub/GitLab/Bitbucket) pour connecter Render et Vercel.
- `backend/.env` et `backend/*.json` (clé de service GA4) sont dans `.gitignore` — ne jamais les committer.

## 1. Backend → Render
1. Push le repo sur GitHub.
2. Sur [render.com](https://dashboard.render.com) : **New > Blueprint**, sélectionner le repo. Render lit `backend/render.yaml` automatiquement (root dir `backend`, build `pip install -r requirements.txt`, start `uvicorn server:app --host 0.0.0.0 --port $PORT`).
   - Sinon en manuel : **New > Web Service**, root dir `backend`, mêmes commandes.
3. Renseigner les variables d'environnement (copier depuis `backend/.env.example`, valeurs réelles depuis `backend/.env`) :
   - `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - `CORS_ORIGINS` = URL Vercel du frontend une fois connue (ex: `https://ton-app.vercel.app`)
   - `COOKIE_SECURE=true`
   - `SMTP_*`, `EMERGENT_LLM_KEY`, `TRELLO_*`, `WORDPRESS_*`, `WOOCOMMERCE_*`, `GA4_PROPERTY_ID*` selon besoin
   - `GA4_SERVICE_ACCOUNT_JSON` : coller le contenu **complet** du fichier JSON de service GA4 sur une seule ligne (Render n'a pas le fichier local `tdl-analtics-reader-*.json`).
4. Déployer. Vérifier `https://<service>.onrender.com/api/` → `{"service": "TDL Formation API", "status": "ok"}`.
   - Plan gratuit Render : le service se met en veille après inactivité (cold start ~30-60s au premier appel).

## 2. Frontend → Vercel
1. Sur [vercel.com](https://vercel.com/new), importer le repo, **Root Directory = `frontend`**.
2. Build command: `craco build` (ou laisser `yarn build`, déjà mappé dans `package.json`). Output: `build`.
3. Variables d'environnement (Project Settings > Environment Variables) :
   - `REACT_APP_BACKEND_URL` = URL Render (ex: `https://tdl-admindashboard-api.onrender.com`)
   - `WDS_SOCKET_PORT=443`, `ENABLE_HEALTH_CHECK=false`
4. `frontend/vercel.json` gère déjà le rewrite SPA (`react-router-dom`) vers `index.html`.
5. Déployer, puis retourner sur Render pour mettre à jour `CORS_ORIGINS` avec l'URL Vercel définitive, et redéployer le backend.

## 3. Vérifications post-déploiement
- Login admin depuis le frontend Vercel (token géré via `localStorage` + header `Authorization: Bearer`, donc pas de souci de cookies cross-domaine).
- Génération de documents / upload (stockage externe Emergent, pas de disque local — OK sur Render free tier).
- Si tu utilises un domaine personnalisé, mets-le aussi dans `CORS_ORIGINS` et dans `PUBLIC_BASE_URL` (sitemap/robots.txt).
