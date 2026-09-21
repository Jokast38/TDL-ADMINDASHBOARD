// Préchauffe le cache CDN du pré-rendu pour les bots (voir api/render.js).
//
// Chaque page est demandée avec un User-Agent de crawler, ce qui déclenche
// le rendu Chromium ; une réponse réussie reste servie par le CDN pendant
// 24h. Un rendu raté renvoie à la place la coquille SPA (200 jamais mise en
// cache) : on la détecte — elle ne contient aucun lien <a>, contrairement à
// une page rendue — et on réessaie. (Vercel retire `s-maxage` des en-têtes
// envoyés au client, on ne peut donc pas s'y fier.) Sans ça, ces pages ne sont rendues qu'au premier passage d'un
// vrai crawler, et lors d'un crawl complet (beaucoup de démarrages à froid
// de Chromium en parallèle) une partie d'entre elles retombe sur la coquille.
//
// Usage (à lancer après chaque déploiement) :
//   node scripts/warm-cache.js                       # lit le sitemap du site
//   node scripts/warm-cache.js https://autre-domaine # autre base d'URL
const SITE_URL = (process.argv[2] || "https://www.tdl-formation.fr").replace(/\/$/, "");
const UA = "Mozilla/5.0 (compatible; TDL-CacheWarmer/1.0; +bot)";
const CONCURRENCY = 2; // volontairement bas : Chromium en serverless est fragile
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 40000;

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const html = await res.text();
  return { status: res.status, rendered: res.ok && /<a\s/i.test(html) };
}

async function warm(url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { status, rendered } = await fetchPage(url);
      if (rendered) return { url, ok: true, attempt };
      if (attempt === MAX_ATTEMPTS) return { url, ok: false, reason: `repli (HTTP ${status})` };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) return { url, ok: false, reason: err.message };
    }
  }
}

async function main() {
  const xml = await (await fetch(`${SITE_URL}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!urls.length) throw new Error(`Aucune URL trouvée dans ${SITE_URL}/sitemap.xml`);
  console.log(`[warm-cache] ${urls.length} pages à préchauffer sur ${SITE_URL}`);

  const queue = [...urls];
  const results = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const r = await warm(queue.shift());
        results.push(r);
        console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.url}${r.ok ? (r.attempt > 1 ? ` (essai ${r.attempt})` : "") : ` — ${r.reason}`}`);
      }
    })
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`[warm-cache] ${results.length - failed.length}/${results.length} rendues et en cache.`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[warm-cache] ${err.message}`);
  process.exit(1);
});
