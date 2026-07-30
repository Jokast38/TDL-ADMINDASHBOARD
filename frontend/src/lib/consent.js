// Gestion du consentement cookies (recommandations CNIL) : aucun cookie/script
// non essentiel n'est chargé avant un choix explicite de l'utilisateur.
// "necessary" n'est pas une vraie catégorie de choix (toujours vrai, pas de
// cookie de mesure/pub) — elle existe pour que l'UI puisse afficher un
// toggle désactivé "Toujours actif".

const KEY = "tdl_cookie_consent";
export const CONSENT_CHANGED_EVENT = "tdl:consent-changed";
export const OPEN_COOKIE_SETTINGS_EVENT = "tdl:open-cookie-settings";

export function getConsent() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setConsent({ analytics = false, marketing = false }) {
  const consent = { necessary: true, analytics, marketing, date: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
  } catch { /* stockage indisponible (navigation privée stricte) — le choix ne persistera pas, sans bloquer la page */ }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: consent }));
  return consent;
}

export function hasConsent(category) {
  if (category === "necessary") return true;
  return !!getConsent()?.[category];
}

export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT));
}
