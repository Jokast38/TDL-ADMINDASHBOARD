"""Tests de la détection de ville des prospects Meta, sur des libellés tirés
des vraies campagnes — voir core/meta_ville.py."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.meta_ville import meta_ville, meta_ville_of, ville_in

EPINAY = "Épinay-sur-Seine"


def test_accents_tirets_et_majuscules():
    for text in ("Épinay", "épinay-sur-seine", "EPINAY_SUR_SEINE", "caces epinay", "ÉPINAY SUR SEINE (93)"):
        assert ville_in(text) == EPINAY
    assert ville_in("adset CREIL +15KM copy") == "Creil"


def test_les_deux_villes_ou_aucune():
    assert ville_in("Épinay ou Creil") is None
    assert ville_in("ENGHIEN +7 CREA STAT 1") is None


def test_question_du_formulaire():
    answers = {"pouvez-vous_participer_à_deux_journées_consécutives_à_épinay-sur-seine_?": "oui"}
    assert meta_ville(answers, campaign_name="ENGHIEN +7 CREA STAT 1") == EPINAY


def test_la_publicite_prime_sur_la_campagne():
    assert meta_ville(ad_name="crea stat prix | Épinay", campaign_name="ENGHIEN +7 CREA STAT 1") == EPINAY
    assert meta_ville(adset_name="adset CREIL +15KM copy", ad_name="crea stat creil ss prix", campaign_name="ENGHIEN +7 CREA STAT 1") == "Creil"
    assert meta_ville(adset_name="adset CREIL +15KM", campaign_name="CACES-EPINAY") == "Creil"


def test_campagne_en_dernier_recours():
    assert meta_ville(campaign_name="ABO-VTC-CREIL - Copie") == "Creil"
    assert meta_ville(campaign_name="saint denis +20 km CREA STAT 1") is None


def test_ancien_import_a_plat_et_prospect_avec_meta_details():
    assert meta_ville_of({"campaign_name": "ENGHIEN +7 CREA STAT 1", "ad_name": "crea stat prix | Épinay"}) == EPINAY
    assert meta_ville_of({"campagne": "x", "meta_details": {"adset_name": "adset vtc creil +15km"}}) == "Creil"
