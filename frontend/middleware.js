/**
 * Edge Middleware — détecte les crawlers/outils SEO (User-Agent) et
 * redirige leur requête vers /api/render, qui rend la page avec un vrai
 * Chromium avant de répondre. Les visiteurs humains ne passent jamais par
 * ce chemin : ils reçoivent le SPA normal, servi statiquement.
 *
 * Voir api/render.js pour le pourquoi de cette architecture (rendu à la
 * demande dans une fonction serverless, pas pendant le build).
 */
import { rewrite } from "@vercel/edge";

// "ahrefs" (pas juste "ahrefsbot") : l'outil Site Audit d'Ahrefs envoie un
// User-Agent "AhrefsSiteAudit", distinct du crawler de backlinks
// "AhrefsBot" — un match trop strict le loupait entièrement, si bien que
// Site Audit recevait la coquille vide du SPA et remontait "orphan page" /
// "no outgoing links" sur toutes les pages, homepage comprise.
const BOT_UA_REGEX =
  /googlebot|bingbot|yandexbot|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|ahrefs|semrush|mj12bot|dotbot|rogerbot|applebot|discordbot|slackbot|pinterest|redditbot|petalbot|sogou|exabot|ia_archiver|embedly|quora link preview|showyoubot|outbrain|w3c_validator|screaming frog|headlesschrome/i;

// Filet de sécurité générique : une liste de noms de bots connus se périme
// vite (on vient de perdre Ahrefs Site Audit à cause de ça). Au lieu de
// rallonger la liste à chaque nouvel outil, on route aussi vers le rendu
// tout ce qui *ressemble* à un outil automatisé par son nom — les vrais
// navigateurs n'ont jamais "bot", "crawl", "spider", "audit"... dans leur
// User-Agent, donc le risque de faux positif est nul (et un faux positif
// serait de toute façon inoffensif : le SPA s'hydrate normalement par-dessus
// le HTML pré-rendu).
const GENERIC_TOOL_UA_REGEX = /bot|crawl|spider|audit|checker|scanner|monitor|validator|fetch|analyzer|lighthouse/i;

function isBotRequest(ua) {
  return BOT_UA_REGEX.test(ua) || GENERIC_TOOL_UA_REGEX.test(ua);
}

export default function middleware(request) {
  // Requête interne émise par api/render.js lui-même — ne pas la
  // réécrire, sinon boucle infinie.
  if (request.headers.get("x-prerender-bypass")) return;

  const ua = request.headers.get("user-agent") || "";
  if (!isBotRequest(ua)) return;

  const url = new URL(request.url);
  const target = new URL("/api/render", url);
  target.searchParams.set("path", url.pathname + url.search);
  return rewrite(target);
}

export const config = {
  // Toutes les routes "page" (pas les assets avec extension, pas /api).
  matcher: ["/((?!api/|static/|.*\\.[\\w]+$).*)"],
};
