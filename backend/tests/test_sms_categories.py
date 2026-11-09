"""SMS activables par type (demande du 2026-11-09, budget limité) : par
défaut seuls les liens de paiement et les rappels de session partent."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from services.sms import sms_category_enabled  # noqa: E402


def test_valeurs_par_defaut():
    for c in ("lien_paiement", "convocation", "rappel_veille"):
        assert sms_category_enabled({}, c)
    for c in ("paiement_recu", "rdv_prospect", "documents"):
        assert not sms_category_enabled({}, c)
    assert sms_category_enabled({}, None)


def test_choix_des_parametres_prioritaire():
    s = {"sms_categories": {"rdv_prospect": True, "convocation": False}}
    assert sms_category_enabled(s, "rdv_prospect")
    assert not sms_category_enabled(s, "convocation")
    assert sms_category_enabled(s, "lien_paiement")
