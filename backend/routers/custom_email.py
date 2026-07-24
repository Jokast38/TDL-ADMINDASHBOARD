import base64
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from core.security import require_role
from core.config import ROLES_LEADS
from services.email import send_email
from services.email_template import render_branded_email

router = APIRouter(prefix="/email", tags=["custom-email"])

MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/send-custom")
async def send_custom_email(
    to: str = Form(...),
    subject: str = Form(...),
    message: str = Form(...),
    button_text: Optional[str] = Form(None),
    button_url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(require_role(*ROLES_LEADS)),
):
    """Composeur d'email libre : l'utilisateur ne saisit que le sujet, le
    message (texte simple) et éventuellement un bouton de redirection et une
    pièce jointe — le HTML de marque (logo, couleurs, pied de page TDL) est
    généré automatiquement, jamais exposé à l'utilisateur."""
    if not to.strip() or not subject.strip() or not message.strip():
        raise HTTPException(status_code=400, detail="Destinataire, objet et message sont requis")
    if (button_text and not button_url) or (button_url and not button_text):
        raise HTTPException(status_code=400, detail="Le bouton nécessite un texte et une URL")

    attachment = None
    if file is not None:
        data = await file.read()
        if len(data) > MAX_ATTACHMENT_SIZE:
            raise HTTPException(status_code=400, detail="Pièce jointe trop volumineuse (max 10MB)")
        attachment = {
            "filename": file.filename or "piece-jointe",
            "content_b64": base64.b64encode(data).decode("ascii"),
        }

    html_body = render_branded_email(message, button_text, button_url)
    log = await send_email(
        to.strip(), subject.strip(), html_body,
        extra={"sent_by": user["id"], "custom_compose": True},
        attachment=attachment,
    )
    if log["status"] not in ("sent", "mocked"):
        raise HTTPException(status_code=502, detail=f"Échec de l'envoi : {log['status']}")
    return {"ok": True, "status": log["status"]}
