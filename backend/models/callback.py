from typing import Optional
from pydantic import BaseModel


class CallbackRequestIn(BaseModel):
    prenom: str
    nom: str
    telephone: str
    session: Optional[str] = ""
    source: Optional[str] = "offre_fidelite"


class CallbackRequestUpdate(BaseModel):
    handled: Optional[bool] = None
    notes: Optional[str] = None
