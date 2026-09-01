from typing import Optional
from pydantic import BaseModel


class ExamTheoriqueNotifyIn(BaseModel):
    result: str  # "reussi" | "echoue"


class ExamJourIn(BaseModel):
    date: str  # YYYY-MM-DD, reçue de l'agence


class ExamPratiqueIn(BaseModel):
    date: str  # YYYY-MM-DD
    department: Optional[str] = None


class ExamPratiqueResultIn(BaseModel):
    result: str  # "reussi" | "echoue"
    next_exam_date: Optional[str] = None  # date CMA suivante, renseignée en cas d'échec si déjà connue
