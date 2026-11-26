// Choix des catégories CACES® R.489 que TDL fait passer (demande du
// 2026-11-26) : formulaire public, page Inscriptions, examen et carte.
// Backend : models/caces.py:CACES_CATEGORIES_PROPOSEES.

export const CACES_CATEGORIES_PROPOSEES = ["1B", "3", "5"];

export const CACES_CATEGORIE_LABELS = {
  "1A": "Transpalette / préparateur de commandes",
  "1B": "Gerbeur à conducteur porté (levée > 1,20 m)",
  "2A": "Porteur",
  "2B": "Tracteur",
  "3": "Chariot élévateur frontal (≤ 6 t)",
  "4": "Chariot élévateur frontal (> 6 t)",
  "5": "Chariot à mât rétractable",
  "6": "Poste de conduite élevable",
  "7": "Conduite hors production",
};

// Formation CACES R.489 (chariots) : les catégories 1B / 3 / 5 ne concernent
// pas les autres CACES (ex : R.482 engins de chantier).
export const isCacesR489 = (formation) =>
  !!formation && formation.category === "CACES" && !/R\.?\s?4(?!89)\d\d/i.test(formation.title || "");

// Catégories écrites dans l'intitulé (« CACES R489 Cat. 3 - Chariot élévateur »).
export const categoriesDepuisTitre = (titre) => {
  const m = (titre || "").match(/\bcat(?:[ée]gories?|s)?\.?\s*((?:1A|1B|2A|2B|[3-7])\b(?:\s*(?:,|\/|et|-)\s*(?:1A|1B|2A|2B|[3-7])\b)*)/i);
  if (!m) return [];
  return [...new Set(m[1].toUpperCase().match(/1A|1B|2A|2B|[3-7]/g) || [])];
};

export default function CacesCategoriesPicker({ value = [], onChange, categories = CACES_CATEGORIES_PROPOSEES, compact = false, testId = "caces-categories" }) {
  const toggle = (c) => {
    const next = value.includes(c) ? value.filter((x) => x !== c) : [...value, c];
    onChange(categories.filter((x) => next.includes(x)));
  };
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`} data-testid={testId}>
      {categories.map((c) => {
        const on = value.includes(c);
        return (
          <button key={c} type="button" onClick={() => toggle(c)} data-testid={`${testId}-${c}`} aria-pressed={on}
            className={`text-left rounded-md border px-3 py-2 transition-colors ${on ? "border-black bg-gray-50 ring-1 ring-black" : "border-gray-300 hover:border-gray-400"}`}>
            <span className="flex items-center gap-2">
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border text-[10px] ${on ? "bg-black border-black text-white" : "border-gray-400"}`}>{on ? "✓" : ""}</span>
              <span className="font-semibold text-sm">Catégorie {c}</span>
            </span>
            {!compact && <span className="block text-xs text-gray-500 mt-0.5 pl-6">{CACES_CATEGORIE_LABELS[c]}</span>}
          </button>
        );
      })}
    </div>
  );
}
