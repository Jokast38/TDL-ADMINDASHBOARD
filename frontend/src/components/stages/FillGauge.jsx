// Jauge de remplissage d'une session — vert < 50%, orange 50-90%, rouge > 90%,
// "Complet" à 100%. `inscrits`/`capacite` sont les chiffres bruts affichés en
// légende ; `ratio` (0-1) pilote la largeur de la barre, calculé par
// l'appelant à partir de nb_inscrits/capacite_max (ou places_restantes).
export default function FillGauge({ inscrits, capacite, ratio, compact = false }) {
  const pct = Math.max(0, Math.min(1, ratio));
  const color = pct >= 1 ? "#dc2626" : pct > 0.9 ? "#dc2626" : pct >= 0.5 ? "#f59e0b" : "#16a34a";
  return (
    <div className={compact ? "w-full" : "w-full space-y-1"}>
      {!compact && (
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>{inscrits} inscrit{inscrits > 1 ? "s" : ""} / {capacite}</span>
          {pct >= 1 && <span className="font-bold text-red-600">Complet</span>}
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
