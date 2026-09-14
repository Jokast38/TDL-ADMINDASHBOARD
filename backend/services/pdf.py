from typing import Optional
from datetime import datetime, timezone
from fastapi import HTTPException


def generate_attestation_pdf(
    stage: dict, formation: dict, student: dict, animateur: dict,
    signature_data_url: Optional[str], present: bool,
    settings_doc: Optional[dict] = None,
    animateur_signature_data_url: Optional[str] = None,
    periode: Optional[str] = None,
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
    ]
    if periode and periode != "journee":
        lines.append(f"Créneau : {'Matin' if periode == 'matin' else 'Après-midi'}")
        lines.append("")
    lines.append(f"Statut de présence : {'PRÉSENT(E)' if present else 'ABSENT(E)'}")
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
    if animateur_signature_data_url and animateur_signature_data_url.startswith("data:image"):
        _draw_data_url_image_top(c, animateur_signature_data_url, 11 * cm, y - 1 * cm, 6 * cm, 1.8 * cm)
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


def _draw_data_url_image_top(c, data_url: Optional[str], x, top_y, max_width, max_height):
    """Comme _draw_data_url_image, mais ancre le HAUT réel de l'image (pas le
    haut de sa boîte englobante) à `top_y`. Nécessaire car une signature/un
    cachet scanné a souvent un ratio très large (peu haut) — avec un simple
    anchor='sw' + preserveAspectRatio, l'image se retrouve alors calée tout en
    bas d'une boîte haute, avec un grand vide au-dessus qui la fait paraître
    « décollée » du texte au lieu d'être juste dessous. Règle générale à
    suivre pour toute future signature apposée sur un document : toujours
    positionner par rapport au HAUT réel de l'image, jamais par un décalage
    fixe depuis le bas."""
    if not data_url or not data_url.startswith("data:image"):
        return
    import io as _io
    import base64 as _b64
    from reportlab.lib.utils import ImageReader
    try:
        b64part = data_url.split(",", 1)[1]
        img = ImageReader(_io.BytesIO(_b64.b64decode(b64part)))
        iw, ih = img.getSize()
        ratio = min(max_width / iw, max_height / ih)
        draw_w, draw_h = iw * ratio, ih * ratio
        c.drawImage(img, x, top_y - draw_h, width=draw_w, height=draw_h, mask='auto')
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

    # Bloc signatures (3 colonnes) — layout calculé du HAUT vers le bas pour
    # chaque colonne (voir _sig_column ci-dessous) : l'image de signature est
    # toujours positionnée à distance fixe SOUS la dernière ligne de texte,
    # jamais chevauchée — contrairement à l'ancien calcul par décalages fixes
    # depuis le bas, qui désynchronisait le cachet et les signatures dès que
    # le nombre de lignes de texte au-dessus changeait (ex: plusieurs
    # formateurs empilés faisant remonter/chevaucher le bloc suivant).
    def _sig_column(x, y_top, lines, image_url, img_w, img_h, center=False, min_gap=0.35 * cm, line_h=0.42 * cm, img_dx=0):
        cy = y_top
        for text, font, size in lines:
            c.setFont(font, size)
            if center:
                c.drawCentredString(x, cy, text)
            else:
                c.drawString(x, cy, text)
            cy -= line_h
        img_top = cy - min_gap
        if image_url:
            anchor_x = ((x - img_w / 2) if center else x) + img_dx
            _draw_data_url_image_top(c, image_url, anchor_x, img_top, img_w, img_h)
        return img_top - img_h

    y -= 1.6 * cm
    col1, col2, col3 = margin, 8.7 * cm, 15.3 * cm
    col2_center = col2 + 2.3 * cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(col1, y, "Signature du directeur")
    c.drawCentredString(col2_center, y, "Signature des Animateurs")
    c.drawString(col3, y, "Signature du stagiaire")

    text_top = y - 0.6 * cm

    # Colonne directeur : nom + cachet du centre.
    # Cachet du centre agrandi (demande explicite) et décalé vers la marge de
    # gauche (img_dx négatif) — largeur plafonnée pour rester sous la colonne
    # Animateurs (qui démarre à col2_center - 1.6cm, soit environ 9.4cm).
    _sig_column(
        col1, text_top, [(centre.get("directeur_nom", ""), "Helvetica", 9.5)],
        cachet_data_url, 7.5 * cm, 5.8 * cm, img_dx=-1 * cm,
    )

    # Colonne animateurs — un ou plusieurs formateurs (dont, le cas échéant,
    # un psychologue identifié par son intitulé) empilés sans chevauchement ;
    # sinon l'ancien flux mono-BAFM + psychologue par défaut (réglages).
    formateurs_list = animateurs.get("formateurs_list")
    if formateurs_list:
        n = len(formateurs_list)
        sig_h = 1.3 * cm if n <= 2 else (0.9 * cm if n == 3 else 0.65 * cm)
        cy = text_top
        for f in formateurs_list:
            cy = _sig_column(
                col2_center, cy,
                [((f.get("titre") or "Formateur")[:30], "Helvetica-Bold", 8.5),
                 (f"{f.get('nom', '')} {f.get('numero') or ''}".strip(), "Helvetica", 8)],
                f.get("signature_data_url"), 2.8 * cm, sig_h, center=True,
            ) - 0.3 * cm
    else:
        cy = _sig_column(
            col2_center, text_top,
            [("BAFM", "Helvetica-Bold", 9), (animateurs.get("bafm_nom", ""), "Helvetica", 9), (animateurs.get("bafm_numero", ""), "Helvetica", 9)],
            formateur_signature_data_url, 3.2 * cm, 1.4 * cm, center=True,
        ) - 0.4 * cm
        _sig_column(
            col2_center, cy,
            [("Psychologue", "Helvetica-Bold", 9), (animateurs.get("psychologue_nom", ""), "Helvetica", 9), (animateurs.get("psychologue_numero", ""), "Helvetica", 9)],
            psychologue_signature_data_url, 3.2 * cm, 1.4 * cm, center=True,
        )

    # Colonne stagiaire : signature manuscrite capturée depuis son espace.
    _sig_column(col3, text_top, [], student_signature_data_url, 4.0 * cm, 2.2 * cm)

    c.setFillColor(gray)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(w / 2, 1.2 * cm, f"{centre.get('nom', 'TDL Formation')} · Agrément préfectoral {centre.get('agrement_numero', '')} · SIRET {centre.get('siret', '')}")

    c.showPage()
    c.save()
    return buf.getvalue()


def _fetch_logo_reader(url: str):
    """Récupère le logo TDL Formation (servi statiquement par le frontend)
    pour l'inclure dans le PDF — best-effort : le document reste généré sans
    logo si le frontend est injoignable au moment précis de la signature."""
    try:
        import requests
        from reportlab.lib.utils import ImageReader
        import io as _io
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            return ImageReader(_io.BytesIO(r.content))
    except Exception:
        pass
    return None


def generate_formateur_convention_pdf(
    formateur: dict, signature_data_url: str, centre: Optional[dict] = None,
    cachet_data_url: Optional[str] = None, sessions: Optional[list] = None,
) -> bytes:
    """Convention de prestation de services signée par un formateur/animateur
    BAFM ou psychologue (voir POST /me/convention/sign côté
    routers/employees.py) — reproduit le modèle papier historique utilisé par
    TDL Formation (texte, mise en page, logo) avec l'identité de l'Intervenant
    rendue dynamique (nom, qualité, numéro d'immatriculation). Remplace le
    passage par une plateforme tierce (Digiforma...) pour ce document."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib import colors
    from reportlab.lib.units import cm
    from core.config import PUBLIC_FRONTEND_URL
    import io as _io

    centre = centre or {}
    buf = _io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    black = colors.HexColor("#0a0a0a")
    margin = 2 * cm
    content_width = w - 2 * margin
    top_start = h - 4.2 * cm
    bottom_limit = 2.2 * cm

    logo = _fetch_logo_reader(f"{PUBLIC_FRONTEND_URL}/tdl.png")

    # Qualité de l'Intervenant (BAFM ou Psychologue) — déduite du `titre`
    # renseigné sur son compte (voir Formateurs.jsx) ; "BAFM" par défaut
    # puisque c'est la qualité la plus courante des animateurs. Le
    # co-intervenant mentionné dans le texte (celui avec qui il co-anime)
    # est automatiquement l'autre qualité.
    titre_raw = (formateur.get("titre") or "").upper()
    is_psy = "PSY" in titre_raw
    qualite = "PSYCHOLOGUE" if is_psy else "BAFM"
    co_qualite_lower = "BAFM" if is_psy else "psychologue"

    nom = (formateur.get("name") or "").strip()
    civ = f"Mr {nom}" if nom else "L'Intervenant"
    immatriculation = formateur.get("agrement_bafm_numero") or "(à compléter)"
    today = datetime.now(timezone.utc)
    today_label = today.strftime("%d/%m/%Y")
    year = today.strftime("%Y")
    centre_nom = centre.get("nom", "TOP DRIVE LEARNING")
    centre_adresse = centre.get("adresse", "")
    centre_ville = centre.get("ville", "")
    centre_siret = centre.get("siret", "")
    directeur_nom = centre.get("directeur_nom", "")

    state = {"y": top_start, "page": 1}

    def _draw_header():
        if logo:
            try:
                c.drawImage(logo, margin, h - 2.6 * cm, width=1.9 * cm, height=1.9 * cm, mask='auto', preserveAspectRatio=True)
            except Exception:
                pass

    def _new_page():
        c.showPage()
        _draw_header()
        state["y"] = h - 3.4 * cm
        state["page"] += 1

    def _ensure_space(needed):
        if state["y"] - needed < bottom_limit:
            _new_page()

    def _wrap(text, font, size, max_width):
        words = text.split(" ")
        lines, cur = [], ""
        for word in words:
            trial = f"{cur} {word}".strip()
            if c.stringWidth(trial, font, size) <= max_width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        return lines

    def para(text, size=10, leading=0.48, bold=False, indent=0, space_after=0.35):
        font = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font, size)
        c.setFillColor(black)
        for line in _wrap(text, font, size, content_width - indent):
            _ensure_space(leading * cm)
            c.drawString(margin + indent, state["y"], line)
            state["y"] -= leading * cm
        state["y"] -= space_after * cm

    def heading(text, size=11):
        _ensure_space(0.9 * cm)
        c.setFont("Helvetica-Bold", size)
        c.setFillColor(black)
        c.drawString(margin, state["y"], text)
        state["y"] -= 0.55 * cm

    def centered(text, size=10):
        _ensure_space(0.5 * cm)
        c.setFont("Helvetica", size)
        c.setFillColor(black)
        c.drawCentredString(w / 2, state["y"], text)
        state["y"] -= 0.45 * cm

    def spacer(cm_h=0.3):
        state["y"] -= cm_h * cm

    _draw_header()

    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(black)
    c.drawCentredString(w / 2, state["y"], f"Convention de prestation de services {year}")
    state["y"] -= 0.6 * cm
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(w / 2, state["y"], "Animation de stages de sensibilisation à la sécurité routière.")
    state["y"] -= 1 * cm

    para(f"Entre les soussignés : {centre_nom}", bold=False)
    para(f"Immatriculation : N° {centre_siret}")
    para("Dont le siège social est situé au")
    para(centre_adresse)
    para(centre_ville)
    para(f"Représenté par Mr {directeur_nom} son dirigeant d'une part")
    spacer(0.2)
    para(
        f"Et {civ}, {qualite} immatriculé(e) à l'Insee sous le n° {immatriculation}, ci-après « l'Intervenant », d'autre part."
    )
    spacer(0.2)
    para(
        f"Rappels : {civ} est agréé(e) par le Ministère des transports pour l'animation de stages de sensibilisation "
        f"à la sécurité routière en tant que {qualite}. La Société {centre_nom} dispense des stages de "
        "sensibilisation à la sécurité routière destinés aux conducteurs infractionnistes dans le cadre de : "
        "La loi n°2011-267 du 14/03/2011, art.70 à 87 du code de la route pour ses articles :"
    )
    centered("L 212-1 à L 212-5     L 213-1 à L 213-8     L 223-1 à L 223-9")
    centered("R 212-1 à R 212-8     R 223-1 à R 223-8")
    spacer(0.2)
    para("Du décret n° 2009-1678 du 29/12/2009 · De l'arrêté du 08/01/2001 · De l'arrêté du 25/02/2004 · Des arrêtés du 26/06/2012.")

    heading("Stages :")
    para(
        "Cas n°1 : stage de sensibilisation à la sécurité routière permettant la récupération maximale de 4 points "
        "de permis par les conducteurs s'étant vu notifier un retrait de points par l'autorité compétente."
    )
    para(
        "Cas n°2 : stage de sensibilisation à la sécurité routière obligatoire dans le cadre d'un permis probatoire "
        "dont le titulaire a commis une infraction entraînant une perte de 3 points ou plus."
    )
    para("Cas n°3 : stage de sensibilisation à la sécurité routière dans le cadre de l'alternative à des poursuites judiciaires et pénales.")
    para("Cas n°4 : stage de sensibilisation à la sécurité routière dans le cadre d'une peine complémentaire prononcée par le juge.")

    heading("Objet de la présente convention :")
    para(f"La Ste {centre_nom} et {civ} se sont accordés sur une collaboration pour l'animation de stages pour l'année {year}.")
    para(
        f"{civ} aura, en sa qualité de {qualite}, la charge de co-animer les stages qui lui seront confiés par la "
        f"Société {centre_nom} avec un(e) {co_qualite_lower}. À ce titre, {civ} a fourni à l'entreprise {centre_nom} "
        "une copie de son autorisation d'animer les stages de sensibilisation à la sécurité routière destinés aux "
        f"conducteurs infractionnistes qui lui a été délivrée par la préfecture de son département de résidence. "
        f"{civ} s'engage par la présente à informer dans les plus brefs délais l'entreprise {centre_nom} de toute "
        "modification concernant cette autorisation d'animer."
    )

    heading("Obligations réciproques :")
    para(
        f"1 - La Ste {centre_nom} est chargée de l'organisation administrative (inscription, accueil et contrôle des "
        "stagiaires, suivi des dossiers) et matérielle des stages (salles de stages avec leur équipement : tables, "
        "chaises, matériel audiovisuel et informatique, paper-board, feuilles et stylos…) dans le cadre de la "
        "réglementation en vigueur."
    )
    para("Ces stages devant obligatoirement se dérouler sur 14 heures réparties sur 2 jours consécutifs et comprenant au minimum un temps de pause méridien de 45 minutes.")
    para(
        f"2 - {civ} en sa qualité de {qualite} est habilité(e) à co-animer avec un(e) {co_qualite_lower} ; dans ce "
        "cadre il/elle devra : veiller au respect de la réglementation en vigueur, et dispenser le programme "
        "obligatoire « G2 ». Préparer en amont les stages avec le binôme d'animation afin de bien s'accorder sur "
        "les orientations pédagogiques. Favoriser la co-animation en respectant les échanges."
    )
    para("- Respecter les objectifs des stages tout en ayant une démarche pédagogique", indent=0.3)
    para("- Respecter les séquences (durées, contenus, objectifs, déroulement et bilans)", indent=0.3)
    para("- Favoriser l'implication des stagiaires (partage d'avis, de connaissances, d'expériences…)", indent=0.3)
    para("- Veiller au respect des groupes de stagiaires (écoute, attention, neutralité…)", indent=0.3)
    para("- Respecter le volume horaire indiqué par la réglementation", indent=0.3)
    para("- Réaliser, après la fin du stage, un débriefing avec le binôme d'animation afin d'analyser le déroulement des diverses séquences et s'assurer de leur adéquation avec les objectifs définis.", indent=0.3)

    para(f"2 - Planning d'intervention : les stages de l'année {year} se dérouleront selon le calendrier retenu et communiqué par le Centre, aux dates et lieux qui y sont indiqués via le tableau de bord TDL Formation.")
    para(f"3 - Durée et effets de la convention : la présente convention prend effet à sa signature et couvre l'année {year}. Le cas échéant, une résiliation anticipée ne pourra intervenir que 15 jours après la réception par la partie défaillante d'une lettre recommandée avec accusé de réception de mise en demeure de retour à la normale.")

    heading("4 - Déprogrammation de stages :")
    para(
        f"La Ste {centre_nom} aura la possibilité de déprogrammer un stage avec un préavis d'une semaine. Seul un "
        "cas de force majeure justifiera une annulation plus courte : nombre réglementaire de stagiaires non "
        "atteint, défection du co-animateur, salle de formation indisponible du fait du loueur. Ces différentes "
        "raisons rendant réglementairement impossible la tenue du stage. En cas d'annulation de sa part dans un "
        f"délai inférieur à une semaine, {civ} devra obligatoirement produire un justificatif d'absence sous 48h."
    )

    heading("5 - Conditions d'exécution de la convention :")
    para(
        f"En signant la présente convention, {civ} s'engage à : respecter le planning auquel il/elle s'est engagé(e) "
        f"auprès de la Ste {centre_nom} ; faire connaître dans les plus brefs délais à la Ste {centre_nom} toute "
        "modification concernant son autorisation d'animer les stages de sensibilisation à la sécurité routière "
        "(suspension ou annulation de celle-ci) et à l'actualiser ; être couvert(e) par une assurance en "
        "responsabilité civile (attestation à fournir pour la signature de cette convention)."
    )
    para(
        f"En signant la présente convention, Mr {directeur_nom} s'engage à : organiser les stages aux dates convenues "
        "dans un des sites agréés par la préfecture compétente en respectant le calendrier établi ; prévenir dans "
        f"les plus brefs délais {civ} de tout problème pouvant intervenir quant à l'organisation d'un stage (agrément, salle…)."
    )

    heading("6 - Confidentialité :")
    para(
        f"La Ste {centre_nom} et {civ} s'obligent réciproquement à une obligation de discrétion et de confidentialité "
        "quant à l'identité des stagiaires ainsi que sur la teneur des informations pouvant être recueillies dans "
        "le cadre de l'animation des stages."
    )

    heading("7 - Contentieux :")
    para("Tous les éventuels litiges entre les parties seront soumis aux tribunaux compétents de Bobigny (93).")
    spacer(0.3)
    para(f"Fait à {centre_ville or 'Epinay sur Seine'} en deux exemplaires le {today_label}.")

    _ensure_space(6 * cm)
    col1, col2 = margin, margin + content_width / 2 + 0.5 * cm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(col1, state["y"], centre_nom)
    c.drawString(col2, state["y"], qualite)
    text_top = state["y"] - 0.5 * cm
    c.setFont("Helvetica", 9.5)
    c.drawString(col1, text_top, directeur_nom)
    c.drawString(col2, text_top, nom)
    sig_w, sig_h = 8 * cm, 4.5 * cm
    _draw_data_url_image(c, cachet_data_url, col1, text_top - 0.35 * cm - sig_h, sig_w, sig_h)
    _draw_data_url_image(c, signature_data_url, col2, text_top - 0.35 * cm - sig_h, sig_w, sig_h)

    c.setFillColor(colors.HexColor("#666"))
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(w / 2, 1.2 * cm, f"{centre_nom} · SIRET {centre_siret}")

    if sessions is not None:
        _new_page()
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(black)
        c.drawCentredString(w / 2, state["y"], f"Convention de prestation de services {year}, Animation")
        state["y"] -= 0.55 * cm
        c.drawCentredString(w / 2, state["y"], "de stages de sensibilisation à la sécurité routière.")
        state["y"] -= 0.9 * cm
        c.setFont("Helvetica-Bold", 10.5)
        c.drawCentredString(w / 2, state["y"], "Annexe")
        state["y"] -= 0.55 * cm
        c.drawCentredString(w / 2, state["y"], f"Dates et lieux de stages {year} :")
        state["y"] -= 0.9 * cm

        headers = [f"Dates {year}", "Lieu du stage", qualite, co_qualite_lower.upper()]
        col_widths = [4.2 * cm, 5.5 * cm, 3.4 * cm, 3.4 * cm]
        row_h = 0.75 * cm
        header_h = 0.9 * cm
        table_x = margin
        table_w = sum(col_widths)

        def _table_row(y_top, cells, height, bold=False, fill=None):
            if fill:
                c.setFillColor(fill)
                c.rect(table_x, y_top - height, table_w, height, fill=1, stroke=0)
            c.setStrokeColor(colors.HexColor("#999"))
            c.setLineWidth(0.5)
            x = table_x
            for cw in col_widths:
                c.rect(x, y_top - height, cw, height, fill=0, stroke=1)
                x += cw
            c.setFont("Helvetica-Bold" if bold else "Helvetica", 8.5)
            c.setFillColor(black)
            x = table_x
            for cell, cw in zip(cells, col_widths):
                for i, line in enumerate(_wrap(cell, "Helvetica-Bold" if bold else "Helvetica", 8.5, cw - 0.3 * cm)[:3]):
                    c.drawString(x + 0.15 * cm, y_top - 0.35 * cm - i * 0.32 * cm, line)
                x += cw

        _ensure_space(header_h)
        _table_row(state["y"], headers, header_h, bold=True, fill=colors.HexColor("#f0f0f0"))
        state["y"] -= header_h

        if sessions:
            for s in sessions:
                dates_label = f"{s.get('date_debut', '')} - {s.get('date_fin', '')}"
                lieu_label = ", ".join([p for p in [s.get("lieu_adresse", ""), s.get("lieu_ville", "")] if p]) or f"{centre_adresse}, {centre_ville}"
                cells = [dates_label, lieu_label, nom, s.get("co_animateur") or "—"]
                _ensure_space(row_h)
                if state["y"] - row_h < bottom_limit:
                    _new_page()
                    _ensure_space(header_h)
                    _table_row(state["y"], headers, header_h, bold=True, fill=colors.HexColor("#f0f0f0"))
                    state["y"] -= header_h
                _table_row(state["y"], cells, row_h)
                state["y"] -= row_h
        else:
            cells = ["—", "Aucune session programmée pour le moment", "—", "—"]
            _table_row(state["y"], cells, row_h)
            state["y"] -= row_h

        state["y"] -= 1 * cm
        para(f"Adresses des lieux de stage : {centre_adresse}, {centre_ville}.")
        para("Horaires : selon planning communiqué par le Centre.")
        state["y"] -= 0.6 * cm

        _ensure_space(6 * cm)
        col1, col2 = margin, margin + content_width / 2 + 0.5 * cm
        c.setFont("Helvetica", 9.5)
        c.drawString(col1, state["y"], f"Bon pour accord, le {today_label}")
        c.drawString(col2, state["y"], f"Bon pour accord, le {today_label}")
        state["y"] -= 0.6 * cm
        c.setFont("Helvetica-Bold", 10)
        c.drawString(col1, state["y"], centre_nom)
        c.drawString(col2, state["y"], qualite)
        text_top2 = state["y"] - 0.5 * cm
        c.setFont("Helvetica", 9.5)
        c.drawString(col1, text_top2, directeur_nom)
        c.drawString(col2, text_top2, nom)
        _draw_data_url_image(c, cachet_data_url, col1, text_top2 - 0.35 * cm - sig_h, sig_w, sig_h)
        _draw_data_url_image(c, signature_data_url, col2, text_top2 - 0.35 * cm - sig_h, sig_w, sig_h)

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
