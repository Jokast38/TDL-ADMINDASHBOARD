from typing import Optional
from pydantic import BaseModel


class SlotGenerateIn(BaseModel):
    type: str  # "formation_pratique" | "examen_blanc"
    start_date: str  # YYYY-MM-DD, doit être un lundi
    formule: str  # "journee" (9h-17h, 1 semaine) | "soiree" (18h-21h, 2 semaines)
    department: Optional[str] = None


class SlotUnlock4thIn(BaseModel):
    student_id: str
    dossier_id: str


class SlotBookIn(BaseModel):
    dossier_id: str
