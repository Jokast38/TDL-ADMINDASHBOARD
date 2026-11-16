"""Feuille d'émargement papier d'une journée de session, par demi-journée
(matin / après-midi), à faire signer sur place (demande du 2026-11-16, page
CACES). Les créneaux viennent des horaires de la session : début -> 12h00 et
13h00 -> fin (09h00-12h00 / 13h00-17h00 pour une session 9h-17h)."""
import io
from typing import List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape

from services.caces_attestation_pdf import LOGO, _footer

_S = {
    "org": ParagraphStyle("o", fontName="Helvetica-Bold", fontSize=12, leading=15),
    "l": ParagraphStyle("l", fontName="Helvetica", fontSize=8.5, leading=11, textColor=colors.HexColor("#444444")),
    "t": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=1),
    "k": ParagraphStyle("k", fontName="Helvetica-Bold", fontSize=9.5, leading=12),
    "v": ParagraphStyle("v", fontName="Helvetica", fontSize=9.5, leading=12),
    "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=9.5, leading=12, alignment=1, textColor=colors.white),
    "n": ParagraphStyle("n", fontName="Helvetica-Bold", fontSize=10, leading=13),
    "s": ParagraphStyle("s", fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor("#555555")),
}
LIGNES_LIBRES = 2


def _hhmm(value: str) -> int:
    h, m = map(int, value.split(":"))
    return h * 60 + m


def _label(minutes: int) -> str:
    return f"{minutes // 60:02d}h{minutes % 60:02d}"


def creneaux(heure_debut: Optional[str], heure_fin: Optional[str]) -> List[Tuple[str, str]]:
    """[(titre, horaires)] : matin et après-midi avec pause 12h-13h ; un seul
    créneau si la journée ne passe pas par la pause."""
    try:
        d, f = _hhmm(heure_debut or "09:00"), _hhmm(heure_fin or "17:00")
    except ValueError:
        d, f = 9 * 60, 17 * 60
    if d < 12 * 60 and f > 13 * 60:
        return [("Matin", f"{_label(d)} – 12h00"), ("Après-midi", f"13h00 – {_label(f)}")]
    return [("Journée", f"{_label(d)} – {_label(f)}")]


def duree_heures(slots_minutes: int) -> str:
    h = slots_minutes / 60
    return f"{h:g} heures"


def feuille_pdf(centre: dict, formation_titre: str, date_label: str, lieu: str, formateurs: List[str],
                apprenants: List[str], heure_debut: Optional[str], heure_fin: Optional[str]) -> bytes:
    slots = creneaux(heure_debut, heure_fin)
    try:
        total = _hhmm(heure_fin or "17:00") - _hhmm(heure_debut or "09:00") - (60 if len(slots) == 2 else 0)
    except ValueError:
        total = 7 * 60
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm, topMargin=1.2 * cm,
                            bottomMargin=1.9 * cm, title=f"Feuille d'émargement — {date_label}", author=centre.get("nom"))
    w = doc.width - 12
    head = Table([[[Paragraph(escape(centre["nom"]), _S["org"]),
                    Paragraph(escape(f"{centre['adresse']}, {centre['ville']}"), _S["l"]),
                    Paragraph(escape(f"{centre.get('telephone', '')} — {centre.get('email', '')}"), _S["l"])],
                   Image(str(LOGO), width=1.9 * cm, height=1.9 * cm) if LOGO.exists() else ""]],
                 colWidths=[w - 2.4 * cm, 2.4 * cm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                              ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    formateur = ", ".join(formateurs) or "—"
    info = Table([[Paragraph(k, _S["k"]), Paragraph(escape(v), _S["v"])] for k, v in (
        ("Formation :", formation_titre),
        ("Date :", date_label),
        ("Horaires :", " · ".join(f"{t} {h}" for t, h in slots) + f" ({duree_heures(total)})"),
        ("Lieu :", lieu),
        ("Formateur :", formateur),
    )], colWidths=[3.2 * cm, w - 3.2 * cm])
    info.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))

    sig_w = 5.4 * cm if len(slots) == 2 else 8 * cm
    cols = [0.9 * cm, w - 0.9 * cm - len(slots) * sig_w] + [sig_w] * len(slots)
    rows = [[Paragraph("N°", _S["h"]), Paragraph("NOM Prénom", _S["h"])]
            + [Paragraph(f"{t}<br/>{h}", _S["h"]) for t, h in slots]]
    for i, name in enumerate(apprenants, start=1):
        rows.append([Paragraph(str(i), _S["n"]), Paragraph(escape(name), _S["n"])] + [""] * len(slots))
    for i in range(len(apprenants) + 1, len(apprenants) + 1 + LIGNES_LIBRES):
        rows.append([Paragraph(str(i), _S["n"]), ""] + [""] * len(slots))
    row_h = 2.0 * cm if len(rows) <= 9 else 1.4 * cm
    t = Table(rows, colWidths=cols, rowHeights=[1.0 * cm] + [row_h] * (len(rows) - 1), repeatRows=1)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#777777")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a0a0a")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 1), (0, -1), "CENTER"),
    ]))
    form = Table([[Paragraph("Signature du formateur", _S["k"])] + [""] * len(slots),
                  [Paragraph(escape(formateur), _S["v"])] + [""] * len(slots)],
                 colWidths=[cols[0] + cols[1]] + [sig_w] * len(slots), rowHeights=[0.7 * cm, 1.8 * cm])
    style = [("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#777777")), ("VALIGN", (0, 0), (-1, -1), "TOP")]
    style += [("SPAN", (c, 0), (c, 1)) for c in range(1, len(slots) + 1)]
    form.setStyle(TableStyle(style))
    story = [head, Spacer(1, 10), Paragraph("Feuille d'émargement", _S["t"]), Spacer(1, 10), info, Spacer(1, 10), t,
             Spacer(1, 10), form, Spacer(1, 8),
             Paragraph("Chaque stagiaire signe en personne à chaque demi-journée. Une case vide vaut absence sur le créneau.", _S["s"])]
    doc.build(story, onFirstPage=_footer(centre), onLaterPages=_footer(centre))
    return buf.getvalue()
