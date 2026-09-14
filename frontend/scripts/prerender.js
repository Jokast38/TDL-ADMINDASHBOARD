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
 * Les routes à pré-rendre viennent de build/sitemap.xml (écrit juste avant
 * par scripts/build-sitemap.js) — best-effort partout : si ce fichier est
 * absent, si Chromium ne démarre pas, ou si une page précise échoue, rien de
 * tout ça ne fait échouer le build lui-même — mieux vaut un site qui déploie
 * avec un SEO partiellement amélioré qu'un déploiement cassé.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

// Le Chromium embarqué dans le paquet "puppeteer" (utilisé en local) ne
// démarre pas sur l'environnement de build Linux de Vercel — il lui manque
// des librairies système qu'on ne peut pas installer (pas de root, pas
// d'apt-get). `@sparticuz/chromium` fournit un binaire Chromium autonome
// conçu pour ce genre d'environnement restreint ; on ne l'utilise que sur
// Linux (CI/Vercel), et le "puppeteer" classique en local (Windows/Mac de
// dev) où son propre Chromium fonctionne très bien.
const puppeteer = process.platform === "linux" ? require("puppeteer-core") : require("puppeteer");
const chromium = process.platform === "linux" ? require("@sparticuz/chromium") : null;

async function launchBrowser() {
  if (process.platform === "linux") {
    return puppeteer.launch({
      headless: true,
      executablePath: await chromium.executablePath(),
      args: chromium.args,
    });
  }
  // Local (Windows/Mac de dev) : le Chromium fourni par le paquet complet
  // "puppeteer" (téléchargé à l'installation) fonctionne directement, pas
  // besoin d'un Chrome système.
  return puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
}

const BUILD_DIR = path.join(__dirname, "..", "build");
const SITEMAP_FILE = path.join(BUILD_DIR, "sitemap.xml");
const PORT = 45678;

// Liste des routes à pré-rendre à partir du sitemap.xml déjà écrit dans
// build/ (voir scripts/build-sitemap.js, exécuté juste avant `craco build`)
// — une seule source de vérité pour "quelles pages publiques existent",
// plutôt que de la dupliquer ici en dur + refaire des appels API séparés.
function routesFromSitemap() {
  if (!fs.existsSync(SITEMAP_FILE)) {
    console.warn("[prerender] Pas de sitemap.xml dans build/ — rien à pré-rendre.");
    return [];
  }
  const xml = fs.readFileSync(SITEMAP_FILE, "utf-8");
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  const paths = locs
    .map((loc) => {
      try {
        return new URL(loc).pathname;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return [...new Set(paths)];
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
  const routes = routesFromSitemap();
  if (!routes.length) return;
  console.log(`[prerender] ${routes.length} page(s) à pré-rendre (depuis sitemap.xml).`);

  const server = await startServer();
  let browser;
  try {
    browser = await launchBrowser();
    let ok = 0;
    // Séquentiel plutôt qu'en parallèle : plus lent, mais nettement plus
    // fiable, surtout sur un conteneur de build (Vercel) probablement moins
    // généreux en mémoire/CPU qu'un poste de dev — 4 onglets Chrome ouverts
    // en même temps s'est montré instable en test local. ~82 pages tiennent
    // largement dans le budget de temps de build en séquentiel (~8 min
    // observées).
    for (const route of routes) {
      if (await prerenderRoute(browser, route)) ok++;
    }
    console.log(`[prerender] Terminé : ${ok}/${routes.length} pages pré-rendues.`);
  } catch (e) {
    console.warn("[prerender] Erreur globale — le build continue avec le rendu 100% client-side :", e.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .catch((e) => {
    // Ne jamais faire échouer le build à cause du pré-rendu — un déploiement
    // avec un SEO partiellement amélioré vaut toujours mieux qu'un
    // déploiement cassé.
    console.warn("[prerender] Erreur non gérée — le build continue :", e);
  })
  .finally(() => process.exit(0));
