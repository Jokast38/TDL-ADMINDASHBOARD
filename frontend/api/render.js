/**
 * Rendu dynamique à la demande (SEO) — appelé uniquement pour les requêtes
 * identifiées comme un bot/crawler par middleware.js, jamais pour un vrai
 * visiteur.
 *
 * Contrairement à une tentative précédente qui essayait de pré-rendre les
 * pages pendant `buildCommand` (le conteneur de build Vercel n'a pas les
 * libs système requises par Chromium, ex. libnss3, et on ne peut pas les
 * installer — pas de root), cette fonction lance Chromium au moment de la
 * requête, dans le runtime des fonctions serverless Vercel — c'est cet
 * environnement-là que @sparticuz/chromium cible réellement.
 *
 * middleware.js réécrit la requête d'un bot vers /api/render?path=<route>,
 * on charge cette route sur le déploiement en cours (avec un header qui
 * fait sauter la réécriture pour éviter une boucle infinie), on attend que
 * React ait fini de rendre, et on renvoie le HTML final — mis en cache par
 * le CDN Vercel pour éviter de relancer Chromium à chaque crawl.
 */
// @sparticuz/chromium only extracts the shared-libs pack (which contains
// libnss3.so and friends) and points LD_LIBRARY_PATH at it when it detects
// it's running inside real AWS Lambda (via AWS_EXECUTION_ENV /
// AWS_LAMBDA_JS_RUNTIME). Vercel's Node.js function runtime is Lambda-based
// under the hood but doesn't set those vars, so the package silently skips
// both steps — the chromium binary exists in /tmp but can't resolve its own
// libraries. Spoofing the env var (must happen before requiring the module,
// since the LD_LIBRARY_PATH side of this runs at module-load time) makes it
// go through the same code path it would on real Lambda.
// "al2" (non-Node20) pack turned out incomplete for Vercel's actual base OS
// (missing libnspr4.so even after libnss3.so resolved) — use the Node20
// code path instead, which extracts the newer "al2023" lib pack.
if (!process.env["AWS_EXECUTION_ENV"] && !process.env["AWS_LAMBDA_JS_RUNTIME"]) {
  process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs20.x";
}
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

// Le mode graphique (SwiftShader, rendu 3D logiciel) est activé par défaut
// dans @sparticuz/chromium mais totalement inutile pour un simple instantané
// HTML — il fait grossir l'extraction et surtout la mémoire utilisée par
// Chromium, une ressource déjà rare dans l'environnement contraint d'une
// fonction serverless (cause probable des "net::ERR_INSUFFICIENT_RESOURCES"
// observés en prod sur ce endpoint).
chromium.setGraphicsMode = false;

let browserPromise = null;
async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: chromium.args,
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

// Si le navigateur partagé (réutilisé entre requêtes tant que la fonction
// reste "chaude") se retrouve dans un état dégradé après une erreur de
// navigation, le garder en cache ferait échouer aussi toutes les requêtes
// suivantes sur cette même instance jusqu'à son recyclage naturel par
// Vercel. On le ferme et on force un relancement propre au prochain appel.
async function discardBrowser() {
  const current = browserPromise;
  browserPromise = null;
  try {
    const browser = await current;
    await browser?.close();
  } catch {
    // rien à faire : le navigateur était déjà dans un état incertain
  }
}

module.exports = async (req, res) => {
  const routePath = typeof req.query.path === "string" ? req.query.path : "/";
  const safePath = routePath.startsWith("/") ? routePath : `/${routePath}`;
  const target = `https://${req.headers.host}${safePath}`;

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    // Empêche middleware.js de re-router cette requête interne vers /api/render.
    await page.setExtraHTTPHeaders({ "x-prerender-bypass": "1" });
    // "networkidle2" (≤2 connexions actives, pas 0) plutôt que networkidle0 —
    // plus tolérant à une éventuelle requête d'analytics/tracking qui traîne
    // en arrière-plan sans jamais se couper, ce qui ferait sinon attendre le
    // timeout complet à chaque rendu pour rien.
    await page.goto(target, { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 300));
    const html = await page.content();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Le HTML rendu ne change pas d'une requête à l'autre pour un même
    // contenu : on laisse le CDN le servir directement aux crawlers
    // suivants pendant 24h plutôt que de relancer Chromium à chaque fois.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(html);
  } catch (e) {
    console.warn(`[render] Échec sur ${safePath}, repli sur le SPA brut :`, e.message);
    await discardBrowser();
    // ?debug=1 : renvoie l'erreur en clair au lieu du 302 silencieux, pour
    // diagnostiquer un souci de lancement de Chromium sans dépendre des
    // logs Vercel.
    if (req.query.debug) {
      res.status(500).json({ error: e.message, stack: e.stack });
      return;
    }
    // Best-effort : si Chromium échoue pour une raison quelconque, on
    // renvoie quand même la page (SPA brute, non pré-rendue) en 200 — un
    // 302 ici est exactement ce qui faisait remonter ces pages comme "non
    // indexables" côté outils SEO : le crawler ne voit qu'une redirection
    // au lieu d'un contenu, même dégradé. Pas de cache sur ce repli (pas de
    // s-maxage), pour que le prochain passage retente un vrai rendu.
    try {
      const fallback = await fetch(target, { headers: { "x-prerender-bypass": "1" } });
      const body = await fallback.text();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(body);
    } catch (fallbackError) {
      console.warn(`[render] Repli SPA brut également en échec sur ${safePath} :`, fallbackError.message);
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
      res.end("<!DOCTYPE html><html><head><title>TDL Formation</title></head><body></body></html>");
    }
  } finally {
    if (page) await page.close().catch(() => {});
  }
};

module.exports.config = { api: { bodyParser: false } };
