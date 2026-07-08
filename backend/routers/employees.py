import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from core.database import db
from core.security import hash_password, get_current_user, require_role
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_ALL_STAFF, ROLES_TEAM_MGMT
from models.employee import EmployeeIn, AccountStatusIn

router = APIRouter(tags=["employees"])

VALID_STAFF_ROLES = (
    "admin", "employe", "animateur", "responsable_admission", "agent_admin",
    "commercial", "responsable_commercial",
)


async def _get_or_create_staff_profile(uid: str) -> dict:
    p = await db.staff_profiles.find_one({"user_id": uid}, {"_id": 0})
    if not p:
        p = {"id": str(uuid.uuid4()), "user_id": uid, "documents": [], "notes": "", "created_at": now_iso(), "updated_at": now_iso()}
        await db.staff_profiles.insert_one(p)
        p.pop("_id", None)
    return p


@router.get("/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)


# Le responsable commercial gère uniquement l'équipe commerciale, pas tout le
# staff (admins, animateurs...) : on restreint son périmètre à ce rôle.
MANAGEABLE_ROLES_BY_MANAGER = ("commercial",)


@router.get("/employees")
async def list_employees(user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    roles = list(VALID_STAFF_ROLES) if user["role"] == "admin" else list(MANAGEABLE_ROLES_BY_MANAGER)
    return await db.users.find(
        {"role": {"$in": roles}},
        {"_id": 0, "password_hash": 0}
    ).to_list(500)


@router.post("/employees")
async def create_employee(payload: EmployeeIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    if user["role"] != "admin" and payload.role not in MANAGEABLE_ROLES_BY_MANAGER:
        raise HTTPException(status_code=403, detail="Vous ne pouvez créer que des comptes commerciaux")
    role = payload.role if payload.role in VALID_STAFF_ROLES else "employe"
    doc = {
        "id": str(uuid.uuid4()), "email": payload.email.lower(), "name": payload.name,
        "role": role, "phone": payload.phone, "department": payload.department,
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(), "active": True, "account_status": "actif"
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash")
    doc.pop("_id", None)
    return doc


@router.put("/employees/{uid}/status")
async def update_employee_status(uid: str, payload: AccountStatusIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    if payload.account_status not in ("actif", "suspendu", "archive"):
        raise HTTPException(status_code=400, detail="Statut invalide (actif, suspendu, archive)")
    if uid == user["id"] and payload.account_status != "actif":
        raise HTTPException(status_code=400, detail="Impossible de suspendre/archiver son propre compte")
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in MANAGEABLE_ROLES_BY_MANAGER:
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes commerciaux")
    await db.users.update_one({"id": uid}, {"$set": {
        "account_status": payload.account_status,
        "active": payload.account_status == "actif",
        "updated_at": now_iso()
    }})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.delete("/employees/{uid}")
async def delete_employee(uid: str, user: dict = Depends(require_role("admin"))):
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


@router.get("/me/profile")
async def get_my_profile(user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    profile = await _get_or_create_staff_profile(user["id"])
    docs = await db.documents.find({"id": {"$in": profile.get("documents", [])}, "is_deleted": False}, {"_id": 0}).to_list(200)
    profile["documents_details"] = docs
    return profile


@router.post("/me/profile/documents")
async def upload_my_profile_document(
    file: UploadFile = File(...),
    doc_type: str = Form("autre"),
    user: dict = Depends(require_role(*ROLES_ALL_STAFF))
):
    profile = await _get_or_create_staff_profile(user["id"])
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 15MB)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    path = f"{APP_NAME}/staff_profiles/{user['id']}/{uuid.uuid4()}.{ext}"
    result = await put_object(path, data, file.content_type or "application/octet-stream")
    doc = {
        "id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
        "content_type": file.content_type, "size": result["size"], "doc_type": doc_type,
        "verification_status": "pending", "uploaded_by": user["id"], "created_at": now_iso(), "is_deleted": False
    }
    await db.documents.insert_one(doc)
    await db.staff_profiles.update_one(
        {"user_id": user["id"]},
        {"$push": {"documents": doc["id"]}, "$set": {"updated_at": now_iso()}}
    )
    doc.pop("_id", None)
    return doc


@router.post("/me/signature")
async def upload_my_signature(file: UploadFile = File(...), user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    """Enregistre la signature manuscrite de l'utilisateur (image PNG, ex: capturée
    via un pad de signature) pour qu'elle puisse être apposée sur les documents
    qu'il génère (voir /documents-generated/{id}/sign)."""
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 2MB)")
    path = f"{APP_NAME}/signatures/{user['id']}.png"
    result = await put_object(path, data, file.content_type or "image/png")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"signature_path": result["path"], "signature_updated_at": now_iso()}}
    )
    return {"ok": True}


@router.delete("/me/signature")
async def delete_my_signature(user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    await db.users.update_one({"id": user["id"]}, {"$unset": {"signature_path": ""}})
    return {"ok": True}


@router.get("/me/signature/image")
async def get_my_signature_image(user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "signature_path": 1})
    if not u or not u.get("signature_path"):
        raise HTTPException(status_code=404, detail="Aucune signature enregistrée")
    data, ct = await get_object(u["signature_path"])
    return Response(content=data, media_type=ct or "image/png")


@router.get("/staff/{uid}/profile")
async def get_staff_profile(uid: str, user: dict = Depends(require_role("admin", "responsable_admission"))):
    profile = await _get_or_create_staff_profile(uid)
    docs = await db.documents.find({"id": {"$in": profile.get("documents", [])}, "is_deleted": False}, {"_id": 0}).to_list(200)
    profile["documents_details"] = docs
    profile["user"] = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return profile
