"""Règles pures du placement des formateurs sur les sessions (sans accès base,
voir services/formateur_placement.py pour leur utilisation).

- Une session de récupération de points a toujours une place BAFM et une place
  psychologue ; une session CACES une place formateur et une place testeur ;
  toute autre formation une seule place formateur.
- Le formateur ne voit que si une place est libre, jamais qui l'occupe.
- Le planning d'une année se choisit l'année précédente, avec le 30 novembre
  comme date limite (demande du 2026-11-02) : rappels à partir du 1er août.
- Le quota annuel (en jours) ne limite que le placement par le formateur
  lui-même — un agent peut le dépasser depuis la page Sessions de formation.
"""
from datetime import date
from typing import Iterable, Optional

PLACES_PAR_CATEGORIE = {"PERMIS": ("BAFM", "PSY"), "CACES": ("FORMATEUR", "TESTEUR")}
PLACES_PAR_DEFAUT = ("FORMATEUR",)

# Pièces et convention propres aux stages de récupération de points : le texte
# de la convention (services/pdf.py) ne parle que de ces stages, elle n'a pas de
# sens pour un formateur SSIAP, CACES...
PERMIS_ONLY_DOC_TYPES = (
    "diplome_bafm_psy", "autorisation_animer_initiale", "attestation_formation_continue",
    "attestation_gta_initiale", "attestation_gta_continue",
)


def formateur_categories(user: dict) -> list:
    """Sans type de formation renseigné, c'est un formateur créé avant ce
    champ : ils animaient tous des stages de récupération de points."""
    return user.get("assigned_categories") or ["PERMIS"]


def formateur_is_permis(user: dict) -> bool:
    return "PERMIS" in formateur_categories(user)


def places_of_category(category: Optional[str]) -> tuple:
    return PLACES_PAR_CATEGORIE.get(category, PLACES_PAR_DEFAUT)


def place_for(titre: Optional[str], category: Optional[str]) -> str:
    """Place occupée sur une session d'après le titre du formateur — "BAFM"
    par défaut en récupération de points, comme la convention (services/pdf.py)."""
    titre_upper = (titre or "").upper()
    if category == "PERMIS":
        return "PSY" if "PSY" in titre_upper else "BAFM"
    if category == "CACES" and "TESTEUR" in titre_upper:
        return "TESTEUR"
    return "FORMATEUR"


def places_occupees(titres: Iterable[Optional[str]], category: Optional[str]) -> set:
    return {place_for(t, category) for t in titres}


def stage_nb_jours(stage: dict) -> int:
    try:
        debut = date.fromisoformat(stage["date_debut"][:10])
        fin = date.fromisoformat(stage["date_fin"][:10])
    except (KeyError, TypeError, ValueError):
        return 1
    return max((fin - debut).days + 1, 1)


def stages_overlap(a: dict, b: dict) -> bool:
    return a["date_debut"][:10] <= b["date_fin"][:10] and b["date_debut"][:10] <= a["date_fin"][:10]


def quota_depasse(jours_places: int, nb_jours: int, quota: Optional[int]) -> bool:
    """Pas de quota renseigné = pas de limite."""
    return quota is not None and jours_places + nb_jours > quota


def planning_year(today: date) -> int:
    return today.year + 1


def planning_deadline(year: int) -> date:
    return date(year - 1, 11, 30)


def reminder_window_open(today: date) -> bool:
    return date(today.year, 8, 1) <= today <= planning_deadline(planning_year(today))
