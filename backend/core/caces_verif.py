"""Vérification publique d'un CACES par son numéro (demande du 2026-11-04),
en plus du QR code de la carte. Les numéros se suivent (voir
services/caces.py) : on exige aussi le nom du titulaire, pour qu'on ne
puisse pas parcourir les numéros et lire les noms de tous les titulaires."""
import re
import unicodedata


def normalize_numero(raw: str) -> str:
    """« c1b. 000000000012 », « C1B000000000012 » ou le numéro tel
    qu'imprimé sur la carte donnent tous « C1B.000000000012 »."""
    compact = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    m = re.fullmatch(r"C?([0-9][A-Z]?)(\d{12})", compact)
    return f"C{m.group(1)}.{m.group(2)}" if m else compact


def _words(text: str) -> list:
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return [w for w in re.split(r"[^a-z]+", plain) if w]


def name_matches(student_name: str, nom: str) -> bool:
    """Le nom saisi doit correspondre à un mot entier (ou une suite de mots
    entiers) du nom du titulaire, sans tenir compte des accents ni de la
    casse : « Benali » reconnaît « Karim BENALI », « ben » non."""
    wanted, words = _words(nom), _words(student_name)
    if not wanted:
        return False
    n = len(wanted)
    return any(words[i:i + n] == wanted for i in range(len(words) - n + 1))
