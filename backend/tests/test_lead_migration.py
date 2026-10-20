"""Tests unitaires de la logique pure d'unification des prospects (Phase 1),
sans accès base — voir services/lead_migration.py et scripts/
migrate_leads_unified.py. Couvre : correspondance des statuts (priorité aux
faits + anciens statuts + conflits), normalisation téléphone/email,
fusion de doublons, prix effectif, détection des fiches de test."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.lead_migration import (
    normalize_phone_e164_fr, normalize_email, is_test_record, pick_legacy_value,
    map_legacy_status, status_from_facts, compute_prix_effectif, relancer_le_from_days,
    merge_duplicate_docs, INJOIGNABLE_THRESHOLD,
)


class TestNormalizePhone:
    def test_numero_francais_classique(self):
        assert normalize_phone_e164_fr("0612345678") == "+33612345678"

    def test_avec_espaces_et_points(self):
        assert normalize_phone_e164_fr("06 12 34 56 78") == "+33612345678"
        assert normalize_phone_e164_fr("06.12.34.56.78") == "+33612345678"

    def test_deja_e164(self):
        assert normalize_phone_e164_fr("+33612345678") == "+33612345678"

    def test_prefixe_0033(self):
        assert normalize_phone_e164_fr("0033612345678") == "+33612345678"

    def test_invalide(self):
        assert normalize_phone_e164_fr("abc") is None
        assert normalize_phone_e164_fr("") is None
        assert normalize_phone_e164_fr(None) is None
        assert normalize_phone_e164_fr("123") is None


class TestNormalizeEmail:
    def test_minuscule_et_sans_espaces(self):
        assert normalize_email(" Jean.Dupont@Example.com ") == "jean.dupont@example.com"

    def test_vide(self):
        assert normalize_email("") is None
        assert normalize_email(None) is None


class TestIsTestRecord:
    def test_nom_contient_test(self):
        assert is_test_record("Test User", "x@y.com") is True

    def test_email_contient_test(self):
        assert is_test_record("Jean Dupont", "test123@gmail.com") is True

    def test_domaine_interne(self):
        assert is_test_record("Jean Dupont", "jean@tdl-formation.fr") is True

    def test_personne_reelle(self):
        assert is_test_record("Jean Dupont", "jean.dupont@gmail.com") is False


class TestPickLegacyValue:
    def test_un_seul_champ(self):
        v, field, conflict, candidates = pick_legacy_value({"status": "nouveau"})
        assert v == "nouveau" and field == "status" and conflict is False

    def test_aucun_champ(self):
        v, field, conflict, candidates = pick_legacy_value({})
        assert v is None and field is None and conflict is False

    def test_plusieurs_champs_memes_cible_pas_de_conflit(self):
        # qualification="a_contacter" et status="nouveau" mappent tous les
        # deux vers a_contacter : pas un vrai conflit.
        v, field, conflict, candidates = pick_legacy_value({"status": "nouveau", "qualification": "a_contacter"})
        assert conflict is False

    def test_conflit_reel(self):
        # pipeline_status="poubelle" (-> non_interesse) vs status="nouveau" (-> a_contacter)
        v, field, conflict, candidates = pick_legacy_value({"status": "nouveau", "pipeline_status": "poubelle"})
        assert conflict is True
        assert field == "pipeline_status"  # le plus avancé l'emporte
        assert len(candidates) == 2


class TestMapLegacyStatus:
    def test_lead_tiede(self):
        r = map_legacy_status("lead_tiede")
        assert r == {"statut": "a_relancer", "chaleur": "tiede", "motif_cloture": None, "relancer_le_jours": 7}

    def test_a_relancer_1_an(self):
        r = map_legacy_status("a_relancer_1_an")
        assert r["statut"] == "a_relancer" and r["relancer_le_jours"] == 365

    def test_interesse_devient_chaud(self):
        r = map_legacy_status("interesse")
        assert r["statut"] == "a_relancer" and r["chaleur"] == "chaud"

    def test_poubelle(self):
        r = map_legacy_status("poubelle")
        assert r["statut"] == "non_interesse" and r["motif_cloture"] == "poubelle"

    def test_pas_interesse_motif_refus(self):
        r = map_legacy_status("pas_interesse")
        assert r["statut"] == "non_interesse" and r["motif_cloture"] == "refus"

    def test_inconnu_repli_a_contacter(self):
        r = map_legacy_status("valeur_inexistante")
        assert r["statut"] == "a_contacter"


class TestStatusFromFacts:
    def test_priorite_paiement(self):
        r = status_from_facts(True, True, True, 10)
        assert r["statut"] == "paye"

    def test_priorite_inscription_active(self):
        r = status_from_facts(False, True, True, 10)
        assert r["statut"] == "inscrit"

    def test_priorite_rdv_futur(self):
        r = status_from_facts(False, False, True, 0)
        assert r["statut"] == "rendez_vous"

    def test_injoignable_au_seuil(self):
        r = status_from_facts(False, False, False, INJOIGNABLE_THRESHOLD)
        assert r["statut"] == "injoignable"

    def test_sous_le_seuil_aucun_fait(self):
        assert status_from_facts(False, False, False, INJOIGNABLE_THRESHOLD - 1) is None

    def test_aucun_fait(self):
        assert status_from_facts(False, False, False, 0) is None


class TestPrixEffectif:
    def test_prix_personnalise_prioritaire(self):
        assert compute_prix_effectif(150, 220, 300) == 150

    def test_prix_grille_si_pas_de_personnalise(self):
        assert compute_prix_effectif(None, 220, 300) == 220

    def test_prix_catalogue_en_dernier_recours(self):
        assert compute_prix_effectif(None, None, 300) == 300

    def test_prix_zero_personnalise_est_valide(self):
        # 0 est une valeur explicite (ex: offerte), pas "absente" — ne doit
        # pas retomber sur la grille/le catalogue.
        assert compute_prix_effectif(0, 220, 300) == 0


class TestRelancerLe:
    def test_aucun_delta(self):
        assert relancer_le_from_days(None) is None

    def test_delta_jours(self):
        from datetime import datetime, timezone
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        assert relancer_le_from_days(7, now) == "2026-01-08"
        assert relancer_le_from_days(365, now) == "2027-01-01"


class TestMergeDuplicateDocs:
    def test_valeur_non_vide_la_plus_recente_gagne(self):
        docs = [
            {"id": "1", "_origin": "leads", "name": "Jean", "notes": "", "updated_at": "2026-01-01", "sources": ["site_web"]},
            {"id": "2", "_origin": "meta", "name": "Jean D.", "notes": "intéressé par VTC", "updated_at": "2026-02-01", "sources": ["meta"]},
        ]
        merged = merge_duplicate_docs(docs)
        assert merged["name"] == "Jean D."  # doc le plus récent
        assert merged["notes"] == "intéressé par VTC"  # seul doc à avoir une valeur non vide

    def test_sources_toujours_cumulees(self):
        docs = [
            {"id": "1", "_origin": "leads", "updated_at": "2026-01-01", "sources": ["site_web"], "compte_meta": None},
            {"id": "2", "_origin": "meta", "updated_at": "2026-02-01", "sources": ["meta"], "compte_meta": "TDL Ads"},
        ]
        merged = merge_duplicate_docs(docs)
        assert set(merged["sources"]) == {"site_web", "meta"}

    def test_legacy_ids_conserves(self):
        docs = [
            {"id": "lead-1", "_origin": "leads", "updated_at": "2026-01-01"},
            {"id": "meta-9", "_origin": "meta_lead_imports", "updated_at": "2026-02-01"},
        ]
        merged = merge_duplicate_docs(docs)
        assert merged["legacy_ids"] == {"leads": "lead-1", "meta_lead_imports": "meta-9"}
