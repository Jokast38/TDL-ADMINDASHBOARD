import { CaretLeft, CaretRight } from "@phosphor-icons/react";

// Sélecteur de mois collant : flèches + chips "Oct. 2026 · 6", scroll doux
// vers l'ancre du mois dans la liste au clic. `months` = [{ key, label, count, fillPct }]
// déjà triés chronologiquement ; `active` = clé du mois courant (mis en
// évidence et scrollé en vue au montage).
export default function MonthNavigator({ months, active, onSelect }) {
  const idx = months.findIndex((m) => m.key === active);

  const shift = (dir) => {
    const next = months[idx + dir];
    if (next) onSelect(next.key);
  };

  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 py-2 -mx-1 px-1" data-testid="stage-month-navigator">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={idx <= 0}
          className="shrink-0 p-1.5 rounded-md border border-gray-200 text-gray-500 hover:border-gray-400 disabled:opacity-30"
        >
          <CaretLeft size={14} />
        </button>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {months.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelect(m.key)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                m.key === active ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
              data-testid={`stage-month-chip-${m.key}`}
            >
              {m.label} <span className="opacity-60">· {m.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={idx === -1 || idx >= months.length - 1}
          className="shrink-0 p-1.5 rounded-md border border-gray-200 text-gray-500 hover:border-gray-400 disabled:opacity-30"
        >
          <CaretRight size={14} />
        </button>
      </div>
    </div>
  );
}
