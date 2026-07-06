from typing import Optional
from datetime import datetime, timezone
from fastapi import HTTPException


def generate_attestation_pdf(
    stage: dict, formation: dict, student: dict, animateur: dict,
    signature_data_url: Optional[str], present: bool,
    settings_doc: Optional[dict] = None
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader
    import io as _io
    import base64 as _b64

    buf = _io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    settings_doc = settings_doc or {}
    gold = colors.HexColor("#d4af37")
    black = colors.HexColor("#0a0a0a")

    c.setFillColor(black)
    c.rect(0, h - 3 * cm, w, 3 * cm, fill=1, stroke=0)
    c.setFillColor(gold)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(2 * cm, h - 1.8 * cm, "TDL FORMATION")
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, h - 2.5 * cm, "Centre de formation professionnelle agréé")

    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(w / 2, h - 5 * cm, "ATTESTATION DE PRÉSENCE")
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#666666"))
    c.drawCentredString(w / 2, h - 5.6 * cm, f"Délivrée le {datetime.now(timezone.utc).strftime('%d/%m/%Y')}")

    y = h - 7.5 * cm
    c.setFillColor(black)
    c.setFont("Helvetica", 11)
    lines = [
        f"Je soussigné(e), {animateur.get('name', 'Animateur TDL')}, animateur de la session,",
        "atteste par la présente que :",
        "",
        f"Nom et prénom : {student.get('name', '—')}",
        f"Email : {student.get('email', '—')}",
        "",
        "A participé à la formation :",
        f"  • {formation.get('title', '—')}",
        f"  • Catégorie : {formation.get('category', '—')}",
        f"  • Durée : {formation.get('duration_hours', '—')} heures",
        "",
        f"Session du {stage.get('date_debut', '—')} au {stage.get('date_fin', '—')}",
        f"Lieu : {stage.get('lieu_adresse', '')}, {stage.get('lieu_ville', '')}",
        "",
        f"Statut de présence : {'PRÉSENT(E)' if present else 'ABSENT(E)'}",
    ]
    for line in lines:
        if line.startswith("Statut"):
            c.setFont("Helvetica-Bold", 12)
            c.setFillColor(gold if present else colors.HexColor("#d0021b"))
        else:
            c.setFont("Helvetica", 11)
            c.setFillColor(black)
        c.drawString(2 * cm, y, line)
        y -= 0.55 * cm

    y -= 1 * cm
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(black)
    c.drawString(2 * cm, y, "Signature électronique de l'apprenant :")
    if signature_data_url and signature_data_url.startswith("data:image"):
        try:
            b64part = signature_data_url.split(",", 1)[1]
            img_bytes = _b64.b64decode(b64part)
            img = ImageReader(_io.BytesIO(img_bytes))
            c.drawImage(img, 2 * cm, y - 3.5 * cm, width=6 * cm, height=3 * cm, mask='auto')
        except Exception:
            c.setFont("Helvetica-Oblique", 9)
            c.setFillColor(colors.HexColor("#999"))
            c.drawString(2 * cm, y - 0.6 * cm, "(signature non chargée)")

    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(black)
    c.drawString(11 * cm, y, "Cachet & signature de l'animateur :")
    c.setFont("Helvetica", 10)
    c.drawString(11 * cm, y - 0.7 * cm, animateur.get("name", "—"))
    c.setStrokeColor(gold)
    c.setLineWidth(1.5)
    c.line(11 * cm, y - 3 * cm, 18 * cm, y - 3 * cm)

    c.setFillColor(colors.HexColor("#666"))
    c.setFont("Helvetica", 8)
    agrement = settings_doc.get("agrement_numero", "—")
    c.drawCentredString(w / 2, 1.5 * cm, f"Agrément préfectoral : {agrement}   ·   TDL Formation   ·   contact@tdlformation.fr")
    c.showPage()
    c.save()
    return buf.getvalue()


def render_html_pdf(html: str) -> bytes:
    from xhtml2pdf import pisa
    import io as _io

    full_html = f"""
    <html>
    <head>
    <style>
        @page {{
            size: A4;
            margin: 1.8cm 2cm;
        }}
        body {{
            font-family: Helvetica, Arial, sans-serif;
            font-size: 10.5pt;
            color: #1a1a1a;
        }}
        table {{ border-collapse: collapse; }}
        hr {{ border: none; height: 1px; background-color: #d4af37; }}
    </style>
    </head>
    <body>
    {html}
    </body>
    </html>
    """
    buf = _io.BytesIO()
    result = pisa.CreatePDF(src=full_html, dest=buf, encoding="utf-8")
    if result.err:
        raise HTTPException(status_code=500, detail="Erreur lors de la génération du PDF (HTML invalide dans le modèle)")
    return buf.getvalue()
