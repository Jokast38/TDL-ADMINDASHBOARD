import { useEffect } from "react";
import { api } from "@/lib/api";

/**
 * Injects analytics scripts (GA4 and/or Plausible) based on public site config.
 * Only loads on public routes (skips /admin and /login by default).
 */
export default function AnalyticsLoader() {
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/admin") || path === "/login") return;
    let cancelled = false;

    api.get("/public/site-config").then((r) => {
      if (cancelled) return;
      const cfg = r.data || {};
      // GA4
      if (cfg.google_analytics_id && !document.getElementById("ga4-tag")) {
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
      // Plausible
      if (cfg.plausible_domain && !document.getElementById("plausible-tag")) {
        const s = document.createElement("script");
        s.id = "plausible-tag";
        s.defer = true;
        s.setAttribute("data-domain", cfg.plausible_domain);
        s.src = "https://plausible.io/js/script.js";
        document.head.appendChild(s);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return null;
}
