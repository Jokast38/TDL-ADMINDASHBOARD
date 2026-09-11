from typing import List, Optional
from pydantic import BaseModel


class FrenchTestIn(BaseModel):
    stagiaire_nom: str
    stagiaire_email: Optional[str] = None  # si renseigné, le lien est aussi envoyé par email
    category: str  # thème du test — voir services/french_test_data.py
    session: Optional[str] = ""
    evaluateur: Optional[str] = ""
    inscription_id: Optional[str] = None


class FrenchTestSendIn(BaseModel):
    email: Optional[str] = None  # sinon, utilise stagiaire_email déjà enregistré


class FrenchTestSubmitIn(BaseModel):
    redaction: str = ""
    qcm_answers: dict = {}  # {"0": "3 personnes", ...} indexé par position de question
    calcul_answers: dict = {}  # {"0": "36", ...} indexé par position de calcul
    phrases_reponses: List[str] = []  # phrase remise en ordre par le candidat, même index que "phrases"


class FrenchTestEvaluationIn(BaseModel):
    # "bases_fragiles" | "intermediaire" | "satisfaisant" — même échelle que
    # la partie évaluateur du PDF (voir _build_result_html).
    niveau: Optional[str] = None
    adaptation: Optional[str] = None  # "renforcement_cible" | "parcours_standard"
    notes: Optional[str] = ""
