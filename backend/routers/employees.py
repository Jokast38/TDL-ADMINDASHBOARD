import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from core.database import db
from core.security import hash_password, get_current_user, require_role
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_ALL_STAFF, ROLES_TEAM_MGMT
from models.employee import EmployeeIn, AccountStatusIn, AssignedCategoriesIn, AssignedCentersIn, AssignedTrainingAssignmentsIn, AgrementBafmIn, EmployeeTitreIn, ConventionSignIn, DossierAdjustmentIn, AllowedPagesIn, MatriculeIn, RoleIn
from services.password_reset import create_reset_token, send_reset_link_email, send_password_setup_email
from services.pdf import generate_formateur_convention_pdf
from services.email import send_email
from services.push import send_push_to_users
from services.convention import upcoming_permis_sessions_for, generate_preview_pdf

router = APIRouter(tags=["employees"])

def _generate_simple_password() -> str:
    """Mot de passe temporaire simple (lisible, à recopier facilement depuis
    l'email) — pas destiné à durer : must_change_password force son
    changement dès la première connexion."""
    import random
    import string
    # Pas de caractères ambigus (0/O, 1/l/I) pour limiter les erreurs de
    # recopie depuis l'email reçu sur mobile.
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    return "".join(random.choice(alphabet) for _ in range(8))


VALID_STAFF_ROLES = (
    "admin", "employe", "animateur", "responsable_admission", "agent_admin",
    "commercial", "responsable_commercial",
)

# Pièces justifiant le droit d'exercer d'un formateur/animateur/psychologue —
# checklist affichée dans son espace ("Mon dossier") et sur la page
# Formateurs du dashboard (voir Formateurs.jsx). Le dossier doit être
# complété (documents + convention signée) dans les 24h suivant la création
# du compte par un agent (voir `dossier_deadline` dans create_employee) —
# objectif : ne plus dépendre de plateformes tierces (Digiforma...).
FORMATEUR_DOC_TYPES = {
    "identite_recto": "Pièce d'identité (recto)",
    "identite_verso": "Pièce d'identité (verso)",
    "diplome_bafm_psy": "Diplôme BAFM / PSY",
    "autorisation_animer_initiale": "Autorisation d'animer initiale",
    "attestation_formation_continue": "Attestation de formation continue",
    "attestation_gta_initiale": "Attestation GTA initiale",
    "attestation_gta_continue": "Attestation GTA continue",
    "kbis": "KBIS de moins de 3 mois",
    "attestation_vigilance_urssaf": "Attestation de vigilance URSSAF",
    "justificatif_domicile": "Justificatif de domicile",
}

FORMATEUR_DOSSIER_SLA = timedelta(hours=24)


async def _formateur_dossier_status(uid: str, created_at: str, convention_signed_at: str = None) -> dict:
    profile = await db.staff_profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    docs = await db.documents.find(
        {"id": {"$in": profile.get("documents", [])}, "is_deleted": False}, {"_id": 0, "doc_type": 1}
    ).to_list(200)
    present_types = {d.get("doc_type") for d in docs}
    missing = [k for k in FORMATEUR_DOC_TYPES if k not in present_types]
    deadline = None
    overdue = False
    try:
        deadline = (datetime.fromisoformat(created_at.replace("Z", "+00:00")) + FORMATEUR_DOSSIER_SLA)
        overdue = datetime.now(timezone.utc) > deadline and (bool(missing) or not convention_signed_at)
    except Exception:
        pass
    return {
        "missing_documents": missing,
        "documents_complete": not missing,
        "convention_signed": bool(convention_signed_at),
        "dossier_complete": not missing and bool(convention_signed_at),
        "dossier_deadline": deadline.isoformat() if deadline else None,
        "dossier_overdue": overdue,
    }


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


# Le responsable commercial gère uniquement l'équipe commerciale et l'agent
# administratif uniquement les formateurs (page Formateurs) — pas tout le
# staff (admins, autres commerciaux...) : on restreint leur périmètre.
MANAGEABLE_ROLES_BY_MANAGER = ("commercial",)
MANAGEABLE_ROLES_BY_ROLE = {
    "responsable_commercial": ("commercial",),
    "agent_admin": ("animateur",),
    "responsable_admission": ("animateur",),
}


def _manageable_roles(role: str) -> tuple:
    return MANAGEABLE_ROLES_BY_ROLE.get(role, ())


@router.get("/employees")
async def list_employees(user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "agent_admin", "responsable_admission"))):
    roles = list(VALID_STAFF_ROLES) if user["role"] == "admin" else list(_manageable_roles(user["role"]))
    staff = await db.users.find(
        {"role": {"$in": roles}},
        {"_id": 0, "password_hash": 0}
    ).to_list(500)
    for s in staff:
        if s.get("role") == "animateur":
            status = await _formateur_dossier_status(s["id"], s.get("created_at") or now_iso(), s.get("convention_signed_at"))
            s.update(status)
    return staff


@router.post("/employees")
async def create_employee(payload: EmployeeIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "agent_admin", "responsable_admission"))):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    if user["role"] != "admin" and payload.role not in _manageable_roles(user["role"]):
        raise HTTPException(status_code=403, detail="Vous ne pouvez créer que des comptes de votre périmètre")
    role = payload.role if payload.role in VALID_STAFF_ROLES else "employe"
    # Mot de passe auto-généré si non fourni (cas du formateur, créé sans
    # qu'un agent n'ait à en inventer un) — envoyé en clair par email ci-
    # dessous, à changer dès la première connexion (must_change_password).
    password = payload.password or _generate_simple_password()
    doc = {
        "id": str(uuid.uuid4()), "email": payload.email.lower(), "name": payload.name,
        "role": role, "phone": payload.phone, "department": payload.department,
        "assigned_categories": payload.assigned_categories,
        "assigned_centers": payload.assigned_centers,
        "assigned_training_assignments": payload.assigned_training_assignments,
        "titre": payload.titre,
        "matricule": payload.matricule,
        "allowed_pages": payload.allowed_pages,
        "password_hash": hash_password(password),
        "created_at": now_iso(), "active": True, "account_status": "actif",
        "must_change_password": True,
    }
    await db.users.insert_one(doc)
    await send_password_setup_email(doc, password)
    doc.pop("password_hash")
    doc.pop("_id", None)
    return doc


@router.post("/employees/{uid}/send-password-reset")
async def send_employee_password_reset(uid: str, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    """Bouton admin "Réinitialiser le mot de passe" : envoie un lien de
    réinitialisation à l'employé plutôt que d'imposer un mot de passe choisi
    par l'admin — l'employé choisit lui-même son nouveau mot de passe."""
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in MANAGEABLE_ROLES_BY_MANAGER:
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes commerciaux")
    token = await create_reset_token(uid)
    await send_reset_link_email(target, token, triggered_by_admin=True)
    return {"ok": True}


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


@router.put("/employees/{uid}/role")
async def update_employee_role(uid: str, payload: RoleIn, user: dict = Depends(require_role("admin"))):
    """Changement de rôle — réservé à l'admin (impact large : change les pages
    accessibles, les leads visibles, les permissions...). Pas de vérification
    de périmètre supplémentaire puisque seul un admin peut appeler ceci."""
    if payload.role not in VALID_STAFF_ROLES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide — doit être l'un de : {', '.join(VALID_STAFF_ROLES)}")
    if uid == user["id"] and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Impossible de changer son propre rôle d'admin vers un autre rôle")
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    await db.users.update_one({"id": uid}, {"$set": {"role": payload.role, "updated_at": now_iso()}})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.put("/employees/{uid}/categories")
async def update_employee_categories(uid: str, payload: AssignedCategoriesIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    """Catégories de formation (CACES, PERMIS, AUTO_ECOLE, SSIAP, VTC_TAXI,
    ECSR, VENTE) attribuées à un commercial/responsable commercial/chargé
    d'admission — détermine quels leads et demandes de rappel il reçoit."""
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in MANAGEABLE_ROLES_BY_MANAGER:
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes commerciaux")
    await db.users.update_one({"id": uid}, {"$set": {"assigned_categories": payload.assigned_categories, "updated_at": now_iso()}})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.put("/employees/{uid}/centers")
async def update_employee_centers(uid: str, payload: AssignedCentersIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in MANAGEABLE_ROLES_BY_MANAGER:
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes commerciaux")
    await db.users.update_one({"id": uid}, {"$set": {"assigned_centers": payload.assigned_centers, "updated_at": now_iso()}})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.put("/employees/{uid}/pages")
async def update_employee_allowed_pages(uid: str, payload: AllowedPagesIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    """Restreint les pages du dashboard visibles/accessibles pour cet
    employé, en plus de son rôle (voir models/employee.py:AllowedPagesIn).
    Liste vide = pas de restriction (l'employé retrouve tout ce que son rôle
    autorise normalement)."""
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de modifier ses propres accès")
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in MANAGEABLE_ROLES_BY_MANAGER:
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes commerciaux")
    await db.users.update_one({"id": uid}, {"$set": {"allowed_pages": payload.allowed_pages, "updated_at": now_iso()}})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.put("/employees/{uid}/assignments")
async def update_employee_assignments(uid: str, payload: AssignedTrainingAssignmentsIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT))):
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in MANAGEABLE_ROLES_BY_MANAGER:
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes commerciaux")
    await db.users.update_one({"id": uid}, {"$set": {"assigned_training_assignments": payload.assigned_training_assignments, "updated_at": now_iso()}})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.put("/employees/{uid}/titre")
async def update_employee_titre(uid: str, payload: EmployeeTitreIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "agent_admin", "responsable_admission"))):
    """Intitulé affiché sur les documents générés (attestations...) pour ce
    formateur — ex: "Formateur BAFM", "Moniteur auto-école"."""
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in _manageable_roles(user["role"]):
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes de votre périmètre")
    await db.users.update_one({"id": uid}, {"$set": {"titre": payload.titre, "updated_at": now_iso()}})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.put("/employees/{uid}/matricule")
async def update_employee_matricule(uid: str, payload: MatriculeIn, user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "agent_admin", "responsable_admission"))):
    """Matricule saisi manuellement par un agent — affiché à la place du nom
    sur la feuille d'émargement (voir generate_emargement_sheet_pdf)."""
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user["role"] != "admin" and target.get("role") not in _manageable_roles(user["role"]):
        raise HTTPException(status_code=403, detail="Vous ne pouvez gérer que des comptes de votre périmètre")
    await db.users.update_one({"id": uid}, {"$set": {"matricule": payload.matricule, "updated_at": now_iso()}})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.delete("/employees/{uid}")
async def delete_employee(uid: str, user: dict = Depends(require_role("admin", "agent_admin"))):
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")
    if user["role"] != "admin":
        target = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1})
        if not target or target.get("role") not in _manageable_roles(user["role"]):
            raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que des comptes de votre périmètre")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


@router.post("/me/activity-ping")
async def ping_my_activity(user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    """Appelé par le frontend sur une vraie interaction (clic, frappe...),
    throttlé côté client — voir services/activity.py::ping_interaction pour
    le calcul du temps de travail réel (pause auto après 10 min d'inactivité)."""
    from services.activity import ping_interaction
    await ping_interaction(user["id"])
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

    if user["role"] == "animateur":
        # Fait avancer le dossier formateur à valider en 24h — les agents
        # doivent le savoir sans avoir à revérifier la page Formateurs.
        label = FORMATEUR_DOC_TYPES.get(doc_type, doc_type)
        agents = await db.users.find(
            {"active": True, "role": {"$in": ["admin", "responsable_admission", "agent_admin"]}}, {"_id": 0, "id": 1, "email": 1}
        ).to_list(100)
        for a in agents:
            if a.get("email"):
                await send_email(
                    a["email"], f"📎 Document formateur déposé — {user.get('name', '')}",
                    f"<p><b>{user.get('name', '')}</b> a déposé le document « {label} » pour son dossier formateur.</p>"
                    f"<p style='margin-top:16px;'>Rendez-vous sur la page Formateurs du dashboard.</p>",
                )
        if agents:
            await send_push_to_users([a["id"] for a in agents], "Document formateur déposé", f"{user.get('name', '')} — {label}", "/admin/formateurs")

    doc.pop("_id", None)
    return doc


@router.put("/me/agrement-bafm")
async def update_my_agrement_bafm(payload: AgrementBafmIn, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    """Numéro d'agrément BAFM de l'animateur — affiché sur l'attestation de
    stage de récupération de points (section "Signature des Animateurs")."""
    await db.users.update_one({"id": user["id"]}, {"$set": {"agrement_bafm_numero": payload.agrement_bafm_numero}})
    return {"ok": True}


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


async def _next_upcoming_stage_for_animateur(uid: str) -> dict | None:
    """Prochaine session (non annulée) que ce formateur doit animer — utilisée
    pour afficher une urgence concrète ("vous animez une session le ... dans
    N jours") plutôt que le seul délai générique de 24h après création du
    compte, qui ne dit rien pour un formateur de longue date réassigné à une
    nouvelle session."""
    today = now_iso()[:10]
    stages = await db.stages.find(
        {"$or": [{"animateur_ids": uid}, {"animateur_id": uid}], "date_debut": {"$gte": today}, "statut": {"$ne": "annule"}},
        {"_id": 0, "id": 1, "date_debut": 1, "formation_titre": 1},
    ).sort("date_debut", 1).to_list(1)
    if not stages:
        return None
    stage = stages[0]
    days_until = (datetime.fromisoformat(stage["date_debut"]).date() - datetime.fromisoformat(today).date()).days
    return {**stage, "days_until": days_until}


@router.get("/me/formateur-dossier")
async def get_my_formateur_dossier(user: dict = Depends(require_role("animateur"))):
    """État du dossier d'habilitation du formateur connecté (documents +
    convention) — affiché dans son espace ("Mon dossier"), à compléter dans
    les 24h suivant la création du compte."""
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    profile = await _get_or_create_staff_profile(user["id"])
    docs = await db.documents.find({"id": {"$in": profile.get("documents", [])}, "is_deleted": False}, {"_id": 0}).to_list(200)
    status = await _formateur_dossier_status(user["id"], u.get("created_at") or now_iso(), u.get("convention_signed_at"))
    next_stage = None
    if not status["convention_signed"]:
        next_stage = await _next_upcoming_stage_for_animateur(user["id"])
    return {
        **status, "documents_details": docs, "document_types": FORMATEUR_DOC_TYPES,
        "convention_pdf_available": bool(u.get("convention_pdf_path")), "next_upcoming_stage": next_stage,
    }


@router.get("/me/convention/preview")
async def preview_my_convention(user: dict = Depends(require_role("animateur"))):
    """Convention non signée, en lecture seule — permet au formateur de lire
    le document complet (texte d'engagement, annexe des sessions) avant de
    poser sa signature manuscrite via POST /me/convention/sign."""
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    pdf_bytes = await generate_preview_pdf(u)
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/me/convention/sign")
async def sign_my_convention(payload: ConventionSignIn, user: dict = Depends(require_role("animateur"))):
    """Signe la convention de collaboration (engagement de présence) avec sa
    signature manuscrite — génère le PDF, l'enregistre comme signature par
    défaut de l'utilisateur si il n'en a pas déjà une, et notifie les agents
    (admin/responsable_admission/agent_admin) que le dossier a avancé."""
    if not payload.signature_data_url.startswith("data:image"):
        raise HTTPException(status_code=400, detail="Signature invalide")
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if u.get("convention_signed_at"):
        raise HTTPException(status_code=400, detail="Convention déjà signée")

    import base64 as _b64
    import io as _io
    img_bytes = _b64.b64decode(payload.signature_data_url.split(",", 1)[1])

    if not u.get("signature_path"):
        sig_path = f"{APP_NAME}/signatures/{user['id']}.png"
        result = await put_object(sig_path, img_bytes, "image/png")
        await db.users.update_one({"id": user["id"]}, {"$set": {"signature_path": result["path"], "signature_updated_at": now_iso()}})

    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    centre = {
        "nom": settings_doc.get("attestation_centre_nom") or "Top Drive Learning (TDL)",
        "adresse": settings_doc.get("attestation_centre_adresse") or "59 avenue Joffre",
        "ville": settings_doc.get("attestation_centre_ville") or "93800 Epinay-sur-seine",
        "siret": settings_doc.get("attestation_centre_siret") or "90096880100010",
        "directeur_nom": settings_doc.get("attestation_directeur_nom") or "",
    }
    cachet_data_url = None
    if settings_doc.get("attestation_cachet_path"):
        try:
            data, ct = await get_object(settings_doc["attestation_cachet_path"])
            cachet_data_url = f"data:{ct or 'image/png'};base64,{_b64.b64encode(data).decode('ascii')}"
        except Exception:
            cachet_data_url = None

    sessions = await upcoming_permis_sessions_for(user["id"])
    pdf_bytes = generate_formateur_convention_pdf(u, payload.signature_data_url, centre, cachet_data_url, sessions)
    path = f"{APP_NAME}/conventions/{user['id']}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")
    signed_at = now_iso()
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"convention_pdf_path": result["path"], "convention_signed_at": signed_at, "updated_at": signed_at}}
    )

    status = await _formateur_dossier_status(user["id"], u.get("created_at") or now_iso(), signed_at)
    agents = await db.users.find(
        {"active": True, "role": {"$in": ["admin", "responsable_admission", "agent_admin"]}}, {"_id": 0, "id": 1, "email": 1, "name": 1}
    ).to_list(100)
    subject = f"✅ Convention signée — {u.get('name', '')}" + ("" if status["dossier_complete"] else " (dossier encore incomplet)")
    body = (
        f"<p><b>{u.get('name', '')}</b> a signé sa convention de collaboration.</p>"
        f"<p>Dossier {'complet ✅' if status['dossier_complete'] else 'encore incomplet — documents manquants : ' + ', '.join(FORMATEUR_DOC_TYPES[k] for k in status['missing_documents'])}.</p>"
        f"<p style='margin-top:16px;'>Rendez-vous sur la page Formateurs du dashboard.</p>"
    )
    for a in agents:
        if a.get("email"):
            await send_email(a["email"], subject, body)
    if agents:
        await send_push_to_users([a["id"] for a in agents], "Convention formateur signée", u.get("name", ""), "/admin/formateurs")

    return {"ok": True, **status}


@router.get("/me/convention/download")
async def download_my_convention(user: dict = Depends(require_role("animateur"))):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "convention_pdf_path": 1})
    if not u or not u.get("convention_pdf_path"):
        raise HTTPException(status_code=404, detail="Convention pas encore signée")
    data, ct = await get_object(u["convention_pdf_path"])
    return Response(content=data, media_type=ct or "application/pdf")


@router.get("/employees/activity")
async def employees_activity(user: dict = Depends(require_role("admin"))):
    """Productivité par employé : nombre de leads traités (contactés par lui),
    résultats (intéressé/pas intéressé), demandes de rappel traitées, et charge
    actuelle (leads en attente dans ses catégories assignées). Repose sur
    `last_contacted_by` (leads) et `handled_by` (demandes de rappel), renseignés
    à chaque relance/mise à jour manuelle — les leads traités avant l'ajout de
    ce suivi n'apparaissent pas rétroactivement."""
    staff = await db.users.find(
        {"role": {"$in": list(VALID_STAFF_ROLES)}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "assigned_categories": 1, "assigned_centers": 1,
         "assigned_training_assignments": 1, "active": 1, "account_status": 1,
         "manual_dossier_adjustment": 1, "manual_dossier_adjustment_note": 1},
    ).to_list(500)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sessions_today = await db.user_sessions.find({"date": today}, {"_id": 0}).to_list(500)
    sessions_by_user = {s["user_id"]: s for s in sessions_today}

    result = []
    for s in staff:
        uid = s["id"]
        leads_contacted = await db.leads.count_documents({"last_contacted_by": uid})
        leads_interesse = await db.leads.count_documents({"last_contacted_by": uid, "status": "interesse"})
        leads_pas_interesse = await db.leads.count_documents({"last_contacted_by": uid, "status": "pas_interesse"})
        # Prospects Meta (db.meta_lead_imports) — collection séparée de
        # Prospects/Cosmosia (db.leads), jamais comptée ci-dessus sinon : un
        # agent qui ne traite que des leads Meta ressortait à 0 contact alors
        # qu'il travaille activement (qualified_by posé dans
        # routers/meta_lead_import.py à chaque changement de qualification).
        meta_leads_qualified = await db.meta_lead_imports.count_documents({"qualified_by": uid})
        meta_leads_inscrits = await db.meta_lead_imports.count_documents({"qualified_by": uid, "qualification": "inscrit"})
        leads_contacted += meta_leads_qualified
        callbacks_handled = await db.callback_requests.count_documents({"handled_by": uid})
        inscriptions_traitees = await db.inscriptions.count_documents({"processed_by": uid})
        calls_today = await db.commercial_calls.count_documents({"agent_id": uid, "at": {"$regex": f"^{today}"}})
        calls_total = await db.commercial_calls.count_documents({"agent_id": uid})

        assigned = s.get("assigned_categories") or []
        pending_workload = None
        if assigned:
            pending_workload = await db.leads.count_documents({
                "category": {"$in": assigned},
                "contacted": {"$ne": True},
            })

        adjustment = s.get("manual_dossier_adjustment") or 0
        # "Dossiers traités" = dossiers/inscriptions qui changent réellement
        # d'état de traitement (inscriptions_traitees + rappels traités +
        # ajustement manuel) — exclut volontairement leads_contacted, qui est
        # un simple compteur d'appels/contacts et était avant compté deux fois
        # (une fois ici, une fois affiché séparément comme "Leads contactés"),
        # ce qui gonflait artificiellement ce total.
        total_dossiers = inscriptions_traitees + callbacks_handled + adjustment

        # Temps de travail = temps d'interaction réelle (clics/frappe, voir
        # ping_interaction dans services/activity.py), PAS le temps de
        # connexion brut (last_seen - first_seen) qui comptait aussi du
        # polling en arrière-plan sans présence réelle devant l'écran.
        sess = sessions_by_user.get(uid)
        connection_minutes_today = round((sess.get("active_seconds") or 0) / 60) if sess else 0

        result.append({
            **s,
            "leads_contacted": leads_contacted,
            "leads_interesse": leads_interesse,
            "leads_pas_interesse": leads_pas_interesse,
            "leads_meta_inscrits": meta_leads_inscrits,
            "callbacks_handled": callbacks_handled,
            "inscriptions_traitees": inscriptions_traitees,
            "calls_today": calls_today,
            "calls_total": calls_total,
            "manual_dossier_adjustment": adjustment,
            "total_dossiers_traites": total_dossiers,
            "pending_workload": pending_workload,
            "connection_minutes_today": connection_minutes_today,
            "last_seen": sess.get("last_seen") if sess else None,
            "first_seen": sess.get("first_seen") if sess else None,
        })

    result.sort(key=lambda x: x["total_dossiers_traites"], reverse=True)
    return result


@router.get("/employees/activity-timeseries")
async def employees_activity_timeseries(days: int = 7, user: dict = Depends(require_role("admin", *ROLES_TEAM_MGMT))):
    """Temps de connexion cumulé de toute l'équipe, par jour, sur les N derniers
    jours — alimente le graphique d'activité de la page Activité."""
    days = min(max(days, 1), 31)
    today = datetime.now(timezone.utc).date()
    date_keys = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days - 1, -1, -1)]
    sessions = await db.user_sessions.find(
        {"date": {"$in": date_keys}}, {"_id": 0, "date": 1, "first_seen": 1, "last_seen": 1}
    ).to_list(5000)
    minutes_by_date = {k: 0 for k in date_keys}
    for s in sessions:
        try:
            fs = datetime.fromisoformat(s["first_seen"].replace("Z", "+00:00"))
            ls = datetime.fromisoformat(s["last_seen"].replace("Z", "+00:00"))
            minutes_by_date[s["date"]] += max(0, round((ls - fs).total_seconds() / 60))
        except Exception:
            pass
    return [{"date": k, "minutes": minutes_by_date[k]} for k in date_keys]


@router.get("/employees/activity-log")
async def employees_activity_log(
    user_id: str = None, action: str = None, date_from: str = None, date_to: str = None,
    page: int = 1, page_size: int = 50,
    user: dict = Depends(require_role("admin", *ROLES_TEAM_MGMT)),
):
    """Journal chronologique réel ("qui a fait quoi, quand") — distinct des
    compteurs agrégés de GET /employees/activity. Alimenté par
    services.activity.log_action, appelé aux points de mutation clés (lead
    contacté, appel loggé, dossier traité, rappel traité)."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    query = {}
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    if date_from or date_to:
        date_range = {}
        if date_from:
            date_range["$gte"] = date_from
        if date_to:
            date_range["$lte"] = f"{date_to}T23:59:59.999999"
        query["at"] = date_range
    total = await db.activity_log.count_documents(query)
    items = await db.activity_log.find(query, {"_id": 0}).sort("at", -1) \
        .skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max((total + page_size - 1) // page_size, 1)}


@router.get("/employees/connection-stats")
async def employees_connection_stats(date: str = None, user: dict = Depends(require_role("admin", *ROLES_TEAM_MGMT))):
    """Temps de connexion estimé par employé pour un jour donné (aujourd'hui
    par défaut) — voir services.activity.ping_session pour la méthode de calcul."""
    day = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sessions = await db.user_sessions.find({"date": day}, {"_id": 0}).to_list(500)
    users = await db.users.find(
        {"id": {"$in": [s["user_id"] for s in sessions]}}, {"_id": 0, "id": 1, "name": 1, "role": 1}
    ).to_list(500)
    names = {u["id"]: u for u in users}
    result = []
    for s in sessions:
        minutes = 0
        try:
            fs = datetime.fromisoformat(s["first_seen"].replace("Z", "+00:00"))
            ls = datetime.fromisoformat(s["last_seen"].replace("Z", "+00:00"))
            minutes = max(0, round((ls - fs).total_seconds() / 60))
        except Exception:
            pass
        u = names.get(s["user_id"], {})
        result.append({
            "user_id": s["user_id"], "name": u.get("name", ""), "role": u.get("role", ""),
            "first_seen": s.get("first_seen"), "last_seen": s.get("last_seen"),
            "connection_minutes": minutes, "ping_count": s.get("ping_count", 0),
        })
    result.sort(key=lambda r: r["connection_minutes"], reverse=True)
    return {"date": day, "items": result}


@router.get("/employees/my-stats")
async def my_stats(user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    """Stats personnelles de l'employé connecté, pour la page d'accueil :
    dossiers traités (compteurs cumulés), charge en attente, appels du jour,
    temps de connexion du jour."""
    uid = user["id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    leads_contacted = await db.leads.count_documents({"last_contacted_by": uid})
    inscriptions_traitees = await db.inscriptions.count_documents({"processed_by": uid})
    callbacks_handled = await db.callback_requests.count_documents({"handled_by": uid})
    calls_today = await db.commercial_calls.count_documents({"agent_id": uid, "at": {"$regex": f"^{today}"}})

    assigned = user.get("assigned_categories") or []
    pending_workload = None
    if assigned:
        pending_workload = await db.leads.count_documents({"category": {"$in": assigned}, "contacted": {"$ne": True}})

    sess = await db.user_sessions.find_one({"user_id": uid, "date": today}, {"_id": 0})
    connection_minutes_today = 0
    if sess and sess.get("first_seen") and sess.get("last_seen"):
        try:
            fs = datetime.fromisoformat(sess["first_seen"].replace("Z", "+00:00"))
            ls = datetime.fromisoformat(sess["last_seen"].replace("Z", "+00:00"))
            connection_minutes_today = max(0, round((ls - fs).total_seconds() / 60))
        except Exception:
            pass

    recent = await db.activity_log.find({"user_id": uid}, {"_id": 0}).sort("at", -1).limit(10).to_list(10)

    return {
        "leads_contacted": leads_contacted, "inscriptions_traitees": inscriptions_traitees,
        "callbacks_handled": callbacks_handled, "calls_today": calls_today,
        "pending_workload": pending_workload, "connection_minutes_today": connection_minutes_today,
        "first_seen": sess.get("first_seen") if sess else None, "last_seen": sess.get("last_seen") if sess else None,
        "recent_activity": recent,
    }


@router.put("/employees/{uid}/dossier-adjustment")
async def set_dossier_adjustment(uid: str, payload: DossierAdjustmentIn, user: dict = Depends(require_role("admin"))):
    """Ajustement manuel (positif ou négatif) ajouté au total de dossiers
    traités d'un employé — sert à créditer un travail effectué avant la mise
    en place du traçage automatique (`processed_by`), impossible à
    reconstituer avec certitude après coup (voir GET /employees/activity)."""
    u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1})
    if not u:
        raise HTTPException(status_code=404, detail="Employé introuvable")
    await db.users.update_one({"id": uid}, {"$set": {
        "manual_dossier_adjustment": payload.manual_dossier_adjustment,
        "manual_dossier_adjustment_note": payload.note,
    }})
    from services.staff_notify import check_dossier_milestone
    try:
        await check_dossier_milestone(uid)
    except Exception:
        pass
    return {"ok": True}


@router.get("/staff/{uid}/profile")
async def get_staff_profile(uid: str, user: dict = Depends(require_role("admin", "responsable_admission", "agent_admin"))):
    profile = await _get_or_create_staff_profile(uid)
    docs = await db.documents.find({"id": {"$in": profile.get("documents", [])}, "is_deleted": False}, {"_id": 0}).to_list(200)
    profile["documents_details"] = docs
    profile["user"] = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return profile


@router.post("/staff/{uid}/documents")
async def upload_staff_document(
    uid: str, file: UploadFile = File(...), doc_type: str = Form("autre"),
    user: dict = Depends(require_role("admin", "responsable_admission", "agent_admin")),
):
    """Équivalent admin de POST /me/profile/documents — permet de répertorier
    les habilitations/diplômes d'un formateur directement depuis la page
    Formateurs du dashboard, sans que l'intéressé n'ait à s'en charger."""
    target = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    profile = await _get_or_create_staff_profile(uid)
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 15MB)")
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    path = f"{APP_NAME}/staff_profiles/{uid}/{uuid.uuid4()}.{ext}"
    result = await put_object(path, data, file.content_type or "application/octet-stream")
    doc = {
        "id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
        "content_type": file.content_type, "size": result["size"], "doc_type": doc_type,
        "verification_status": "pending", "uploaded_by": user["id"], "created_at": now_iso(), "is_deleted": False
    }
    await db.documents.insert_one(doc)
    await db.staff_profiles.update_one(
        {"user_id": uid},
        {"$push": {"documents": doc["id"]}, "$set": {"updated_at": now_iso()}}
    )
    doc.pop("_id", None)
    return doc


@router.delete("/staff/{uid}/documents/{doc_id}")
async def delete_staff_document(uid: str, doc_id: str, user: dict = Depends(require_role("admin", "responsable_admission", "agent_admin"))):
    await db.documents.update_one({"id": doc_id}, {"$set": {"is_deleted": True, "deleted_at": now_iso()}})
    await db.staff_profiles.update_one({"user_id": uid}, {"$pull": {"documents": doc_id}, "$set": {"updated_at": now_iso()}})
    return {"ok": True}
