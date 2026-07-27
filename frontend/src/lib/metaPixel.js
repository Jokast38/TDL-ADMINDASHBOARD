// Wrapper sûr autour de window.fbq (Meta Pixel) — no-op si le pixel n'est pas
// chargé (ID pas encore configuré dans Paramètres, ou script bloqué par un
// bloqueur de pub) : les appels de tracking ne doivent jamais faire planter
// une action utilisateur (recherche, inscription...).
export function trackMetaEvent(eventName, params = {}) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    window.fbq("track", eventName, params);
  } catch {
    // silencieux — le tracking ne doit jamais interrompre le parcours utilisateur
  }
}

// Événements standard Meta utilisés sur le site :
// - Search            : recherche d'une formation / d'une session
// - Schedule          : sélection d'une session/date sur une landing page
// - Lead              : demande de rappel / formulaire de contact
// - CompleteRegistration : inscription finalisée
export const trackSearch = (searchString) => trackMetaEvent("Search", { search_string: searchString });
export const trackSchedule = (params) => trackMetaEvent("Schedule", params);
export const trackLead = (params) => trackMetaEvent("Lead", params);
export const trackCompleteRegistration = (params) => trackMetaEvent("CompleteRegistration", params);
