"""Page "Paiement personnalisé" — permet à un agent d'envoyer par email un
lien de paiement Stripe à prix libre (intitulé + montant choisis à la main),
sans passer par le tunnel d'inscription standard (toujours au tarif
catalogue d'une formation). Utile pour un solde, des frais additionnels, ou
toute demande de paiement ad hoc.

Suivi dans sa propre collection (db.custom_payments), marquée payée par le
même webhook Stripe que les inscriptions (voir routers/payments.py), via
metadata.custom_payment_id plutôt que inscription_id."""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.config import ROLES_LEADS, PUBLIC_FRONTEND_URL
from core.utils import now_iso
from models.custom_payment import CustomPaymentIn
from services import stripe_service
from services.email import send_email
from services.email_template import render_branded_email

router = APIRouter(prefix="/custom-payments", tags=["custom-payments"])


@router.get("")
async def list_custom_payments(user: dict = Depends(require_role(*ROLES_LEADS))):
    return await db.custom_payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("")
async def create_custom_payment(payload: CustomPaymentIn, user: dict = Depends(require_role(*ROLES_LEADS))):
    amount_cents = round(payload.price * 100)
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Le prix doit être supérieur à 0")

    payment_id = str(uuid.uuid4())
    success_url = f"{PUBLIC_FRONTEND_URL}/?paiement=succes"
    cancel_url = f"{PUBLIC_FRONTEND_URL}/?paiement=annule"

    try:
        session = await stripe_service.create_custom_checkout_session(
            payload.title, amount_cents, payload.recipient_email, payment_id, success_url, cancel_url,
        )
    except stripe_service.StripeNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    doc = {
        "id": payment_id, "title": payload.title, "price": payload.price,
        "recipient_name": payload.recipient_name, "recipient_email": payload.recipient_email,
        "stripe_session_id": session.id, "stripe_url": session.url,
        "status": "pending", "created_by": user["id"], "created_at": now_iso(),
        "paid_at": None,
    }
    await db.custom_payments.insert_one(doc)

    body = render_branded_email(
        f"Bonjour {payload.recipient_name or ''},\n\n"
        f"Voici votre lien de paiement pour « {payload.title} » — montant : {payload.price:.2f} €.\n\n"
        "Cliquez sur le bouton ci-dessous pour régler en ligne par carte bancaire, en toute sécurité via Stripe.",
        "Payer maintenant", session.url,
    )
    await send_email(payload.recipient_email, f"Paiement — {payload.title}", body)

    doc.pop("_id", None)
    return doc
