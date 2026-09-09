from typing import Optional
from pydantic import BaseModel


class SatisfactionResponseIn(BaseModel):
    inscription_id: str
    type: str  # "chaud" | "froid"
    answers: dict
    commentaire: Optional[str] = ""
