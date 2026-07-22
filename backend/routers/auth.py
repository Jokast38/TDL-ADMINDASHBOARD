import uuid
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import Response

from core.database import db
from core.security import hash_password, verify_password, create_access_token, get_current_user
from core.utils import now_iso
from core.config import COOKIE_SECURE
from models.auth import RegisterIn, LoginIn, ForgotPasswordIn, ResetPasswordIn, ChangePasswordIn
from services.password_reset import create_reset_token, send_reset_link_email
from fastapi import HTTPException

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(payload: RegisterIn, response: Response):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id, "email": payload.email.lower(), "name": payload.name,
        "role": payload.role if payload.role in ("etudiant",) else "etudiant",
        "phone": payload.phone, "password_hash": hash_password(payload.password),
        "created_at": now_iso(), "active": True
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, doc["email"], doc["role"])
    response.set_cookie("access_token", token, httponly=True, secure=COOKIE_SECURE, samesite="lax", max_age=86400, path="/")
    doc.pop("_id", None)
    return {"token": token, "user": {k: v for k, v in doc.items() if k != "password_hash"}}


@router.post("/login")
async def login(payload: LoginIn, response: Response):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    acc_status = user.get("account_status", "actif" if user.get("active", True) else "suspendu")
    if acc_status == "suspendu":
        raise HTTPException(status_code=403, detail="Ce compte a été suspendu. Contactez l'administration.")
    if acc_status == "archive":
        raise HTTPException(status_code=403, detail="Ce compte a été archivé et n'est plus accessible.")
    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=COOKIE_SECURE, samesite="lax", max_age=86400, path="/")
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"token": token, "user": user}


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordIn):
    """Toujours la même réponse, que l'email existe ou non — ne jamais révéler
    si une adresse est enregistrée (évite l'énumération de comptes)."""
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if user:
        token = await create_reset_token(user["id"])
        await send_reset_link_email(user, token, triggered_by_admin=False)
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordIn):
    record = await db.password_reset_tokens.find_one({"token": payload.token, "used": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="Lien invalide ou déjà utilisé")
    expires_at = datetime.fromisoformat(record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Ce lien a expiré, demandez-en un nouveau")
    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "must_change_password": False, "updated_at": now_iso()}},
    )
    await db.password_reset_tokens.update_one({"token": payload.token}, {"$set": {"used": True}})
    return {"ok": True}


@router.post("/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    full_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not full_user or not verify_password(payload.current_password, full_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "must_change_password": False, "updated_at": now_iso()}},
    )
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
