// Images téléchargées depuis tdl-formation.fr, servies statiquement depuis /tdl-image/.
// Mapping par catégorie de formation : image de bannière (hero) + galerie de projection.
const IMG = "/tdl-image";

export const CATEGORY_LABELS = {
  CACES: "CACES",
  PERMIS: "Récupération de points",
  AUTO_ECOLE: "Auto-école",
  SSIAP: "SSIAP",
  VTC_TAXI: "VTC / Taxi",
  ECSR: "ECSR",
  VENTE: "Conseiller de Vente",
};

export const CATEGORY_HERO = {
  CACES: `${IMG}/about-2.jpg`,
  PERMIS: `${IMG}/banniere-stade-de-recuperation-de-points-Moyenne.jpeg`,
  AUTO_ECOLE: `${IMG}/about-1.jpg`,
  SSIAP: `${IMG}/banniere-formation-ssiap-inspection-equipement-incendie-Moyenne.jpeg`,
  VTC_TAXI: `${IMG}/formation-conduite-taxi-vtc-tdl-Grande.jpeg`,
  ECSR: `${IMG}/formation-ecsr-cours-code-route-en-sallE-Moyenne.jpeg`,
  VENTE: `${IMG}/Formation-conseiller-de-vente-en-mobilite-Grande.jpeg`,
};

export const CATEGORY_GALLERY = {
  CACES: [`${IMG}/about-1.jpg`, `${IMG}/about-2.jpg`],
  PERMIS: [
    `${IMG}/banniere-stade-de-recuperation-de-points-Moyenne.jpeg`,
    `${IMG}/reussite-examen-1er-coup-tdl-1024x700-1.webp`,
  ],
  AUTO_ECOLE: [`${IMG}/about-1.jpg`, `${IMG}/about-2.jpg`],
  VENTE: [
    `${IMG}/Formation-conseiller-de-vente-en-mobilite-Grande.jpeg`,
    `${IMG}/formation-conseiller-vente-automobile-tdl-Grande.jpeg`,
    `${IMG}/formation-conseiller-vente-velo-tdl-Grande-Moyenne.jpeg`,
  ],
  SSIAP: [
    `${IMG}/banniere-formation-ssiap-inspection-equipement-incendie-Moyenne.jpeg`,
    `${IMG}/formation-ssiap-cours-theorique-securite-incendie.png`,
    `${IMG}/formation-ssiap-equipe-securite-incendie.png`,
    `${IMG}/formation-ssiap-systeme-securite-incendie-tableau-alarme.png`,
  ],
  VTC_TAXI: [
    `${IMG}/formation-conduite-taxi-vtc-tdl-Grande.jpeg`,
    `${IMG}/formation-taxi-paris-circulation-tdl-Grande.jpeg`,
    `${IMG}/formation-taxi-revision-reglementation-paris-Moyenne.jpeg`,
  ],
  ECSR: [`${IMG}/formation-ecsr-cours-code-route-en-sallE-Moyenne.jpeg`, `${IMG}/about-1.jpg`],
};

// Diaporama du hero d'accueil : les visuels les plus impactants, tous domaines confondus.
export const HOME_HERO_SLIDES = [
  { src: `${IMG}/formation-conduite-taxi-vtc-tdl-Grande.jpeg`, alt: "Formation VTC et Taxi TDL Formation" },
  { src: `${IMG}/banniere-formation-ssiap-inspection-equipement-incendie-Moyenne.jpeg`, alt: "Formation SSIAP sécurité incendie" },
  { src: `${IMG}/formation-taxi-paris-circulation-tdl-Grande.jpeg`, alt: "Formation Taxi circulation à Paris" },
  { src: `${IMG}/banniere-stade-de-recuperation-de-points-Moyenne.jpeg`, alt: "Stage de récupération de points" },
  { src: `${IMG}/reussite-examen-1er-coup-tdl-1024x700-1.webp`, alt: "Réussite à l'examen du premier coup" },
];

export function heroForCategory(category) {
  return CATEGORY_HERO[category] || CATEGORY_HERO.VTC_TAXI;
}

export function galleryForCategory(category) {
  return CATEGORY_GALLERY[category] || [];
}
