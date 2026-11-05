// Sessions proposées dans les listes « Affecter une session » / « Inscrire »
// (demande de Lina, 2026-11-05) : seulement celles qui ne sont pas terminées,
// ni annulées, ni de test (scripts/formateur_test.py). Une session en cours
// reste proposée : une formation longue (VTC, ECSR) peut accueillir un
// retardataire. `keepId` garde la session déjà affectée, même passée, pour
// que la liste affiche toujours la valeur actuelle.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function selectableStages(stages, keepId = null) {
  const today = todayIso();
  return stages
    .filter((s) => s.id === keepId
      || ((s.date_fin || s.date_debut || "").slice(0, 10) >= today && s.statut !== "annule" && !s.is_test))
    .sort((a, b) => (a.date_debut || "").localeCompare(b.date_debut || ""));
}
