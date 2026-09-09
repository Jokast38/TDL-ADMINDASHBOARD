from typing import Optional, Dict, List
from pydantic import BaseModel


class PositioningTestIn(BaseModel):
    stagiaire_nom: str
    stagiaire_email: Optional[str] = None  # si renseigné, le lien est aussi envoyé par email
    category: Optional[str] = "VTC_TAXI"  # thématise la 1re question — voir services/positioning_test_data.py
    session: Optional[str] = ""
    evaluateur: Optional[str] = ""
    inscription_id: Optional[str] = None


class PositioningTestSendIn(BaseModel):
    email: Optional[str] = None  # sinon, utilise stagiaire_email déjà enregistré


class PositioningTestSubmitIn(BaseModel):
    answers: Dict[str, str]  # {"0": "Transport public particulier de personnes", ...}
    reponse_q17: Optional[str] = ""
    domaines_a_renforcer: List[str] = []
