import { STAGE_SESSIONS_2026 } from "@/constants/stageSessions2026";

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function formatSession({ start, end, lieu }) {
  const d1 = new Date(`${start}T00:00:00`);
  const d2 = new Date(`${end}T00:00:00`);
  const mois1 = MOIS_FR[d1.getMonth()];
  const mois2 = MOIS_FR[d2.getMonth()];
  const label = mois1 === mois2
    ? `${String(d1.getDate()).padStart(2, "0")} & ${String(d2.getDate()).padStart(2, "0")} ${mois1}`
    : `${String(d1.getDate()).padStart(2, "0")} ${mois1} & ${String(d2.getDate()).padStart(2, "0")} ${mois2}`;
  return {
    label: lieu ? `${label} (${lieu})` : label,
    mois: mois1.charAt(0).toUpperCase() + mois1.slice(1),
    start: d1,
  };
}

// Retourne les sessions réelles du planning animateurs à venir (les sessions
// annulées — marquées "F" au planning — ne figurent pas dans la liste
// source), groupées par mois, dans l'ordre chronologique.
export function generateUpcomingSessions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = STAGE_SESSIONS_2026
    .map(formatSession)
    .filter((s) => s.start >= today)
    .sort((a, b) => a.start - b.start);

  const groups = [];
  for (const s of upcoming) {
    let group = groups.find((g) => g.mois === s.mois);
    if (!group) {
      group = { mois: s.mois, items: [] };
      groups.push(group);
    }
    group.items.push(s.label);
  }
  return groups;
}
