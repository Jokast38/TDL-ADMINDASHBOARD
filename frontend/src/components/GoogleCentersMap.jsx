import { useState } from "react";

const CENTRES = [
  {
    id: "epinay",
    label: "Épinay-sur-Seine (93)",
    address: "59 avenue Joffre, 93800 Épinay-sur-Seine",
    mapQuery: "59 avenue Joffre, 93800 Épinay-sur-Seine",
  },
  {
    id: "creil",
    label: "Creil (60)",
    address: "27 Place Saint-Médard, 60100 Creil",
    mapQuery: "27 Place Saint-Médard, 60100 Creil",
  },
];

const embedUrl = (query) => `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
const directionsUrl = (query) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;

/**
 * Carte Google Maps réelle (iframe officiel, pas de SVG stylisé) pour situer
 * les centres TDL Formation — avec un sélecteur quand il y en a plusieurs.
 * Remplace l'ancienne carte custom (SVG France ou Leaflet/OSM) : rendu
 * identique à ce que verrait un visiteur cherchant l'adresse sur Google.
 */
export default function GoogleCentersMap({ centreIds = ["epinay", "creil"], title = "Nos centres" }) {
  const centres = CENTRES.filter((c) => centreIds.includes(c.id));
  const [active, setActive] = useState(centres[0]?.id);
  const current = centres.find((c) => c.id === active) || centres[0];

  return (
    <div data-reveal>
      {centres.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Choisir un centre">
          {centres.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              aria-pressed={active === c.id}
              className={`min-h-[38px] px-4 rounded-full border text-xs font-bold uppercase tracking-wide transition-colors ${
                active === c.id ? "bg-black text-white border-black" : "bg-white text-black border-gray-300 hover:border-black"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid lg:grid-cols-[1.7fr_1fr] gap-4 items-stretch">
        <div className="relative rounded-md overflow-hidden border border-gray-200 aspect-video lg:aspect-auto lg:h-[320px]">
          <iframe
            key={current.id}
            title={`Carte Google Maps — ${current.label}`}
            src={embedUrl(current.mapQuery)}
            width="100%"
            height="100%"
            style={{ border: 0, position: "absolute", inset: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="flex flex-col justify-center gap-3 bg-gray-50 border border-gray-200 rounded-md p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{title}</p>
          <p className="font-display font-extrabold text-lg">TDL Formation {current.label}</p>
          <p className="text-sm text-gray-500">{current.address}</p>
          <a
            href={directionsUrl(current.mapQuery)}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-sm font-bold underline decoration-2 underline-offset-4 mt-2"
            style={{ textDecorationColor: "#F5C518" }}
          >
            Itinéraire →
          </a>
        </div>
      </div>
    </div>
  );
}
