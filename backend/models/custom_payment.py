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
    # Session choisie (date/lieu), facultative — affichée dans l'email pour
    # que le destinataire sache précisément à quelle session ce paiement se
    # rapporte (voir GET /stages/public/available, réutilisé par la page).
    session_label: Optional[str] = None
    # Lead d'origine quand ce lien est envoyé depuis un bouton "Envoyer un
    # lien de paiement" sur une liste de prospects (Leads.jsx, Marketing.jsx)
    # — pour relier ce paiement au prospect dans le bilan d'activité et
    # permettre une redirection vers sa fiche.
    lead_id: Optional[str] = None
