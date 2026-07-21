// Script de réponses simulées (mock) pour le chatbot public.
// ⚠️ Aucun appel IA/backend ici : réponses statiques, en attendant l'entraînement
// d'un vrai modèle sur les scripts et réponses réels de l'équipe commerciale.
// Pour brancher un vrai modèle plus tard : remplacer getBotReply() par un appel
// à une API (ex: api.post("/chat/message", { message })) sans toucher au reste
// du composant ChatWidget.

export const WELCOME_MESSAGE =
  "Bonjour 👋 Je suis l'assistant virtuel de TDL Formation. Je peux vous renseigner sur nos formations, les tarifs, le financement ou vous mettre en relation avec un conseiller. Que souhaitez-vous savoir ?";

export const QUICK_REPLIES = [
  "Voir les formations",
  "Tarifs et financement",
  "Formation VTC ou Taxi",
  "Parler à un conseiller",
];

// Chaque entrée : mots-clés à repérer dans le message (insensible à la casse,
// sans accents, sur des limites de mots) -> réponse du "commercial". Les
// intentions les plus spécifiques sont volontairement placées avant le
// catalogue générique : getBotReply() retient l'intention avec le plus de
// mots-clés reconnus, pas la première trouvée dans le message.
const INTENTS = [
  {
    keywords: ["ssiap"],
    reply:
      "Nous formons aux 3 niveaux SSIAP : agent de sécurité incendie (SSIAP 1), chef d'équipe (SSIAP 2) et chef de service (SSIAP 3). Un SST à jour et un certificat médical d'aptitude visuelle sont généralement demandés en prérequis.",
  },
  {
    keywords: ["caces", "chariot", "nacelle", "grue"],
    reply:
      "Le CACES permet de conduire des engins de manutention et de chantier en sécurité (chariots, nacelles, grues...). La durée dépend de la catégorie et de votre expérience préalable (généralement 1 à 5 jours). Voulez-vous une estimation pour une catégorie précise ?",
  },
  {
    keywords: ["permis", "point", "recuperation", "stage"],
    reply:
      "Notre stage de récupération de points est agréé par la Préfecture : 2 jours consécutifs, jusqu'à 4 points récupérés, sessions régulières à Épinay-sur-Seine et Creil. Souhaitez-vous connaître les prochaines dates disponibles ?",
  },
  {
    keywords: ["vtc", "taxi", "chauffeur"],
    reply:
      "Nous formons aux métiers de VTC et Taxi : formation initiale, formation continue, et passerelle VTC ↔ Taxi. Taux de réussite à l'examen : 97% en VTC et 95% en Taxi. Le dossier ANTS (carte professionnelle) est suivi par notre équipe jusqu'à son aboutissement.",
  },
  {
    keywords: ["vente", "vendeur"],
    reply:
      "Notre Titre Professionnel Conseiller de Vente (RNCP37098, niveau 4) se déroule en alternance sur 6 mois : 1 jour par semaine en centre, 4 jours en entreprise. Il prépare aux métiers de vendeur-conseil, conseiller clientèle ou employé commercial.",
  },
  {
    keywords: ["financement", "cpf", "opco", "pole", "emploi"],
    reply:
      "Bonne nouvelle : la majorité de nos formations sont éligibles au CPF, ainsi qu'aux financements France Travail ou OPCO selon votre statut (salarié, demandeur d'emploi, indépendant...). Notre équipe étudie votre éligibilité gratuitement et vous accompagne dans le montage du dossier.",
  },
  {
    keywords: ["prix", "tarif", "combien", "coute"],
    reply:
      "Les tarifs varient selon la formation choisie (ex : stage de récupération de points, permis B, VTC/Taxi...). La plupart de nos formations sont finançables via le CPF, France Travail ou un OPCO selon votre situation. Dites-moi quelle formation vous intéresse et je vous donne une fourchette de prix indicative.",
  },
  {
    keywords: ["conseiller", "commercial", "rappel", "contact", "telephone", "humain"],
    reply:
      "Bien sûr ! Un conseiller TDL Formation peut vous rappeler sous 24h ouvrées. Vous pouvez remplir le formulaire de contact en bas de la page d'accueil, ou nous appeler directement au 01 80 90 72 49.",
  },
  {
    keywords: ["horaire", "ouvert", "adresse", "epinay", "creil"],
    reply:
      "Nos centres sont situés à Épinay-sur-Seine (93) et à Creil (60). L'équipe est disponible du lundi au samedi. Vous trouverez l'adresse complète et le formulaire de contact en bas de la page d'accueil.",
  },
  {
    keywords: ["merci", "revoir", "bye"],
    reply: "Avec plaisir ! N'hésitez pas si vous avez d'autres questions, notre équipe reste disponible. 👋",
  },
  {
    keywords: ["formation", "catalogue"],
    reply:
      "Nous proposons des formations CACES, récupération de points de permis, auto-école (permis B), SSIAP 1/2/3, VTC/Taxi, ECSR et Conseiller de Vente. Vous pouvez consulter le catalogue complet dans la section \"Formations\" de la page d'accueil, ou me dire quel métier vous intéresse et je vous oriente directement.",
  },
];

const ACCENT_MAP = {
  à: "a", â: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  î: "i", ï: "i",
  ô: "o", ö: "o",
  ù: "u", û: "u", ü: "u",
  ç: "c",
};

const normalize = (s) =>
  s
    .toLowerCase()
    .split("")
    .map((c) => ACCENT_MAP[c] || c)
    .join("");

// Ancrée uniquement en début de mot (pas en fin) : "tarif" reconnaît "tarifs",
// "formation" reconnaît "formations", mais "ou" ne reconnaît pas "bonjour"
// (les formes pluriel/singulier passent, les correspondances en milieu de mot non).
const hasWord = (normalizedMessage, keyword) => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`).test(normalizedMessage);
};

// Point d'entrée unique du "bot" — à remplacer par un vrai appel API quand le
// modèle entraîné sur les scripts commerciaux réels sera prêt.
export function getBotReply(message) {
  const normalized = normalize(message);

  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const score = intent.keywords.filter((k) => hasWord(normalized, normalize(k))).length;
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  if (best) return best.reply;
  return "Je n'ai pas toutes les réponses pour l'instant (assistant en cours d'entraînement 🤖), mais un conseiller peut vous répondre en détail sous 24h ouvrées. Voulez-vous que je vous mette en relation, ou préférez-vous appeler le 01 80 90 72 49 ?";
}
