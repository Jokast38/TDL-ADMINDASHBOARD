// Formatage de dates pour l'affichage humain (front) en français : DD-MM-YYYY.
// Ne jamais utiliser pour des valeurs destinées à l'API / aux inputs date / aux clés
// de tri : celles-ci doivent rester au format ISO (YYYY-MM-DD).

// Évite toISOString() / les getters UTC (décalage d'un jour selon le fuseau horaire)
// en extrayant les composantes de la date locale, comme dans Agenda.jsx.
function toDate(dateInput) {
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === "number") return new Date(dateInput);
  if (typeof dateInput === "string") {
    // Date pure "YYYY-MM-DD" : construire en local pour éviter le décalage UTC.
    const m = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    return new Date(dateInput);
  }
  return null;
}

/**
 * Formate une date en "DD-MM-YYYY" (tirets).
 * Accepte une chaîne ISO (date ou date-heure), un objet Date, ou un timestamp.
 * Retourne "" si la date est invalide/absente.
 */
export function formatDateFR(dateInput) {
  if (!dateInput) return "";
  const d = toDate(dateInput);
  if (!d || isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Formate une date-heure en "DD-MM-YYYY HH:MM" (tirets).
 */
export function formatDateTimeFR(dateInput) {
  if (!dateInput) return "";
  const d = toDate(dateInput);
  if (!d || isNaN(d.getTime())) return "";
  const datePart = formatDateFR(d);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${datePart} ${hours}:${minutes}`;
}

const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * Formate une date en "Jeudi 06 octobre 2026" — à utiliser uniquement pour du
 * texte destiné à être envoyé par email (composé côté front), jamais pour de
 * l'affichage front classique (qui doit rester en DD-MM-YYYY).
 */
export function formatDateLongFR(dateInput) {
  if (!dateInput) return "";
  const d = toDate(dateInput);
  if (!d || isNaN(d.getTime())) return "";
  const jour = JOURS_FR[d.getDay()];
  const mois = MOIS_FR[d.getMonth()];
  const day = String(d.getDate()).padStart(2, "0");
  return `${jour} ${day} ${mois} ${d.getFullYear()}`;
}
