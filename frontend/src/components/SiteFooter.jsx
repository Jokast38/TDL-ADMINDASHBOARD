import { Link } from "react-router-dom";
import { InstagramLogo, TiktokLogo, FacebookLogo } from "@phosphor-icons/react";

const SOCIALS = [
  { icon: InstagramLogo, label: "Instagram", href: "https://www.instagram.com/tdlformation_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw%3D%3D" },
  { icon: TiktokLogo, label: "TikTok", href: "https://www.tiktok.com/@tdlformation?_r=1&_t=ZN-96iA2TYXyTK" },
  { icon: FacebookLogo, label: "Facebook", href: "https://www.facebook.com/tdlformationvtc93?mibextid=wwXIfr&rdid=3XjyqEuwkOTfSkAb&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1FrpoXScxD%2F%3Fmibextid%3DwwXIfr" },
];

// Pied de page commun aux pages publiques : mentions légales, FAQ, réseaux sociaux.
export default function SiteFooter({ className = "border-t border-gray-200 py-8" }) {
  return (
    <footer className={className}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-4 items-center justify-between">
        <p className="text-sm text-gray-500">© 2026 TDL Formation · Tous droits réservés.</p>
        <div className="flex flex-wrap items-center gap-5">
          <Link to="/faq" className="text-xs text-gray-400 hover:text-[#d4af37]">FAQ</Link>
          <Link to="/mentions-legales" className="text-xs text-gray-400 hover:text-[#d4af37]">Mentions légales</Link>
          <div className="flex items-center gap-3">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.label}
                className="text-gray-400 hover:text-[#d4af37] transition-colors"
              >
                <s.icon size={18} weight="fill" />
              </a>
            ))}
          </div>
          <p className="text-xs text-gray-400 font-mono">contact@tdl-formation.fr</p>
        </div>
      </div>
    </footer>
  );
}
