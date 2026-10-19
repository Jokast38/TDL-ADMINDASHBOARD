import { normalizeLocation } from "../../lib/normalizeLocation";

export const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MOIS_COURT_FR = ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

// Évite toISOString() (décalage UTC) — comparaison de chaînes ISO locales.
export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function monthKey(dateStr) {
  if (!dateStr) return "0000-00";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "0000-00";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelShort(key) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return "Sans date";
  return `${MOIS_COURT_FR[m - 1]} ${y}`;
}

export function monthLabelLong(key) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return "Sans date";
  return `${MOIS_FR[m - 1]} ${y}`;
}

export function extractCreneau(notes) {
  const m = /Créneau\s*:\s*(JOUR|SOIR)/i.exec(notes || "");
  return m ? m[1].toUpperCase() : null;
}

export function formatDateShortFr(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${MOIS_COURT_FR[d.getMonth()].replace(".", "").toLowerCase()}.`;
}

// Statut affiché : dérivé uniquement pour l'affichage, jamais écrit en base —
// une session "planifie" dont la date de fin est passée s'affiche "Terminé"
// sans qu'on modifie `statut` en base (voir demande du 2026-10-19 : le statut
// stocké restait "Planifié" indéfiniment après la fin de la session).
export function displayStatus(s) {
  if (s.statut === "annule" || s.statut === "complet") return s.statut;
  if ((s.date_fin || s.date_debut) < todayIso()) return "termine";
  return s.statut || "planifie";
}

export function placesRestantes(s) {
  return s.places_restantes ?? Math.max(0, (s.capacite_max || 0) - (s.nb_inscrits || 0) - (s.external_reserved || 0));
}

export function fillRatio(s) {
  const cap = s.capacite_max || 0;
  if (!cap) return 0;
  const taken = (s.nb_inscrits || 0) + (s.external_reserved || 0);
  return taken / cap;
}

export function sessionLocation(s) {
  return normalizeLocation(s.lieu_ville);
}

export function isSoonFull(s) {
  const rest = placesRestantes(s);
  return rest > 0 && rest <= 3;
}
