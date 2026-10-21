"""Gestion des CACES R.489 (demande du 2026-10-21) : suivi des tentatives
d'examen (théorie/pratique) par catégorie, génération de la carte CACES
recto/verso avec QR code de vérification, et page de vérification publique.

Portée volontairement limitée à ce qui a été confirmé comme faisable :
- Pas de lien vers la base nationale CACES/INRS (externe, non accessible) —
  la vérification se fait uniquement contre NOS propres enregistrements,
  comme le permet déjà la recommandation R.489 pour un OTC (§3/3/3).
- Pas de génération automatique PAR LOT ; chaque carte est générée à la
  demande depuis la fiche du candidat.
"""
import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response

from core.database import db
from core.security import require_role, get_current_user
from core.utils import now_iso
from core.config import ROLES_DOSSIERS_MGMT, PUBLIC_FRONTEND_URL, APP_NAME
from core.storage import put_object, get_object
from models.caces import (
    CACES_CATEGORIES, CACES_PRATIQUE_DUREE_MIN,
    CacesExamAttemptIn, CacesTheorieResultIn, CacesPratiqueResultIn,
    CacesExternalCertificateIn, CacesCertificateUpdateIn,
)
from services.caces import compute_attempt_status, finalize_category, add_external_category, today_iso
from services.pdf import generate_caces_card_pdf

router = APIRouter(prefix="/caces", tags=["caces"])


@router.get("/categories")
async def list_categories(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    return [{"category": c, "duree_pratique_min": CACES_PRATIQUE_DUREE_MIN.get(c)} for c in CACES_CATEGORIES]


# ---------------------------------------------------------------------------
# Tentatives d'examen (théorie + pratique par catégorie)
# ---------------------------------------------------------------------------

async def _hydrate_attempt(attempt: dict) -> dict:
    attempt["status"] = compute_attempt_status(attempt)
    return attempt


@router.post("/exam-attempts")
async def create_exam_attempt(payload: CacesExamAttemptIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    if payload.category not in CACES_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie CACES inconnue")
    existing = await db.caces_exam_attempts.find_one(
        {"student_id": payload.student_id, "category": payload.category}, {"_id": 0}
    )
    if existing and compute_attempt_status(existing) not in ("expire",):
        raise HTTPException(status_code=400, detail="Une tentative est déjà en cours pour cette catégorie")
    doc = {
        "id": str(uuid.uuid4()), "dossier_id": payload.dossier_id,
        "student_id": payload.student_id, "student_name": payload.student_name,
        "student_email": payload.student_email, "category": payload.category,
        "notes": payload.notes or "", "theorie": None, "pratique": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.caces_exam_attempts.insert_one(doc)
    doc.pop("_id", None)
    return await _hydrate_attempt(doc)


@router.get("/exam-attempts")
async def list_exam_attempts(
    category: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT)),
):
    query: Dict[str, Any] = {}
    if category:
        query["category"] = category
    if q:
        query["student_name"] = {"$regex": q, "$options": "i"}
    items = await db.caces_exam_attempts.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    items = [await _hydrate_attempt(i) for i in items]
    if status:
        items = [i for i in items if i["status"] == status]
    return items


@router.get("/exam-attempts/{attempt_id}")
async def get_exam_attempt(attempt_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    attempt = await db.caces_exam_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Tentative introuvable")
    return await _hydrate_attempt(attempt)


@router.post("/exam-attempts/{attempt_id}/theorie")
async def record_theorie_result(attempt_id: str, payload: CacesTheorieResultIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    attempt = await db.caces_exam_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Tentative introuvable")
    result = {"passed": payload.passed, "date": payload.date or today_iso()}
    await db.caces_exam_attempts.update_one({"id": attempt_id}, {"$set": {"theorie": result, "updated_at": now_iso()}})
    attempt["theorie"] = result
    return await _maybe_finalize(attempt)


@router.post("/exam-attempts/{attempt_id}/pratique")
async def record_pratique_result(attempt_id: str, payload: CacesPratiqueResultIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    attempt = await db.caces_exam_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Tentative introuvable")
    result = {"passed": payload.passed, "date": payload.date or today_iso(), "testeur_name": payload.testeur_name}
    await db.caces_exam_attempts.update_one({"id": attempt_id}, {"$set": {"pratique": result, "updated_at": now_iso()}})
    attempt["pratique"] = result
    return await _maybe_finalize(attempt)


async def _maybe_finalize(attempt: dict) -> dict:
    status = compute_attempt_status(attempt)
    if status == "valide" and not attempt.get("finalized_certificate_id"):
        try:
            certificate = await finalize_category(attempt, testeur_name=(attempt.get("pratique") or {}).get("testeur_name"))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        await db.caces_exam_attempts.update_one(
            {"id": attempt["id"]}, {"$set": {"finalized_certificate_id": certificate["id"], "updated_at": now_iso()}}
        )
        attempt["finalized_certificate_id"] = certificate["id"]
    attempt["status"] = status
    return attempt


# ---------------------------------------------------------------------------
# Cartes CACES (une par titulaire, plusieurs catégories possibles)
# ---------------------------------------------------------------------------

@router.get("/certificates")
async def list_certificates(category: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    query: Dict[str, Any] = {}
    if category:
        query["categories.category"] = category
    if q:
        query["student_name"] = {"$regex": q, "$options": "i"}
    return await db.caces_certificates.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)


@router.get("/stats")
async def caces_stats(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Nombre de titulaires par catégorie — vue filtre demandée pour la page
    de gestion CACES."""
    certs = await db.caces_certificates.find({}, {"_id": 0, "categories": 1}).to_list(5000)
    counts: Dict[str, int] = {c: 0 for c in CACES_CATEGORIES}
    for cert in certs:
        for entry in cert.get("categories", []):
            if entry["category"] in counts:
                counts[entry["category"]] += 1
    return {"total_titulaires": len(certs), "par_categorie": counts}


@router.get("/certificates/{certificate_id}")
async def get_certificate(certificate_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    certificate = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Carte introuvable")
    return certificate


@router.put("/certificates/{certificate_id}")
async def update_certificate(certificate_id: str, payload: CacesCertificateUpdateIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        certificate = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
        if not certificate:
            raise HTTPException(status_code=404, detail="Carte introuvable")
        return certificate
    update["updated_at"] = now_iso()
    result = await db.caces_certificates.update_one({"id": certificate_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Carte introuvable")
    return await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})


@router.get("/certificates/{certificate_id}/card.pdf")
async def download_card_pdf(certificate_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    certificate = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Carte introuvable")

    # Photo d'identité — reprise du premier dossier lié à une catégorie de
    # cette carte (un seul dossier/étudiant porte la photo, voir
    # _store_dossier_photo), absente si jamais capturée.
    photo_bytes = None
    dossier_id = next((c.get("dossier_id") for c in certificate.get("categories", []) if c.get("dossier_id")), None)
    if dossier_id:
        dossier = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "id_photo_path": 1})
        if dossier and dossier.get("id_photo_path"):
            try:
                photo_bytes, _ = await get_object(dossier["id_photo_path"])
            except Exception:
                photo_bytes = None

    pdf_bytes = generate_caces_card_pdf(certificate, f"{PUBLIC_FRONTEND_URL}/verif-caces", photo_bytes=photo_bytes)
    filename = f"caces_{(certificate.get('student_name') or 'carte').replace(' ', '_')}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.post("/certificates/external")
async def register_external_certificate(payload: CacesExternalCertificateIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Enregistrement (pour audit) d'un CACES déjà délivré par un autre OTC —
    voir services.caces.add_external_category pour la règle d'échéance."""
    if payload.category not in CACES_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie CACES inconnue")
    try:
        return await add_external_category(payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/certificates/{certificate_id}/categories/{category}/trace")
async def trace_category_exam(certificate_id: str, category: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Retrace l'examen complet d'une catégorie de la carte : dates théorie/
    pratique, résultats, testeur — pour un audit interne (pas exposé sur la
    page de vérification publique, qui reste volontairement minimale)."""
    certificate = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Carte introuvable")
    entry = next((c for c in certificate.get("categories", []) if c["category"] == category), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Catégorie absente de cette carte")
    if entry.get("external"):
        return {"external": True, "otc_name": entry["external"]["otc_name"], "numero_externe": entry["external"]["numero_externe"]}
    if not entry.get("exam_attempt_id"):
        return {"external": False, "attempt": None}
    attempt = await db.caces_exam_attempts.find_one({"id": entry["exam_attempt_id"]}, {"_id": 0})
    return {"external": False, "attempt": attempt}


# ---------------------------------------------------------------------------
# Photo d'identité (carte CACES) — capturée soit par l'apprenant depuis son
# espace (son propre téléphone), soit par un agent sur place (smartphone de
# l'agence) — mêmes conventions de stockage que employees.py::upload_my_signature.
# Stockée sur le dossier (pas sur la carte CACES elle-même) car une seule
# photo sert pour tout le dossier, pas uniquement le CACES.
# ---------------------------------------------------------------------------

_MAX_PHOTO_BYTES = 5 * 1024 * 1024


async def _store_dossier_photo(dossier_id: str, file: UploadFile) -> dict:
    data = await file.read()
    if len(data) > _MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 5 Mo)")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image")
    path = f"{APP_NAME}/dossier_photos/{dossier_id}.jpg"
    result = await put_object(path, data, file.content_type or "image/jpeg")
    await db.dossiers.update_one(
        {"id": dossier_id},
        {"$set": {"id_photo_path": result["path"], "id_photo_updated_at": now_iso()}},
    )
    return {"ok": True}


@router.post("/me/dossiers/{dossier_id}/photo")
async def upload_my_dossier_photo(dossier_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Capture depuis l'espace apprenant (son propre smartphone ou webcam) —
    voir frontend/src/components/PhotoCapture.jsx."""
    dossier = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "student_id": 1})
    if not dossier or dossier.get("student_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return await _store_dossier_photo(dossier_id, file)


@router.post("/dossiers/{dossier_id}/photo")
async def upload_dossier_photo(dossier_id: str, file: UploadFile = File(...), user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Capture sur place par un agent (smartphone de l'agence)."""
    dossier = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "id": 1})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    return await _store_dossier_photo(dossier_id, file)


@router.get("/dossiers/{dossier_id}/photo")
async def get_dossier_photo(dossier_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    dossier = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "id_photo_path": 1})
    if not dossier or not dossier.get("id_photo_path"):
        raise HTTPException(status_code=404, detail="Aucune photo enregistrée")
    data, ct = await get_object(dossier["id_photo_path"])
    return Response(content=data, media_type=ct or "image/jpeg")


@router.get("/me/dossiers/{dossier_id}/photo")
async def get_my_dossier_photo(dossier_id: str, user: dict = Depends(get_current_user)):
    dossier = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "student_id": 1, "id_photo_path": 1})
    if not dossier or dossier.get("student_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if not dossier.get("id_photo_path"):
        raise HTTPException(status_code=404, detail="Aucune photo enregistrée")
    data, ct = await get_object(dossier["id_photo_path"])
    return Response(content=data, media_type=ct or "image/jpeg")


# ---------------------------------------------------------------------------
# Vérification publique (scan du QR code) — pas d'authentification, données
# volontairement minimales (voir routers/satisfaction.py pour le même
# principe d'ID opaque comme seul "secret").
# ---------------------------------------------------------------------------

@router.get("/public/{certificate_id}")
async def public_verify_certificate(certificate_id: str):
    certificate = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificat introuvable")
    today = today_iso()
    return {
        "student_name": certificate.get("student_name"),
        "otc": "TDL Formation",
        "expiration_date": certificate.get("expiration_date"),
        "valide": bool(certificate.get("expiration_date") and certificate["expiration_date"] >= today),
        "categories": [
            {
                "category": c["category"],
                "numero_caces": c["numero_caces"],
                "date_obtention": c["date_obtention"],
                "origine": "TDL Formation" if not c.get("external") else c["external"]["otc_name"],
            }
            for c in certificate.get("categories", [])
        ],
    }
