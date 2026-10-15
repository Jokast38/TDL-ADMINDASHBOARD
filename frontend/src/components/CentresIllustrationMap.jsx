import { useState } from "react";

const GOLD = "#d4af37";

// Carte stylisée (pas une vraie carte géographique) : deux centres mis en
// avant (Creil dans l'Oise, Épinay-sur-Seine en Île-de-France) entourés de
// villes desservies, avec une info-bulle au survol — reproduit la maquette
// fournie, en SVG/CSS plutôt qu'en image statique, pour rester léger et
// animable (hover, focus clavier).
const CENTERS = [
  { id: "creil", label: "Creil (60)", x: 160, y: 95 },
  { id: "epinay", label: "Épinay-sur-Seine (93)", x: 150, y: 260 },
];

const CITIES = [
  { label: "Senlis", x: 215, y: 110 },
  { label: "Chantilly", x: 105, y: 150 },
  { label: "Pontoise", x: 85, y: 205 },
  { label: "Sarcelles", x: 205, y: 240 },
  { label: "Argenteuil", x: 125, y: 300 },
  { label: "Saint-Denis", x: 185, y: 325 },
];

export default function CentresIllustrationMap({ className = "" }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className={`relative aspect-square max-w-md mx-auto ${className}`}>
      <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 50% 40%, #f3efe6 0%, #ece7da 70%, #e6e0d2 100%)" }} />
      <svg viewBox="0 0 320 380" className="relative w-full h-full" role="img" aria-label="Carte des centres TDL Formation">
        <path
          d="M60,70 C40,110 20,150 35,200 C15,230 25,280 60,310 C90,345 150,365 200,345 C250,330 290,290 280,240 C300,200 290,150 260,115 C270,80 240,45 195,40 C150,20 95,30 60,70 Z"
          fill="#ffffff" stroke="#ddd6c4" strokeWidth="1.5"
        />
        <path d="M30,195 C90,180 180,185 290,210" fill="none" stroke="#d6d0c0" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M70,250 C120,270 170,275 230,255" fill="none" stroke="#cfe3f0" strokeWidth="2" />

        <text x="80" y="118" className="fill-gray-400" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>OISE</text>
        <text x="150" y="358" className="fill-gray-400" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>ÎLE-DE-FRANCE</text>

        {CITIES.map((c) => (
          <g key={c.label} onMouseEnter={() => setHovered(c.label)} onMouseLeave={() => setHovered((h) => (h === c.label ? null : h))} style={{ cursor: "pointer" }}>
            <circle cx={c.x} cy={c.y} r={5} fill="#111827" opacity={hovered === c.label ? 1 : 0.85} />
            {hovered === c.label && (
              <g>
                <rect x={c.x - 2} y={c.y - 30} width={Math.max(60, c.label.length * 7)} height={22} rx={6} fill="#111827" />
                <text x={c.x + Math.max(60, c.label.length * 7) / 2 - 2} y={c.y - 15} textAnchor="middle" fill="#fff" style={{ fontSize: 11, fontWeight: 700 }}>{c.label}</text>
              </g>
            )}
          </g>
        ))}

        {CENTERS.map((c) => (
          <g key={c.id}>
            <circle cx={c.x} cy={c.y} r={22} fill={GOLD} opacity={0.15} />
            <circle cx={c.x} cy={c.y} r={13} fill="#fff" stroke={GOLD} strokeWidth={2.5} />
            <circle cx={c.x} cy={c.y} r={5.5} fill={GOLD} />
          </g>
        ))}
      </svg>

      <div className="flex items-center justify-center gap-5 mt-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: GOLD }} /> Centre TDL Formation</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-800" /> Villes desservies</span>
      </div>
    </div>
  );
}
