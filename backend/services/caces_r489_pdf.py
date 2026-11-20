"""Grilles théoriques CACES® R.489 « à l'identique » (demande du 2026-11-19).

Les 5 grilles officielles (V1 - 12/2024) sont gardées telles quelles en PDF
(assets/caces_r489/templates/grille_N.pdf) : chaque page est reprise sans
modification, légèrement réduite sous un bandeau TDL Formation (logo,
candidat, date, libellés VRAI / FAUX au-dessus des deux colonnes de réponse
de la grille), et on coche par-dessus :
  - « vierge »  : questionnaire à remplir par le candidat ;
  - « corrige » : la bonne réponse cochée à chaque question ;
  - « copie »   : les réponses du candidat (saisies par le testeur), les
                  erreurs entourées en rouge avec la bonne réponse en vert,
                  et la note par thème.
Position de chaque question sur la page : assets/caces_r489/grilles.json
(scripts/caces_r489_extract.py)."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

import pymupdf as fitz

BASE = Path(__file__).resolve().parent.parent / "assets" / "caces_r489"
LOGO = Path(__file__).resolve().parent.parent / "assets" / "tdl_logo.png"
A4 = fitz.paper_rect("a4")
HEADER = 46          # hauteur du bandeau TDL (points)
COL_VRAI = 523.5     # centre des colonnes de réponse de la grille officielle
COL_FAUX = 558.5
NAVY = (0.09, 0.21, 0.37)
GREEN = (0.05, 0.55, 0.2)
RED = (0.8, 0.1, 0.1)
BLUE = (0.05, 0.25, 0.75)


@lru_cache(maxsize=1)
def grilles() -> dict:
    with open(BASE / "grilles.json", encoding="utf-8") as f:
        return json.load(f)


def official_questions(numero: str) -> List[dict]:
    return grilles()["grilles"][str(numero)]


def qkey(q: dict) -> str:
    """Identifiant stable d'une question dans sa grille : thème + numéro."""
    return f"t{q.get('theme_num')}_{q.get('numero')}"


class _Placer:
    """Report des coordonnées de la page officielle sur la page réduite."""

    def __init__(self, src_rect: fitz.Rect):
        self.s = (A4.height - HEADER - 4) / src_rect.height
        self.ox = (A4.width - src_rect.width * self.s) / 2
        self.target = fitz.Rect(self.ox, HEADER, self.ox + src_rect.width * self.s, HEADER + src_rect.height * self.s)

    def pt(self, x: float, y: float) -> fitz.Point:
        return fitz.Point(self.ox + x * self.s, HEADER + y * self.s)


def _header(page: fitz.Page, pl: _Placer, title: str, entete: dict, page_no: int, nb_pages: int, score_line: str = "") -> None:
    if LOGO.exists():
        page.insert_image(fitz.Rect(14, 4, 52, 42), filename=str(LOGO), keep_proportion=True)
    page.insert_text((58, 15), "TDL Formation", fontsize=9, fontname="hebo", color=NAVY)
    page.insert_text((58, 26), title, fontsize=7.5, fontname="helv", color=NAVY)
    champs = [("Candidat", entete.get("candidat")), ("Date", entete.get("date")), ("Copie n°", entete.get("numero_copie"))]
    x = 58
    for label, value in champs:
        page.insert_text((x, 38), f"{label} : ", fontsize=7.5, fontname="hebo")
        w = fitz.get_text_length(f"{label} : ", fontname="hebo", fontsize=7.5)
        if value:
            page.insert_text((x + w, 38), str(value), fontsize=8, fontname="helv", color=BLUE)
        else:
            page.draw_line((x + w, 39), (x + w + (120 if label == "Candidat" else 55), 39), color=(0.5, 0.5, 0.5), width=0.5, dashes="[1 1] 0")
        x += w + (128 if label == "Candidat" else 62)
    if entete.get("testeur"):
        page.insert_text((A4.width - 210, 15), f"Testeur : {entete['testeur']}", fontsize=7.5, fontname="helv")
    if score_line:
        page.insert_text((A4.width - 210, 26), score_line, fontsize=7.5, fontname="hebo", color=GREEN if "ADMIS" in score_line else RED)
    page.insert_text((A4.width - 210, 38 if score_line or entete.get("testeur") else 15), f"Feuille {page_no}/{nb_pages}", fontsize=7, fontname="helv", color=(0.4, 0.4, 0.4))
    # Libellés des deux colonnes de réponse, juste au-dessus de la grille.
    for col, label in ((COL_VRAI, "VRAI"), (COL_FAUX, "FAUX")):
        p = pl.pt(col, 0)
        w = fitz.get_text_length(label, fontname="hebo", fontsize=7)
        page.insert_text((p.x - w / 2, HEADER - 1.5), label, fontsize=7, fontname="hebo", color=NAVY)


def _cross(page: fitz.Page, center: fitz.Point, size: float, color, width: float = 1.4) -> None:
    d = size / 2
    page.draw_line((center.x - d, center.y - d), (center.x + d, center.y + d), color=color, width=width)
    page.draw_line((center.x - d, center.y + d), (center.x + d, center.y - d), color=color, width=width)


def render(numero: str, mode: str = "vierge", entete: Optional[dict] = None,
           reponses_bank: Optional[Dict[str, bool]] = None, reponses_candidat: Optional[Dict[str, Optional[bool]]] = None,
           resultat: Optional[dict] = None, out: Optional[fitz.Document] = None) -> fitz.Document:
    """Ajoute la grille `numero` à `out` (créé si absent) et le renvoie.
    `reponses_bank` : bonnes réponses de la banque (clé qkey) - celles de la
    grille officielle à défaut. `reponses_candidat` : réponses cochées par le
    candidat (mode « copie »)."""
    entete = entete or {}
    src = fitz.open(BASE / "templates" / f"grille_{numero}.pdf")
    out = out if out is not None else fitz.open()
    questions = official_questions(numero)
    bonnes = {qkey(q): q["reponse"] for q in questions}
    bonnes.update({k: v for k, v in (reponses_bank or {}).items() if v is not None})
    score_line = ""
    if mode == "copie" and resultat:
        score_line = f"Note : {resultat.get('bonnes')}/{resultat.get('total')} - {'ADMIS' if resultat.get('passed') else 'AJOURNÉ'}"
    title = f"Épreuve théorique CACES® R.489 - Grille {numero}" + {"corrige": " - CORRIGÉ", "copie": " - copie corrigée"}.get(mode, "")
    for pno in range(len(src)):
        pl = _Placer(src[pno].rect)
        page = out.new_page(width=A4.width, height=A4.height)
        page.show_pdf_page(pl.target, src, pno)
        _header(page, pl, title, entete, pno + 1, len(src), score_line)
        if mode == "vierge":
            continue
        for q in (q for q in questions if q["page"] == pno):
            k = qkey(q)
            y = (q["row"][1] + q["row"][3]) / 2
            juste = bonnes.get(k)
            if mode == "corrige":
                if juste is not None:
                    _cross(page, pl.pt(COL_VRAI if juste else COL_FAUX, y), 7, GREEN, 1.6)
                continue
            rep = (reponses_candidat or {}).get(k)
            if rep is not None:
                _cross(page, pl.pt(COL_VRAI if rep else COL_FAUX, y), 7, BLUE)
            if rep is None or rep != juste:
                # Erreur ou absence de réponse : ligne de réponse entourée, bonne réponse en vert.
                tl, br = pl.pt(507, q["row"][1] + 1), pl.pt(575, q["row"][3] - 1)
                page.draw_rect(fitz.Rect(tl, br), color=RED, width=1)
                if juste is not None:
                    c = pl.pt(COL_VRAI if juste else COL_FAUX, y)
                    page.draw_circle(c, 5.5, color=GREEN, width=1)
        if mode == "copie" and resultat and pno == len(src) - 1:
            _score_box(page, resultat)
    src.close()
    return out


def _score_box(page: fitz.Page, resultat: dict) -> None:
    lines = ["Résultat de l'épreuve théorique"]
    for t in (resultat.get("par_theme") or {}).values():
        lines.append(f"{t['label']} : {t['bonnes']}/{t['total']}")
    lines.append(f"Total : {resultat.get('bonnes')}/{resultat.get('total')} - {'FAVORABLE' if resultat.get('passed') else 'DÉFAVORABLE'}")
    h = 12 * len(lines) + 10
    box = fitz.Rect(40, A4.height - h - 20, 360, A4.height - 20)
    page.draw_rect(box, color=NAVY, fill=(1, 1, 1), width=1)
    for i, l in enumerate(lines):
        page.insert_text((box.x0 + 8, box.y0 + 14 + 12 * i), l, fontsize=8.5 if i else 9,
                         fontname="hebo" if i in (0, len(lines) - 1) else "helv",
                         color=(GREEN if resultat.get("passed") else RED) if i == len(lines) - 1 else (0, 0, 0))


def pdf_bytes(doc: fitz.Document) -> bytes:
    data = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return data
