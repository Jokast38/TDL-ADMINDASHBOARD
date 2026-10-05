from typing import Optional
from pydantic import BaseModel, EmailStr


class CustomPaymentIn(BaseModel):
    # Intitulé choisi par l'agent (nom de formation existant ou texte libre,
    # ex: "Solde CMA", "Frais supplémentaires") — affiché comme nom de
    # produit sur la session Stripe et dans l'email envoyé au prospect.
    title: str
    # Prix libre en euros (pas forcément le tarif catalogue d'une formation) —
    # c'est tout l'intérêt de cette page par rapport au tunnel d'inscription
    # standard, dont le prix est toujours celui de la formation.
    price: float
    recipient_name: Optional[str] = None
    recipient_email: EmailStr
