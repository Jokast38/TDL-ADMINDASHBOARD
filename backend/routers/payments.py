import logging
from fastapi import APIRouter, Depends, HTTPException, Request

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import PUBLIC_FRONTEND_URL
from models.payment import PaymentToggleIn, CheckoutIn
from services import stripe_service
from services.meta_capi import send_capi_event

router = APIRouter(prefix="/payments", tags=["payments"])
log = logging.getLogger(__name__)

# Chaque landing page qui vend en direct (paiement Stripe sans passer par
# /inscription) a besoin d'une page de remerciement dédiée en retour de Stripe
# — sans ça, l'utilisateur atterrit sur /inscription qui ignore tout du
# tunnel d'origine, et aucun événement Purchase (pixel/CAPI) ne peut s'y
# rattacher correctement. Étendre ce dict pour toute nouvelle landing page
# vendant en direct (voir StripeCheckout.jsx / StageLandingPage.jsx).
_LANDING_THANK_YOU_PATHS = {
    "stage_recuperation_points": "/stage-recuperation-points/merci",
}


async def _settings() -> dict:
    return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}


@router.get("/status")
async def payments_status(user: dict = Depends(require_role("admin", "employe"))):
    s = await _settings()
    return {"configured": await stripe_service.is_configured(), "enabled": bool(s.get("payments_enabled"))}


@router.get("/public-status")
async def payments_public_status():
    """Endpoint public (page d'inscription non authentifiée) — ne renvoie
    qu'un booléen, jamais de clé ni d'info sensible."""
    s = await _settings()
    return {"enabled": bool(s.get("payments_enabled")) and await stripe_service.is_configured()}


@router.put("/toggle")
async def toggle_payments(payload: PaymentToggleIn, user: dict = Depends(require_role("admin"))):
    await db.settings.update_one(
        {"id": "global"}, {"$set": {"payments_enabled": payload.enabled, "updated_at": now_iso()}}, upsert=True
    )
    return await payments_status(user)


@router.post("/checkout")
async def create_checkout(payload: CheckoutIn, request: Request):
    """Public — appelé depuis la page d'inscription (étudiant non connecté)."""
    s = await _settings()
    if not s.get("payments_enabled"):
        raise HTTPException(status_code=400, detail="Le paiement en ligne n'est pas activé pour le moment")

    inscription = await db.inscriptions.find_one({"id": payload.inscription_id}, {"_id": 0})
    if not inscription:
        raise HTTPException(status_code=404, detail="Inscription introuvable")

    formation = await db.formations.find_one({"id": inscription["formation_id"]}, {"_id": 0})
    if formation and formation.get("cpf_eligible"):
        raise HTTPException(status_code=400, detail="Cette formation est éligible CPF — le paiement en ligne n'est pas proposé")

    if inscription.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Cette inscription est déjà payée")

    thank_you_path = _LANDING_THANK_YOU_PATHS.get(inscription.get("source"))
    if thank_you_path:
        import urllib.parse
        session_q = urllib.parse.quote(inscription.get("session") or "")
        success_url = f"{PUBLIC_FRONTEND_URL}{thank_you_path}?inscription={inscription['id']}&value={inscription.get('price', 0)}&session={session_q}"
        cancel_url = f"{PUBLIC_FRONTEND_URL}{thank_you_path.rsplit('/', 1)[0]}?paiement=annule&inscription={inscription['id']}"
    else:
        success_url = f"{PUBLIC_FRONTEND_URL}/inscription?paiement=succes&inscription={inscription['id']}"
        cancel_url = f"{PUBLIC_FRONTEND_URL}/inscription?paiement=annule&inscription={inscription['id']}"

    try:
        session = await stripe_service.create_checkout_session(inscription, payload.allow_klarna, success_url, cancel_url)
    except stripe_service.StripeNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # On remonte le message Stripe réel (ex: Klarna non activé sur le compte,
        # montant hors plage éligible...) plutôt qu'un message générique — sans
        # ça, impossible de diagnostiquer une erreur de configuration Stripe.
        detail = getattr(e, "user_message", None) or str(e)
        log.warning(f"Stripe checkout error: {detail}")
        raise HTTPException(status_code=502, detail=f"Erreur Stripe : {detail}")

    await db.inscriptions.update_one(
        {"id": inscription["id"]},
        {"$set": {
            "payment_status": "processing", "stripe_session_id": session.id,
            "allow_klarna": payload.allow_klarna, "updated_at": now_iso(),
            # Capturés ici (requête directe du navigateur) car le webhook Stripe
            # qui confirme le paiement est un appel serveur-à-serveur sans accès
            # à ce contexte — nécessaires à l'évènement Purchase CAPI pour une
            # bonne qualité de correspondance (voir services/meta_capi.py).
            "checkout_client_ip": (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else None),
            "checkout_user_agent": request.headers.get("user-agent"),
        }},
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = await stripe_service.construct_webhook_event(payload, sig_header)
    except stripe_service.StripeNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.warning(f"Stripe webhook signature invalide: {e}")
        raise HTTPException(status_code=400, detail="Signature invalide")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        inscription_id = (session.get("metadata") or {}).get("inscription_id")
        if inscription_id:
            amount_paid = (session.get("amount_total") or 0) / 100
            await db.inscriptions.update_one(
                {"id": inscription_id},
                {"$set": {
                    "payment_status": "paid", "amount_paid": amount_paid,
                    "stripe_payment_intent": session.get("payment_intent"), "paid_at": now_iso(),
                    "updated_at": now_iso(),
                }},
            )
            inscription = await db.inscriptions.find_one({"id": inscription_id}, {"_id": 0})
            if inscription:
                await send_capi_event(
                    "Purchase",
                    # ID déterministe à partir de l'inscription — le pixel navigateur
                    # (StageRecuperationMerci.jsx) calcule le même `purchase_{id}`
                    # indépendamment, ce qui suffit à Meta pour dédupliquer les deux
                    # évènements sans aucune coordination réseau entre les deux.
                    event_id=f"purchase_{inscription_id}",
                    email=inscription.get("student_email"),
                    phone=inscription.get("student_phone"),
                    custom_data={"value": amount_paid, "currency": "EUR", "content_name": inscription.get("source") or "inscription_formation"},
                    event_source_url=inscription.get("landing_url") or f"{PUBLIC_FRONTEND_URL}/inscription",
                    client_ip_address=inscription.get("checkout_client_ip"),
                    client_user_agent=inscription.get("checkout_user_agent"),
                )
    elif event["type"] in ("checkout.session.expired",):
        session = event["data"]["object"]
        inscription_id = (session.get("metadata") or {}).get("inscription_id")
        if inscription_id:
            await db.inscriptions.update_one(
                {"id": inscription_id, "payment_status": "processing"},
                {"$set": {"payment_status": "pending", "updated_at": now_iso()}},
            )

    return {"received": True}
