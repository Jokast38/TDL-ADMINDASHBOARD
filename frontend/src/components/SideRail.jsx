import { MapPin, FileText, EnvelopeSimple, Phone } from "@phosphor-icons/react";

const PHONE_DISPLAY = "01 80 90 72 49";
const PHONE_HREF = "tel:+33180907249";

/**
 * Rail fixe à droite (desktop uniquement, masqué sous 1280px comme dans la
 * maquette) avec des onglets qui se rétractent et ne révèlent leur libellé
 * qu'au survol/focus — repris du gabarit de landing page fourni par
 * l'utilisateur (`.tdl-fp__rail`), ré-implémenté en Tailwind pour rester
 * cohérent avec le reste du kit de composants des landing pages.
 */
export default function SideRail({ centresHref = "#centres", brochureHref, contactHref = "#contact", phone = PHONE_HREF, phoneLabel = PHONE_DISPLAY }) {
  const items = [
    { icon: MapPin, label: "Nos centres", href: centresHref },
    brochureHref ? { icon: FileText, label: "Brochure", href: brochureHref, target: "_blank" } : null,
    { icon: EnvelopeSimple, label: "Nous écrire", href: contactHref },
    { icon: Phone, label: phoneLabel, href: phone },
  ].filter(Boolean);

  return (
    <>
      {/* Desktop : rail rétractable sur le bord droit (masqué sous 1280px, comme la maquette) */}
      <aside
        className="hidden xl:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 flex-col gap-1.5"
        aria-label="Contact rapide"
      >
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target={item.target}
            rel={item.target ? "noopener" : undefined}
            className="group flex items-center gap-2.5 h-12 pl-3.5 pr-3.5 bg-black text-[#F5C518] rounded-l-lg no-underline font-bold text-sm whitespace-nowrap transition-transform duration-300 ease-out hover:bg-[#1c1c1c]"
            style={{ transform: "translateX(calc(100% - 48px))" }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateX(0)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateX(calc(100% - 48px))"; }}
            onFocus={(e) => { e.currentTarget.style.transform = "translateX(0)"; }}
            onBlur={(e) => { e.currentTarget.style.transform = "translateX(calc(100% - 48px))"; }}
          >
            <item.icon size={20} weight="bold" className="flex-shrink-0" />
            <span className="text-white">{item.label}</span>
          </a>
        ))}
      </aside>

      {/* Mobile/tablette : barre fixe en bas (équivalent de .tdl-mbar de la maquette) */}
      <nav
        className="xl:hidden fixed left-0 right-0 bottom-0 z-40 grid grid-cols-2 gap-2.5 p-2.5 bg-black"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
        aria-label="Actions rapides"
      >
        <a href={phone} className="flex items-center justify-center gap-2 h-12 rounded-md border-2 border-white text-white font-bold text-sm">
          <Phone size={16} weight="bold" /> Appeler
        </a>
        <a href={contactHref} style={{ backgroundColor: "#F5C518" }} className="flex items-center justify-center gap-2 h-12 rounded-md text-black font-bold text-sm">
          <EnvelopeSimple size={16} weight="bold" /> Nous écrire
        </a>
      </nav>
    </>
  );
}
