import { Link } from "react-router-dom";
import { InstagramLogo, TiktokLogo, FacebookLogo, LinkedinLogo, YoutubeLogo, MapPin, Phone, EnvelopeSimple } from "@phosphor-icons/react";
import { openCookieSettings } from "@/lib/consent";

const GOLD = "#d4af37";

const SOCIALS = [
  { icon: InstagramLogo, label: "Instagram", href: "https://www.instagram.com/tdlformation_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw%3D%3D" },
  { icon: TiktokLogo, label: "TikTok", href: "https://www.tiktok.com/@tdlformation?_r=1&_t=ZN-96iA2TYXyTK" },
  { icon: FacebookLogo, label: "Facebook", href: "https://www.facebook.com/tdlformationvtc93?mibextid=wwXIfr&rdid=3XjyqEuwkOTfSkAb&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1FrpoXScxD%2F%3Fmibextid%3DwwXIfr" },
  { icon: LinkedinLogo, label: "LinkedIn", href: "https://www.linkedin.com/company/tdlformation/" },
  { icon: YoutubeLogo, label: "YouTube", href: "https://youtube.com/@tdlformationtaxivtc6584?si=4SVsQlU8DMZ1dsoz" },
];

// Landings publiques sinon liées de nulle part dans le site (« orphan pages »
// pour les outils SEO) : le pied de page est commun à toutes les pages
// publiques, c'est le moyen le plus simple de leur donner des liens entrants.
const FORMATION_LINKS = [
  { to: "/formation-vtc", label: "Formation VTC" },
  { to: "/formation-taxi", label: "Formation Taxi" },
  { to: "/passerelle-taxi-banlieue-parisien", label: "Passerelle Taxi" },
  { to: "/mobilite-taxi", label: "Mobilité Taxi" },
  { to: "/formation-ssiap", label: "Formation SSIAP" },
  // { to: "/offre-fidelite", label: "Offre fidélité" },
];

const CENTRE_LINKS = [
  { to: "/formations", label: "Toutes nos formations" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Nous contacter" },
];

const LEGAL_LINKS = [
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/politique-de-confidentialite", label: "Confidentialité" },
];

// Pied de page commun aux pages publiques : mentions légales, FAQ, réseaux sociaux.
export default function SiteFooter({ className = "" }) {
  return (
    <footer className={`bg-black text-white ${className}`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <Link to="/" className="flex items-center gap-2 mb-4">
            <img
              src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png"
              alt="TDL Formation"
              width="36"
              height="36"
              className="w-9 h-9 rounded object-contain bg-white"
            />
            <span className="font-display font-bold text-sm tracking-tight">TDL Formation</span>
          </Link>
          <p className="text-sm text-gray-400 max-w-xs mb-5">
            Centre de formation agréé VTC, Taxi et sécurité incendie, au nord de Paris.
          </p>
          <div className="flex items-center gap-3">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.label}
                className="w-8 h-8 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-black transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = GOLD; e.currentTarget.style.borderColor = GOLD; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = "#374151"; }}
              >
                <s.icon size={15} weight="fill" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4">Nos formations</p>
          <ul className="flex flex-col gap-2.5">
            {FORMATION_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-sm text-gray-400 hover:text-white transition-colors">{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4">Le centre</p>
          <ul className="flex flex-col gap-2.5">
            {CENTRE_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-sm text-gray-400 hover:text-white transition-colors">{l.label}</Link>
              </li>
            ))}
            <li>
              <button onClick={() => openCookieSettings()} className="text-sm text-gray-400 hover:text-white transition-colors text-left" data-testid="footer-cookie-settings">
                Gérer les cookies
              </button>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4">Nous contacter</p>
          <ul className="flex flex-col gap-3 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0" style={{ color: GOLD }} />
              <span>Épinay-sur-Seine (93) &amp; Creil (60)</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone size={15} className="shrink-0" style={{ color: GOLD }} />
              <a href="tel:0180907244" className="hover:text-white transition-colors">01 80 90 72 44</a>
            </li>
            <li className="flex items-center gap-2">
              <EnvelopeSimple size={15} className="shrink-0" style={{ color: GOLD }} />
              <a href="mailto:contact@tdl-formation.fr" className="hover:text-white transition-colors font-mono text-xs">contact@tdl-formation.fr</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5 flex flex-wrap gap-4 items-center justify-between">
          <p className="text-xs text-gray-500">© 2026 TDL Formation · Tous droits réservés.</p>
          <div className="flex flex-wrap items-center gap-5">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="text-xs text-gray-500 hover:text-white transition-colors">{l.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
