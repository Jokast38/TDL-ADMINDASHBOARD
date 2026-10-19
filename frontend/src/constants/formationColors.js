// Couleur douce par formation pour la page Sessions de formation — pastilles
// d'onglet, bordure gauche des cartes, barres du calendrier. VTC_TAXI est une
// seule catégorie backend qui couvre deux formations visuellement distinctes
// (VTC et Taxi), différenciées ici par mot-clé du titre, même logique que
// components/FormationBookingWidget.jsx.
const BY_CATEGORY = {
  VTC_TAXI: "#2563eb", // bleu (par défaut, recouvert par le mot-clé VTC/Taxi ci-dessous)
  PERMIS: "#16a34a", // vert
  CACES: "#ea580c", // orange
  SSIAP: "#dc2626", // rouge
  ECSR: "#7c3aed", // violet
  AUTO_ECOLE: "#0891b2", // cyan
  VENTE: "#db2777", // rose
};

const KEYWORD_OVERRIDES = [
  [/\btaxi\b/i, "#ca8a04"], // jaune/doré — Taxi
  [/\bvtc\b/i, "#2563eb"], // bleu — VTC
];

export function colorForFormation(category, title) {
  for (const [re, color] of KEYWORD_OVERRIDES) {
    if (re.test(title || "")) return color;
  }
  return BY_CATEGORY[category] || "#6b7280";
}
