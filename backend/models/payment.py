from typing import Optional
from pydantic import BaseModel


class PaymentToggleIn(BaseModel):
    enabled: bool


class CheckoutIn(BaseModel):
    inscription_id: str
    # Propose Klarna (paiement en plusieurs fois) en plus de la carte —
    # Klarna décide lui-même du nombre de fois (3x/4x) selon l'éligibilité.
    allow_klarna: bool = False
