"""Réception des leads Meta Lead Ads (formulaires "instant form" sur
Facebook/Instagram) via webhook — distinct du Pixel/CAPI (services/meta_capi.py,
tracking de conversion sortant). Ici on reçoit des leads entrants et on les
fait apparaître dans Prospects (db.leads), au même titre qu'un lead venu du
formulaire de contact du site.

Flux Meta : quand un utilisateur soumet un "instant form" publicitaire, Meta
notifie ce webhook avec juste un `leadgen_id` (POST) ; il faut ensuite
rappeler l'API Graph pour récupérer le détail du lead (nom, email,
téléphone, réponses aux questions du formulaire).

Endpoint public (pas d'authentification dashboard) — c'est Meta qui l'appelle
directement, comme le webhook Stripe (routers/payments.py). La vérification
se fait autrement : handshake hub.challenge (GET) puis signature
X-Hub-Signature-256 sur chaque notification (POST)."""
import hashlib
import hmac
import logging

import requests
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse

from core.config import META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN
from routers.leads import create_lead_from_contact

router = APIRouter(prefix="/webhooks/meta", tags=["meta-leads"])
logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v20.0"


@router.get("")
async def verify_webhook(request: Request):
    """Handshake initial demandé par Meta lors de la configuration du
    webhook (Meta for Developers > Webhooks > Souscrire)."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")
    if mode == "subscribe" and token and META_WEBHOOK_VERIFY_TOKEN and token == META_WEBHOOK_VERIFY_TOKEN:
        return PlainTextResponse(challenge or "")
    raise HTTPException(status_code=403, detail="Vérification du webhook échouée")


def _verify_signature(raw_body: bytes, signature_header: str) -> bool:
    if not META_APP_SECRET or not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(META_APP_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.split("=", 1)[1])


def _fetch_lead_details(leadgen_id: str) -> dict:
    """Appelle l'API Graph pour récupérer le détail d'un lead à partir de
    son identifiant (le webhook ne transmet que ça)."""
    resp = requests.get(
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/{leadgen_id}",
        params={
            "access_token": META_PAGE_ACCESS_TOKEN,
            "fields": "field_data,form_id,ad_id,ad_name,campaign_name,created_time",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def _extract_fields(field_data: list) -> dict:
    """Les questions d'un formulaire Meta varient (nom parfois en un seul
    champ "full_name", parfois "first_name"/"last_name" séparés ; questions
    personnalisées type "quelle formation vous intéresse ?") — on mappe les
    noms de champs connus et on garde tout le reste en note plutôt que de le
    perdre silencieusement."""
    values = {}
    for f in field_data or []:
        key = (f.get("name") or "").lower()
        vals = f.get("values") or []
        values[key] = vals[0] if vals else ""

    name = values.get("full_name") or " ".join(
        p for p in [values.get("first_name"), values.get("last_name")] if p
    ).strip()
    email = values.get("email")
    phone = values.get("phone_number") or values.get("phone")

    known = {"full_name", "first_name", "last_name", "email", "phone_number", "phone"}
    extra_notes = "\n".join(f"{k} : {v}" for k, v in values.items() if k not in known and v)

    return {"name": name, "email": email, "phone": phone, "notes": extra_notes}


@router.post("")
async def receive_lead_notification(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    if not _verify_signature(raw_body, signature):
        logger.warning("Webhook Meta : signature invalide, notification ignorée")
        raise HTTPException(status_code=403, detail="Signature invalide")

    payload = await request.json()
    created = 0
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                continue
            value = change.get("value", {})
            leadgen_id = value.get("leadgen_id")
            if not leadgen_id:
                continue
            try:
                detail = _fetch_lead_details(leadgen_id)
            except Exception as e:
                logger.error(f"Échec de récupération du lead Meta {leadgen_id} : {e}")
                continue

            parsed = _extract_fields(detail.get("field_data", []))
            if not parsed["email"] and not parsed["phone"]:
                logger.warning(f"Lead Meta {leadgen_id} sans email ni téléphone, ignoré")
                continue

            interest = detail.get("form_name") or detail.get("campaign_name") or ""
            lead = await create_lead_from_contact(
                name=parsed["name"],
                email=parsed["email"],
                phone=parsed["phone"],
                interest=interest,
                notes=parsed["notes"],
                source="meta",
                from_meta_ads=True,
            )
            if lead:
                created += 1

    return {"ok": True, "leads_created": created}
