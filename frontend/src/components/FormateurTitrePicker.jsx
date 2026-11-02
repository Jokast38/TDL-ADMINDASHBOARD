import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/constants/formationAssets";
import { titresForCategories } from "@/constants/formateurTitres";

// Types de formations d'un formateur + titre proposé selon ces types. Un
// intitulé saisi librement avant la mise en place de cette liste reste affiché
// tant qu'on n'en choisit pas un autre, plutôt que de disparaître à l'ouverture.
export default function FormateurTitrePicker({ categories, titre, onChange }) {
  const titres = titresForCategories(categories);
  const options = titre && !titres.includes(titre) ? [titre, ...titres] : titres;

  const toggleCategory = (category) => {
    const next = categories.includes(category)
      ? categories.filter((c) => c !== category)
      : [...categories, category];
    onChange({ categories: next, titre: titresForCategories(next).includes(titre) ? titre : "" });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Types de formations</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
            const selected = categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={selected}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  selected ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
                data-testid={`formateur-category-${category}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Titre du formateur (affiché sur les documents)</label>
        <Select value={titre} onValueChange={(v) => onChange({ categories, titre: v })} disabled={!options.length}>
          <SelectTrigger className="mt-1" data-testid="formateur-titre">
            <SelectValue placeholder={options.length ? "Choisir un titre" : "Choisissez d'abord un type de formation"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
