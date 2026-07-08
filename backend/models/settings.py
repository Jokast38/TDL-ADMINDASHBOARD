from typing import Optional
from pydantic import BaseModel


class SettingsIn(BaseModel):
    """Tous les champs sont Optional[...] = None (et non des chaînes vides) :
    PUT /settings ne met à jour que les champs réellement envoyés, pour ne
    jamais écraser silencieusement le reste de la config (ex: un appel qui
    n'envoie que 2 champs ne doit pas réinitialiser les autres)."""
    stripe_public_key: Optional[str] = None
    stripe_secret_key: Optional[str] = None
    email_provider: Optional[str] = None
    email_api_key: Optional[str] = None
    email_from: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_tls: Optional[bool] = None
    resend_fallback_api_key: Optional[str] = None
    n8n_webhook_inscription: Optional[str] = None
    n8n_webhook_dossier: Optional[str] = None
    n8n_webhook_payment: Optional[str] = None
    trello_board_id: Optional[str] = None
    google_analytics_id: Optional[str] = None
    plausible_domain: Optional[str] = None
    public_base_url: Optional[str] = None


class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: Optional[str] = "general"
