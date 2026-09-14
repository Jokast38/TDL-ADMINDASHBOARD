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
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await chromium.executablePath();
      return puppeteer.launch({
        headless: true,
        executablePath,
        args: chromium.args,
      });
    })().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
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
    await page.goto(target, { waitUntil: "networkidle0", timeout: 15000 });
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
    // ?debug=1 : renvoie l'erreur en clair au lieu du 302 silencieux, pour
    // diagnostiquer un souci de lancement de Chromium sans dépendre des
    // logs Vercel.
    if (req.query.debug) {
      res.status(500).json({ error: e.message, stack: e.stack });
      return;
    }
    // Best-effort : si Chromium échoue pour une raison quelconque, on
    // laisse passer le visiteur (bot ou non) vers le SPA normal plutôt que
    // de casser la page.
    res.setHeader("Location", safePath);
    res.status(302).end();
  } finally {
    if (page) await page.close().catch(() => {});
  }
};

module.exports.config = { api: { bodyParser: false } };
