import secrets
import uuid
from datetime import datetime, timezone, timedelta

from core.database import db
from core.utils import now_iso
from core.config import PUBLIC_FRONTEND_URL
from services.email import send_email

RESET_TOKEN_TTL = timedelta(hours=2)


async def create_reset_token(user_id: str) -> str:
    """Génère un token de réinitialisation à usage unique, valable 2h. Les
    anciens tokens non utilisés du même utilisateur sont invalidés pour éviter
    qu'un lien plus ancien ne reste exploitable après une nouvelle demande."""
    await db.password_reset_tokens.update_many(
        {"user_id": user_id, "used": False}, {"$set": {"used": True}}
    )
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "token": token,
        "used": False,
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + RESET_TOKEN_TTL).isoformat(),
    })
    return token


async def send_password_setup_email(user: dict, password: str):
    """Email envoyé à la création d'un compte employé : identifiants de
    connexion + invitation à changer le mot de passe dès la première connexion."""
    login_url = f"{PUBLIC_FRONTEND_URL}/login"
    subject = "Votre accès à la plateforme TDL Formation"
    body = f"""
    <p>Bonjour {user['name']},</p>
    <p>Un compte vient d'être créé pour vous sur la plateforme interne TDL Formation.</p>
    <p>
      <b>Email :</b> {user['email']}<br>
      <b>Mot de passe temporaire :</b> {password}
    </p>
    <p>
      <a href="{login_url}" style="display:inline-block;padding:10px 20px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px;">
        Se connecter →
      </a>
    </p>
    <p>Pour votre sécurité, il vous sera demandé de choisir un nouveau mot de passe dès votre première connexion.</p>
    """
    await send_email(user["email"], subject, body)


async def send_reset_link_email(user: dict, token: str, triggered_by_admin: bool = False):
    """Email contenant le lien de réinitialisation de mot de passe (auto-service
    'mot de passe oublié', ou déclenché par un admin depuis la page Employés)."""
    reset_url = f"{PUBLIC_FRONTEND_URL}/reset-password?token={token}"
    subject = "Réinitialisation de votre mot de passe — TDL Formation"
    intro = (
        "Un administrateur a demandé la réinitialisation de votre mot de passe."
        if triggered_by_admin
        else "Vous avez demandé la réinitialisation de votre mot de passe."
    )
    body = f"""
    <p>Bonjour {user.get('name', '')},</p>
    <p>{intro}</p>
    <p>
      <a href="{reset_url}" style="display:inline-block;padding:10px 20px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px;">
        Choisir un nouveau mot de passe →
      </a>
    </p>
    <p>Ce lien est valable 2 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    """
    await send_email(user["email"], subject, body)
