"""Référentiel des épreuves CACES® R.489 (recommandation Cnam, annexe 3) et
calcul des résultats — demande du 2026-11-10.

- Théorie (annexe A3/1) : 4 thèmes notés sur 100. Les questions elles-mêmes
  (4 grilles de questions vrai/faux) sont saisies ou importées par l'équipe
  (routers/caces_exam.py) : elles ne sont pas dans le code.
- Pratique (annexe A3/2) : une grille par catégorie, recopiée de la
  recommandation (points d'évaluation, critères et barème).

Règles de réussite (annexe 3) :
- théorie : 70/100 au total ET au moins la moyenne dans chaque thème ;
- pratique : 70/100 au total ET au moins la moyenne dans chaque thème ET une
  note supérieure à zéro à chaque point d'évaluation (les points numérotés de
  la grille).
"""
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Théorie
# ---------------------------------------------------------------------------

GRILLES_THEORIE = ("1", "2", "3", "4")

# (clé, libellé, barème sur 100) — annexe A3/1.
THEMES_THEORIE = (
    ("generales", "Connaissances générales", 15),
    ("technologie", "Technologie et stabilité des chariots à conducteur porté", 25),
    ("abaque", "Tableau / abaque de charges", 10),
    ("exploitation", "Exploitation des chariots à conducteur porté", 50),
)
THEME_KEYS = tuple(t[0] for t in THEMES_THEORIE)

# Mots-clés reconnus à l'import d'un fichier (colonne « thème »).
_THEME_ALIASES = {
    "generales": ("general", "connaissance", "1"),
    "technologie": ("techno", "stabilit", "2"),
    "abaque": ("abaque", "tableau", "charge", "3"),
    "exploitation": ("exploit", "4"),
}


def theme_from_label(label) -> Optional[str]:
    """Clé de thème à partir d'un libellé libre (« Technologie », « abaque »,
    « 2 »…) ; None si non reconnu."""
    import unicodedata
    if label is None:
        return None
    s = unicodedata.normalize("NFKD", str(label)).encode("ascii", "ignore").decode().lower().strip()
    if s in THEME_KEYS:
        return s
    if s.isdigit():
        return {"1": "generales", "2": "technologie", "3": "abaque", "4": "exploitation"}.get(s)
    for key, words in _THEME_ALIASES.items():
        if any(w in s for w in words if not w.isdigit()):
            return key
    return None


def answer_from_label(value) -> Optional[bool]:
    """Vrai/Faux à partir de « V », « vrai », « F », « faux », 1/0, True/False."""
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in ("v", "vrai", "true", "1", "oui", "o", "x"):
        return True
    if s in ("f", "faux", "false", "0", "non", "n"):
        return False
    return None


def score_theorie(questions: List[dict], erreurs: List[int]) -> dict:
    """Résultat d'une copie : `questions` dans l'ordre de la copie (chaque
    question a `theme`), `erreurs` = numéros (1..N, numérotation de la copie)
    des réponses fausses ou non répondues."""
    wrong = {int(n) for n in erreurs}
    par_theme = {}
    for key, label, _ in THEMES_THEORIE:
        idx = [i for i, q in enumerate(questions, start=1) if q.get("theme") == key]
        ok = sum(1 for i in idx if i not in wrong)
        par_theme[key] = {
            "label": label, "bonnes": ok, "total": len(idx),
            "pct": round(100 * ok / len(idx), 1) if idx else None,
        }
    total = len(questions)
    bonnes = total - len(wrong & set(range(1, total + 1)))
    pct = round(100 * bonnes / total, 1) if total else 0
    themes_ok = all(t["pct"] is None or t["pct"] >= 50 for t in par_theme.values())
    return {
        "bonnes": bonnes, "total": total, "pct": pct, "par_theme": par_theme,
        "passed": bool(total) and pct >= 70 and themes_ok,
        "erreurs": sorted(wrong),
    }


# ---------------------------------------------------------------------------
# Pratique — grilles de l'annexe A3/2
# ---------------------------------------------------------------------------

_NOTICE = "Notice d'instructions (justifier une interdiction d'emploi ou une règle d'utilisation)"
_RAPPORT = "Rapport de vérification générale périodique, de mise ou de remise en service (absence d'observation ou de restriction d'usage)"
_VISUELLE = "Procéder à une vérification visuelle du chariot"
_REGLAGES = "Effectuer les différents réglages relatifs au poste de conduite"
_FONCTIONNEMENT = "Vérifier le bon fonctionnement des mécanismes et des dispositifs de sécurité"
_ADEQUATION = "S'assurer de l'adéquation du chariot à la manutention à réaliser"
_EN_CONTINU = "En marche avant / arrière, en ligne droite / en virage, arrêter le chariot (évalué en continu durant toutes les épreuves)"

FIN_DE_POSTE = ["Réaliser les opérations de fin de poste", "Réaliser les opérations de maintenance journalière", "Rendre compte des anomalies relevées"]
PRENDRE = [_ADEQUATION, "Positionner le chariot pour la prise / positionner la palette sur la fourche",
           "Vérifier le lieu de dépose / positionner le chariot et déposer la palette avec précision à l'endroit prévu"]
GERBER = [_ADEQUATION, "Apprécier le nombre maximal de niveaux empilables en fonction des charges",
          "Positionner le chariot face aux charges / positionner les charges sur la fourche",
          "Empiler les charges avec précision sans compromettre la stabilité de la pile",
          "Dépiler les charges et les déposer à l'endroit prévu"]
STOCKER = [_ADEQUATION, "Localiser les emplacements définis / évaluer les risques selon les charges",
           "Vérifier les charges (état de la palette, qualité du conditionnement, stabilité…)",
           "Positionner le chariot / prendre et déposer les charges sans heurts",
           "Déstocker les charges et les déposer à l'endroit prévu"]
QUAI = ["S'assurer de l'adéquation du chariot et du véhicule à la manutention à réaliser",
        "Mettre en œuvre les moyens d'accès en sécurité au véhicule", "Adapter la vitesse et la trajectoire du chariot",
        "Prendre et déposer 3 charges conformément au plan de chargement",
        "Décharger le véhicule et déposer les charges à l'endroit prévu"]
DEPUIS_SOL = [_ADEQUATION, "Définir la position appropriée du véhicule et s'assurer que les conditions autorisant l'opération sont remplies",
              "Déposer au moins 3 charges sur ou dans le véhicule en équilibrant le chargement de part et d'autre du plateau",
              "Décharger le véhicule et déposer les charges à l'endroit prévu"]
CHARGE_LONGUE = [_ADEQUATION, "Définir la méthode de prise et de manutention de la charge",
                 "Mettre en œuvre les moyens de manutention adaptés / vérifier le lieu de dépose / déposer chaque charge avec précision à l'endroit prévu"]


def _point(n, titre, criteres):
    """`criteres` : liste de (libellé, barème)."""
    return {"n": n, "titre": titre, "criteres": [{"id": f"{n}.{i}", "label": l, "max": m} for i, (l, m) in enumerate(criteres, start=1)]}


def _prise_de_poste(avec_reglages: bool, baremes):
    labels = [_NOTICE, _RAPPORT, _VISUELLE] + ([_REGLAGES] if avec_reglages else []) + [_FONCTIONNEMENT]
    return {"titre": "Prise de poste et mise en service", "points": [
        _point(1, "Vérifier les documents réglementaires, l'état et le fonctionnement du chariot", list(zip(labels, baremes)))]}


def _fin(n):
    return {"titre": "Fin de poste – maintenance", "points": [_point(n, "Fin de poste et maintenance", [(l, 5) for l in FIN_DE_POSTE])]}


def _volet(themes):
    return {"themes": themes}


def _cat_1(cat):
    a = cat == "1A"
    manoeuvres = [_point(4, "Prendre, déplacer et déposer au sol une charge palettisée", list(zip(PRENDRE, (7, 7, 7) if a else (3, 3, 3))))]
    if not a:
        manoeuvres += [
            _point(5, "Gerber et dégerber au moins 3 charges en pile", list(zip(GERBER, (3, 3, 3, 4, 3)))),
            _point(6, "Stocker et déstocker 3 palettes à 3 niveaux différents d'un palettier (jusqu'à 2,90 m minimum)", list(zip(STOCKER, (3, 3, 3, 3, 3)))),
        ]
    manoeuvres.append(_point(7, "Effectuer le chargement et le déchargement d'un véhicule par l'arrière depuis un quai",
                             list(zip(QUAI, (7, 7, 6, 7, 7) if a else (3, 3, 3, 3, 3)))))
    return [_volet([
        _prise_de_poste(False, (1, 1, 4, 4)),
        {"titre": "Conduite", "points": [_point(2, "Circuler à vide", [(_EN_CONTINU, 10)]), _point(3, "Circuler en charge", [(_EN_CONTINU, 10)])]},
        {"titre": "Manœuvres", "points": manoeuvres},
        _fin(8),
    ])]


def _cat_2(cat):
    if cat == "2A":
        conduite = [_point(2, "Circuler à vide", [(_EN_CONTINU, 16)]), _point(3, "Circuler en charge", [(_EN_CONTINU, 16)])]
        specifique = _point(8, "Charge sur le plateau porteur", [
            ("Détermination de la position appropriée d'une charge donnée sur le plateau porteur", 5),
            ("Guidage du cariste ou du pontier pour le positionnement de la charge à l'endroit défini", 5),
            ("Arrimage de la charge sur le plateau porteur", 5)])
    else:
        conduite = [_point(4, "Circuler avec au moins une remorque vide attelée au chariot", [(_EN_CONTINU, 16)]),
                    _point(5, "Circuler avec au moins une remorque chargée attelée au chariot", [(_EN_CONTINU, 16)])]
        specifique = _point(9, "Remorque(s)", [
            ("Attelage d'une (ou plusieurs) remorque(s) au chariot", 5), ("Arrimage d'une charge sur la remorque", 5),
            ("Décrochage de la (ou des) remorque(s)", 5)])
    conduite.append(_point(6, "Circuler en sécurité, s'arrêter et redémarrer sur un plan incliné et/ou un dévers, en charge", [("Plan incliné / dévers, en charge", 8)]))
    return [_volet([
        _prise_de_poste(True, (1, 1, 3, 2, 3)),
        {"titre": "Conduite", "points": conduite},
        {"titre": "Manœuvres", "points": [_point(7, "S'assurer de l'adéquation du chariot à la manutention à réaliser", [(_ADEQUATION, 20)]), specifique]},
        _fin(10),
    ])]


def _cat_3():
    return [_volet([
        _prise_de_poste(True, (1, 1, 3, 2, 3)),
        {"titre": "Conduite", "points": [
            _point(2, "Circuler à vide", [(_EN_CONTINU, 8)]), _point(3, "Circuler en charge", [(_EN_CONTINU, 8)]),
            _point(4, "Circuler en sécurité, s'arrêter et redémarrer sur un plan incliné et/ou un dévers, en charge", [("Plan incliné / dévers, en charge", 4)])]},
        {"titre": "Manœuvres", "points": [
            _point(5, "Prendre, déplacer et déposer au sol une charge palettisée", list(zip(PRENDRE, (3, 3, 2)))),
            _point(6, "Gerber et dégerber au moins 3 charges en pile", list(zip(GERBER, (3, 3, 3, 3, 2)))),
            _point(7, "Stocker et déstocker 3 palettes à 3 niveaux différents d'un palettier (jusqu'à 3,30 m minimum)", list(zip(STOCKER, (3, 3, 3, 3, 2)))),
            _point(8, "Effectuer le chargement et le déchargement d'un véhicule depuis le sol", list(zip(DEPUIS_SOL, (3, 3, 3, 2)))),
            _point(9, "Prise, transport et dépose d'une charge longue / d'un conteneur de liquide / d'une charge déformable", list(zip(CHARGE_LONGUE, (3, 2, 3))))]},
        _fin(10),
    ])]


def _cat_4():
    return [_volet([
        _prise_de_poste(True, (1, 1, 3, 2, 3)),
        {"titre": "Conduite", "points": [_point(2, "Circuler à vide", [(_EN_CONTINU, 10)]), _point(3, "Circuler en charge", [(_EN_CONTINU, 10)])]},
        {"titre": "Manœuvres", "points": [
            _point(4, "Prendre, déplacer et déposer au sol une charge palettisée", list(zip(PRENDRE, (4, 3, 3)))),
            _point(5, "Gerber et dégerber au moins 3 charges en pile", list(zip(GERBER, (4, 4, 4, 4, 3)))),
            _point(6, "Effectuer le chargement et le déchargement d'un véhicule depuis le sol", list(zip(DEPUIS_SOL, (4, 4, 4, 3)))),
            _point(7, "Prise, transport et dépose d'une charge longue / d'un conteneur de liquide / d'une charge déformable", list(zip(CHARGE_LONGUE, (4, 4, 3))))]},
        _fin(8),
    ])]


def _cat_5():
    return [_volet([
        _prise_de_poste(True, (1, 1, 3, 2, 3)),
        {"titre": "Conduite", "points": [_point(2, "Circuler à vide", [(_EN_CONTINU, 10)]), _point(3, "Circuler en charge", [(_EN_CONTINU, 10)])]},
        {"titre": "Manœuvres", "points": [
            _point(4, "Prendre, déplacer et déposer au sol une charge palettisée", list(zip(PRENDRE, (5, 4, 4)))),
            _point(5, "Gerber et dégerber au moins 3 charges en pile", list(zip(GERBER, (5, 4, 4, 4, 4)))),
            _point(6, "Stocker et déstocker 4 palettes à 4 niveaux différents d'un palettier (jusqu'à 6 m minimum)", list(zip(STOCKER, (5, 4, 4, 4, 4))))]},
        _fin(7),
    ])]


def _cat_6():
    return [_volet([
        _prise_de_poste(True, (1, 1, 3, 2, 3)),
        {"titre": "Conduite", "points": [
            _point(2, "Circuler à vide", [(_EN_CONTINU, 10)]), _point(3, "Circuler en charge", [(_EN_CONTINU, 10)]),
            _point(4, "Circuler à vide et en charge en allée réservée", [("En marche avant / arrière, montée / descente à différents niveaux", 10)])]},
        {"titre": "Manœuvres", "points": [
            _point(5, "Prendre, déplacer et déposer au sol une charge palettisée", [
                (_ADEQUATION, 5), ("Positionner le chariot pour la prise / positionner la palette vide sur la fourche", 5),
                ("Vérifier le lieu de dépose / positionner le chariot et déposer la palette avec précision à l'endroit prévu", 4)]),
            _point(6, "Constituer une palette par picking à plusieurs niveaux d'un palettier (plancher jusqu'à 2,80 m minimum)", [
                (_ADEQUATION, 5), ("Positionner correctement le chariot lors des déplacements dans les allées", 5),
                ("Adapter la hauteur de la cabine en fonction du plan de picking", 4),
                ("Adapter la hauteur de la palette en fonction du plan de dépose", 4),
                ("Déposer la palette constituée en dehors de l'allée de préparation", 4)]),
            _point(7, "Manœuvre de secours", [("Effectuer une manœuvre de secours", 5), ("Faire effectuer une manœuvre de secours", 4)])]},
        _fin(8),
    ])]


def _cat_7():
    charger = [
        ("S'assurer de l'adéquation du chariot et du véhicule à la manœuvre prévue", 5),
        ("S'assurer que la position du véhicule est appropriée et que les conditions permettant le chargement / déchargement sont remplies", 4),
        ("Positionner le chariot / monter sur le véhicule / mettre le chariot en sécurité", 5),
        ("Identifier les points d'arrimage sur le chariot et le véhicule / s'assurer de l'adéquation des moyens d'arrimage proposés", 4),
        ("Décharger le chariot et le ramener à l'endroit prévu", 4)]

    def volet(titre, prise):
        return {"titre": titre, "themes": [
            prise,
            {"titre": "Conduite", "points": [_point(2, "Circuler à vide avec le chariot", [(_EN_CONTINU, 20)]),
                                             _point(3, "Circuler en charge avec le chariot", [(_EN_CONTINU, 20)])]},
            {"titre": "Manœuvres", "points": [
                _point(4, "Prendre, déplacer et déposer au sol une charge palettisée", list(zip(PRENDRE, (5, 4, 4)))),
                _point(5, "Charger et décharger le chariot sur un véhicule de transport, avec une charge sur les bras de fourche", charger)]},
            _fin(6),
        ]}
    return [volet("Chariot N°1 (représentatif des catégories 1A ou 1B)", _prise_de_poste(False, (1, 1, 4, 4))),
            volet("Chariot N°2 (représentatif des catégories 3, 4, 5 ou 6)", _prise_de_poste(True, (1, 1, 3, 2, 3)))]


_LIBELLES = {
    "1A": "Transpalettes à conducteur porté et préparateurs de commande sans élévation du poste de conduite (h ≤ 1,20 m)",
    "1B": "Gerbeurs à conducteur porté (h > 1,20 m)",
    "2A": "Chariots à plateau porteur (capacité de charge ≤ 2 tonnes)",
    "2B": "Chariots tracteurs industriels (capacité de traction ≤ 25 tonnes)",
    "3": "Chariots élévateurs frontaux en porte-à-faux (capacité nominale ≤ 6 tonnes)",
    "4": "Chariots élévateurs frontaux en porte-à-faux (capacité nominale > 6 tonnes)",
    "5": "Chariots élévateurs à mât rétractable",
    "6": "Chariots élévateurs à poste de conduite élevable (hauteur de plancher > 1,20 m)",
    "7": "Conduite hors production des chariots de toutes les catégories",
}


def _with_max(volets):
    for v in volets:
        v.setdefault("titre", None)
        for t in v["themes"]:
            t["max"] = sum(c["max"] for p in t["points"] for c in p["criteres"])
    return volets


def grille_pratique(category: str) -> Optional[dict]:
    builders = {"1A": lambda: _cat_1("1A"), "1B": lambda: _cat_1("1B"), "2A": lambda: _cat_2("2A"), "2B": lambda: _cat_2("2B"),
                "3": _cat_3, "4": _cat_4, "5": _cat_5, "6": _cat_6, "7": _cat_7}
    if category not in builders:
        return None
    return {"category": category, "libelle": _LIBELLES[category], "volets": _with_max(builders[category]())}


def score_pratique(category: str, notes: Dict[str, float]) -> dict:
    """`notes` : {"<volet>:<critère>": note} — volet 0 (1 seul) sauf la
    catégorie 7 (volets 0 et 1 = chariots N°1 et N°2). Une note absente
    compte 0. Chaque volet est noté sur 100 et doit être réussi."""
    grille = grille_pratique(category)
    if not grille:
        raise ValueError("Catégorie CACES inconnue")
    volets = []
    for vi, volet in enumerate(grille["volets"]):
        themes, points_a_zero, total = [], [], 0.0
        for theme in volet["themes"]:
            t_score = 0.0
            for point in theme["points"]:
                p_score = 0.0
                for c in point["criteres"]:
                    raw = notes.get(f"{vi}:{c['id']}", 0) or 0
                    try:
                        val = float(raw)
                    except (TypeError, ValueError):
                        val = 0.0
                    if val < 0 or val > c["max"]:
                        raise ValueError(f"Note hors barème pour le critère {c['id']} (0 à {c['max']})")
                    p_score += val
                if p_score <= 0:
                    points_a_zero.append(point["n"])
                t_score += p_score
            themes.append({"titre": theme["titre"], "note": t_score, "max": theme["max"], "ok": t_score >= theme["max"] / 2})
            total += t_score
        volets.append({
            "titre": volet.get("titre"), "total": total, "themes": themes, "points_a_zero": points_a_zero,
            "passed": total >= 70 and all(t["ok"] for t in themes) and not points_a_zero,
        })
    return {"volets": volets, "total": min(v["total"] for v in volets), "passed": all(v["passed"] for v in volets)}
