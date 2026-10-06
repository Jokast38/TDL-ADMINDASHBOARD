import uuid
from datetime import datetime, timezone, date


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Listes explicites (pas de dépendance à la locale serveur, qui n'est pas
# forcément fr_FR) — à garder cohérentes avec MOIS_FR/JOURS_FR côté front
# (frontend/src/pages/Agenda.jsx).
JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
MOIS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _parse_date(value):
    """Accepte une date/datetime, ou une chaîne ISO ('YYYY-MM-DD' ou avec heure)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        s = value.strip()
        try:
            # Gère 'YYYY-MM-DD' et les formats datetime ISO (avec ou sans 'Z').
            s_norm = s.replace("Z", "+00:00")
            if len(s_norm) <= 10:
                return date.fromisoformat(s_norm)
            return datetime.fromisoformat(s_norm).date()
        except ValueError:
            try:
                return date.fromisoformat(s[:10])
            except ValueError:
                return None
    return None


def format_date_fr(iso_date_or_str) -> str:
    """Formate une date en 'DD-MM-YYYY' (tirets) pour affichage humain."""
    d = _parse_date(iso_date_or_str)
    if not d:
        return str(iso_date_or_str) if iso_date_or_str else ""
    return f"{d.day:02d}-{d.month:02d}-{d.year:04d}"


def format_date_long_fr(iso_date_or_str) -> str:
    """Formate une date en 'Jeudi 06 octobre 2026' pour les emails."""
    d = _parse_date(iso_date_or_str)
    if not d:
        return str(iso_date_or_str) if iso_date_or_str else ""
    jour = JOURS_FR[d.weekday()]
    mois = MOIS_FR[d.month - 1]
    return f"{jour} {d.day:02d} {mois} {d.year:04d}"


def slugify(text: str) -> str:
    import re
    import unicodedata
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'[^a-zA-Z0-9\s-]', '', text).strip().lower()
    text = re.sub(r'[\s-]+', '-', text)
    return text[:80] or str(uuid.uuid4())[:8]
