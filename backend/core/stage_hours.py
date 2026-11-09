"""Horaires des sessions par type de formation (demande du 2026-11-09).

Les stages de récupération de points ont lieu de 8h00 à 16h00 : jusqu'ici
ils étaient créés au défaut générique 9h-17h, la convocation et le rappel
annonçaient donc 9h et des élèves arrivaient en retard."""

DEFAULT_HOURS = ("09:00", "17:00")
RECUP_HOURS = ("08:00", "16:00")
# Accueil des stagiaires avant le début du stage.
RECUP_ACCUEIL = "07:45"


def is_recup(stage_or_category) -> bool:
    """Stage de récupération de points : catégorie de formation PERMIS (ou,
    à défaut de catégorie connue, le titre de la formation)."""
    if isinstance(stage_or_category, str) or stage_or_category is None:
        return stage_or_category == "PERMIS"
    s = stage_or_category
    if s.get("formation_category"):
        return s["formation_category"] == "PERMIS"
    titre = (s.get("formation_titre") or "").lower()
    return "récupération" in titre or "recuperation" in titre or "récup" in titre


def default_hours(category) -> tuple:
    return RECUP_HOURS if category == "PERMIS" else DEFAULT_HOURS


def stage_hours(stage: dict) -> tuple:
    """(début, fin) d'une session : ses horaires enregistrés, sinon le
    défaut de sa formation."""
    debut, fin = RECUP_HOURS if is_recup(stage) else DEFAULT_HOURS
    return stage.get("heure_debut") or debut, stage.get("heure_fin") or fin
