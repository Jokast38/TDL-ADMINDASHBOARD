"""Stages de récupération de points : 8h00-16h00 par défaut, et la
convocation / le rappel annoncent cet horaire avec l'heure d'arrivée
(demande du 2026-11-09 : des élèves arrivaient en retard)."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "test")

from core.stage_hours import default_hours, is_recup, stage_hours  # noqa: E402
from services.candidate_automation import convocation_message, convocation_sms  # noqa: E402

RECUP = {"formation_titre": "Récupération points de permis", "date_debut": "2026-11-16", "date_fin": "2026-11-17",
         "lieu_adresse": "59 avenue Joffre", "lieu_ville": "Épinay-sur-Seine", "heure_debut": "08:00", "heure_fin": "16:00"}
INSC = {"student_name": "Karim"}


def test_horaires_par_defaut():
    assert default_hours("PERMIS") == ("08:00", "16:00")
    assert default_hours("VTC_TAXI") == ("09:00", "17:00")
    assert is_recup({"formation_titre": "Récupération points de permis"})
    assert not is_recup({"formation_titre": "Formation VTC"})
    sans_heures = {k: v for k, v in RECUP.items() if not k.startswith("heure")}
    assert stage_hours(sans_heures) == ("08:00", "16:00")


def test_convocation_recup_annonce_8h_et_l_arrivee():
    msg = convocation_message({**RECUP, "formation_category": "PERMIS"}, INSC)
    assert "Horaires : de 8h à 16h" in msg
    assert "commence à 8h précises" in msg and "dès 7h45" in msg
    sms = convocation_sms(RECUP, INSC)
    assert "à 8h PRÉCISES" in sms and "dès 7h45" in sms and "Retards non tolérés" in sms
    assert "LES RETARDS NE SONT PAS TOLÉRÉS" in msg


def test_autres_formations_inchangees():
    vtc = {**RECUP, "formation_titre": "Formation VTC", "heure_debut": "09:00", "heure_fin": "17:00"}
    msg = convocation_message({**vtc, "formation_category": "CACES"}, INSC)
    assert "de 9h à 17h" in msg and "précises" not in msg
