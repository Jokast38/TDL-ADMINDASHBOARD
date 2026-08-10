from typing import Optional, Dict, List
from pydantic import BaseModel


class PositioningTestIn(BaseModel):
    stagiaire_nom: str
    session: Optional[str] = ""
    evaluateur: Optional[str] = ""
    inscription_id: Optional[str] = None


class PositioningTestSubmitIn(BaseModel):
    answers: Dict[str, str]  # {"0": "Transport public particulier de personnes", ...}
    reponse_q17: Optional[str] = ""
    domaines_a_renforcer: List[str] = []
