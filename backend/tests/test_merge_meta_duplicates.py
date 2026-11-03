"""Règle de fusion des doublons Prospects Meta — voir
scripts/merge_meta_duplicates.py."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))

from merge_meta_duplicates import legacy_wins, merged_fields
from services.lead_migration import statut_to_qualification

AVANT_FUSION = "2026-10-15T10:00:00+00:00"
APRES_FUSION = "2026-10-25T10:00:00+00:00"


def test_ancienne_ligne_modifiee_apres_la_fusion_l_emporte():
    assert legacy_wins({"qualified_at": APRES_FUSION}, {})
    assert legacy_wins({"notes_updated_at": APRES_FUSION}, {"qualified_at": AVANT_FUSION})


def test_modification_d_avant_la_fusion_deja_reprise():
    assert not legacy_wins({"qualified_at": AVANT_FUSION}, {})


def test_copie_retravaillee_plus_recemment_l_emporte():
    assert not legacy_wins({"qualified_at": APRES_FUSION}, {"notes_updated_at": "2026-10-30T10:00:00+00:00"})


def test_sans_trace_d_agent_on_ne_touche_a_rien():
    assert not legacy_wins({"qualification": "pas_de_reponse", "qualified_by_name": "Agent"}, {})


def test_reprise_de_la_qualification_et_des_notes():
    old = {"qualification": "interesse", "notes": "rappeler jeudi", "qualified_at": APRES_FUSION, "qualified_by_name": "Agent", "relance_count": 3}
    fields = merged_fields(old, {"statut": "a_relancer", "relance_count": 1})
    assert statut_to_qualification(fields) == "interesse"
    assert fields["notes"] == "rappeler jeudi" and fields["qualified_by_name"] == "Agent" and fields["relance_count"] == 3


def test_un_prospect_paye_n_est_jamais_retrograde():
    fields = merged_fields({"qualification": "pas_de_reponse", "qualified_at": APRES_FUSION}, {"statut": "paye"})
    assert "statut" not in fields
