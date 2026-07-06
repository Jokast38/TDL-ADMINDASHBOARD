import uuid
import secrets
from fastapi import APIRouter, Depends
from fastapi.responses import Response

from core.database import db
from core.security import hash_password, verify_password, create_access_token, get_current_user
from core.utils import now_iso
from core.config import COOKIE_SECURE
from models.auth import RegisterIn, LoginIn
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


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
