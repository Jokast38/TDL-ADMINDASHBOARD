"""Examen d'adéquation R.489 sur le document officiel TDL Formation
(4.5.2, demande du 2026-11-19) : rempli chaque jour de test par le testeur,
dans son espace, puis regénéré à l'identique avec ses cases cochées, son nom,
la date et sa signature.

Le document (assets/caces_r489/templates/examen_adequation.pdf) a ses
tableaux en image : chaque case à cocher est repérée par sa position
(assets/caces_r489/adequation_cases.json, index = numéro ci-dessous)."""
import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pymupdf as fitz

BASE = Path(__file__).resolve().parent.parent / "assets" / "caces_r489"
NAVY = (0.05, 0.2, 0.55)

_M1 = "masse ≥ 50 % capacité nominale, hauteur ≥ 1,20 m"
_M2 = "masse ≥ 25 % capacité nominale, hauteur ≥ 1,80 m"
_M3 = "charge fictive, masse réelle ≥ 25 % capacité"
_M4 = "masse ≥ 25 % capacité nominale, hauteur ≥ haut. alvéole - 0,30 m"
_M5 = "masse ≥ 50 % capacité nominale"
_SOL = "Sol stabilisé, béton et/ou enrobé"
_SPEC = ("1 charge de longueur ≥ 2x la largeur hors-tout du chariot, ou 1 contenant ≥ 1 m³ partiellement empli de liquide,"
         " ou 1 big-bag plein — masse ≥ 500 kg")

SECTIONS = {
    "categories": "Catégories testées aujourd'hui",
    "documents": "Documents de conformité de chaque machine",
    "zone": "Zone d'évolution",
    "palettisees": "Charges palettisées (avec indication de la masse)",
    "empilables": "Charges empilables (avec indication de la masse)",
    "specifiques": "Charges spécifiques (avec indication de la masse)",
    "palettier": "Palettier (hauteur des lisses)",
    "camion": "Camion ou remorque",
}

# (index de la case, clé, section, catégories concernées, libellé)
CASES = [
    (0, "cat_1A", "categories", ["1A"], "1A — Chariot(s) de catégorie 1A (et éventuellement 1B), conçu pour charger et décharger un véhicule à quai"),
    (1, "cat_1B", "categories", ["1B"], "1B — Gerbeur à conducteur porté assis ou debout (hauteur de levée ≥ 3,10 m)"),
    (2, "cat_2A", "categories", ["2A"], "2A — Chariot à plateau porteur (capacité de charge ≥ 500 kg)"),
    (3, "cat_2B", "categories", ["2B"], "2B — Chariot tracteur industriel attelé à une remorque adaptée (capacité de traction ≥ 3 t)"),
    (4, "cat_3", "categories", ["3"], "3 — Chariot élévateur frontal en porte-à-faux (≤ 6 t, levée ≥ 3,50 m)"),
    (5, "cat_4", "categories", ["4"], "4 — Chariot élévateur frontal en porte-à-faux (> 6 t)"),
    (6, "cat_5", "categories", ["5"], "5 — Chariot élévateur à mât rétractable (levée ≥ 6 m)"),
    (7, "cat_6", "categories", ["6"], "6 — Chariot élévateur à poste de conduite élevable (plancher ≥ 2,80 m)"),
    (8, "cat_7", "categories", ["7"], "7 — Un chariot représentatif des catégories 1A ou 1B et un des catégories 3, 4, 5 ou 6"),
    (9, "doc_ce", "documents", [], "Certificat de conformité ou CE"),
    (10, "doc_vgp", "documents", [], "Vérification générale périodique (VGP)"),
    (11, "doc_notice", "documents", [], "Notice d'instructions en français de la machine"),
    # Tableau catégories 1A à 3
    (12, "surface_1A", "zone", ["1A"], "Surface"),
    (21, "surface_1B", "zone", ["1B"], "Surface"),
    (20, "surface_2A", "zone", ["2A"], "Surface 200 m² mini"),
    (22, "surface_2B", "zone", ["2B"], "Surface"),
    (42, "surface_3", "zone", ["3"], "Surface"),
    (23, "sol_1A_3", "zone", ["1A", "1B", "2A", "2B", "3"], _SOL),
    (24, "pente", "zone", ["2A", "2B", "3"], "Pente : rampe ou terrain naturel, longueur ≥ 2x long. hors-tout du chariot, pente 8 % mini"),
    (25, "devers", "zone", ["2A", "2B", "3"], "Dévers : rampe ou terrain naturel, largeur ≥ 2x larg. hors-tout du chariot, pente 2 % mini"),
    (13, "quai", "zone", ["1A", "1B"], "Quai avec dispositif de nivelage"),
    (14, "standard_1A", "palettisees", ["1A"], f"Manutention standard : 1 charge ({_M1})"),
    (26, "standard_1B", "palettisees", ["1B"], f"Manutention standard : 3 charges ({_M1})"),
    (27, "standard_3", "palettisees", ["3"], f"Manutention standard : 3 charges ({_M1})"),
    (15, "masquant_1A", "palettisees", ["1A"], f"Masquant la visibilité : 1 charge ({_M2})"),
    (28, "masquant_1B", "palettisees", ["1B"], f"Masquant la visibilité : 1 charge ({_M2})"),
    (29, "masquant_3", "palettisees", ["3"], f"Masquant la visibilité : 1 charge ({_M2})"),
    (16, "depassant_1A", "palettisees", ["1A"], f"Dépassant la capacité : 1 charge ({_M3})"),
    (32, "depassant_1B", "palettisees", ["1B"], f"Dépassant la capacité : 1 charge ({_M3})"),
    (30, "depassant_2A", "palettisees", ["2A"], f"Dépassant la capacité : 1 charge ({_M3})"),
    (31, "depassant_2B", "palettisees", ["2B"], f"Dépassant la capacité : 1 charge ({_M3})"),
    (33, "depassant_3", "palettisees", ["3"], f"Dépassant la capacité : 1 charge ({_M3})"),
    (34, "pour_palettier_1B", "palettisees", ["1B"], f"Pour palettier : 3 charges ({_M4})"),
    (35, "pour_palettier_3", "palettisees", ["3"], f"Pour palettier : 3 charges ({_M4})"),
    (36, "porteur_2A", "palettisees", ["2A"], "Pour porteur : 1 charge (masse ≥ 50 % capacité de charge)"),
    (37, "remorque_2B", "palettisees", ["2B"], "Pour remorque : 1 charge (masse ≥ 50 % capacité de traction)"),
    (38, "empilables_1B", "empilables", ["1B"], f"3 charges empilables ({_M5})"),
    (39, "empilables_3", "empilables", ["3"], f"3 charges empilables ({_M5})"),
    (40, "specifiques_3", "specifiques", ["3"], f"1 charge spécifique* ({_SPEC})"),
    (17, "palettier_1B", "palettier", ["1B"], "3 travées / 3 niveaux (0 à 2,90 m mini)"),
    (19, "camion_1A", "camion", ["1A"], "Chargement / déchargement par l'arrière"),
    (18, "camion_1B", "camion", ["1B"], "Chargement / déchargement par l'arrière"),
    (41, "camion_3", "camion", ["3"], "Chargement / déchargement depuis le sol"),
    # Tableau catégories 4 à 7
    (43, "surface_4", "zone", ["4"], "Surface 300 m² mini"),
    (44, "surface_5", "zone", ["5"], "Surface"),
    (45, "surface_6", "zone", ["6"], "Surface 200 m² mini"),
    (61, "surface_7", "zone", ["7"], "Surface"),
    (46, "sol_4_7", "zone", ["4", "5", "6", "7"], _SOL),
    (47, "standard_4", "palettisees", ["4"], f"Manutention standard : 3 charges ({_M1})"),
    (48, "standard_5", "palettisees", ["5"], f"Manutention standard : 3 charges ({_M1})"),
    (62, "standard_7", "palettisees", ["7"], f"Manutention standard : 2 charges ({_M1})"),
    (49, "masquant_4", "palettisees", ["4"], f"Masquant la visibilité : 1 charge ({_M2})"),
    (50, "masquant_5", "palettisees", ["5"], f"Masquant la visibilité : 1 charge ({_M2})"),
    (52, "depassant_4", "palettisees", ["4"], f"Dépassant la capacité : 1 charge ({_M3})"),
    (51, "depassant_5", "palettisees", ["5"], f"Dépassant la capacité : 1 charge ({_M3})"),
    (53, "pour_palettier_5", "palettisees", ["5"], f"Pour palettier : 3 charges ({_M4})"),
    (54, "commande_6", "palettisees", ["6"], "Préparation de commande : 3 palettes de colis divers (taille et masse) + 3 palettes vides"),
    (55, "empilables_4", "empilables", ["4"], f"3 charges empilables ({_M5})"),
    (56, "empilables_5", "empilables", ["5"], f"3 charges empilables ({_M5})"),
    (57, "specifiques_4", "specifiques", ["4"], f"1 charge spécifique* ({_SPEC})"),
    (59, "palettier_5", "palettier", ["5"], "3 travées / 4 niveaux (0 à 6 m mini)"),
    (58, "palettier_6", "palettier", ["6"], "3 travées / 4 niveaux (0 à 3,30 m mini)"),
    (60, "camion_4", "camion", ["4"], "Chargement / déchargement depuis le sol"),
    (63, "camion_7", "camion", ["7"], "Porte-engins adapté"),
]
KEYS = {c[1] for c in CASES}
CATEGORIES = ["1A", "1B", "2A", "2B", "3", "4", "5", "6", "7"]


@lru_cache(maxsize=1)
def _boxes() -> List[fitz.Rect]:
    with open(BASE / "adequation_cases.json", encoding="utf-8") as f:
        return [fitz.Rect(*r) for r in json.load(f)]


def checklist() -> List[dict]:
    """Cases du formulaire, pour l'espace du testeur."""
    return [{"key": k, "section": s, "section_label": SECTIONS[s], "categories": cats, "label": label}
            for _i, k, s, cats, label in CASES]


def required_for(categories: Iterable[str]) -> List[str]:
    """Cases du tableau à vérifier pour les catégories testées (+ documents)."""
    cats = set(categories)
    return [k for _i, k, s, c, _l in CASES if s == "documents" or (s != "categories" and cats & set(c))]


def _tick(page: fitz.Page, r: fitz.Rect) -> None:
    """Coche (✓) dans la case."""
    a = fitz.Point(r.x0 + r.width * 0.18, r.y0 + r.height * 0.55)
    b = fitz.Point(r.x0 + r.width * 0.42, r.y1 - r.height * 0.18)
    c = fitz.Point(r.x1 - r.width * 0.12, r.y0 + r.height * 0.15)
    page.draw_polyline([a, b, c], color=NAVY, width=1.3)


def render(cases: Iterable[str], testeur: str, date_fr: str, signature_png: Optional[bytes] = None) -> bytes:
    src = fitz.open(BASE / "templates" / "examen_adequation.pdf")
    page = src[0]
    boxes = _boxes()
    by_key = {k: i for i, k, *_ in CASES}
    for key in cases:
        if key in by_key:
            _tick(page, boxes[by_key[key]])
    # Champs de l'en-tête (« Nom et Prénom du testeur : », « Signature du testeur : », « Date : »).
    page.insert_text((193, 193), testeur or "", fontsize=11, fontname="helv", color=NAVY)
    page.insert_text((72, 213), date_fr or "", fontsize=11, fontname="helv", color=NAVY)
    if signature_png:
        try:
            page.insert_image(fitz.Rect(512, 172, 640, 222), stream=signature_png, keep_proportion=True)
        except Exception:
            pass
    data = src.tobytes(garbage=3, deflate=True)
    src.close()
    return data


def summary(cases: Iterable[str]) -> Dict[str, List[str]]:
    sel = set(cases)
    return {"categories": [c[3][0] for c in CASES if c[2] == "categories" and c[1] in sel],
            "manquantes": [k for k in required_for(c[3][0] for c in CASES if c[2] == "categories" and c[1] in sel) if k not in sel]}
