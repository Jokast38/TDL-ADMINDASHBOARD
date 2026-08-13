from typing import Optional
from pydantic import BaseModel


class PaymentToggleIn(BaseModel):
    enabled: bool


class CheckoutIn(BaseModel):
    inscription_id: str
    # Propose Klarna (paiement en plusieurs fois) en plus de la carte —
    # Klarna décide lui-même du nombre de fois (3x/4x) selon l'éligibilité.
    allow_klarna: bool = False
    # Cookies posés par le pixel Meta (voir lib/metaPixel.js getFbCookies) —
    # capturés ici (requête directe du navigateur) pour être réutilisés par
    # le webhook Stripe lors de l'évènement Purchase CAPI, qui lui n'a aucun
    # accès au navigateur (appel serveur-à-serveur de Stripe).
    fbc: Optional[str] = None
    fbp: Optional[str] = None
