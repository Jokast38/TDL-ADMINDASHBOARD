import { MapPin } from "@phosphor-icons/react";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer } from "react-leaflet";

const GOLD = "#d4af37";

const CENTERS = [
  {
    name: "Épinay-sur-Seine",
    dept: "93",
    position: [48.954, 2.314],
    description: "Centre de formation agréé",
  },
  {
    name: "Creil",
    dept: "60",
    position: [49.25, 2.51],
    description: "Centre de formation agréé",
  },
];

const IDF_HIGHLIGHT = [
  [49.25, 1.85],
  [49.35, 2.35],
  [49.18, 3.15],
  [48.72, 2.95],
  [48.58, 2.15],
  [48.72, 1.45],
];

export default function FranceMapSection({ className = "" }) {
  return (
    <section
      className={`w-full overflow-hidden rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-[#fffdf5] to-[#f7f3e8] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.25)] ${className}`}
      data-testid="france-map-section"
    >
      <div className="grid lg:grid-cols-[1.02fr_1fr] gap-8 lg:gap-10 p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col justify-center" data-reveal>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-[#f0e4b1] bg-[#fff8db] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8f6a00]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GOLD }} />
            Nos implantations
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-4 mb-4">
            Deux centres, au nord de Paris
          </h2>
          <p className="text-gray-600 max-w-md leading-relaxed">
            TDL Formation forme ses stagiaires depuis deux centres agréés en Île-de-France et dans les Hauts-de-France,
            faciles d'accès depuis Paris et sa région.
          </p>

          <div className="mt-6 space-y-3 max-w-sm">
            {CENTERS.map((c) => (
              <div key={c.name} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white/80 p-3 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${GOLD}20` }}>
                  <MapPin size={18} weight="fill" style={{ color: GOLD }} />
                </span>
                <div>
                  <p className="font-display font-bold text-sm">
                    {c.name} <span className="text-gray-400 font-normal">({c.dept})</span>
                  </p>
                  <p className="text-xs text-gray-500">{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[320px] sm:min-h-[380px] lg:min-h-[440px] overflow-hidden rounded-[24px] border border-[#efe6bd]" data-reveal>
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(circle at top left, rgba(212,175,55,0.16), transparent 55%), linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.2))",
            }}
          />

          <div className="absolute left-4 top-4 z-[500] rounded-full border border-[#d4af37]/40 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-700 shadow-sm">
            <span className="mr-2 inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: GOLD }} />
            Île-de-France mise en avant
          </div>

          <MapContainer
            center={[48.85, 2.35]}
            zoom={8}
            minZoom={6}
            maxZoom={9}
            scrollWheelZoom={false}
            zoomControl={false}
            attributionControl={false}
            className="h-full w-full z-[1]"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <Polygon
              positions={IDF_HIGHLIGHT}
              pathOptions={{
                color: GOLD,
                weight: 2,
                fillColor: GOLD,
                fillOpacity: 0.12,
              }}
            />
            {CENTERS.map((center) => (
              <CircleMarker
                key={center.name}
                center={center.position}
                radius={8}
                pathOptions={{
                  color: GOLD,
                  fillColor: GOLD,
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-sm text-gray-800">
                    <p className="font-semibold">{center.name}</p>
                    <p className="text-xs text-gray-500">{center.dept}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </div>
    </section>
  );
}
