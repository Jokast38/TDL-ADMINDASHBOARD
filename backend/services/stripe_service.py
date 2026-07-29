import asyncio
import logging
from typing import Optional

import stripe

from core.database import db
from core.config import (
    STRIPE_SECRET_KEY as ENV_STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY as ENV_STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET as ENV_STRIPE_WEBHOOK_SECRET,
    PUBLIC_FRONTEND_URL,
)

logger = logging.getLogger(__name__)


class StripeNotConfigured(Exception):
    pass


async def _settings() -> dict:
    return await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}


async def secret_key() -> str:
    s = await _settings()
    key = s.get("stripe_secret_key") or ENV_STRIPE_SECRET_KEY
    if not key:
        raise StripeNotConfigured("Clé secrète Stripe non configurée (Paramètres → Stripe)")
    return key


async def webhook_secret() -> Optional[str]:
    s = await _settings()
    return s.get("stripe_webhook_secret") or ENV_STRIPE_WEBHOOK_SECRET


async def is_configured() -> bool:
    s = await _settings()
    return bool(s.get("stripe_secret_key") or ENV_STRIPE_SECRET_KEY)


# Paiement en plusieurs fois : via Klarna (Pay in 3/4), un vrai moyen de
# paiement Stripe à part entière (pas un paramètre caché sur les cartes) —
# Klarna gère lui-même l'échelonnement et le risque de crédit, rien à
# programmer côté relance de paiement. Doit être activé au préalable dans le
# Dashboard Stripe (Paramètres → Moyens de paiement → Klarna). Limité en
# pratique à des montants entre 1 € et 3000 € en France — toutes nos
# formations non-CPF sont dans cette plage.
async def create_checkout_session(
    inscription: dict, allow_klarna: bool, success_url: str, cancel_url: str,
) -> "stripe.checkout.Session":
    key = await secret_key()
    amount_cents = round(float(inscription.get("price") or 0) * 100)
    if amount_cents <= 0:
        raise ValueError("Cette formation n'a pas de tarif fixe (sur devis) — le paiement en ligne n'est pas proposé")

    payment_method_types = ["card"]
    if allow_klarna:
        payment_method_types.append("klarna")

    def _create():
        return stripe.checkout.Session.create(
            api_key=key,
            mode="payment",
            payment_method_types=payment_method_types,
            # Klarna exige l'adresse de facturation du client.
            billing_address_collection="required" if allow_klarna else "auto",
            customer_email=inscription.get("student_email"),
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {"name": inscription.get("formation_title", "Formation TDL")},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            metadata={"inscription_id": inscription["id"], "allow_klarna": str(allow_klarna)},
            success_url=success_url,
            cancel_url=cancel_url,
        )

    return await asyncio.to_thread(_create)


async def construct_webhook_event(payload: bytes, sig_header: str):
    key = await secret_key()
    secret = await webhook_secret()
    if not secret:
        raise StripeNotConfigured("Secret de webhook Stripe non configuré (Paramètres → Stripe)")

    def _construct():
        return stripe.Webhook.construct_event(payload, sig_header, secret, api_key=key)

    return await asyncio.to_thread(_construct)
