// Regroupe les variantes de saisie d'une même ville sous un seul libellé
// canonique ("Épinay-sur-Seine", "EPINAY SUR SEINE", "Epinay-sur-Seine (93)"
// -> "Épinay-sur-Seine") — ne touche jamais les données en base, sert
// uniquement à l'affichage/au filtrage (voir scripts/normalize_stage_villes.py
// pour la normalisation en base, à exécuter à part).
const KNOWN_CITIES = [
  { match: /epinay/, label: "Épinay-sur-Seine" },
  { match: /creil/, label: "Creil" },
  { match: /\bparis\b/, label: "Paris" },
  { match: /en\s*ligne|distanciel|visio/, label: "En ligne" },
];

function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeLocation(raw) {
  if (!raw || !raw.trim()) return "Sans lieu";
  let v = stripAccents(raw.trim().toLowerCase());
  v = v.replace(/\(\s*\d+\s*\)/g, ""); // supprime "(93)", "(60)"...
  v = v.replace(/[-_]/g, " ");
  v = v.replace(/\s+/g, " ").trim();
  for (const city of KNOWN_CITIES) {
    if (city.match.test(v)) return city.label;
  }
  // Pas de correspondance connue : on reformate proprement (capitale initiale
  // de chaque mot) plutôt que de renvoyer la chaîne brute mal normalisée.
  return v.replace(/\b\w/g, (c) => c.toUpperCase());
}
