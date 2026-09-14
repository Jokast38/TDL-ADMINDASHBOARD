// Exécuté avant `craco build` (voir "prebuild" dans package.json). Le backend
// expose déjà un sitemap dynamique, alimenté par la base (formations, articles
// de blog), sur GET /api/sitemap.xml (voir backend/routers/health.py). Mais ce
// front est une SPA statique déployée sur Vercel, sans code serveur à elle —
// jusqu'ici, vercel.json faisait un reverse-proxy live de /sitemap.xml vers le
// backend Render à CHAQUE requête. Problème : sur le plan gratuit Render, le
// service s'endort après inactivité — la première requête d'un crawler après
// une période creuse pouvait donc être très lente, voire timeout, sur le
// fichier que Google consulte le plus souvent. On le récupère une fois ici, au
// moment du build, et on l'écrit en dur dans public/sitemap.xml : Vercel le
// sert alors comme un fichier statique normal, toujours instantané.
//
// Nécessite REACT_APP_BACKEND_URL pointant vers le vrai backend de production
// pendant le build Vercel (pas localhost). S'il est injoignable, on écrit un
// sitemap minimal de repli plutôt que de casser le déploiement.
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const SITE_URL = "https://www.tdl-formation.fr";
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const OUT_FILE = path.join(__dirname, "..", "public", "sitemap.xml");

const FALLBACK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/formations</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>${SITE_URL}/blog</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
`;

function fetchText(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

async function main() {
  if (!BACKEND_URL) {
    console.warn("[sitemap] REACT_APP_BACKEND_URL absent — sitemap minimal écrit.");
    fs.writeFileSync(OUT_FILE, FALLBACK_XML, "utf-8");
    return;
  }
  try {
    const xml = await fetchText(`${BACKEND_URL}/api/sitemap.xml`);
    fs.writeFileSync(OUT_FILE, xml, "utf-8");
    console.log(`[sitemap] Récupéré depuis le backend et écrit dans ${OUT_FILE}`);
  } catch (err) {
    console.warn(`[sitemap] Échec récupération backend (${err.message}) — sitemap minimal écrit.`);
    fs.writeFileSync(OUT_FILE, FALLBACK_XML, "utf-8");
  }
}

main();
