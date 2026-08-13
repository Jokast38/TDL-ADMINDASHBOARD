import { hasConsent } from "@/lib/consent";

// Wrapper sûr autour de window.fbq (Meta Pixel) — no-op si le pixel n'est pas
// chargé (ID pas encore configuré dans Paramètres, ou script bloqué par un
// bloqueur de pub) : les appels de tracking ne doivent jamais faire planter
// une action utilisateur (recherche, inscription...). Vérifie aussi le
// consentement "marketing" en plus de la garde déjà côté AnalyticsLoader
// (défense en profondeur : même si le script était chargé par un autre biais,
// aucun événement ne part sans consentement).
// `eventID` (optionnel) doit être identique à celui envoyé côté serveur
// (Meta Conversions API, voir backend/services/meta_capi.py) pour la même
// action réelle — c'est ce qui permet à Meta de dédupliquer l'évènement
// pixel et l'évènement CAPI au lieu de compter la conversion deux fois.
export function trackMetaEvent(eventName, params = {}, eventID = null) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (!hasConsent("marketing")) return;
  try {
    if (eventID) window.fbq("track", eventName, params, { eventID });
    else window.fbq("track", eventName, params);
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
export const trackLead = (params, eventID) => trackMetaEvent("Lead", params, eventID);
export const trackInitiateCheckout = (params) => trackMetaEvent("InitiateCheckout", params);
export const trackPurchase = (params, eventID) => trackMetaEvent("Purchase", params, eventID);
export const trackCompleteRegistration = (params) => trackMetaEvent("CompleteRegistration", params);

// Génère un identifiant unique côté navigateur, à envoyer tel quel au backend
// (payload.event_id) pour que l'évènement CAPI corresponde exactement à
// l'évènement pixel de la même action.
export const newEventId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
