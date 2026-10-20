// Capture des paramètres UTM (?utm_source=meta&utm_campaign=...) déposés
// par une campagne publicitaire sur l'URL d'atterrissage — même logique
// que le fbc/fbclid de lib/metaPixel.js : capté une fois à l'arrivée sur le
// site, puis conservé en sessionStorage pour survivre à une navigation
// interne (ex: landing -> formulaire -> confirmation) avant d'être renvoyé
// avec l'inscription/le lead créé, pour pouvoir distinguer plusieurs
// campagnes qui pointent toutes vers la même page.
const STORAGE_KEY = "tdl_utm_params";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export function captureUtmParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const found = {};
    UTM_KEYS.forEach((key) => {
      const value = params.get(key);
      if (value) found[key] = value;
    });
    // Un nouveau clic publicitaire (nouveaux utm_* dans l'URL) écrase la
    // campagne précédemment mémorisée dans cet onglet ; une navigation
    // interne sans utm_* dans l'URL garde celle déjà capturée.
    if (Object.keys(found).length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
    }
  } catch {
    // sessionStorage bloqué (navigation privée stricte...) — tant pis, pas
    // d'attribution de campagne pour cette visite, mais le site continue.
  }
}

export function getUtmParams() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
