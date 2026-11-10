"""PDF des épreuves CACES® R.489 (demande du 2026-11-10), tous archivés au
nom du testeur (routers/caces_exam.py) :
- questionnaires théoriques papier (une copie par candidat, grille et ordre
  des questions tirés au sort) et leurs corrigés ;
- résultat de l'épreuve théorique d'un candidat ;
- grille d'évaluation pratique remplie (annexe A3/2) ;
- examen d'adéquation / vérification du chariot avant les tests (§3/3/1/2).
Polices standard (Helvetica) : les caractères hors WinAnsi (≤, ≥) sont
remplacés à l'impression."""
import io
from pathlib import Path
from typing import List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from core.caces_grilles import THEMES_THEORIE
from core.utils import format_date_long_fr

_LOGO = Path(__file__).resolve().parent.parent / "assets" / "tdl_logo.png"
DARK = colors.HexColor("#0a0a0a")
GREY = colors.HexColor("#666666")
LIGHT = colors.HexColor("#f2f2f2")

_S = {
    "title": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=14, leading=17, spaceAfter=4),
    "sub": ParagraphStyle("s", fontName="Helvetica", fontSize=9, leading=12, textColor=GREY),
    "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=10.5, leading=13, spaceBefore=6, spaceAfter=3, keepWithNext=1),
    "p": ParagraphStyle("p", fontName="Helvetica", fontSize=9, leading=11.5),
    "q": ParagraphStyle("q", fontName="Helvetica", fontSize=9, leading=11),
    "small": ParagraphStyle("sm", fontName="Helvetica", fontSize=7.5, leading=9.5, textColor=GREY),
    "cell": ParagraphStyle("c", fontName="Helvetica", fontSize=8, leading=10),
    "cellb": ParagraphStyle("cb", fontName="Helvetica-Bold", fontSize=8, leading=10),
    "center": ParagraphStyle("ce", fontName="Helvetica-Bold", fontSize=9, leading=11, alignment=TA_CENTER),
}


def _txt(value) -> str:
    s = "" if value is None else str(value)
    return escape(s.replace("≤", "<=").replace("≥", ">=").replace("’", "'"))


def _p(value, style="p") -> Paragraph:
    return Paragraph(_txt(value), _S[style])


def _date(iso: Optional[str]) -> str:
    return format_date_long_fr(iso) if iso else "—"


def _doc(title: str):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm,
                            topMargin=1.3 * cm, bottomMargin=1.4 * cm, title=title, author="TDL Formation")
    return buf, doc


def _footer(label: str):
    def draw(c, doc):
        c.saveState()
        c.setFont("Helvetica", 7)
        c.setFillColor(GREY)
        c.drawString(1.5 * cm, 0.8 * cm, _txt(label).replace("&amp;", "&"))
        c.drawRightString(A4[0] - 1.5 * cm, 0.8 * cm, f"Page {doc.page}")
        c.restoreState()
    return draw


def _header(title: str, subtitle: str) -> list:
    left = []
    if _LOGO.exists():
        try:
            left = [Image(str(_LOGO), width=1.4 * cm, height=1.4 * cm)]
        except Exception:
            left = []
    head = Table([[left or "", [_p(title, "title"), _p(subtitle, "sub")]]], colWidths=[1.8 * cm, None])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return [head, Spacer(1, 6)]


def _info_table(rows: List[tuple]) -> Table:
    t = Table([[_p(k, "cellb"), _p(v, "cell")] for k, v in rows], colWidths=[4.2 * cm, None])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bbbbbb")),
        ("BACKGROUND", (0, 0), (0, -1), LIGHT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _box() -> Table:
    """Case vide à cocher (carré dessiné, lisible à l'impression)."""
    t = Table([[""]], colWidths=[0.42 * cm], rowHeights=[0.42 * cm])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.9, DARK)]))
    return t


def _signature_block(label: str, name: str, signature_png: Optional[bytes]) -> Table:
    img = ""
    if signature_png:
        try:
            reader = ImageReader(io.BytesIO(signature_png))
            iw, ih = reader.getSize()
            scale = min(6 * cm / iw, 2 * cm / ih)
            img = Image(io.BytesIO(signature_png), width=iw * scale, height=ih * scale)
        except Exception:
            img = ""
    t = Table([[_p(label, "cellb")], [_p(name, "cell")], [img or Spacer(1, 1.6 * cm)]], colWidths=[7 * cm])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#bbbbbb")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


# ---------------------------------------------------------------------------
# Théorie
# ---------------------------------------------------------------------------

def questionnaires_pdf(copies: List[dict], stage: dict) -> bytes:
    """Une copie par candidat : `copies` = [{student_name, numero_copie,
    grille, date, questions: [{enonce}]}] (questions dans l'ordre de la copie)."""
    buf, doc = _doc("Questionnaires théoriques CACES R.489")
    story = []
    for i, copie in enumerate(copies):
        if i:
            story.append(PageBreak())
        story += _header("CACES® R.489 — Épreuve théorique",
                         "Chariots de manutention automoteurs à conducteur porté — TDL Formation")
        story.append(_info_table([
            ("Candidat", copie.get("student_name") or ""),
            ("Date de l'épreuve", _date(copie.get("date"))),
            ("Session", f"{stage.get('formation_titre') or ''} — {stage.get('lieu_ville') or ''}"),
            ("Copie n°", f"{copie.get('numero_copie')} (grille {copie.get('grille')})"),
        ]))
        story.append(Spacer(1, 6))
        story.append(_p(
            "Pour chaque affirmation, cochez une seule case : VRAI ou FAUX. Une bonne réponse vaut 1 point ; une "
            "réponse fausse, double ou absente vaut 0. Réussite : au moins 70 % de bonnes réponses ET au moins la "
            "moyenne dans chaque thème (recommandation R.489, annexe A3/1). Les échanges se font en français ; les "
            "questions peuvent être lues à voix haute par le testeur.", "small"))
        story.append(Spacer(1, 6))
        rows = [[_p("N°", "cellb"), _p("Affirmation", "cellb"), _p("VRAI", "center"), _p("FAUX", "center")]]
        for n, q in enumerate(copie["questions"], start=1):
            rows.append([_p(str(n), "cellb"), _p(q.get("enonce"), "q"), _box(), _box()])
        t = Table(rows, colWidths=[1 * cm, None, 1.4 * cm, 1.4 * cm], repeatRows=1)
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (2, 1), (-1, -1), "CENTER"),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))
        story.append(KeepTogether([
            Table([[_p("Signature du candidat :", "cellb"), _p("Note (réservé au testeur) :      / " + str(len(copie["questions"])), "cellb")],
                   [Spacer(1, 1.4 * cm), ""]], colWidths=[9 * cm, None],
                  style=[("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
                         ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999"))]),
        ]))
    doc.build(story, onFirstPage=_footer("CACES® R.489 — questionnaire théorique — document confidentiel"),
              onLaterPages=_footer("CACES® R.489 — questionnaire théorique — document confidentiel"))
    return buf.getvalue()


def corriges_pdf(copies: List[dict], stage: dict) -> bytes:
    """Corrigé de chaque copie (réservé au testeur) : réponses dans l'ordre
    de la copie, en grille de 10 colonnes."""
    buf, doc = _doc("Corrigés CACES R.489")
    story = _header("CACES® R.489 — Corrigés de l'épreuve théorique",
                    f"{stage.get('formation_titre') or ''} — {stage.get('lieu_ville') or ''} — réservé au testeur")
    for copie in copies:
        cells = [f"{n}. {'V' if q.get('reponse') else 'F'}" for n, q in enumerate(copie["questions"], start=1)]
        rows = [cells[i:i + 10] + [""] * (10 - len(cells[i:i + 10])) for i in range(0, len(cells), 10)]
        t = Table(rows, colWidths=[1.8 * cm] * 10)
        t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#bbbbbb")),
                               ("FONTSIZE", (0, 0), (-1, -1), 8), ("FONTNAME", (0, 0), (-1, -1), "Helvetica")]))
        story.append(KeepTogether([
            _p(f"Copie n°{copie.get('numero_copie')} — {copie.get('student_name') or ''} — grille {copie.get('grille')}", "h"),
            t, Spacer(1, 6)]))
    doc.build(story, onFirstPage=_footer("Corrigés — document confidentiel, ne pas distribuer"),
              onLaterPages=_footer("Corrigés — document confidentiel, ne pas distribuer"))
    return buf.getvalue()


def resultat_theorie_pdf(copie: dict, result: dict, stage: dict, testeur_name: str, signature_png: Optional[bytes]) -> bytes:
    buf, doc = _doc("Résultat épreuve théorique CACES R.489")
    story = _header("CACES® R.489 — Résultat de l'épreuve théorique", "TDL Formation")
    story.append(_info_table([
        ("Candidat", copie.get("student_name") or ""),
        ("Date de l'épreuve", _date(copie.get("date"))),
        ("Session", f"{stage.get('formation_titre') or ''} — {stage.get('lieu_ville') or ''}"),
        ("Copie n° / grille", f"{copie.get('numero_copie')} / grille {copie.get('grille')}"),
        ("Testeur", testeur_name),
    ]))
    story.append(Spacer(1, 8))
    rows = [[_p("Thème", "cellb"), _p("Bonnes réponses", "cellb"), _p("%", "cellb"), _p("Moyenne atteinte", "cellb")]]
    for key, label, _ in THEMES_THEORIE:
        t = result["par_theme"].get(key) or {}
        rows.append([_p(label, "cell"), _p(f"{t.get('bonnes', 0)} / {t.get('total', 0)}", "cell"),
                     _p("—" if t.get("pct") is None else f"{t['pct']} %", "cell"),
                     _p("—" if t.get("pct") is None else ("Oui" if t["pct"] >= 50 else "Non"), "cell")])
    rows.append([_p("TOTAL", "cellb"), _p(f"{result['bonnes']} / {result['total']}", "cellb"), _p(f"{result['pct']} %", "cellb"), ""])
    t = Table(rows, colWidths=[8 * cm, 3.5 * cm, 2.5 * cm, None])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")), ("BACKGROUND", (0, 0), (-1, 0), LIGHT)]))
    story.append(t)
    story.append(Spacer(1, 8))
    story.append(_p(f"Résultat : {'RÉUSSITE' if result['passed'] else 'ÉCHEC'}", "h"))
    if result.get("erreurs"):
        story.append(_p("Questions non validées (numéros de la copie) : " + ", ".join(str(n) for n in result["erreurs"]), "small"))
    story.append(Spacer(1, 12))
    story.append(_signature_block("Le testeur", testeur_name, signature_png))
    doc.build(story, onFirstPage=_footer("CACES® R.489 — résultat théorique"), onLaterPages=_footer("CACES® R.489 — résultat théorique"))
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Pratique
# ---------------------------------------------------------------------------

def grille_pratique_pdf(evaluation: dict, grille: dict, score: dict, stage: dict, testeur_name: str,
                        signature_png: Optional[bytes]) -> bytes:
    buf, doc = _doc(f"Grille pratique CACES R.489 cat. {grille['category']}")
    story = _header(f"CACES® R.489 — Épreuve pratique — catégorie {grille['category']}", grille["libelle"])
    story.append(_info_table([
        ("Candidat", evaluation.get("student_name") or ""),
        ("Date de l'épreuve", _date(evaluation.get("date"))),
        ("Session", f"{stage.get('formation_titre') or ''} — {stage.get('lieu_ville') or ''}"),
        ("Chariot utilisé", evaluation.get("chariot") or "—"),
        ("Testeur", testeur_name),
    ]))
    notes = evaluation.get("notes") or {}
    for vi, volet in enumerate(grille["volets"]):
        vs = score["volets"][vi]
        if volet.get("titre"):
            story.append(_p(volet["titre"], "h"))
        # Une ligne d'en-tête par thème (pas de cellule fusionnée sur
        # plusieurs lignes : le tableau doit pouvoir se couper entre deux pages).
        rows = [[_p("Point d'évaluation", "cellb"), _p("Critère", "cellb"), _p("Barème", "cellb"), _p("Note", "cellb")]]
        style = [("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#aaaaaa")), ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
                 ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]
        for ti, theme in enumerate(volet["themes"]):
            th = vs["themes"][ti]
            rows.append([_p(f"{theme['titre']} — {th['note']:g} / {theme['max']}" + ("" if th["ok"] else " (sous la moyenne)"), "cellb"), "", "", ""])
            style += [("SPAN", (0, len(rows) - 1), (-1, len(rows) - 1)), ("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), LIGHT)]
            for point in theme["points"]:
                for ci, crit in enumerate(point["criteres"]):
                    val = notes.get(f"{vi}:{crit['id']}", 0) or 0
                    rows.append([
                        _p(f"{point['n']}. {point['titre']}", "cell") if ci == 0 else "",
                        _p(crit["label"], "cell"), _p(str(crit["max"]), "cell"), _p(f"{float(val):g}", "cellb"),
                    ])
        rows.append([_p("TOTAL", "cellb"), "", _p("100", "cellb"), _p(f"{vs['total']:g}", "cellb")])
        t = Table(rows, colWidths=[5 * cm, None, 1.6 * cm, 1.3 * cm], repeatRows=1)
        t.setStyle(TableStyle(style))
        story.append(t)
        verdict = "RÉUSSITE" if vs["passed"] else "ÉCHEC"
        detail = []
        if vs["total"] < 70:
            detail.append("total inférieur à 70/100")
        detail += [f"thème « {th['titre']} » sous la moyenne" for th in vs["themes"] if not th["ok"]]
        if vs["points_a_zero"]:
            detail.append("note nulle au(x) point(s) " + ", ".join(str(n) for n in vs["points_a_zero"]))
        story.append(_p(f"{verdict}{' — ' + '; '.join(detail) if detail else ''}", "h"))
    story.append(Spacer(1, 4))
    story.append(_p(f"Résultat de l'épreuve pratique : {'RÉUSSITE' if score['passed'] else 'ÉCHEC'}", "title"))
    if evaluation.get("observations"):
        story.append(_p("Observations : " + evaluation["observations"], "p"))
    story.append(_p("Réussite : 70/100 au minimum, au moins la moyenne dans chaque thème et une note supérieure à zéro à "
                    "chaque point d'évaluation (recommandation R.489, annexe 3).", "small"))
    story.append(Spacer(1, 10))
    story.append(_signature_block("Le testeur", testeur_name, signature_png))
    doc.build(story, onFirstPage=_footer("CACES® R.489 — grille d'évaluation pratique"),
              onLaterPages=_footer("CACES® R.489 — grille d'évaluation pratique"))
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Examen d'adéquation (vérification du chariot avant les tests)
# ---------------------------------------------------------------------------

def adequation_pdf(entry: dict, checklist: List[tuple], stage: dict, testeur_name: str, signature_png: Optional[bytes]) -> bytes:
    """`checklist` : [(clé, libellé, groupe)] ; `entry["checks"]` : {clé: bool}."""
    buf, doc = _doc("Examen d'adéquation CACES R.489")
    story = _header("Examen d'adéquation — vérification du chariot avant les tests",
                    "CACES® R.489 — à remplir chaque jour de test par le testeur (§3/3/1/2)")
    story.append(_info_table([
        ("Date", _date(entry.get("date"))),
        ("Session", f"{stage.get('formation_titre') or ''} — {stage.get('lieu_adresse') or ''} {stage.get('lieu_ville') or ''}"),
        ("Catégorie(s) testée(s)", entry.get("categories") or "—"),
        ("Chariot", " — ".join(x for x in (entry.get("chariot_type"), entry.get("chariot_marque"), entry.get("chariot_modele")) if x) or "—"),
        ("N° de série / identification", entry.get("chariot_numero") or "—"),
        ("Capacité nominale / hauteur de levée", entry.get("chariot_capacite") or "—"),
        ("Dernière vérification générale périodique", _date(entry.get("vgp_date"))),
        ("Testeur", testeur_name),
    ]))
    checks = entry.get("checks") or {}
    groupe = None
    rows, style = [[_p("Point de contrôle", "cellb"), _p("Conforme", "center")]], [
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#aaaaaa")), ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]
    for key, label, grp in checklist:
        if grp != groupe:
            groupe = grp
            rows.append([_p(grp, "cellb"), ""])
            style.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor("#fafafa")))
            style.append(("SPAN", (0, len(rows) - 1), (-1, len(rows) - 1)))
        ok = checks.get(key)
        rows.append([_p(label, "cell"), _p("OUI" if ok else "NON", "center")])
        if not ok:
            style.append(("TEXTCOLOR", (1, len(rows) - 1), (1, len(rows) - 1), colors.HexColor("#b91c1c")))
    story.append(Spacer(1, 8))
    t = Table(rows, colWidths=[None, 2.5 * cm], repeatRows=1)
    t.setStyle(TableStyle(style))
    story.append(t)
    story.append(Spacer(1, 8))
    story.append(_p(f"Conclusion : chariot {'APTE' if entry.get('conforme') else 'NON APTE'} à la réalisation des épreuves pratiques.", "h"))
    if entry.get("observations"):
        story.append(_p("Observations : " + entry["observations"], "p"))
    story.append(Spacer(1, 12))
    story.append(_signature_block("Le testeur", testeur_name, signature_png))
    doc.build(story, onFirstPage=_footer("CACES® R.489 — examen d'adéquation"), onLaterPages=_footer("CACES® R.489 — examen d'adéquation"))
    return buf.getvalue()
