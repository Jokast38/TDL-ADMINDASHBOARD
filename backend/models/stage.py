from typing import Optional
from pydantic import BaseModel


class StageIn(BaseModel):
    formation_id: str
    date_debut: str
    date_fin: str
    lieu_adresse: str
    lieu_ville: str
    capacite_max: int = 20
    animateur_id: Optional[str] = None
    notes: Optional[str] = ""


class StageUpdate(BaseModel):
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    lieu_adresse: Optional[str] = None
    lieu_ville: Optional[str] = None
    capacite_max: Optional[int] = None
    animateur_id: Optional[str] = None
    statut: Optional[str] = None
    notes: Optional[str] = None


class EmargementIn(BaseModel):
    stage_id: str
    inscription_id: str
    student_id: str
    student_name: str
    signature_data_url: str
    present: bool = True
    session_date: str
