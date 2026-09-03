from typing import Optional
from pydantic import BaseModel


class SettingsIn(BaseModel):
    """Tous les champs sont Optional[...] = None (et non des chaînes vides) :
    PUT /settings ne met à jour que les champs réellement envoyés, pour ne
    jamais écraser silencieusement le reste de la config (ex: un appel qui
    n'envoie que 2 champs ne doit pas réinitialiser les autres)."""
    stripe_public_key: Optional[str] = None
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    email_provider: Optional[str] = None
    email_api_key: Optional[str] = None
    email_from: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_tls: Optional[bool] = None
    resend_fallback_api_key: Optional[str] = None
    brevo_fallback_api_key: Optional[str] = None
    n8n_webhook_inscription: Optional[str] = None
    n8n_webhook_dossier: Optional[str] = None
    n8n_webhook_payment: Optional[str] = None
    trello_board_id: Optional[str] = None
    google_analytics_id: Optional[str] = None
    plausible_domain: Optional[str] = None
    meta_pixel_id: Optional[str] = None
    meta_conversion_api_token: Optional[str] = None
    public_base_url: Optional[str] = None
    limova_api_key: Optional[str] = None
    limova_phone_agent_id: Optional[str] = None
    limova_marketing_agent_id: Optional[str] = None

    # Attestation de suivi de stage de récupération de points (voir
    # services/pdf.py:generate_stage_recup_points_attestation) — identité du
    # centre + signataires par défaut (directeur, psychologue). La signature
    # de l'animateur BAFM n'est pas ici : elle vient de son propre compte
    # (voir POST /me/signature), assignée dynamiquement via le stage.
    attestation_centre_nom: Optional[str] = None
    attestation_centre_adresse: Optional[str] = None
    attestation_centre_ville: Optional[str] = None
    attestation_centre_siret: Optional[str] = None
    attestation_directeur_nom: Optional[str] = None
    attestation_agrement_numero: Optional[str] = None
    attestation_psychologue_nom: Optional[str] = None
    attestation_psychologue_numero: Optional[str] = None


class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: Optional[str] = "general"
