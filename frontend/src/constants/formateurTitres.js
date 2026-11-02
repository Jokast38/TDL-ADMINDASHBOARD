// Intitulés proposés à la création d'un formateur, par catégorie de formation.
// Attention : la place occupée sur une session (core/placement_rules.py) et la
// convention (services/pdf.py) se déduisent du titre — garder "PSY" dans le
// titre du psychologue et "TESTEUR" dans celui du testeur CACES.
export const FORMATEUR_TITRES = {
  PERMIS: ["Formateur BAFM", "Psychologue"],
  CACES: ["Formateur CACES", "Testeur CACES"],
  AUTO_ECOLE: ["Moniteur auto-école"],
  SSIAP: ["Formateur SSIAP"],
  VTC_TAXI: ["Formateur VTC / Taxi"],
  ECSR: ["Formateur ECSR"],
  VENTE: ["Formateur Conseiller de Vente"],
};

export const titresForCategories = (categories) =>
  Object.entries(FORMATEUR_TITRES)
    .filter(([category]) => categories.includes(category))
    .flatMap(([, titres]) => titres);
