import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CookieIcon } from "@phosphor-icons/react";
import { getConsent, setConsent, OPEN_COOKIE_SETTINGS_EVENT } from "@/lib/consent";

const GOLD = "#d4af37";

// Bandeau de consentement cookies — recommandations CNIL : 3 choix d'égale
// importance visuelle (Tout accepter / Tout refuser / Personnaliser), aucun
// script de mesure d'audience ou publicitaire chargé avant un choix explicite.
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, marketing: false });

  useEffect(() => {
    // Pas de bandeau sur le dashboard interne (staff) — seulement les pages
    // publiques visitées par de vrais internautes, comme AnalyticsLoader.
    const path = window.location.pathname;
    if (path.startsWith("/admin") || path === "/login") return;
    if (!getConsent()) setVisible(true);
    const reopen = () => {
      const current = getConsent();
      setDraft({ analytics: !!current?.analytics, marketing: !!current?.marketing });
      setCustomizing(true);
      setVisible(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const acceptAll = () => { setConsent({ analytics: true, marketing: true }); setVisible(false); };
  const rejectAll = () => { setConsent({ analytics: false, marketing: false }); setVisible(false); };
  const saveCustom = () => { setConsent(draft); setVisible(false); setCustomizing(false); };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6"
      role="dialog"
      aria-label="Gestion des cookies"
      data-testid="cookie-consent-banner"
    >
      <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg shadow-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CookieIcon size={22} style={{ color: GOLD }} weight="fill" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base mb-1">Respect de votre vie privée</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Nous utilisons des cookies pour assurer le fonctionnement du site, mesurer notre audience et,
              si vous l'acceptez, personnaliser nos communications. Vous pouvez accepter, refuser ou choisir
              précisément vos préférences. Plus d'informations dans notre{" "}
              <Link to="/politique-de-confidentialite" className="underline hover:text-[#0a0a0a]">
                politique de confidentialité
              </Link>.
            </p>
          </div>
        </div>

        {customizing && (
          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-gray-50">
              <div>
                <p className="text-sm font-medium">Nécessaires</p>
                <p className="text-xs text-gray-500">Fonctionnement du site — toujours actifs.</p>
              </div>
              <input type="checkbox" checked disabled className="w-4 h-4" />
            </div>
            <label className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-gray-50 cursor-pointer">
              <div>
                <p className="text-sm font-medium">Mesure d'audience</p>
                <p className="text-xs text-gray-500">Google Analytics — statistiques de fréquentation.</p>
              </div>
              <input
                type="checkbox"
                checked={draft.analytics}
                onChange={(e) => setDraft((d) => ({ ...d, analytics: e.target.checked }))}
                className="w-4 h-4"
                data-testid="cookie-toggle-analytics"
              />
            </label>
            <label className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-gray-50 cursor-pointer">
              <div>
                <p className="text-sm font-medium">Publicité & réseaux sociaux</p>
                <p className="text-xs text-gray-500">Meta (Facebook/Instagram) Pixel — suivi des campagnes publicitaires.</p>
              </div>
              <input
                type="checkbox"
                checked={draft.marketing}
                onChange={(e) => setDraft((d) => ({ ...d, marketing: e.target.checked }))}
                className="w-4 h-4"
                data-testid="cookie-toggle-marketing"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4 justify-end">
          {customizing ? (
            <button
              onClick={saveCustom}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-[#0a0a0a] text-white hover:bg-[#1a1a1a]"
              data-testid="cookie-save-custom"
            >
              Enregistrer mes choix
            </button>
          ) : (
            <>
              <button
                onClick={rejectAll}
                className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 hover:bg-gray-50"
                data-testid="cookie-reject-all"
              >
                Tout refuser
              </button>
              <button
                onClick={() => { setDraft({ analytics: false, marketing: false }); setCustomizing(true); }}
                className="px-4 py-2 text-sm font-semibold rounded-md border border-gray-300 hover:bg-gray-50"
                data-testid="cookie-customize"
              >
                Personnaliser
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-2 text-sm font-semibold rounded-md text-black hover:brightness-95"
                style={{ backgroundColor: GOLD }}
                data-testid="cookie-accept-all"
              >
                Tout accepter
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
