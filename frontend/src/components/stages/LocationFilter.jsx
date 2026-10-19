// Chips multi-sélection par lieu normalisé (voir lib/normalizeLocation), avec
// compteur par lieu. `selected` vide = tous les lieux (pas de restriction).
export default function LocationFilter({ options, selected, onChange }) {
  const toggle = (label) => {
    if (selected.includes(label)) onChange(selected.filter((l) => l !== label));
    else onChange([...selected, label]);
  };
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" data-testid="stage-location-filter">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap ${
          selected.length === 0 ? "bg-[#d4af37]/10 border-[#d4af37] text-[#8a6d00]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
        }`}
      >
        Tous les lieux
      </button>
      {options.map((o) => {
        const active = selected.includes(o.label);
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => toggle(o.label)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap ${
              active ? "bg-[#d4af37]/10 border-[#d4af37] text-[#8a6d00]" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
            }`}
            data-testid={`stage-location-${o.label}`}
          >
            {o.label} <span className="opacity-60">· {o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
