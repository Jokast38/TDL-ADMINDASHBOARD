"""Attestation individuelle de formation CACES® R.489 et téléchargement des
grilles depuis la page CACES (demande du 2026-11-16)."""
import asyncio
import io
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from fastapi import HTTPException  # noqa: E402

from routers import caces_attestations as ca  # noqa: E402
from services import caces_attestation_pdf as pdf  # noqa: E402

BASE = {
    "civilite": "M.", "nom": "Dupont", "prenom": "Jean", "date_naissance": "01/03/1990",
    "categories": ["5", "1B", "3"], "lieu": "59 avenue Joffre, 93800 Épinay-sur-Seine",
    "date_debut": "2026-12-07", "date_fin": "2026-12-11", "duree_heures": 35,
    "formateur_nom": "Anas", "resultat": "atteints", "resultat_detail": "",
    "signataire_nom": "TAFIAL RODDY", "signataire_qualite": "Directeur",
    "lieu_signature": "Épinay-sur-Seine", "date_emission": "2026-12-11",
}


def test_outils_de_pre_remplissage():
    assert ca.split_name("Jean DUPONT") == ("DUPONT", "Jean")
    assert ca.split_name("DUPONT Jean Marc") == ("DUPONT", "Jean Marc")
    assert ca.split_name("Jean Dupont") == ("Dupont", "Jean")
    assert ca.categories_of_title("CACES R489 Cat. 3 - Chariot élévateur") == ["3"]
    assert ca.categories_of_title("CACES R489 catégories 1B, 3 et 5") == ["1B", "3", "5"]
    assert ca.categories_of_title("CACES R486 Cat. B - Nacelle") == []
    assert ca.date_label("2026-12-01") == "1er décembre 2026"
    assert ca.date_label("01/03/1990") == "1er mars 1990"
    assert ca.date_label("") == ""


def test_controle_de_la_saisie():
    data = ca._check(ca.AttestationFormationIn(**BASE))
    assert data["categories"] == ["1B", "3", "5"]  # ordre de la R.489
    for patch, msg in (
        ({"formateur_nom": "  "}, "formateur"),
        ({"categories": []}, "catégorie"),
        ({"categories": ["3", "9"]}, "catégorie"),
        ({"date_fin": "2026-12-01"}, "avant"),
        ({"date_emission": "2026-12-10"}, "issue de la formation"),
        ({"date_naissance": "pas une date"}, "naissance"),
    ):
        with pytest.raises(HTTPException) as e:
            ca._check(ca.AttestationFormationIn(**{**BASE, **patch}))
        assert msg in e.value.detail


def _pdf_data():
    return {**BASE, "categories": ["1B", "3", "5"], "centre": dict(ca.CENTRE_PAR_DEFAUT),
            "date_naissance_label": "1er mars 1990", "date_debut_label": "7 décembre 2026",
            "date_fin_label": "11 décembre 2026", "date_emission_label": "11 décembre 2026",
            "duree_heures": 35.0, "nom": "DUPONT"}


def test_pdf_une_page_toutes_les_mentions_et_signature_recadree():
    import pymupdf
    raw = pdf.SIGNATURE_PAR_DEFAUT.read_bytes()
    out = pdf.attestation_formation_pdf(_pdf_data(), raw)
    d = pymupdf.open(stream=out, filetype="pdf")
    assert d.page_count == 1
    text = d[0].get_text()
    for needed in ("Attestation individuelle de formation", "TAFIAL RODDY", "M. DUPONT Jean", "né le 1er mars 1990",
                   "Catégorie 1B", "Catégorie 5", "du 7 décembre 2026 au 11 décembre 2026", "35 heures", "Anas",
                   "L.6313-1", "Objectifs atteints", "ne vaut pas CACES", "R.4323-56",
                   "Fait à Épinay-sur-Seine, le 11 décembre 2026", "11930882293",
                   "Cet enregistrement ne vaut pas agrément de l'État"):
        assert needed in text, needed
    # Signature : marges retirées, dans son cadre, sous le nom du signataire.
    from PIL import Image as PILImage
    cropped = PILImage.open(io.BytesIO(pdf.crop_signature(raw)))
    original = PILImage.open(io.BytesIO(raw))
    assert cropped.width < original.width * 0.85 and cropped.height < original.height * 0.85
    sig = [i["bbox"] for i in d[0].get_image_info() if i["bbox"][1] > 400]
    assert len(sig) == 1
    x0, y0, x1, y1 = sig[0]
    assert x1 - x0 <= pdf.SIGNATURE_MAX_W + 1 and y1 - y0 <= pdf.SIGNATURE_MAX_H + 1
    assert y1 - y0 > pdf.SIGNATURE_MAX_H * 0.9 or x1 - x0 > pdf.SIGNATURE_MAX_W * 0.9  # occupe le cadre
    nom = d[0].search_for("TAFIAL RODDY, Directeur")[-1]  # le cadre de signature, pas le corps
    assert y0 >= nom.y1 and abs((x0 + x1) / 2 - (nom.x0 + nom.x1) / 2) < 3  # centrée sous le nom
    assert y1 < d[0].rect.height - 1.9 * 28.35  # au-dessus du pied de page


def test_pdf_sans_signature_ni_date_de_naissance():
    import pymupdf
    data = {**_pdf_data(), "date_naissance_label": "", "civilite": "Mme", "prenom": "Awa"}
    d = pymupdf.open(stream=pdf.attestation_formation_pdf(data, None), filetype="pdf")
    text = d[0].get_text()
    assert d.page_count == 1 and "Mme DUPONT Awa" in text and "née" not in text


def test_grille_a_telecharger(monkeypatch):
    from routers import caces_exam

    questions = [{"theme": "generales", "enonce": f"Affirmation {i}", "reponse": bool(i % 2)} for i in range(1, 101)]

    class Coll:
        def find(self, q, _p=None):
            docs = [{"numero": n, "questions": questions} for n in q["numero"]["$in"] if n in ("1", "2")]

            class C:
                async def to_list(self, _n):
                    return docs
            return C()

    class Db:
        caces_theorie_grilles = Coll()
    monkeypatch.setattr(caces_exam, "db", Db)
    user = {"id": "u", "role": "admin"}
    r = asyncio.run(caces_exam.download_grille("1", False, user))
    assert r.media_type == "application/pdf" and "questionnaire_caces_grille_1" in r.headers["content-disposition"]
    import pymupdf
    text = "".join(p.get_text() for p in pymupdf.open(stream=r.body, filetype="pdf"))
    assert "Nom et prénom du candidat" in text and "Affirmation 100" in text
    r = asyncio.run(caces_exam.download_grille("1", False, user, feuille=True))
    assert "feuille_reponses_caces_grille_1" in r.headers["content-disposition"]
    r = asyncio.run(caces_exam.download_grille("toutes", True, user))
    assert "corrige_caces_grille_toutes" in r.headers["content-disposition"]
    with pytest.raises(HTTPException):
        asyncio.run(caces_exam.download_grille("3", False, user))  # grille vide
    with pytest.raises(HTTPException):
        asyncio.run(caces_exam.download_grille("9", False, user))


def test_duree_de_la_session():
    assert ca.duree_session({"date_debut": "2026-11-16", "date_fin": "2026-11-16", "heure_debut": "09:00", "heure_fin": "17:00"}) == 7
    assert ca.duree_session({"date_debut": "2026-11-16", "date_fin": "2026-11-20", "heure_debut": "09:00", "heure_fin": "17:00"}) == 35
    assert ca.duree_session(None) is None and ca.duree_session({"heure_debut": "09:00"}) is None


def test_adresse_factice_jamais_envoyee():
    from services.email import is_placeholder_email
    assert is_placeholder_email("cisse.bahamory@sans-email.invalid")
    assert not is_placeholder_email("anas.cuche@gmail.com") and not is_placeholder_email(None)


def test_creneaux_emargement():
    from services.emargement_creneaux_pdf import creneaux, feuille_pdf
    assert creneaux("09:00", "17:00") == [("Matin", "09h00 – 12h00"), ("Après-midi", "13h00 – 17h00")]
    assert creneaux("13:30", "17:00") == [("Journée", "13h30 – 17h00")]
    import pymupdf
    out = feuille_pdf(dict(ca.CENTRE_PAR_DEFAUT), "CACES R489 Cat. 3", "Lundi 16 novembre 2026", "Épinay", ["Anas"],
                      ["CISSE Bahamory", "MELOUTE Didier Jean-Marc"], "09:00", "17:00")
    d = pymupdf.open(stream=out, filetype="pdf")
    text = d[0].get_text()
    assert d.page_count == 1 and "09h00 – 12h00" in text and "13h00 – 17h00" in text and "(7 heures)" in text and "MELOUTE" in text
