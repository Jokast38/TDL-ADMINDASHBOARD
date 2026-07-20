// Infographie "débouchés / structures / salaires / évolutions / poursuites d'études",
// par catégorie de formation — affichée sur la page de détail formation.
export const CAREER_OUTLOOK = {
  VENTE: {
    debouches: ["Conseiller de vente", "Vendeur-conseil", "Vendeur spécialisé", "Employé commercial", "Référent produit"],
    structures: ["Grandes surfaces alimentaires", "Grandes surfaces spécialisées", "Magasins spécialisés", "Commerces indépendants", "Négoces professionnels (BtoB)"],
    salaireRange: "1 750 à 3 000 € brut",
    salaireNote: "selon expérience",
    salaireManager: "Manager : jusqu'à 3 200 € + primes",
    evolutions: ["Vendeur expert", "Chef de rayon", "Manager de secteur", "Responsable magasin"],
    poursuites: ["BTS MCO", "BTS NDRC", "BTS CCST"],
  },
};

export function careerOutlookForCategory(category) {
  return CAREER_OUTLOOK[category] || null;
}

// Vidéo de présentation par catégorie de formation.
export const CATEGORY_VIDEO = {
  VENTE: { videoId: "h9_u2IES9Vo", title: "Découvrez le métier de Conseiller de Vente" },
};

export function videoForCategory(category) {
  return CATEGORY_VIDEO[category] || null;
}
