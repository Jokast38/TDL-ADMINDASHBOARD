const SITE_URL = "https://tdl-formation.fr";

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Définit titre, description et lien canonique de la page courante — même
// esprit que les `document.title = ...` déjà utilisés dans ce codebase,
// étendu pour couvrir ce que l'audit SEO signalait manquant (canonique
// dupliqué/absent sur une SPA sans rendu serveur par page).
export function setPageMeta({ title, description, path = window.location.pathname }) {
  if (title) {
    document.title = title;
    upsertMeta("property", "og:title", title);
  }
  if (description) {
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:description", description);
  }
  const url = `${SITE_URL}${path}`;
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
  upsertMeta("property", "og:url", url);
}
