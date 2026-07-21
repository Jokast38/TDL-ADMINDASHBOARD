import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CaretRight } from "@phosphor-icons/react";

const SECTIONS = [
  {
    title: "Éditeur du site",
    content: (
      <>
        <p>
          Le site tdl-formation.fr est édité par la société <strong>TOP DRIVE LEARNING</strong>, société par actions
          simplifiée à associé unique (SASU), immatriculée au RCS de Bobigny sous le numéro 900 968 801, et au SIRET
          90096880100010.
        </p>
        <ul className="mt-4 space-y-1.5">
          <li><strong>Adresse :</strong> 59 Avenue Joffre, 93800 Épinay-sur-Seine, France</li>
          <li><strong>Numéro de TVA intracommunautaire :</strong> FR57900968801</li>
          <li><strong>Capital social :</strong> 300,00 €</li>
          <li><strong>Président :</strong> Rody TAFIAL</li>
        </ul>
        <p className="mt-4">
          <strong>Contact :</strong><br />
          Adresse e-mail : <a href="mailto:contact@tdl-formation.fr" className="text-[#d4af37] hover:underline">contact@tdl-formation.fr</a><br />
          Téléphone : <a href="tel:+33180907249" className="text-[#d4af37] hover:underline">+33 1 80 90 72 49</a>
        </p>
      </>
    ),
  },
  {
    title: "Hébergement du site",
    content: (
      <p>
        Le site est hébergé par <strong>Hostinger International Ltd</strong>, dont le siège social est situé à :
        61 Lordou Vironos Street, 6023 Larnaca, Chypre.<br />
        Site web : <a href="https://www.hostinger.fr" target="_blank" rel="noreferrer" className="text-[#d4af37] hover:underline">https://www.hostinger.fr</a>
      </p>
    ),
  },
  {
    title: "Activité du site",
    content: (
      <p>
        Le site TDL Formation propose des services de formation continue pour adultes dans le domaine du transport,
        notamment pour les métiers de VTC (Voiture de Transport avec Chauffeur) et Taxi. TDL Formation est un centre
        de formation agréé Qualiopi.
      </p>
    ),
  },
  {
    title: "Propriété intellectuelle",
    content: (
      <p>
        Tous les contenus présents sur le site (textes, images, vidéos, logos, graphiques, etc.) sont la propriété
        exclusive de TOP DRIVE LEARNING, sauf mention contraire. Toute reproduction, représentation, modification ou
        diffusion, totale ou partielle, de ces éléments sans autorisation préalable est strictement interdite.
      </p>
    ),
  },
  {
    title: "Protection des données personnelles",
    content: (
      <p>
        Le site respecte la réglementation en vigueur en matière de protection des données personnelles, notamment
        le Règlement Général sur la Protection des Données (RGPD). Pour toute demande relative à vos données
        personnelles, vous pouvez nous contacter à l'adresse :{" "}
        <a href="mailto:contact@tdl-formation.fr" className="text-[#d4af37] hover:underline">contact@tdl-formation.fr</a>
      </p>
    ),
  },
  {
    title: "Responsabilité",
    content: (
      <p>
        TOP DRIVE LEARNING met tout en œuvre pour garantir l'exactitude des informations disponibles sur son site.
        Toutefois, l'entreprise ne saurait être tenue responsable des erreurs ou omissions, ni des éventuelles
        interruptions ou dysfonctionnements du site.
      </p>
    ),
  },
  {
    title: "Contact",
    content: (
      <p>
        Pour toute question ou demande d'information, vous pouvez nous contacter :<br />
        Par e-mail : <a href="mailto:contact@tdl-formation.fr" className="text-[#d4af37] hover:underline">contact@tdl-formation.fr</a><br />
        Par téléphone : <a href="tel:+33180907249" className="text-[#d4af37] hover:underline">+33 1 80 90 72 49</a><br />
        À l'adresse : 59 Avenue Joffre, 93800 Épinay-sur-Seine, France
      </p>
    ),
  },
];

export default function MentionsLegales() {
  useEffect(() => {
    document.title = "Mentions Légales — TDL Formation";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white" data-testid="mentions-legales-page">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <Link to="/" className="text-sm text-gray-600 hover:text-[#d4af37] inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Retour à l'accueil
          </Link>
        </div>
      </header>

      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-gray-500">
          <Link to="/" className="hover:text-[#d4af37]">Accueil</Link>
          <CaretRight size={10} />
          <span className="text-gray-700">Mentions Légales</span>
        </div>
      </div>

      <section className="relative border-b border-gray-200 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/tdl-image/mention-legale.jpg"
            alt="Mentions légales TDL Formation"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
          <p className="overline mb-3 text-white/70">Informations légales</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter leading-[0.95] text-white">
            Mentions <span className="text-[#d4af37]">Légales</span>
          </h1>
        </div>
      </section>

      <article className="max-w-4xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="space-y-10">
          {SECTIONS.map((s) => (
            <div key={s.title} className="pb-10 border-b border-gray-100 last:border-b-0 last:pb-0">
              <h2 className="font-display text-xl font-bold mb-4">{s.title}</h2>
              <div className="text-gray-600 text-sm leading-relaxed">{s.content}</div>
            </div>
          ))}
        </div>
      </article>

      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-4 items-center justify-between">
          <p className="text-sm text-gray-500">© 2026 TDL Formation · Tous droits réservés.</p>
          <p className="text-xs text-gray-400 font-mono">contact@tdl-formation.fr</p>
        </div>
      </footer>
    </div>
  );
}
