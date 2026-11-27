// Libellés français des statuts de paiement (demande du 2026-11-27) — une
// seule liste pour toutes les pages de l'équipe (Inscriptions, Apprenants,
// fiche de session...). Côté backend : core/notification_rules.py.
// « cpf_valide » / « cpf_attente » : financement CPF validé ou pas encore,
// distinct d'un règlement direct (carte, espèces...).
export const PAYMENT_LABEL = {
  pending: "En attente",
  processing: "Paiement en cours",
  paid: "Payé",
  cpf_attente: "CPF en attente",
  cpf_valide: "CPF validé",
  refunded: "Remboursé",
};

export const PAYMENT_PAID_LIKE = ["paid", "cpf_valide"];

export const paymentLabel = (status) => PAYMENT_LABEL[status] || status || "Non renseigné";

// Couleurs : vert = acquis, gris = remboursé, orange = à encaisser.
export const paymentBadgeClass = (status) =>
  PAYMENT_PAID_LIKE.includes(status) ? "bg-[#0B7238]/10 text-[#0B7238] border-[#0B7238]/20"
  : status === "refunded" ? "bg-gray-100 text-gray-600"
  : "bg-[#F5A623]/10 text-[#B7791F] border-[#F5A623]/30";

// Statut renvoyé par Stripe (vérification manuelle d'un paiement).
const STRIPE_LABEL = {
  paid: "payé", unpaid: "non payé", no_payment_required: "aucun paiement demandé",
  open: "en cours", complete: "terminé", expired: "expiré",
};
export const stripeStatusLabel = (status) => STRIPE_LABEL[status] || status;
