"""Email de reprise de contact envoyé automatiquement au prospect dès que sa
qualification passe à "pas_de_reponse" — pour l'inviter lui-même à recontacter
l'équipe plutôt que de dépendre d'une nouvelle tentative d'appel. Partagé entre
Prospects/Cosmosia (routers/leads.py) et Prospects Meta
(routers/meta_lead_import.py), qui partagent les mêmes libellés de
qualification (voir routers.meta_lead_import.QUALIFICATION_LABELS)."""
from core.config import PUBLIC_FRONTEND_URL
from services.email import send_email
from services.email_template import render_branded_email

NO_RESPONSE_QUALIFICATION = "pas_de_reponse"


async def send_no_response_followup(name: str, email: str) -> None:
    if not email:
        return
    subject = "Nous n'avons pas réussi à vous joindre"
    body = render_branded_email(
        f"Bonjour {name or ''},\n\n"
        "Nous avons essayé de vous contacter récemment au sujet de votre demande, sans succès.\n\n"
        "Si vous êtes toujours intéressé(e), n'hésitez pas à reprendre contact avec notre équipe : "
        "nous serions ravis de répondre à vos questions et de vous accompagner dans votre projet de formation.",
        "Nous contacter", f"{PUBLIC_FRONTEND_URL}/contact",
    )
    await send_email(email, subject, body)
