from typing import Optional
from pydantic import BaseModel


class ElearningRegisterIn(BaseModel):
    """Inscription manuelle d'un apprenant e-learning depuis le dashboard (hors site
    public). elearning_tier obligatoire ici : le staff choisit le niveau directement,
    pas de passage par l'état 'en attente d'activation'."""
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    partner_code: Optional[str] = None
    elearning_tier: str  # "premium" | "standard"


class ElearningUpdateIn(BaseModel):
    elearning_tier: Optional[str] = None  # "premium" | "standard" | "uber"
    active: Optional[bool] = None
    reason: Optional[str] = None
