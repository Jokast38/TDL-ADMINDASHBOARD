import { Link } from "react-router-dom";

// Case de consentement RGPD réutilisée sur tous les formulaires publics
// collectant des données personnelles (inscription, contact, demande de
// rappel) — cochée par défaut à false, obligatoire pour envoyer.
export default function PrivacyConsentCheckbox({ checked, onChange, testId = "privacy-consent" }) {
  return (
    <label className="flex items-start gap-2 text-xs text-gray-500 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
        data-testid={testId}
      />
      <span>
        J'accepte que mes données soient utilisées pour traiter ma demande, conformément à la{" "}
        <Link to="/politique-de-confidentialite" target="_blank" className="underline hover:text-[#0a0a0a]">
          politique de confidentialité
        </Link>.
      </span>
    </label>
  );
}
