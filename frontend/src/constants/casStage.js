// Cas de stage de récupération de points — doit rester synchronisé avec
// backend/core/stage_recup_points.py (texte officiel fourni par l'équipe,
// demande du 2026-11-02, jamais reformulé). Choisi par le candidat sur le
// formulaire public pour que l'attestation individuelle imprime le bon cas
// au lieu de toujours défaut sur "Cas 1 : volontaire".
export const CAS_STAGE_OPTIONS = [
  {
    value: "volontaire",
    shortName: "Stage volontaire (Cas n°1)",
    description:
      "Vous décidez de vous inscrire de votre propre initiative parce que votre solde de points est bas. " +
      "Il permet de récupérer jusqu'à 4 points (dans la limite du plafond de votre permis), à condition de ne pas " +
      "avoir suivi un autre stage similaire depuis moins d'un an de date à date.",
  },
  {
    value: "obligatoire_probatoire",
    shortName: "Stage obligatoire en période probatoire (Cas n°2)",
    description:
      "Il s'adresse aux jeunes conducteurs. Si vous commettez une infraction entraînant la perte d'au moins 3 points " +
      "durant votre période probatoire, vous recevez la lettre 48N du ministère de l'Intérieur. Vous avez alors " +
      "l'obligation de vous inscrire au stage dans un délai de 4 mois. Ce stage vous permet également de récupérer " +
      "jusqu'à 4 points et d'obtenir le remboursement de l'amende forfaitaire.",
  },
];
