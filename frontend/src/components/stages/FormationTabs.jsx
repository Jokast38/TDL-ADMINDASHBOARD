// Barre d'onglets horizontaux par formation — un par formation_id présent
// dans les sessions, plus "Toutes". Tri : formations avec sessions à venir
// d'abord (plus de sessions à venir en premier), puis celles sans aucune
// session à venir, grisées, à la fin.
export default function FormationTabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" data-testid="stage-formation-tabs">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${
          active === "all" ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
        }`}
        data-testid="stage-tab-all"
      >
        Toutes <span className="opacity-60">· {tabs.reduce((n, t) => n + t.upcomingCount, 0)}</span>
      </button>
      {tabs.map((t) => {
        const isActive = active === t.id;
        const dim = t.upcomingCount === 0;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${
              isActive ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : dim ? "bg-white text-gray-400 border-gray-100" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
            data-testid={`stage-tab-${t.id}`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            {t.label}
            <span className="opacity-60">· {t.upcomingCount}</span>
          </button>
        );
      })}
    </div>
  );
}
