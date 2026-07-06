from typing import Optional
from pydantic import BaseModel


class SettingsIn(BaseModel):
    stripe_public_key: Optional[str] = ""
    stripe_secret_key: Optional[str] = ""
    email_provider: Optional[str] = "mock"
    email_api_key: Optional[str] = ""
    email_from: Optional[str] = "noreply@tdlformation.fr"
    smtp_host: Optional[str] = "smtp.gmail.com"
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = ""
    smtp_password: Optional[str] = ""
    smtp_tls: Optional[bool] = True
    n8n_webhook_inscription: Optional[str] = ""
    n8n_webhook_dossier: Optional[str] = ""
    n8n_webhook_payment: Optional[str] = ""
    trello_board_id: Optional[str] = ""
    google_analytics_id: Optional[str] = ""
    plausible_domain: Optional[str] = ""
    public_base_url: Optional[str] = ""


class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None
    context: Optional[str] = "general"
