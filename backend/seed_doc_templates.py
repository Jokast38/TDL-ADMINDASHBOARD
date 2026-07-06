# seed_doc_templates.py - Templates HTML/CSS compatibles xhtml2pdf
# Reproduit fidèlement la mise en page des documents TOP DRIVE LEARNING
# (logo, bandeau or/noir, tableaux bordés, saut de page, pied de page).
import os
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import uuid
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# --- Logo TDL en base64 ---
def get_tdl_logo_base64():
    logo_path = ROOT_DIR.parent / "frontend" / "public" / "tdl.png"
    print(f"🔍 Recherche du logo à: {logo_path}")
    if logo_path.exists():
        with open(logo_path, "rb") as f:
            img_data = f.read()
            b64 = base64.b64encode(img_data).decode('utf-8')
            print(f"✅ Logo chargé: {logo_path} ({len(img_data)} octets)")
            return f'<img src="data:image/png;base64,{b64}" width="70" height="70" />'
    print("⚠️ Logo non trouvé, fallback textuel")
    return '<div style="font-family:Helvetica;font-weight:bold;font-size:14pt;color:#0a0a0a;">TDL <span style="color:#d4af37;">FORMATION</span></div>'


TDL_LOGO = get_tdl_logo_base64()

# --- En-tête réutilisable (logo à gauche, coordonnées à droite) ---
def header_block(extra_top_right="59 avenue JOFFRE, 93800 EPINAY-SUR-SEINE"):
    return f"""
    <table width="100%" style="margin-bottom:14px;">
      <tr>
        <td width="15%">{TDL_LOGO}</td>
        <td width="55%" style="font-family:Helvetica;font-size:8.5pt;color:#444444;">
          <b style="font-size:11pt;color:#0a0a0a;">{{organisme_nom}}</b><br/>
          {{adresse}}<br/>
          Email: {{email}} &nbsp;|&nbsp; Tel: {{telephone}}
        </td>
        <td width="30%" align="right" style="font-family:Helvetica;font-size:8pt;color:#888888;">
          SIRET: {{siret}}<br/>
          N° Déclaration: {{numero_declaration_activite}}
        </td>
      </tr>
    </table>
    <hr/>
    """

FOOTER_RULE = '<hr style="margin-top:18px;"/>'

def footer_block():
    return f"""
    {FOOTER_RULE}
    <p style="font-family:Helvetica;font-size:7.5pt;color:#999999;text-align:center;">
      {{organisme_nom}} | {{adresse}} | SIRET: {{siret}} | N° Déclaration d'activité: {{numero_declaration_activite}}
      ({{region_prefet}})
    </p>
    """


# ============================================================
# Modèle 1 : Attestation d'assiduité (2 pages, comme l'original)
# ============================================================
ATTESTATION_ASSIDUITE = {
    "nom": "Attestation d'assiduité - VTC / Formation",
    "type_doc": "attestation",
    "description": "Attestation d'assiduité pour les formations VTC, CACES, permis, SSIAP (sur le modèle du document original, 2 pages)",
    "variables": [
        "organisme_nom", "adresse", "email", "telephone", "siret",
        "numero_declaration_activite", "region_prefet",
        "formateur_nom", "stagiaire_nom", "formation_titre", "lieu_formation",
        "date_debut", "date_fin", "programme_details", "info_reglementaire",
        "duree_suivie", "taux_realisation", "detail_sessions", "modules_list",
        "epreuves_theoriques", "epreuves_pratiques", "ville", "date_emission"
    ],
    "contenu_html": f"""
    {header_block()}

    <h1 style="font-family:Helvetica-Bold;font-size:20pt;color:#0a0a0a;margin-bottom:2px;">Attestation d'assiduité</h1>
    <hr style="margin-bottom:14px;"/>

    <p style="font-family:Helvetica;font-size:10.5pt;">
      Je, soussigné: <b>{{formateur_nom}}</b> représentant de l'organisme de formation <b>{{organisme_nom}}</b>,
      N° {{numero_declaration_activite}} ({{region_prefet}})
    </p>

    <p style="font-family:Helvetica;font-size:10.5pt;">atteste que: <b>{{stagiaire_nom}}</b></p>

    <p style="font-family:Helvetica;font-size:10.5pt;">a suivi la formation:</p>
    <p style="font-family:Helvetica-Bold;font-size:12pt;">{{formation_titre}}</p>

    <table width="100%" style="margin:8px 0 14px 0;background-color:#f8f8f8;border-left:3px solid #d4af37;">
      <tr><td style="padding:8px;font-family:Helvetica;font-size:10pt;">
        <b>Lieu de la formation:</b> {{lieu_formation}}<br/>
        <b>Dates de la formation:</b> {{date_debut}} au {{date_fin}}
      </td></tr>
    </table>

    <p style="font-family:Helvetica-Bold;font-size:11pt;color:#0a0a0a;">Programme :</p>
    <p style="font-family:Helvetica;font-size:10pt;">{{programme_details}}</p>

    <p style="font-family:Helvetica;font-size:8.5pt;color:#555555;">{{info_reglementaire}}</p>

    <h2 style="font-family:Helvetica-Bold;font-size:13pt;color:#0a0a0a;">Assiduité du stagiaire</h2>
    <hr/>
    <p style="font-family:Helvetica;font-size:10.5pt;">
      Durée effectivement suivie par le/la stagiaire: <b>{{duree_suivie}}</b><br/>
      soit un taux de réalisation de <b>{{taux_realisation}} %</b>
    </p>

    <p style="font-family:Helvetica;font-size:9.5pt;">{{detail_sessions}}</p>

    <!-- ===== Page 2 ===== -->
    <div style="page-break-before: always;"></div>
    {header_block()}

    <p style="font-family:Helvetica-Bold;font-size:11pt;color:#0a0a0a;">Modules suivis :</p>
    <p style="font-family:Helvetica;font-size:9.5pt;">{{modules_list}}</p>

    <p style="font-family:Helvetica-Bold;font-size:11pt;color:#0a0a0a;">Épreuves théoriques :</p>
    <p style="font-family:Helvetica;font-size:9.5pt;">{{epreuves_theoriques}}</p>

    <p style="font-family:Helvetica-Bold;font-size:11pt;color:#0a0a0a;">Épreuve pratique :</p>
    <p style="font-family:Helvetica;font-size:9.5pt;">{{epreuves_pratiques}}</p>

    <p style="font-family:Helvetica-Oblique;font-size:9pt;color:#666666;">
      La feuille d'émargement attestant cette assiduité est fournie en annexe.
    </p>

    <p style="font-family:Helvetica-Bold;font-size:11pt;text-align:right;margin-top:18px;">
      Fait à {{ville}}, le {{date_emission}}
    </p>

    {footer_block()}
    """,
    "actif": True
}

# ============================================================
# Modèle 2 : Attestation individuelle de formation
# ============================================================
ATTESTATION_INDIVIDUELLE = {
    "nom": "Attestation individuelle de formation - Certificat",
    "type_doc": "attestation",
    "description": "Certificat / attestation individuelle avec objectifs détaillés (sur le modèle du document original)",
    "variables": [
        "organisme_nom", "adresse", "telephone", "email", "agrements",
        "responsable_nom", "siret", "numero_declaration_activite", "region_prefet",
        "stagiaire_titre", "stagiaire_nom", "formation_titre", "lieu_formation",
        "date_debut", "date_fin", "duree_totale", "nature_action",
        "objectifs_list", "ville", "date_emission"
    ],
    "contenu_html": f"""
    <table width="100%" style="margin-bottom:6px;">
      <tr>
        <td width="70%">
          <b style="font-family:Helvetica-Bold;font-size:13pt;color:#0a0a0a;">{{organisme_nom}}</b><br/>
          <span style="font-family:Helvetica;font-size:9pt;color:#444444;">{{adresse}}</span><br/>
          <span style="font-family:Helvetica;font-size:9pt;color:#444444;">{{telephone}}</span><br/>
          <span style="font-family:Helvetica;font-size:9pt;color:#444444;">{{email}}</span><br/>
          <span style="font-family:Helvetica-Bold;font-size:8.5pt;">Agréments: {{agrements}}</span>
        </td>
        <td width="30%" align="right">{TDL_LOGO}</td>
      </tr>
    </table>
    <hr/>

    <h1 style="font-family:Helvetica-Bold;font-size:20pt;color:#0a0a0a;text-align:center;margin:18px 0;">
      Attestation individuelle de formation
    </h1>

    <p style="font-family:Helvetica;font-size:10.5pt;">
      Je, soussigné: <b>{{responsable_nom}}</b>, représentant de l'organisme de formation <b>{{organisme_nom}}</b>, {{adresse}}
    </p>
    <p style="font-family:Helvetica;font-size:10.5pt;">atteste que: <b>{{stagiaire_titre}} {{stagiaire_nom}}</b></p>

    <p style="font-family:Helvetica;font-size:10.5pt;">a suivi la formation:</p>
    <table width="100%" style="margin:6px 0 14px 0;">
      <tr><td style="background-color:#0a0a0a;padding:10px;text-align:center;">
        <span style="font-family:Helvetica-Bold;font-size:13pt;color:#d4af37;">{{formation_titre}}</span>
      </td></tr>
    </table>

    <table width="100%" style="font-family:Helvetica;font-size:10pt;">
      <tr><td width="32%"><b>Lieu de la formation:</b></td><td>{{lieu_formation}}</td></tr>
      <tr><td><b>Dates de la formation:</b></td><td>{{date_debut}} {{date_fin}}</td></tr>
      <tr><td><b>Durée de la formation:</b></td><td>{{duree_totale}}</td></tr>
      <tr><td><b>Nature de l'action de formation:</b></td><td>{{nature_action}}</td></tr>
    </table>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;margin-top:16px;">Objectifs de la formation</h2>
    <hr/>
    <p style="font-family:Helvetica;font-size:10pt;">{{objectifs_list}}</p>

    <p style="font-family:Helvetica-Bold;font-size:11pt;text-align:right;margin-top:18px;">
      Fait à {{ville}} , le {{date_emission}}
    </p>

    {footer_block()}
    """,
    "actif": True
}

# ============================================================
# Modèle 3 : Contrat / Convention de formation professionnelle
# ============================================================
CONVENTION_FORMATION = {
    "nom": "Convention de formation professionnelle",
    "type_doc": "convention",
    "description": "Contrat de formation professionnelle complet avec planning et modalités (sur le modèle du document original)",
    "variables": [
        "organisme_nom", "adresse", "code_postal", "ville", "siret",
        "numero_declaration_activite", "region", "representant_nom",
        "telephone", "email",
        "stagiaire_nom", "stagiaire_adresse", "formation_titre",
        "duree_totale", "lieu_formation", "date_debut", "date_fin",
        "planning_table", "prix_formation", "iban", "modalites_paiement",
        "conditions_renoncement", "tribunal", "date_signature"
    ],
    "contenu_html": f"""
    {header_block()}

    <h1 style="font-family:Helvetica-Bold;font-size:17pt;color:#0a0a0a;text-align:center;margin-bottom:0;">
      Contrat de formation professionnelle
    </h1>
    <p style="font-family:Helvetica;font-size:8.5pt;color:#666666;text-align:center;">
      (Articles L. 6353-3 à L. 6353-7 du code du travail)
    </p>

    <table width="100%" style="margin:10px 0;background-color:#f8f8f8;border-left:3px solid #d4af37;">
      <tr><td style="padding:8px;font-family:Helvetica;font-size:9.5pt;">
        <b>Entre l'organisme de formation: {{organisme_nom}}</b><br/>
        (ci-après nommé l'organisme de formation)<br/>
        Situé: {{adresse}} {{code_postal}} {{ville}}<br/>
        Enregistré sous le numéro {{numero_declaration_activite}} auprès du préfet de la région {{region}}<br/>
        Représenté par: {{representant_nom}}
      </td></tr>
    </table>

    <table width="100%" style="margin:10px 0;background-color:#f8f8f8;border-left:3px solid #d4af37;">
      <tr><td style="padding:8px;font-family:Helvetica;font-size:9.5pt;">
        <b>Et le bénéficiaire: {{stagiaire_nom}}</b><br/>
        (ci-après nommé le bénéficiaire)<br/>
        Situé: {{stagiaire_adresse}}
      </td></tr>
    </table>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">1. Objet, nature et durée de la formation</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">Le bénéficiaire entend participer à l'action de formation suivante organisée par l'organisme de formation.</p>

    <table width="100%" style="margin:8px 0;">
      <tr><td style="background-color:#0a0a0a;padding:10px;text-align:center;">
        <span style="font-family:Helvetica-Bold;font-size:12.5pt;color:#d4af37;">{{formation_titre}}</span>
      </td></tr>
    </table>

    <table width="100%" style="font-family:Helvetica;font-size:9.5pt;">
      <tr><td width="25%"><b>Durée:</b></td><td>{{duree_totale}}</td></tr>
      <tr><td><b>Lieu:</b></td><td>{{lieu_formation}}</td></tr>
      <tr><td><b>Dates:</b></td><td>{{date_debut}} au {{date_fin}}</td></tr>
    </table>

    <h3 style="font-family:Helvetica-Bold;font-size:11pt;color:#0a0a0a;">Planning de la formation</h3>
    <p style="font-family:Helvetica;font-size:9pt;">{{planning_table}}</p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">2. Programme de la formation et formateur</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">La description détaillée du programme de formation et du formateur est fournie en annexe.</p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">3. Engagement de participation à l'action de formation</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">Le bénéficiaire s'engage à assurer sa présence aux dates et lieux prévus ci-dessus.</p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">4. Prix de la formation</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">En contrepartie de cette action de formation, le bénéficiaire s'acquittera des coûts suivants:</p>
    <table width="60%" style="border:1px solid #dddddd;font-family:Helvetica;font-size:9.5pt;">
      <tr style="background-color:#0a0a0a;">
        <td style="padding:6px;color:#d4af37;"><b>Description</b></td>
        <td style="padding:6px;color:#d4af37;text-align:right;"><b>Prix</b></td>
      </tr>
      <tr><td style="padding:6px;">Formation</td><td style="padding:6px;text-align:right;">{{prix_formation}} €</td></tr>
    </table>
    <p style="font-family:Helvetica-Bold;font-size:9.5pt;margin-top:6px;">{{iban}}</p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">5. Modalités de règlement</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">Le paiement sera dû à réception d'une facture émise par l'organisme de formation. {{modalites_paiement}}</p>

    <!-- ===== Page 2 ===== -->
    <div style="page-break-before: always;"></div>
    {header_block()}

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">6. Moyens pédagogiques et techniques mis en œuvre</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">
      Voir le programme de formation en annexe. Une feuille d'émargement signée par le(s) stagiaire(s) et le formateur,
      par demi-journée de formation, permettra de justifier de la réalisation de la prestation.
    </p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">7. Sanction de la formation</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">
      En application de l'article L.6353-1 du Code du Travail, une attestation mentionnant les objectifs, la nature et
      la durée de l'action et les résultats de l'évaluation des acquis de la formation sera remise au(x) stagiaire(s)
      à l'issue de la formation.
    </p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">8. Non réalisation de la prestation de formation</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">
      En application de l'article L6354-1 du Code du travail, faute de réalisation totale ou partielle de la prestation
      de formation, l'organisme prestataire doit rembourser au cocontractant les sommes indûment perçues de ce fait.
    </p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">9. Dédommagement, réparation ou dédit</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">
      À compter de la date de signature du présent contrat, le bénéficiaire a un délai de 10 jours pour se rétracter
      (14 jours pour les contrats conclus à distance ou hors établissement, article L.121-16 du Code de la consommation).
      {{conditions_renoncement}}
    </p>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">10. Litiges</h2>
    <p style="font-family:Helvetica;font-size:9.5pt;">
      Si une contestation ou un différend ne peuvent pas être réglés à l'amiable, le Tribunal de {{tribunal}} sera
      seul compétent pour régler le litige.
    </p>

    <p style="font-family:Helvetica;font-size:8.5pt;color:#666666;margin-top:18px;">
      Document réalisé en 2 exemplaires à {{ville}}, le {{date_signature}}
    </p>

    <table width="100%" style="margin-top:20px;">
      <tr>
        <td width="50%" style="font-family:Helvetica;font-size:9.5pt;">
          <b>Pour l'organisme de formation,</b><br/>
          {{organisme_nom}},<br/>{{representant_nom}}
          <hr style="width:150px;margin-top:30px;"/>
          <span style="font-size:7.5pt;color:#888888;">Signature et cachet</span>
        </td>
        <td width="50%" align="right" style="font-family:Helvetica;font-size:9.5pt;">
          <b>Nom de famille Prénom</b>
          <hr style="width:150px;margin-top:30px;"/>
          <span style="font-size:7.5pt;color:#888888;">Signature</span>
        </td>
      </tr>
    </table>

    {footer_block()}
    """,
    "actif": True
}

# ============================================================
# Modèle 4 : Facture
# ============================================================
FACTURE = {
    "nom": "Facture - Formation / Prestation",
    "type_doc": "facture",
    "description": "Facture standard pour les formations et prestations",
    "variables": [
        "organisme_nom", "adresse", "code_postal", "ville", "telephone",
        "email", "siret", "numero_declaration_activite", "numero_facture",
        "date_emission", "client_nom", "client_adresse", "client_email",
        "lignes_facture", "total_ht", "taux_tva", "montant_tva",
        "total_ttc", "iban", "bic"
    ],
    "contenu_html": f"""
    {header_block()}

    <h1 style="font-family:Helvetica-Bold;font-size:24pt;color:#0a0a0a;text-align:center;margin:18px 0;">FACTURE</h1>

    <table width="100%" style="margin-bottom:14px;background-color:#f8f8f8;border-left:3px solid #d4af37;">
      <tr>
        <td width="50%" style="padding:10px;font-family:Helvetica;font-size:10pt;">
          <b>N° Facture:</b> {{numero_facture}}<br/>
          <b>Date:</b> {{date_emission}}
        </td>
        <td width="50%" align="right" style="padding:10px;font-family:Helvetica;font-size:10pt;">
          <b>Client:</b><br/>{{client_nom}}<br/>{{client_adresse}}<br/>{{client_email}}
        </td>
      </tr>
    </table>

    <table width="100%" style="border:1px solid #dddddd;font-family:Helvetica;font-size:9.5pt;">
      <tr style="background-color:#0a0a0a;">
        <td style="padding:8px;color:#d4af37;"><b>Désignation</b></td>
        <td style="padding:8px;color:#d4af37;text-align:center;"><b>Qté</b></td>
        <td style="padding:8px;color:#d4af37;text-align:right;"><b>Prix HT</b></td>
        <td style="padding:8px;color:#d4af37;text-align:right;"><b>Total HT</b></td>
      </tr>
      {{lignes_facture}}
      <tr style="background-color:#f8f8f8;">
        <td colspan="3" style="padding:8px;text-align:right;border-top:2px solid #0a0a0a;"><b>Total HT</b></td>
        <td style="padding:8px;text-align:right;border-top:2px solid #0a0a0a;"><b>{{total_ht}} €</b></td>
      </tr>
      <tr style="background-color:#f8f8f8;">
        <td colspan="3" style="padding:8px;text-align:right;">TVA ({{taux_tva}}%)</td>
        <td style="padding:8px;text-align:right;">{{montant_tva}} €</td>
      </tr>
      <tr style="background-color:#0a0a0a;">
        <td colspan="3" style="padding:8px;text-align:right;color:#d4af37;"><b>Total TTC</b></td>
        <td style="padding:8px;text-align:right;color:#d4af37;"><b>{{total_ttc}} €</b></td>
      </tr>
    </table>

    <table width="100%" style="margin-top:14px;background-color:#f8f8f8;border:1px solid #dddddd;font-family:Helvetica;font-size:9pt;">
      <tr><td style="padding:8px;"><b>Règlement:</b> à réception de facture</td></tr>
      <tr><td style="padding:8px;"><b>IBAN:</b> {{iban}} &nbsp;|&nbsp; <b>BIC:</b> {{bic}}</td></tr>
      <tr><td style="padding:8px;color:#888888;font-size:8pt;">TVA non applicable - article 293B du CGI</td></tr>
    </table>

    {footer_block()}
    """,
    "actif": True
}

# ============================================================
# Modèle 5 : Feuille d'émargement
# ============================================================
FEUILLE_EMARGEMENT = {
    "nom": "Feuille d'émargement - Présence stagiaires",
    "type_doc": "attestation",
    "description": "Feuille d'émargement pour le suivi de présence des stagiaires",
    "variables": [
        "organisme_nom", "email", "telephone", "adresse", "code_postal",
        "ville", "siret", "numero_declaration_activite", "formation_titre",
        "date_debut", "date_fin", "lieu_formation", "duree_totale",
        "formateurs_list", "apprenants_list", "intervenants_list",
        "lieu_signature", "date_signature"
    ],
    "contenu_html": f"""
    <table width="100%" style="margin-bottom:6px;">
      <tr>
        <td width="15%">{TDL_LOGO}</td>
        <td width="85%" style="font-family:Helvetica;font-size:9pt;color:#444444;">
          <b style="font-size:11pt;color:#0a0a0a;">{{organisme_nom}}</b><br/>
          Email: {{email}} &nbsp;|&nbsp; Tel: {{telephone}}
        </td>
      </tr>
    </table>

    <table width="100%" style="margin:8px 0;background-color:#f8f8f8;">
      <tr><td style="padding:6px;text-align:center;font-family:Helvetica;font-size:8pt;color:#666666;">
        {{organisme_nom}} | {{adresse}} | {{code_postal}} {{ville}}<br/>
        SIRET: {{siret}} | N° Déclaration: {{numero_declaration_activite}}<br/>
        <i>Cet enregistrement ne vaut pas l'agrément de l'État.</i>
      </td></tr>
    </table>

    <h1 style="font-family:Helvetica-Bold;font-size:18pt;color:#0a0a0a;text-align:center;">Feuille d'émargement</h1>
    <hr/>

    <table width="100%" style="margin:10px 0;background-color:#f8f8f8;border-left:3px solid #d4af37;font-family:Helvetica;font-size:9.5pt;">
      <tr><td style="padding:8px;">
        <b>Nom de la formation:</b> {{formation_titre}}<br/>
        <b>Date:</b> du {{date_debut}} au {{date_fin}}<br/>
        <b>Lieu:</b> {{lieu_formation}}<br/>
        <b>Durée:</b> {{duree_totale}} heures<br/>
        <b>Prestataire:</b> {{organisme_nom}} | N° {{numero_declaration_activite}}<br/>
        <b>Formateurs:</b> {{formateurs_list}}
      </td></tr>
    </table>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">Émargement des apprenants</h2>
    <hr/>
    <table width="100%" style="border:1px solid #dddddd;font-family:Helvetica;font-size:9.5pt;">
      <tr style="background-color:#f0f0f0;"><td style="padding:6px;"><b>Apprenant</b></td><td style="padding:6px;text-align:right;"><b>Signature</b></td></tr>
      {{apprenants_list}}
    </table>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;margin-top:14px;">Émargement des intervenants</h2>
    <hr/>
    <table width="100%" style="border:1px solid #dddddd;font-family:Helvetica;font-size:9.5pt;">
      <tr style="background-color:#f0f0f0;"><td style="padding:6px;"><b>Intervenant</b></td><td style="padding:6px;text-align:right;"><b>Signature</b></td></tr>
      {{intervenants_list}}
    </table>

    <p style="font-family:Helvetica-Bold;font-size:11pt;text-align:right;margin-top:18px;">
      Fait à {{lieu_signature}}, le {{date_signature}}
    </p>
    {FOOTER_RULE}
    <p style="font-family:Helvetica;font-size:7.5pt;color:#999999;text-align:center;">
      Signature des apprenants et des intervenants attestant de leur présence
    </p>
    """,
    "actif": True
}

# ============================================================
# Modèle 6 : Convocation à la formation professionnelle
# ============================================================
CONVOCATION = {
    "nom": "Convocation à la formation professionnelle",
    "type_doc": "attestation",
    "description": "Convocation envoyée au stagiaire avec planning et rappel des modalités",
    "variables": [
        "organisme_nom", "adresse", "code_postal", "ville", "email",
        "telephone", "siret", "numero_declaration_activite",
        "stagiaire_civilite_nom", "formation_titre", "lieu_formation",
        "date_debut", "date_fin", "duree_totale", "horaires",
        "planning_table", "date_limite_confirmation", "service_nom",
        "service_telephone", "service_email", "signataire_nom",
        "lieu_signature", "date_emission"
    ],
    "contenu_html": f"""
    {header_block()}

    <p style="font-family:Helvetica;font-size:9pt;text-align:right;color:#666666;">{{date_emission}}</p>

    <h1 style="font-family:Helvetica-Bold;font-size:18pt;color:#0a0a0a;text-align:center;">
      Convocation à la formation professionnelle
    </h1>
    <hr/>

    <p style="font-family:Helvetica;font-size:10.5pt;">Bonjour <b>{{stagiaire_civilite_nom}}</b>,</p>

    <p style="font-family:Helvetica;font-size:10.5pt;">
      Nous vous prions de bien vouloir trouver ci-dessous votre convocation à la formation organisée par
      <b>{{organisme_nom}}</b>.
    </p>

    <table width="100%" style="margin:10px 0;">
      <tr><td style="background-color:#0a0a0a;padding:10px;text-align:center;">
        <span style="font-family:Helvetica-Bold;font-size:13pt;color:#d4af37;">{{formation_titre}}</span>
      </td></tr>
    </table>

    <table width="100%" style="font-family:Helvetica;font-size:10pt;">
      <tr><td width="32%"><b>Lieu de la formation:</b></td><td>{{lieu_formation}}</td></tr>
      <tr><td><b>Dates de la formation:</b></td><td>du {{date_debut}} au {{date_fin}}</td></tr>
      <tr><td><b>Durée de la formation:</b></td><td>{{duree_totale}}</td></tr>
      <tr><td><b>Horaires:</b></td><td>{{horaires}}</td></tr>
    </table>

    <h2 style="font-family:Helvetica-Bold;font-size:12pt;color:#0a0a0a;">Planning</h2>
    <hr/>
    <p style="font-family:Helvetica;font-size:9.5pt;">{{planning_table}}</p>

    <table width="100%" style="margin:10px 0;background-color:#f8f8f8;border-left:3px solid #d4af37;">
      <tr><td style="padding:8px;font-family:Helvetica;font-size:9.5pt;">
        <b>Rappel important:</b><br/>
        • La présence à l'ensemble de la session est obligatoire.<br/>
        • Merci de nous prévenir en cas d'empêchement dès que possible.
      </td></tr>
    </table>

    <p style="font-family:Helvetica;font-size:10.5pt;">
      Pour confirmer votre présence, merci de répondre à ce mail avant le <b>{{date_limite_confirmation}}</b>.
    </p>

    <p style="font-family:Helvetica;font-size:10.5pt;">Cordialement,<br/>{{service_nom}} – {{organisme_nom}}<br/>{{service_telephone}} {{service_email}}</p>

    <p style="font-family:Helvetica;font-size:10.5pt;">Nous restons à votre disposition.</p>

    <p style="font-family:Helvetica;font-size:10.5pt;">
      Bien cordialement,<br/><b>{{signataire_nom}}</b> pour {{organisme_nom}}
    </p>

    <p style="font-family:Helvetica;font-size:10.5pt;">Fait à {{lieu_signature}} le {{date_emission}}</p>

    {footer_block()}
    """,
    "actif": True
}

MODELS = [
    ATTESTATION_ASSIDUITE,
    ATTESTATION_INDIVIDUELLE,
    CONVENTION_FORMATION,
    FACTURE,
    FEUILLE_EMARGEMENT,
    CONVOCATION
]

# --- Correctif: les f-strings Python utilisées ci-dessus pour insérer le logo
# et les blocs d'en-tête/pied de page transforment automatiquement les
# "{{variable}}" en "{variable}" (règle d'échappement des f-strings).
# On restaure donc ici les doubles accolades pour que le moteur de
# génération PDF (server.py) puisse bien substituer {{variable}} -> valeur.
import re as _re
_VAR_PATTERN = _re.compile(r"(?<!\{)\{(\w+)\}(?!\})")
for _m in MODELS:
    _m["contenu_html"] = _VAR_PATTERN.sub(r"{{\1}}", _m["contenu_html"])



async def seed_doc_templates():
    print("🔄 Début de l'ajout des modèles de documents...")
    logo_path = ROOT_DIR.parent / "frontend" / "public" / "tdl.png"
    print(f"📁 Logo: {'trouvé ✅' if logo_path.exists() else 'absent ⚠️'} ({logo_path})")

    for model_data in MODELS:
        try:
            existing = await db.doc_templates.find_one({"nom": model_data["nom"]})
            if existing:
                update_data = {k: v for k, v in model_data.items() if k != "nom"}
                await db.doc_templates.update_one({"nom": model_data["nom"]}, {"$set": update_data})
                print(f"✅ Modèle '{model_data['nom']}' mis à jour")
            else:
                model_data["id"] = str(uuid.uuid4())
                model_data["created_at"] = now_iso()
                model_data["created_by"] = "admin"
                await db.doc_templates.insert_one(model_data)
                print(f"✅ Modèle '{model_data['nom']}' créé")
        except Exception as e:
            print(f"❌ Erreur sur le modèle '{model_data['nom']}': {e}")

    print("🎉 Tous les modèles ont été ajoutés/mis à jour avec succès!")


async def main():
    try:
        await seed_doc_templates()
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())