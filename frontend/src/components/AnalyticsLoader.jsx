import { useEffect } from "react";
import { api } from "@/lib/api";
import { hasConsent, CONSENT_CHANGED_EVENT } from "@/lib/consent";

/**
 * Injects analytics scripts (GA4 and/or Plausible) and the Meta Pixel based on
 * public site config — mais seulement si le visiteur y a consenti (bandeau
 * cookies, voir lib/consent.js). Plausible est exempté du consentement
 * (mesure d'audience sans cookie ni donnée personnelle, cf. recommandations
 * CNIL) ; GA4 et Meta Pixel nécessitent respectivement le consentement
 * "analytics" et "marketing". Rien n'est injecté sur /admin ou /login.
 */
export default function AnalyticsLoader() {
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/admin") || path === "/login") return;
    let cancelled = false;
    let cfgCache = null;

    const inject = (cfg) => {
      // Plausible — pas de cookie, pas de donnée personnelle : chargé sans
      // attendre de consentement (cf. exemption CNIL "mesure d'audience").
      if (cfg.plausible_domain && !document.getElementById("plausible-tag")) {
        const s = document.createElement("script");
        s.id = "plausible-tag";
        s.defer = true;
        s.setAttribute("data-domain", cfg.plausible_domain);
        s.src = "https://plausible.io/js/script.js";
        document.head.appendChild(s);
      }

      // GA4 — nécessite le consentement "mesure d'audience".
      if (cfg.google_analytics_id && hasConsent("analytics") && !document.getElementById("ga4-tag")) {
        const s1 = document.createElement("script");
        s1.id = "ga4-tag";
        s1.async = true;
        s1.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.google_analytics_id}`;
        document.head.appendChild(s1);
        const s2 = document.createElement("script");
        s2.id = "ga4-init";
        s2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${cfg.google_analytics_id}');`;
        document.head.appendChild(s2);
      }

      // Meta (Facebook) Pixel — nécessite le consentement "publicité/marketing".
      // Les événements custom (lib/metaPixel.js) vérifient eux aussi le
      // consentement avant d'appeler fbq(), en plus de cette garde ici.
      if (cfg.meta_pixel_id && hasConsent("marketing") && !document.getElementById("meta-pixel-tag")) {
        const s = document.createElement("script");
        s.id = "meta-pixel-tag";
        s.innerHTML = `
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${cfg.meta_pixel_id}');
          fbq('track', 'PageView');
        `;
        document.head.appendChild(s);
      }
    };

    api.get("/public/site-config").then((r) => {
      if (cancelled) return;
      cfgCache = r.data || {};
      inject(cfgCache);
    }).catch(() => {});

    // Si le visiteur accepte via le bandeau APRÈS le chargement initial de la
    // page, on injecte immédiatement les scripts nouvellement autorisés —
    // sans ça il faudrait recharger la page pour que le consentement prenne effet.
    const onConsentChange = () => { if (cfgCache) inject(cfgCache); };
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChange);

    return () => { cancelled = true; window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChange); };
  }, []);

  return null;
}
