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

const BOT_UA_REGEX =
  /googlebot|bingbot|yandexbot|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|ahrefsbot|semrushbot|mj12bot|dotbot|rogerbot|applebot|discordbot|slackbot|pinterestbot|redditbot|petalbot|sogou|exabot|ia_archiver|embedly|quora link preview|showyoubot|outbrain|w3c_validator|screaming frog|headlesschrome/i;

export default function middleware(request) {
  // Requête interne émise par api/render.js lui-même — ne pas la
  // réécrire, sinon boucle infinie.
  if (request.headers.get("x-prerender-bypass")) return;

  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA_REGEX.test(ua)) return;

  const url = new URL(request.url);
  const target = new URL("/api/render", url);
  target.searchParams.set("path", url.pathname + url.search);
  return rewrite(target);
}

export const config = {
  // Toutes les routes "page" (pas les assets avec extension, pas /api).
  matcher: ["/((?!api/|static/|.*\\.[\\w]+$).*)"],
};
