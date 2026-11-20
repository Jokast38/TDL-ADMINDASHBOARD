"""Fiches officielles TDL d'évaluation du savoir-faire pratique CACES® R.489
(4.5.5, catégories 1B, 3 et 5 — demande du 2026-11-19) : les notes saisies
par le testeur sont reportées sur la fiche d'origine, ligne par ligne, avec
le candidat, la date, les horaires, les temps de séquence (T1, T2, T3), le
total et la signature du testeur.

Le barème de chaque fiche est identique à core/caces_grilles.py (annexe
A3/2) : la n-ième valeur de la colonne « Barème » de la fiche est le n-ième
critère de la grille du code — vérifié à chaque génération."""
from pathlib import Path
from typing import Dict, List, Optional

import pymupdf as fitz

TEMPLATES = Path(__file__).resolve().parent.parent / "assets" / "caces_r489" / "templates"
BLUE = (0.05, 0.25, 0.75)
RED = (0.8, 0.1, 0.1)
GREEN = (0.05, 0.5, 0.2)


def has_template(category: str) -> bool:
    return (TEMPLATES / f"eval_pratique_{category}.pdf").exists()


def _criteres(grille: dict) -> List[dict]:
    return [c for t in grille["volets"][0]["themes"] for p in t["points"] for c in p["criteres"]]


def _fmt(v) -> str:
    if v is None or v == "":
        return ""
    f = float(v)
    return str(int(f)) if f.is_integer() else str(f).replace(".", ",")


def _center(page: fitz.Page, text: str, cx: float, y: float, size: float = 9, color=BLUE, font: str = "hebo") -> None:
    w = fitz.get_text_length(text, fontname=font, fontsize=size)
    page.insert_text((cx - w / 2, y), text, fontsize=size, fontname=font, color=color)


def render(category: str, grille: dict, notes: Dict[str, float], score: dict, entete: dict,
           temps: Optional[Dict[str, str]] = None, signature_png: Optional[bytes] = None) -> Optional[bytes]:
    if not has_template(category):
        return None
    src = fitz.open(TEMPLATES / f"eval_pratique_{category}.pdf")
    page = src[0]
    words = page.get_text("words")
    find = lambda t: [w for w in words if w[4] == t]  # noqa: E731
    bareme = find("Barème")[0]
    note_l, note_r = find("Note")[0], find("obtenue")[0]
    note_x = (note_l[0] + note_r[2]) / 2
    bx = (bareme[0] + bareme[2]) / 2
    lignes = sorted([w for w in words if w[4].isdigit() and abs((w[0] + w[2]) / 2 - bx) < 15 and w[1] > bareme[3]], key=lambda w: w[1])
    total_word, lignes = lignes[-1], lignes[:-1]
    criteres = _criteres(grille)
    if [int(w[4]) for w in lignes] != [int(c["max"]) for c in criteres]:
        src.close()
        return None  # fiche et grille ne correspondent plus : on garde le PDF générique
    for w, c in zip(lignes, criteres):
        v = notes.get(f"0:{c['id']}")
        if v is not None:
            _center(page, _fmt(v), note_x, w[3] - 1.5, color=RED if float(v) == 0 else BLUE)
    total = score.get("total")
    passed = score.get("passed")
    _center(page, f"{_fmt(total)} / 100", note_x, total_word[3] - 1, size=10, color=GREEN if passed else RED)
    _center(page, "ADMIS" if passed else "AJOURNÉ", note_x + 70, total_word[3] - 1, size=10, color=GREEN if passed else RED)
    # Temps de séquence : à droite de « T1= », « T2= », « T3= ».
    for key in ("T1", "T2", "T3"):
        val = (temps or {}).get(key)
        hit = find(f"{key}=")
        if val and hit:
            page.insert_text((hit[0][2] + 3, hit[0][3] - 1.5), str(val), fontsize=10, fontname="hebo", color=BLUE)
    # En-tête : valeurs sous chaque intitulé de colonne.
    head_y = find("Candidat")[0][1]
    for label, value in (("Candidat", entete.get("candidat")), ("Date", entete.get("date")), ("Début", entete.get("debut")),
                         ("Fin", entete.get("fin")), ("Testeur", entete.get("testeur"))):
        hit = [w for w in find(label) if abs(w[1] - head_y) < 3]
        if value and hit:
            _center(page, str(value), (hit[0][0] + hit[0][2]) / 2, head_y + 24, size=9, font="helv")
    sig = [w for w in find("Signature") if abs(w[1] - head_y) < 3]
    if signature_png and sig:
        cx = (sig[0][0] + sig[0][2]) / 2
        try:
            page.insert_image(fitz.Rect(cx - 45, head_y + 8, cx + 45, head_y + 36), stream=signature_png, keep_proportion=True)
        except Exception:
            pass
    data = src.tobytes(garbage=3, deflate=True)
    src.close()
    return data
