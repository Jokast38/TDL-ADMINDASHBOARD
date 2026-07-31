from typing import Optional
from pydantic import BaseModel


class CallbackRequestIn(BaseModel):
    prenom: str
    nom: str
    telephone: str
    email: Optional[str] = ""
    message: Optional[str] = ""
    session: Optional[str] = ""
    source: Optional[str] = "offre_fidelite"
    # Catégorie de formation concernée (CACES, PERMIS, AUTO_ECOLE, SSIAP,
    # VTC_TAXI, ECSR, VENTE) — si la landing page ne la précise pas
    # explicitement, elle est déduite de `source` (voir routers/callback.py).
    interest: Optional[str] = None
    center: Optional[str] = None


class CallbackRequestUpdate(BaseModel):
    handled: Optional[bool] = None
    notes: Optional[str] = None
