import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";

const GOLD = "#d4af37";

const CENTER = { name: "TDL ÉPINAY", position: [48.954, 2.314] };

const NEARBY_CITIES = [
  { name: "Enghien-les-Bains", position: [48.9646, 2.308] },
  { name: "Deuil-la-Barre", position: [48.9723, 2.3183] },
  { name: "Argenteuil", position: [48.9478, 2.2469] },
  { name: "Villetaneuse", position: [48.9578, 2.3406] },
  { name: "Saint-Denis", position: [48.9362, 2.3574] },
  { name: "Colombes", position: [48.9228, 2.2544] },
  { name: "Gennevilliers", position: [48.9333, 2.2939] },
  { name: "Villeneuve-la-Garenne", position: [48.9358, 2.3086] },
];

// Carte réelle (Leaflet + fond de carte sombre CARTO) situant le centre TDL
// d'Épinay-sur-Seine parmi les communes voisines des départements 95/93/92 —
// remplace l'ancienne carte stylisée en CSS par une vraie géolocalisation.
export default function EpinayLocalMap({ className = "" }) {
  return (
    <div
      className={className}
      role="img"
      aria-label="Carte situant le centre TDL Épinay-sur-Seine parmi les communes voisines des départements 95, 93 et 92"
    >
      <MapContainer
        center={CENTER.position}
        zoom={12}
        minZoom={11}
        maxZoom={15}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: "#111113" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {NEARBY_CITIES.map((city) => (
          <CircleMarker
            key={city.name}
            center={city.position}
            radius={5}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: "#9a9a9a", fillOpacity: 0.9 }}
          >
            <Tooltip permanent direction="top" offset={[0, -6]} className="epinay-map-tooltip">
              {city.name}
            </Tooltip>
          </CircleMarker>
        ))}

        <CircleMarker
          center={CENTER.position}
          radius={10}
          pathOptions={{ color: GOLD, weight: 3, fillColor: GOLD, fillOpacity: 0.95 }}
        >
          <Tooltip permanent direction="top" offset={[0, -10]} className="epinay-map-tooltip epinay-map-tooltip-main">
            {CENTER.name}
          </Tooltip>
        </CircleMarker>
      </MapContainer>

      <style>{`
        .epinay-map-tooltip {
          background: rgba(17,17,19,0.92) !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
          color: #e7e7e7 !important;
          font-size: 11px !important;
          font-weight: 600;
          padding: 3px 8px !important;
          box-shadow: none !important;
        }
        .epinay-map-tooltip::before { display: none; }
        .epinay-map-tooltip-main {
          background: ${GOLD} !important;
          color: #000 !important;
          font-weight: 800;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
