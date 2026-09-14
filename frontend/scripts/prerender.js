/**
 * Pré-rendu statique du site public (SEO) — exécuté automatiquement après
 * `yarn build` (voir "postbuild" dans package.json).
 *
 * Le site est une SPA React 100% client-side : sans ça, tout robot qui
 * n'exécute pas JavaScript (beaucoup d'outils SEO, certains bots) ne voit
 * qu'une coquille HTML vide — pas de titre, pas de H1, pas de liens, pas de
 * contenu. Ce script lance un vrai navigateur headless (Puppeteer) sur
 * chaque page publique du site déjà buildé, attend que React ait fini de
 * rendre, puis écrase le HTML statique correspondant par le rendu complet.
 * Googlebot (qui exécute déjà JS) n'en a pas besoin, mais tous les autres
 * robots/outils en profitent, et Google lui-même indexe plus vite un
 * contenu déjà présent au premier passage plutôt qu'après un rendu différé.
 *
 * Best-effort : si l'API backend est injoignable au moment du build (les
 * routes dynamiques ne peuvent alors pas être découvertes), le script ne
 * fait échouer ni le pré-rendu des pages statiques, ni le build lui-même —
 * mieux vaut un site qui déploie avec un SEO partiellement amélioré qu'un
 * déploiement cassé.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

// Le Chromium embarqué dans le paquet "puppeteer" (utilisé en local) ne
// démarre pas sur l'environnement de build de Vercel — il lui manque des
// librairies système (libnss3.so...) qu'on ne peut pas installer (pas de
// root, pas d'apt-get). `@sparticuz/chromium` fournit un binaire Chromium
// autonome conçu pour ce genre d'environnement restreint (Vercel/AWS
// Lambda) ; on ne l'utilise que là, et le "puppeteer" classique en local où
// son propre Chromium fonctionne très bien (Windows/Mac/Linux de dev).
const ON_VERCEL = !!process.env.VERCEL;
const puppeteer = ON_VERCEL ? require("puppeteer-core") : require("puppeteer");
const chromium = ON_VERCEL ? require("@sparticuz/chromium") : null;

async function launchBrowser() {
  if (ON_VERCEL) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  return puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
}

const BUILD_DIR = path.join(__dirname, "..", "build");
const PORT = 45678;
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

// Pages publiques statiques (voir les routes déclarées dans src/App.js) —
// tout ce qui n'est pas admin/espace privé/formulaire d'auth.
const STATIC_ROUTES = [
  "/",
  "/formations",
  "/inscription",
  "/blog",
  "/kami-street",
  "/offre-fidelite",
  "/stage-recuperation-points",
  "/formation-ssiap",
  "/formation-taxi",
  "/mobilite-taxi",
  "/passerelle-taxi-banlieue-parisien",
  "/formation-vtc",
  "/formation-caces",
  "/faq",
  "/mentions-legales",
  "/politique-de-confidentialite",
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function discoverDynamicRoutes() {
  const routes = [];
  if (!BACKEND_URL) {
    console.warn("[prerender] REACT_APP_BACKEND_URL absent — routes dynamiques ignorées.");
    return routes;
  }
  try {
    const formations = await fetchJson(`${BACKEND_URL}/api/formations?active_only=true`);
    for (const f of formations) routes.push(`/formations/${f.slug || f.id}`);
  } catch (e) {
    console.warn("[prerender] Impossible de récupérer les formations :", e.message);
  }
  try {
    const posts = await fetchJson(`${BACKEND_URL}/api/blog/posts?limit=500`);
    for (const p of posts) routes.push(`/blog/${p.slug}`);
  } catch (e) {
    console.warn("[prerender] Impossible de récupérer les articles de blog :", e.message);
  }
  return routes;
}

// Petit serveur statique avec repli SPA (sert build/index.html pour toute
// route sans fichier correspondant) — nécessaire pour que le routeur React
// fonctionne normalement pendant que Puppeteer navigue.
function startServer() {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split("?")[0]);
    let filePath = path.join(BUILD_DIR, reqPath);
    if (reqPath === "/" || !path.extname(filePath)) {
      filePath = path.join(BUILD_DIR, "index.html");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(BUILD_DIR, "index.html"), (err2, fallback) => {
          if (err2) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(fallback);
        });
        return;
      }
      const ext = path.extname(filePath);
      const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json" }[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

function outputPathFor(route) {
  const clean = route.replace(/^\/+/, "").replace(/\/+$/, "");
  const dir = clean ? path.join(BUILD_DIR, clean) : BUILD_DIR;
  return path.join(dir, "index.html");
}

async function prerenderRoute(browser, route) {
  const page = await browser.newPage();
  try {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
    // Laisse le temps aux derniers effets React (reveal/animations, fetch
    // en cascade) de se stabiliser avant de capturer le HTML final.
    await new Promise((r) => setTimeout(r, 400));
    const html = await page.content();
    const outPath = outputPathFor(route);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    return true;
  } catch (e) {
    console.warn(`[prerender] Échec sur ${route} :`, e.message);
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  if (!fs.existsSync(BUILD_DIR)) {
    console.warn("[prerender] Dossier build/ introuvable — étape ignorée.");
    return;
  }
  const dynamicRoutes = await discoverDynamicRoutes();
  const routes = [...STATIC_ROUTES, ...dynamicRoutes];
  console.log(`[prerender] ${routes.length} page(s) à pré-rendre (${STATIC_ROUTES.length} statiques + ${dynamicRoutes.length} dynamiques).`);

  const server = await startServer();
  let browser;
  try {
    browser = await launchBrowser();
    let ok = 0;
    for (const route of routes) {
      const success = await prerenderRoute(browser, route);
      if (success) ok++;
    }
    console.log(`[prerender] Terminé : ${ok}/${routes.length} pages pré-rendues.`);
  } catch (e) {
    console.warn("[prerender] Erreur globale — le build continue avec le rendu 100% client-side :", e.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((e) => {
  // Ne jamais faire échouer le build à cause du pré-rendu — un déploiement
  // avec un SEO partiellement amélioré vaut toujours mieux qu'un
  // déploiement cassé.
  console.warn("[prerender] Erreur non gérée — le build continue :", e);
});
