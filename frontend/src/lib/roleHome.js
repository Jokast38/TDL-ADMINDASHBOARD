// Page d'accueil par rôle — seule source de vérité utilisée à la fois pour
// la redirection après connexion (Login.jsx) et le repli quand un rôle tente
// d'accéder à une page qui ne lui est pas ouverte (App.js/ProtectedRoute).
// Avant ça, tout le monde hors étudiant/animateur atterrissait sur /admin
// (Dashboard) par défaut — y compris responsable_admission et agent_admin,
// qui n'ont pourtant pas accès à GET /api/dashboard/stats côté backend (voir
// require_role dans routers/dashboard.py) : la page se chargeait mais
// affichait une erreur "Accès refusé" au lieu des statistiques.
export const ROLE_HOME = {
  etudiant: "/espace-eleve",
  animateur: "/espace-animateur",
  commercial: "/admin/leads",
  responsable_admission: "/admin/accueil",
  agent_admin: "/admin/accueil",
  admin: "/admin",
  employe: "/admin",
  responsable_commercial: "/admin",
};

export function roleHome(role) {
  return ROLE_HOME[role] || "/admin";
}
