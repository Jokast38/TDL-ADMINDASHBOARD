from typing import Optional
from pydantic import BaseModel


class ChatMessageIn(BaseModel):
    session_id: Optional[str] = None
    message: str


class LeadExtraction(BaseModel):
    """Schéma d'extraction demandé au modèle à chaque tour — fusionné (upsert,
    sans écraser par null) dans la collection leads existante."""
    intent: Optional[str] = None  # "renseignement" | "inscription"
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    formation: Optional[str] = None
    ville: Optional[str] = None
    cpf: Optional[bool] = None
    commentaire: Optional[str] = None
    lead_completed: bool = False
