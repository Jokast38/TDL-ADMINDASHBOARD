import { hasConsent } from "@/lib/consent";

// Wrapper sûr autour de window.fbq (Meta Pixel) — no-op si le pixel n'est pas
// chargé (ID pas encore configuré dans Paramètres, ou script bloqué par un
// bloqueur de pub) : les appels de tracking ne doivent jamais faire planter
// une action utilisateur (recherche, inscription...). Vérifie aussi le
// consentement "marketing" en plus de la garde déjà côté AnalyticsLoader
// (défense en profondeur : même si le script était chargé par un autre biais,
// aucun événement ne part sans consentement).
export function trackMetaEvent(eventName, params = {}) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (!hasConsent("marketing")) return;
  try {
    window.fbq("track", eventName, params);
  } catch {
    // silencieux — le tracking ne doit jamais interrompre le parcours utilisateur
  }
}

// Événements standard Meta utilisés sur le site :
// - PageView          : vue de page (auto, voir AnalyticsLoader — 'init' déclenche déjà PageView)
// - ViewContent        : clic sur un CTA principal d'une landing page (bouton "recevoir le programme"...)
// - Search            : recherche d'une formation / d'une session
// - Schedule          : sélection d'une session/date sur une landing page
// - Lead              : demande de rappel / formulaire de contact (= "subscription" à une offre)
// - InitiateCheckout  : clic sur "payer maintenant" (avant redirection Stripe)
// - Purchase          : paiement confirmé (retour de Stripe Checkout)
// - CompleteRegistration : inscription finalisée
export const trackPageView = () => trackMetaEvent("PageView");
export const trackViewContent = (params) => trackMetaEvent("ViewContent", params);
export const trackSearch = (searchString) => trackMetaEvent("Search", { search_string: searchString });
export const trackSchedule = (params) => trackMetaEvent("Schedule", params);
export const trackLead = (params) => trackMetaEvent("Lead", params);
export const trackInitiateCheckout = (params) => trackMetaEvent("InitiateCheckout", params);
export const trackPurchase = (params) => trackMetaEvent("Purchase", params);
export const trackCompleteRegistration = (params) => trackMetaEvent("CompleteRegistration", params);
