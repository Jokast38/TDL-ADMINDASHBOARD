"""Calendrier type des stages de récupération de points (règles données le
2026-11-12) :

- chaque semaine, une session lundi-mardi et une session vendredi-samedi ;
- lundi ou mardi férié : la session passe au mercredi-jeudi de la même
  semaine (si l'un des deux est aussi férié : pas de session cette semaine) ;
- vendredi ou samedi férié : pas de session, on passe à la semaine suivante.

Une session appartient à l'année de son premier jour. Les centres et leurs
horaires sont dans CENTRES_RECUP (Creil 8h30-16h30, Épinay 8h-16h, comme les
sessions déjà en ligne)."""
from datetime import date, timedelta

CENTRES_RECUP = {
    "creil": {"label": "Creil", "lieu_ville": "Creil", "lieu_adresse": "27 Pl. Saint-Médard, 60100 Creil, France",
              "heure_debut": "08:30", "heure_fin": "16:30"},
    "epinay": {"label": "Épinay-sur-Seine", "lieu_ville": "Épinay-sur-Seine (93)", "lieu_adresse": "59 avenue Joffre",
               "heure_debut": "08:00", "heure_fin": "16:00"},
}


def _easter(year: int) -> date:
    """Dimanche de Pâques (algorithme de Meeus/Jones/Butcher)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month, day = divmod(h + l_ - 7 * m + 114, 31)
    return date(year, month, day + 1)


def jours_feries(year: int) -> dict:
    """Jours fériés légaux en France métropolitaine (hors Alsace-Moselle)."""
    paques = _easter(year)
    return {
        date(year, 1, 1): "Jour de l'an",
        paques + timedelta(days=1): "Lundi de Pâques",
        date(year, 5, 1): "Fête du Travail",
        date(year, 5, 8): "Victoire 1945",
        paques + timedelta(days=39): "Ascension",
        paques + timedelta(days=50): "Lundi de Pentecôte",
        date(year, 7, 14): "Fête nationale",
        date(year, 8, 15): "Assomption",
        date(year, 11, 1): "Toussaint",
        date(year, 11, 11): "Armistice",
        date(year, 12, 25): "Noël",
    }


def _ferie(d: date, cache: dict) -> bool:
    if d.year not in cache:
        cache[d.year] = jours_feries(d.year)
    return d in cache[d.year]


def sessions_recup(year: int) -> list:
    """Sessions de 2 jours de l'année : [{"date_debut", "date_fin", "note"}],
    triées par date. note explique un décalage (mercredi-jeudi)."""
    cache: dict = {}
    out = []
    monday = date(year, 1, 1) - timedelta(days=date(year, 1, 1).weekday())
    while monday.year <= year:
        tue, wed, thu = monday + timedelta(days=1), monday + timedelta(days=2), monday + timedelta(days=3)
        fri, sat = monday + timedelta(days=4), monday + timedelta(days=5)
        if not (_ferie(monday, cache) or _ferie(tue, cache)):
            out.append({"date_debut": monday, "date_fin": tue, "note": ""})
        elif not (_ferie(wed, cache) or _ferie(thu, cache)):
            out.append({"date_debut": wed, "date_fin": thu, "note": "Décalée au mercredi-jeudi (jour férié)"})
        if not (_ferie(fri, cache) or _ferie(sat, cache)):
            out.append({"date_debut": fri, "date_fin": sat, "note": ""})
        monday += timedelta(days=7)
    return [s for s in out if s["date_debut"].year == year]
