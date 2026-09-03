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


def _draw_data_url_image(c, data_url: Optional[str], x, y, width, height):
    """Dessine une image data:image/... (signature manuscrite capturée en
    base64 côté frontend) à la position donnée. Ne fait rien si absente ou
    invalide (case laissée vide sur le PDF plutôt que de faire échouer toute
    la génération)."""
    if not data_url or not data_url.startswith("data:image"):
        return
    import io as _io
    import base64 as _b64
    from reportlab.lib.utils import ImageReader
    try:
        b64part = data_url.split(",", 1)[1]
        img = ImageReader(_io.BytesIO(_b64.b64decode(b64part)))
        c.drawImage(img, x, y, width=width, height=height, mask='auto', preserveAspectRatio=True, anchor='sw')
    except Exception:
        pass


def generate_stage_recup_points_attestation(
    stagiaire: dict, stage_dates: list, lieu: str,
    centre: dict, animateurs: dict,
    student_signature_data_url: Optional[str] = None,
    formateur_signature_data_url: Optional[str] = None,
    psychologue_signature_data_url: Optional[str] = None,
    cachet_data_url: Optional[str] = None,
    cas_stage_label: str = "Cas 1 : Stage volontaire (art. L.223-6 alinéa 4 et R.223-8 du code de la route).",
    lieu_signature: Optional[str] = None,
    date_signature: Optional[str] = None,
) -> bytes:
    """Reproduit la mise en page exacte de l'attestation officielle de suivi
    de stage de sensibilisation à la sécurité routière (récupération de
    points) — voir frontend/public/doc/model-attestation-stage-recup.pdf,
    le modèle réel fourni par l'agence, préfecture par préfecture identique
    dans sa forme (texte réglementaire fixe : cas de stage, articles du code
    de la route...), seules les données de chaque partie changent.

    `centre` : dict avec nom, adresse, ville, siret, directeur_nom,
    agrement_numero.
    `animateurs` : dict avec bafm_nom, bafm_numero, psychologue_nom,
    psychologue_numero — les deux profils requis par la réglementation pour
    ce type de stage (un animateur BAFM + un psychologue). Si plusieurs
    formateurs sont assignés à la session, passer `animateurs["formateurs_list"]`
    = liste de {nom, titre, numero, signature_data_url} : chacun est alors
    dessiné avec son propre intitulé et sa signature (bafm_nom/bafm_numero/
    formateur_signature_data_url sont ignorés dans ce cas).
    `stagiaire` : dict avec nom, prenom, adresse, ville, date_naissance,
    lieu_naissance, numero_permis, date_delivrance_permis,
    prefecture_delivrance.
    Les signatures (`*_signature_data_url`, `cachet_data_url`) sont des
    data:image/png;base64 optionnelles — une case reste vide si absente,
    la génération n'échoue jamais pour cette raison."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib import colors
    from reportlab.lib.units import cm

    def _wrap(text, font, size, max_width):
        words = text.split(" ")
        lines, cur = [], ""
        for w in words:
            trial = f"{cur} {w}".strip()
            if c.stringWidth(trial, font, size) <= max_width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    buf = __import__("io").BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    black = colors.HexColor("#0a0a0a")
    gray = colors.HexColor("#444444")
    margin = 2 * cm

    # En-tête : identité du centre
    c.setFillColor(black)
    c.setFont("Helvetica", 10)
    y = h - 2 * cm
    for line in [centre.get("nom", "Top Drive Learning (TDL)"), centre.get("adresse", ""), centre.get("ville", ""), f"SIRET : {centre.get('siret', '')}"]:
        c.drawString(margin, y, line)
        y -= 0.5 * cm

    # Titre
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(w / 2, h - 5.2 * cm, "ATTESTATION DE SUIVI DE STAGE")
    c.drawCentredString(w / 2, h - 5.8 * cm, "DE SENSIBILISATION À LA SÉCURITÉ ROUTIÈRE")

    # Paragraphe d'introduction
    y = h - 7.3 * cm
    c.setFont("Helvetica", 10.5)
    intro = (
        f"Je soussigné(e) {centre.get('directeur_nom', '')}, Responsable de la formation spécifique, "
        f"titulaire de l'Agrément Préfectoral n° {centre.get('agrement_numero', '')} atteste que:"
    )
    for line in _wrap(intro, "Helvetica", 10.5, w - 2 * margin):
        c.drawString(margin, y, line)
        y -= 0.5 * cm

    # Identité du stagiaire (deux colonnes)
    y -= 0.6 * cm
    left_x, right_x = margin, 11 * cm
    left_lines = [
        f"Nom : {stagiaire.get('nom', '—')}",
        f"Prénom : {stagiaire.get('prenom', '—')}",
        f"Adresse : {stagiaire.get('adresse', '—')}",
        f"Ville : {stagiaire.get('ville', '—')}",
        f"Date de naissance : {stagiaire.get('date_naissance', '—')}",
        f"Lieu de naissance : {stagiaire.get('lieu_naissance', '—')}",
    ]
    right_lines = [
        f"Numéro de permis : {stagiaire.get('numero_permis', '—')}",
        f"Date délivrance permis : {stagiaire.get('date_delivrance_permis', '—')}",
        f"Préfecture de délivrance : {stagiaire.get('prefecture_delivrance', '—')}",
    ]
    identity_top = y
    for i, line in enumerate(left_lines):
        c.drawString(left_x, identity_top - i * 0.5 * cm, line)
    for i, line in enumerate(right_lines):
        c.drawString(right_x, identity_top - i * 0.5 * cm, line)
    y = identity_top - max(len(left_lines), len(right_lines)) * 0.5 * cm - 0.7 * cm

    # Paragraphe dates + lieu du stage
    dates_str = " et ".join(stage_dates) if stage_dates else "—"
    stage_para = f"a suivi le stage de formation spécifique correspondant au cas visé ci-dessous, qui s'est déroulé les {dates_str} à l'adresse suivante : {lieu}"
    for line in _wrap(stage_para, "Helvetica", 10.5, w - 2 * margin):
        c.drawString(margin, y, line)
        y -= 0.5 * cm

    # Cas de stage
    y -= 0.5 * cm
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(margin, y, "Cas de stage :")
    y -= 0.65 * cm
    c.setFont("Helvetica", 10.5)
    c.drawString(margin + 0.4 * cm, y, f"•  {cas_stage_label}")

    # Lieu et date de signature
    y -= 1.6 * cm
    c.setFont("Helvetica", 10.5)
    c.drawString(margin, y, f"À {lieu_signature or centre.get('ville', '')}, le {date_signature or ''}")

    # Bloc signatures (3 colonnes)
    y -= 1.6 * cm
    col1, col2, col3 = margin, 8.7 * cm, 15.3 * cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(col1, y, "Signature du directeur")
    c.drawCentredString(col2 + 2.3 * cm, y, "Signature des Animateurs")
    c.drawString(col3, y, "Signature du stagiaire")

    y -= 0.6 * cm
    c.setFont("Helvetica", 9.5)
    c.drawString(col1, y, centre.get("directeur_nom", ""))

    formateurs_list = animateurs.get("formateurs_list")  # liste multi-formateur, voir docstring
    if formateurs_list:
        # Plusieurs formateurs assignés à la session (voir Stages.jsx multi-
        # sélection) : chacun est dessiné avec son intitulé (BAFM, moniteur...)
        # et sa propre signature, empilés — taille réduite si plus de 2 pour
        # rester dans le même espace vertical que le cas mono-formateur.
        n = len(formateurs_list)
        sig_h = 1.5 * cm if n <= 2 else (0.95 * cm if n == 3 else 0.7 * cm)
        row_h = sig_h + 0.75 * cm
        cy = y
        for f in formateurs_list:
            c.setFont("Helvetica-Bold", 8.5)
            c.drawCentredString(col2 + 2.3 * cm, cy, (f.get("titre") or "Formateur")[:30])
            c.setFont("Helvetica", 8)
            c.drawCentredString(col2 + 2.3 * cm, cy - 0.35 * cm, f"{f.get('nom', '')} {f.get('numero') or ''}".strip())
            _draw_data_url_image(c, f.get("signature_data_url"), col2 + 0.9 * cm, cy - 0.5 * cm - sig_h, 2.8 * cm, sig_h)
            cy -= row_h
    else:
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(col2 + 2.3 * cm, y, "BAFM")
        c.setFont("Helvetica", 9)
        c.drawCentredString(col2 + 2.3 * cm, y - 0.45 * cm, animateurs.get("bafm_nom", ""))
        c.drawCentredString(col2 + 2.3 * cm, y - 0.9 * cm, animateurs.get("bafm_numero", ""))
        # Signature de l'animateur BAFM (réutilise la signature staff
        # existante, voir POST /me/signature côté employees.py).
        _draw_data_url_image(c, formateur_signature_data_url, col2 + 0.6 * cm, y - 2.3 * cm, 3.4 * cm, 1.6 * cm)

    # Cachet du centre (case "directeur") — image par défaut du centre.
    _draw_data_url_image(c, cachet_data_url, col1, y - 3.3 * cm, 4.5 * cm, 2.6 * cm)

    # Psychologue — deuxième profil requis par la réglementation.
    y2 = y - 2.7 * cm
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(col2 + 2.3 * cm, y2, "Psychologue")
    c.setFont("Helvetica", 9)
    c.drawCentredString(col2 + 2.3 * cm, y2 - 0.45 * cm, animateurs.get("psychologue_nom", ""))
    c.drawCentredString(col2 + 2.3 * cm, y2 - 0.9 * cm, animateurs.get("psychologue_numero", ""))
    _draw_data_url_image(c, psychologue_signature_data_url, col2 + 0.6 * cm, y2 - 2.4 * cm, 3.4 * cm, 1.6 * cm)

    # Signature manuscrite du stagiaire, capturée depuis son espace apprenant.
    _draw_data_url_image(c, student_signature_data_url, col3, y - 2.4 * cm, 4.5 * cm, 2.2 * cm)

    c.setFillColor(gray)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(w / 2, 1.2 * cm, f"{centre.get('nom', 'TDL Formation')} · Agrément préfectoral {centre.get('agrement_numero', '')} · SIRET {centre.get('siret', '')}")

    c.showPage()
    c.save()
    return buf.getvalue()


def generate_payment_receipt_pdf(inscription: dict, formation: dict, settings_doc: Optional[dict] = None) -> bytes:
    """Reçu de paiement remis après un règlement Stripe déclenché par un agent
    depuis le dashboard (inscription sur place, voir POST /payments/checkout
    avec source="admin_walkin" et GET /payments/{id}/receipt)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    import io as _io

    settings_doc = settings_doc or {}
    centre_nom = settings_doc.get("attestation_centre_nom") or "TDL Formation"
    centre_adresse = settings_doc.get("attestation_centre_adresse") or ""
    centre_ville = settings_doc.get("attestation_centre_ville") or ""
    centre_siret = settings_doc.get("attestation_centre_siret") or ""

    buf = _io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    gold = colors.HexColor("#d4af37")
    black = colors.HexColor("#0a0a0a")

    c.setFillColor(black)
    c.rect(0, h - 3 * cm, w, 3 * cm, fill=1, stroke=0)
    c.setFillColor(gold)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(2 * cm, h - 1.8 * cm, centre_nom.upper())
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, h - 2.5 * cm, f"{centre_adresse}, {centre_ville}".strip(", "))

    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(w / 2, h - 5 * cm, "REÇU DE PAIEMENT")
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#666666"))
    paid_at = (inscription.get("paid_at") or "")[:10] or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    c.drawCentredString(w / 2, h - 5.6 * cm, f"N° {inscription.get('id', '')[:8].upper()} — délivré le {paid_at}")

    y = h - 7.5 * cm
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(2 * cm, y, "Client")
    y -= 0.6 * cm
    c.setFont("Helvetica", 11)
    for line in [
        inscription.get("student_name", "—"),
        inscription.get("student_email", "—"),
        inscription.get("student_phone") or "",
    ]:
        if line:
            c.drawString(2 * cm, y, line)
            y -= 0.55 * cm

    y -= 0.7 * cm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(2 * cm, y, "Formation")
    y -= 0.6 * cm
    c.setFont("Helvetica", 11)
    c.drawString(2 * cm, y, formation.get("title", inscription.get("formation_title", "—")) if formation else inscription.get("formation_title", "—"))
    y -= 1.2 * cm

    c.setStrokeColor(colors.HexColor("#e0e0e0"))
    c.setLineWidth(1)
    c.line(2 * cm, y, w - 2 * cm, y)
    y -= 1 * cm

    amount = inscription.get("amount_paid") if inscription.get("amount_paid") is not None else inscription.get("price", 0)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(2 * cm, y, "Montant réglé")
    c.setFillColor(gold)
    c.drawRightString(w - 2 * cm, y, f"{amount:.2f} €")
    c.setFillColor(black)
    y -= 0.6 * cm
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#666"))
    c.drawString(2 * cm, y, "Mode de paiement : carte bancaire (Stripe)")

    c.setFillColor(colors.HexColor("#666"))
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, 1.5 * cm, f"SIRET : {centre_siret}   ·   {centre_nom}   ·   contact@tdlformation.fr")
    c.showPage()
    c.save()
    return buf.getvalue()


def overlay_signature_on_pdf(pdf_bytes: bytes, signature_png: bytes, signer_name: str, signed_at_label: str) -> bytes:
    """Appose l'image de signature de l'utilisateur (+ une mention) en bas à
    droite de la DERNIÈRE page d'un PDF déjà généré. Le cachet et la signature
    de l'entreprise restent physiques (apposés après impression) : ceci ne
    concerne que la signature individuelle d'un utilisateur du dashboard."""
    import io as _io
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader

    reader = PdfReader(_io.BytesIO(pdf_bytes))
    last_page = reader.pages[-1]
    page_w = float(last_page.mediabox.width)
    page_h = float(last_page.mediabox.height)

    overlay_buf = _io.BytesIO()
    c = rl_canvas.Canvas(overlay_buf, pagesize=(page_w, page_h))
    try:
        img = ImageReader(_io.BytesIO(signature_png))
        c.drawImage(
            img, page_w - 12 * cm, 3.8 * cm, width=10 * cm, height=5 * cm,
            mask='auto', preserveAspectRatio=True, anchor='sw'
        )
    except Exception:
        pass
    c.setFont("Helvetica-Oblique", 8)
    c.drawRightString(page_w - 2 * cm, 3.5 * cm, f"Signé électroniquement par {signer_name} le {signed_at_label}")
    c.save()
    overlay_buf.seek(0)
    overlay_page = PdfReader(overlay_buf).pages[0]

    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i == len(reader.pages) - 1:
            page.merge_page(overlay_page)
        writer.add_page(page)
    out = _io.BytesIO()
    writer.write(out)
    return out.getvalue()


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
