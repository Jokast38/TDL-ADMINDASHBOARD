"""Attestation individuelle de formation CACES® R.489 (demande du 2026-11-16).

Mise en page reprise de l'« Attestation individuelle de formation » déjà
utilisée par le centre (en-tête du centre et logo, « Je soussigné… atteste
que… », bandeau noir avec le titre de la formation, tableau des informations,
objectifs, « Fait à… le… »), complétée pour être conforme :
- article L.6353-1 du Code du travail : objectifs, nature, durée de l'action
  et résultats de l'évaluation des acquis ;
- recommandation R.489 de la Cnam : catégories de chariots suivies, formateur ;
  la formation ne vaut pas CACES® (délivré par un testeur certifié après les
  tests) et la conduite reste soumise à l'autorisation de l'employeur
  (article R.4323-56 du Code du travail) ;
- article L.6352-12 : le numéro de déclaration d'activité est toujours suivi
  de « Cet enregistrement ne vaut pas agrément de l'État ». Le numéro commence
  par 11 : il est enregistré auprès du préfet de région d'Île-de-France.

La signature du représentant est l'image signature + cachet du centre
(Paramètres > Attestations), recadrée sur sa partie visible pour qu'elle ait
toujours la même taille dans le cadre de signature.
"""
import io
from pathlib import Path
from typing import List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_ASSETS = Path(__file__).resolve().parent.parent / "assets"
LOGO = _ASSETS / "tdl_logo.png"
SIGNATURE_PAR_DEFAUT = _ASSETS / "signature_cachet_tdl.png"

DARK = colors.HexColor("#0a0a0a")
GOLD = colors.HexColor("#d4af37")
GREY = colors.HexColor("#555555")
RULE = colors.HexColor("#0a0a0a")

CATEGORIES_R489 = {
    "1A": "Transpalettes à conducteur porté et préparateurs de commandes au sol (levée jusqu'à 1,20 m)",
    "1B": "Gerbeurs à conducteur porté (levée de plus de 1,20 m)",
    "2A": "Chariots à plateau porteur (capacité jusqu'à 2 t)",
    "2B": "Chariots tracteurs industriels (capacité jusqu'à 25 t)",
    "3": "Chariots élévateurs en porte-à-faux (capacité jusqu'à 6 t)",
    "4": "Chariots élévateurs en porte-à-faux (capacité de plus de 6 t)",
    "5": "Chariots élévateurs à mât rétractable",
    "6": "Chariots à poste de conduite élevable (levée de plus de 1,20 m)",
    "7": "Conduite hors production des chariots de toutes les catégories",
}

OBJECTIFS_R489 = [
    "Connaître la réglementation applicable et les responsabilités du conducteur de chariot.",
    "Connaître la technologie, les organes de service et de sécurité des chariots des catégories suivies.",
    "Connaître les règles de stabilité et savoir lire une plaque de charge et un abaque de charges.",
    "Effectuer les vérifications de prise et de fin de poste, et rendre compte des anomalies.",
    "Circuler, manœuvrer, prendre, déplacer et déposer une charge en sécurité, y compris en hauteur.",
    "Identifier les risques liés à la conduite et appliquer les règles de circulation et de sécurité.",
]

RESULTATS = {
    "atteints": "Objectifs atteints",
    "partiellement_atteints": "Objectifs partiellement atteints",
    "non_atteints": "Objectifs non atteints",
}

_S = {
    "org": ParagraphStyle("org", fontName="Helvetica-Bold", fontSize=12.5, leading=15),
    "orgl": ParagraphStyle("orgl", fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=colors.HexColor("#444444")),
    "orgb": ParagraphStyle("orgb", fontName="Helvetica-Bold", fontSize=8, leading=11),
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=19, leading=23, alignment=TA_CENTER),
    "p": ParagraphStyle("p", fontName="Helvetica", fontSize=10, leading=14),
    "band": ParagraphStyle("band", fontName="Helvetica-Bold", fontSize=12, leading=15, alignment=TA_CENTER, textColor=GOLD),
    "bandsub": ParagraphStyle("bandsub", fontName="Helvetica", fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=colors.white),
    "k": ParagraphStyle("k", fontName="Helvetica-Bold", fontSize=9.5, leading=12.5),
    "v": ParagraphStyle("v", fontName="Helvetica", fontSize=9.5, leading=12.5),
    "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=4),
    "li": ParagraphStyle("li", fontName="Helvetica", fontSize=9, leading=11.8, leftIndent=10, bulletIndent=0),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=7.8, leading=10, textColor=GREY),
    "fait": ParagraphStyle("fait", fontName="Helvetica-Bold", fontSize=10.5, leading=13, alignment=TA_RIGHT),
    "sigl": ParagraphStyle("sigl", fontName="Helvetica", fontSize=8.5, leading=11, alignment=TA_CENTER, textColor=GREY),
    "sign": ParagraphStyle("sign", fontName="Helvetica-Bold", fontSize=9.5, leading=12, alignment=TA_CENTER),
    "foot": ParagraphStyle("foot", fontName="Helvetica", fontSize=7, leading=9, alignment=TA_CENTER, textColor=colors.HexColor("#999999")),
}

# Cadre de la signature : la signature + cachet recadrée tient dans ce
# rectangle en gardant ses proportions.
SIGNATURE_MAX_W = 5.6 * cm
SIGNATURE_MAX_H = 2.8 * cm


def _t(value) -> str:
    s = "" if value is None else str(value)
    return escape(s.replace("≤", "<=").replace("≥", ">=").replace("’", "'"))


def _rule(width=None, thickness=0.8) -> Table:
    t = Table([[""]], colWidths=[width] if width else None, rowHeights=[0.1])
    t.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), thickness, RULE)]))
    return t


def crop_signature(png: bytes) -> Optional[bytes]:
    """Retire les marges transparentes ou blanches autour de la signature +
    cachet (l'image enregistrée en a beaucoup, ce qui la rendait minuscule et
    décentrée dans son cadre)."""
    try:
        from PIL import Image as PILImage, ImageChops
        im = PILImage.open(io.BytesIO(png)).convert("RGBA")
        alpha = im.split()[-1].point(lambda a: 255 if a > 24 else 0)
        box = alpha.getbbox()
        # Image opaque sur fond blanc : on cherche ce qui n'est pas blanc.
        if box == (0, 0, im.width, im.height):
            bg = PILImage.new("RGB", im.size, (255, 255, 255))
            diff = ImageChops.difference(im.convert("RGB"), bg).convert("L").point(lambda v: 255 if v > 40 else 0)
            box = diff.getbbox() or box
        if not box:
            return None
        pad = 6
        box = (max(box[0] - pad, 0), max(box[1] - pad, 0), min(box[2] + pad, im.width), min(box[3] + pad, im.height))
        out = io.BytesIO()
        im.crop(box).save(out, format="PNG")
        return out.getvalue()
    except Exception:
        return None


def signature_image(png: Optional[bytes]):
    """Image reportlab de la signature, mise à l'échelle dans le cadre."""
    data = crop_signature(png) if png else None
    if not data:
        return None
    from reportlab.lib.utils import ImageReader
    iw, ih = ImageReader(io.BytesIO(data)).getSize()
    scale = min(SIGNATURE_MAX_W / iw, SIGNATURE_MAX_H / ih)
    return Image(io.BytesIO(data), width=iw * scale, height=ih * scale)


def _footer(centre: dict):
    nda = centre.get("nda")
    parts = [centre.get("nom") or "", f"{centre.get('adresse') or ''}, {centre.get('ville') or ''}".strip(", ")]
    if centre.get("siret"):
        parts.append(f"SIRET : {centre['siret']}")
    line1 = " | ".join(p for p in parts if p)
    line2 = ""
    if nda:
        line2 = (f"Déclaration d'activité enregistrée sous le n° {nda} auprès du préfet de région "
                 f"{centre.get('region_nda') or 'd’Île-de-France'}. Cet enregistrement ne vaut pas agrément de l'État.")

    def draw(c, doc):
        c.saveState()
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        c.line(1.8 * cm, 1.55 * cm, A4[0] - 1.8 * cm, 1.55 * cm)
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#888888"))
        c.drawCentredString(A4[0] / 2, 1.15 * cm, line1.replace("’", "'"))
        if line2:
            c.drawCentredString(A4[0] / 2, 0.8 * cm, line2.replace("’", "'"))
        c.restoreState()
    return draw


def attestation_formation_pdf(data: dict, signature_png: Optional[bytes] = None) -> bytes:
    """`data` : centre{nom, adresse, ville, telephone, email, siret, nda,
    otc_numero_inrs}, signataire_nom, signataire_qualite, civilite, nom,
    prenom, date_naissance_label (optionnel), categories[], lieu,
    date_debut_label, date_fin_label, duree_heures, formateur_nom, resultat,
    resultat_detail, lieu_signature, date_emission_label."""
    centre = data["centre"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.8 * cm, rightMargin=1.8 * cm,
                            topMargin=1.1 * cm, bottomMargin=1.9 * cm,
                            title=f"Attestation de formation CACES R.489 — {data.get('prenom', '')} {data.get('nom', '')}",
                            author=centre.get("nom") or "TDL Formation")
    width = doc.width - 12  # le cadre de reportlab garde 6 pt de marge de chaque côté
    story: List = []

    # En-tête : coordonnées du centre à gauche, logo à droite.
    left = [Paragraph(_t(centre.get("nom")), _S["org"]),
            Paragraph(_t(f"{centre.get('adresse')}, {centre.get('ville')}"), _S["orgl"])]
    if centre.get("telephone"):
        left.append(Paragraph(_t(centre["telephone"]), _S["orgl"]))
    if centre.get("email"):
        left.append(Paragraph(_t(centre["email"]), _S["orgl"]))
    if centre.get("otc_numero_inrs"):
        left.append(Paragraph(_t(f"Organisme Testeur Certifié CACES® — n° INRS {centre['otc_numero_inrs']}"), _S["orgb"]))
    logo = Image(str(LOGO), width=2.1 * cm, height=2.1 * cm) if LOGO.exists() else ""
    head = Table([[left, logo]], colWidths=[width - 2.6 * cm, 2.6 * cm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 4), _rule(width), Spacer(1, 9),
              Paragraph("Attestation individuelle de formation", _S["title"]), Spacer(1, 9)]

    signataire = f"<b>{_t(data['signataire_nom'])}</b>, {_t(data['signataire_qualite'])}"
    story.append(Paragraph(
        f"Je, soussigné(e) {signataire}, représentant de l'organisme de formation <b>{_t(centre.get('nom'))}</b>, "
        f"{_t(centre.get('adresse'))}, {_t(centre.get('ville'))},", _S["p"]))
    story.append(Spacer(1, 6))
    stagiaire = f"<b>{_t(data['civilite'])} {_t(data['nom'].upper())} {_t(data['prenom'])}</b>"
    if data.get("date_naissance_label"):
        ne = "née" if data["civilite"].lower().startswith("mme") else "né"
        stagiaire += f", {ne} le {_t(data['date_naissance_label'])}"
    story.append(Paragraph(f"atteste que : {stagiaire}", _S["p"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("a suivi la formation :", _S["p"]))
    story.append(Spacer(1, 6))

    band = Table([[[Paragraph("CACES® R.489 — Conduite en sécurité des chariots de manutention automoteurs à conducteur porté", _S["band"]),
                    Paragraph("Formation préparatoire aux tests CACES® (recommandation R.489 de l'Assurance Maladie – Risques professionnels)", _S["bandsub"])]]],
                 colWidths=[width])
    band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), DARK), ("TOPPADDING", (0, 0), (-1, -1), 7),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                              ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
    story += [band, Spacer(1, 8)]

    cats = "<br/>".join(f"Catégorie {_t(c)} — {_t(CATEGORIES_R489.get(c, ''))}" for c in data["categories"])
    duree = f"{data['duree_heures']:g} heures" if isinstance(data["duree_heures"], (int, float)) else _t(data["duree_heures"])
    rows = [
        ("Catégorie(s) suivie(s) :", cats),
        ("Lieu de la formation :", _t(data["lieu"])),
        ("Dates de la formation :", f"du {_t(data['date_debut_label'])} au {_t(data['date_fin_label'])}"),
        ("Durée de la formation :", f"{duree} (théorie et pratique, en présentiel)"),
        ("Formateur :", _t(data["formateur_nom"])),
        ("Nature de l'action :", "Action de formation (article L.6313-1 du Code du travail)"),
    ]
    info = Table([[Paragraph(k, _S["k"]), Paragraph(v, _S["v"])] for k, v in rows], colWidths=[4.6 * cm, width - 4.6 * cm])
    info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story += [info, Spacer(1, 8)]

    story += [Paragraph("Objectifs de la formation", _S["h"]), Spacer(1, 3), _rule(width, 0.6), Spacer(1, 4)]
    story += [Paragraph(_t(o), _S["li"], bulletText="•") for o in OBJECTIFS_R489]
    story.append(Spacer(1, 8))

    story += [Paragraph("Résultats de l'évaluation des acquis", _S["h"]), Spacer(1, 3), _rule(width, 0.6), Spacer(1, 4)]
    story.append(Paragraph(f"<b>{_t(RESULTATS.get(data['resultat'], data['resultat']))}</b>"
                           + (f" — {_t(data['resultat_detail'])}" if data.get("resultat_detail") else ""), _S["v"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "La présente attestation ne vaut pas CACES® : le CACES® est délivré par un testeur certifié après réussite "
        "des tests théorique et pratique de la recommandation R.489. La conduite d'un chariot reste soumise à "
        "l'autorisation de conduite délivrée par l'employeur (article R.4323-56 du Code du travail).", _S["small"]))
    story.append(Spacer(1, 8))

    # « Fait à… » puis le cadre de signature, toujours ensemble.
    img = signature_image(signature_png)
    sig_cell = [Paragraph("Le représentant de l'organisme de formation", _S["sigl"]),
                Paragraph(_t(f"{data['signataire_nom']}, {data['signataire_qualite']}"), _S["sign"]),
                Spacer(1, 4)]
    sig_cell.append(img if img is not None else Spacer(1, SIGNATURE_MAX_H))
    sig = Table([[sig_cell]], colWidths=[7.4 * cm], rowHeights=[SIGNATURE_MAX_H + 1.2 * cm])
    sig.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    holder = Table([["", sig]], colWidths=[width - 7.4 * cm, 7.4 * cm])
    holder.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(KeepTogether([
        Paragraph(f"Fait à {_t(data['lieu_signature'])}, le {_t(data['date_emission_label'])}", _S["fait"]),
        Spacer(1, 6), holder,
    ]))

    footer = _footer(centre)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
