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
import asyncio
import base64
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
    CacesExternalCertificateIn, CacesCertificateUpdateIn, CacesCategoryEntryIn, CacesCategoriesIn,
    CACES_CATEGORIES_PROPOSEES,
)
from pydantic import BaseModel
from services.caces import (
    CARTE_VALIDITE_ANS, add_external_category, add_years, categories_inscription, compute_attempt_status,
    finalize_category, new_numero, today_iso,
)
from services.pdf import generate_caces_card_pdf
from services.photo_crop import crop_id_photo


async def theorie_reussie_recente(student_id: str):
    from routers.caces_exam import theorie_reussie_recente as _recent
    return await _recent(student_id)
from services.email import send_email
from services.email_template import render_branded_email
from core.caces_verif import normalize_numero, name_matches
from core.utils import format_date_long_fr

router = APIRouter(prefix="/caces", tags=["caces"])


@router.get("/categories")
async def list_categories(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    return [{"category": c, "duree_pratique_min": CACES_PRATIQUE_DUREE_MIN.get(c), "proposee": c in CACES_CATEGORIES_PROPOSEES}
            for c in CACES_CATEGORIES]


@router.get("/candidats")
async def list_candidats(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Dossiers CACES pour la page CACES (demande du 2026-11-04) : c'est
    d'un dossier qu'on ouvre un examen pour une catégorie."""
    dossiers = await db.dossiers.find(
        {"category": "CACES"},
        {"_id": 0, "id": 1, "student_id": 1, "student_name": 1, "student_email": 1, "formation_title": 1, "status": 1, "id_photo_path": 1,
         "inscription_id": 1},
    ).sort("created_at", -1).to_list(2000)
    inscs = {i["id"]: i for i in await db.inscriptions.find(
        {"id": {"$in": [d.get("inscription_id") for d in dossiers if d.get("inscription_id")]}},
        {"_id": 0, "id": 1, "caces_categories": 1, "formation_title": 1, "stage_titre": 1, "session": 1}).to_list(2000)}
    for d in dossiers:
        d["has_photo"] = bool(d.pop("id_photo_path", None))
        # Catégories choisies à l'inscription, proposées par défaut à l'examen et sur la carte.
        d["caces_categories"] = categories_inscription(inscs.get(d.pop("inscription_id", None), {}) or {"formation_title": d.get("formation_title")})
    return dossiers


@router.get("/testeurs")
async def list_testeurs(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Formateurs dont le titre est « Testeur CACES », proposés à la saisie
    de l'épreuve pratique (le nom reste modifiable à la main)."""
    users = await db.users.find({"titre": "Testeur CACES"}, {"_id": 0, "name": 1}).to_list(200)
    return sorted({u["name"] for u in users if u.get("name")})


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
        # Théorie déjà réussie sur une copie papier (moins de 12 mois) :
        # reportée, le candidat ne repasse que la pratique (R.489 §3/3/1).
        "notes": payload.notes or "", "theorie": await theorie_reussie_recente(payload.student_id), "pratique": None,
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


async def _card_pdf(certificate: dict) -> bytes:
    """PDF de la carte avec la photo d'identité du premier dossier lié à une
    de ses catégories (un seul dossier porte la photo, voir
    _store_dossier_photo) — absente si jamais capturée."""
    photo_bytes = None
    dossier_id = next((c.get("dossier_id") for c in certificate.get("categories", []) if c.get("dossier_id")), None)
    if dossier_id:
        dossier = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "id_photo_path": 1})
        if dossier and dossier.get("id_photo_path"):
            try:
                photo_bytes, _ = await get_object(dossier["id_photo_path"])
            except Exception:
                photo_bytes = None
    # Cachet du centre (Paramètres > Attestations, le même que sur les
    # attestations de stage) et n° de certification INRS de l'OTC.
    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0, "attestation_cachet_path": 1, "caces_otc_numero_inrs": 1}) or {}
    cachet_bytes = None
    if settings_doc.get("attestation_cachet_path"):
        try:
            cachet_bytes, _ = await get_object(settings_doc["attestation_cachet_path"])
        except Exception:
            cachet_bytes = None
    return generate_caces_card_pdf(
        certificate, f"{PUBLIC_FRONTEND_URL}/verif-caces", photo_bytes=photo_bytes,
        cachet_bytes=cachet_bytes,
        otc_numero_inrs=certificate.get("otc_numero_inrs") or settings_doc.get("caces_otc_numero_inrs"),
    )


def _resultat(part: Optional[dict]) -> str:
    if not part:
        return "pas encore passée"
    verdict = "réussie" if part.get("passed") else "non réussie"
    return f"{verdict} le {format_date_long_fr(part.get('date', ''))}"


@router.post("/exam-attempts/{attempt_id}/send-results")
async def send_results(attempt_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Envoie au candidat le résultat de son examen CACES (demande du
    2026-11-04), avec sa carte en pièce jointe quand la catégorie est
    obtenue."""
    attempt = await db.caces_exam_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Tentative introuvable")
    if not attempt.get("theorie") and not attempt.get("pratique"):
        raise HTTPException(status_code=400, detail="Aucun résultat saisi pour cet examen")
    email = attempt.get("student_email")
    if not email and attempt.get("dossier_id"):
        dossier = await db.dossiers.find_one({"id": attempt["dossier_id"]}, {"_id": 0, "student_email": 1}) or {}
        email = dossier.get("student_email")
    if not email:
        raise HTTPException(status_code=400, detail="Aucun email connu pour ce candidat")

    status = compute_attempt_status(attempt)
    category = attempt["category"]
    lignes = [
        f"Bonjour {attempt.get('student_name', '')},\n",
        f"Voici les résultats de votre examen CACES® R.489, catégorie {category} :\n",
        f"Épreuve théorique : {_resultat(attempt.get('theorie'))}",
        f"Épreuve pratique : {_resultat(attempt.get('pratique'))}\n",
    ]
    attachment = None
    certificate = None
    if status == "valide" and attempt.get("finalized_certificate_id"):
        certificate = await db.caces_certificates.find_one({"id": attempt["finalized_certificate_id"]}, {"_id": 0})
    if certificate:
        entry = next((c for c in certificate.get("categories", []) if c["category"] == category), {})
        lignes.append(
            f"Félicitations, vous avez obtenu le CACES® catégorie {category}, numéro {entry.get('numero_caces', '')}, "
            f"valable jusqu'au {format_date_long_fr(certificate.get('expiration_date', ''))}.\n"
            "Votre carte CACES® est en pièce jointe. Son authenticité peut être vérifiée à tout moment "
            f"en scannant son QR code, ou avec son numéro sur {PUBLIC_FRONTEND_URL}/verif-caces."
        )
        pdf = await _card_pdf(certificate)
        attachment = {"filename": f"carte_caces_{category}.pdf", "content_b64": base64.b64encode(pdf).decode()}
    elif status in ("theorie_ok", "pratique_ok"):
        manque = "pratique" if status == "theorie_ok" else "théorique"
        lignes.append(f"Il vous reste l'épreuve {manque} à valider dans les 12 mois. Nous revenons vers vous pour la programmer.")
    elif status == "expire":
        lignes.append("Le délai de 12 mois entre les deux épreuves est dépassé : l'examen est à repasser. Nous revenons vers vous.")
    else:
        lignes.append("L'examen n'est pas validé cette fois-ci. Nous revenons vers vous pour vous proposer une nouvelle date.")
    lignes.append("\nPour toute question, contactez-nous : contact@tdl-formation.fr.")

    log = await send_email(
        email, f"Vos résultats CACES® — catégorie {category}", render_branded_email("\n".join(lignes)),
        attachment=attachment, extra={"caces_attempt_id": attempt_id},
    )
    if log.get("status") not in ("sent", "mocked"):
        raise HTTPException(status_code=502, detail="Échec de l'envoi de l'email")
    sent_at = now_iso()
    await db.caces_exam_attempts.update_one(
        {"id": attempt_id}, {"$set": {"results_sent_at": sent_at, "results_sent_by": user.get("name"), "updated_at": sent_at}},
    )
    attempt.update({"results_sent_at": sent_at, "results_sent_by": user.get("name"), "status": status})
    return attempt


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


# ---------------------------------------------------------------------------
# Modification des cartes par l'équipe (demande du 2026-11-26) : catégories
# obtenues (numéro, date, testeur) et création d'une carte sans passer par
# un examen saisi ici (ex : examen fait sur papier).
# ---------------------------------------------------------------------------

async def _entrees_categories(entries: List[CacesCategoryEntryIn], anciennes: List[dict]) -> List[dict]:
    cats = [e.category for e in entries]
    if not entries:
        raise HTTPException(status_code=400, detail="Au moins une catégorie sur la carte")
    if len(set(cats)) != len(cats):
        raise HTTPException(status_code=400, detail="Une catégorie apparaît deux fois")
    bad = [c for c in cats if c not in CACES_CATEGORIES]
    if bad:
        raise HTTPException(status_code=400, detail=f"Catégorie CACES inconnue : {', '.join(bad)}")
    old = {c["category"]: c for c in anciennes}
    out = []
    for e in entries:
        prev = old.get(e.category, {})
        numero = (e.numero_caces or "").strip() or prev.get("numero_caces") or await new_numero(e.category)
        out.append({
            "category": e.category, "numero_caces": numero,
            "date_obtention": e.date_obtention or prev.get("date_obtention") or today_iso(),
            "testeur_name": (e.testeur_name or "").strip() or prev.get("testeur_name"),
            "dossier_id": prev.get("dossier_id"), "exam_attempt_id": prev.get("exam_attempt_id"),
            "external": prev.get("external"),
        })
    return out


def _echeance(cert: dict, categories: List[dict]) -> Optional[str]:
    """Échéance = 5 ans après la première catégorie obtenue chez nous ; celle
    du centre d'origine pour une carte ouverte par un CACES externe."""
    internes = sorted(c["date_obtention"] for c in categories if not c.get("external") and c.get("date_obtention"))
    if any(c.get("external") for c in categories) or not internes:
        return cert.get("expiration_date")
    return add_years(internes[0], CARTE_VALIDITE_ANS)


@router.put("/certificates/{certificate_id}/categories")
async def set_certificate_categories(certificate_id: str, payload: CacesCategoriesIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    cert = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Carte introuvable")
    categories = await _entrees_categories(payload.categories, cert.get("categories", []))
    upd = {"categories": categories, "expiration_date": _echeance(cert, categories), "updated_at": now_iso()}
    await db.caces_certificates.update_one({"id": certificate_id}, {"$set": upd})
    return await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})


class CacesCertificateCreateIn(CacesCategoriesIn):
    dossier_id: str
    date_naissance: Optional[str] = None


@router.post("/certificates")
async def create_certificate(payload: CacesCertificateCreateIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    dossier = await db.dossiers.find_one({"id": payload.dossier_id}, {"_id": 0})
    if not dossier or not dossier.get("student_id"):
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if await db.caces_certificates.find_one({"student_id": dossier["student_id"]}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=400, detail="Ce candidat a déjà une carte : modifiez ses catégories")
    categories = await _entrees_categories(payload.categories, [])
    for c in categories:
        c["dossier_id"] = dossier["id"]
    cert = {
        "id": str(uuid.uuid4()), "student_id": dossier["student_id"], "student_name": dossier.get("student_name"),
        "date_naissance": payload.date_naissance, "signataire_name": None, "signataire_qualite": None,
        "categories": categories, "created_at": now_iso(), "updated_at": now_iso(), "created_by": user.get("name"),
    }
    cert["expiration_date"] = _echeance(cert, categories)
    await db.caces_certificates.insert_one(dict(cert))
    return cert


class CacesAttemptUpdateIn(BaseModel):
    category: str


@router.patch("/exam-attempts/{attempt_id}")
async def update_exam_attempt(attempt_id: str, payload: CacesAttemptUpdateIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Changer la catégorie d'un examen tant que la carte n'est pas délivrée."""
    attempt = await db.caces_exam_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Tentative introuvable")
    if payload.category not in CACES_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie CACES inconnue")
    if attempt.get("finalized_certificate_id"):
        raise HTTPException(status_code=400, detail="CACES déjà délivré : modifiez la carte")
    if await db.caces_exam_attempts.find_one({"student_id": attempt["student_id"], "category": payload.category, "id": {"$ne": attempt_id}}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=400, detail=f"Un examen existe déjà en catégorie {payload.category}")
    await db.caces_exam_attempts.update_one({"id": attempt_id}, {"$set": {"category": payload.category, "updated_at": now_iso()}})
    attempt["category"] = payload.category
    return await _hydrate_attempt(attempt)


@router.delete("/exam-attempts/{attempt_id}")
async def delete_exam_attempt(attempt_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    attempt = await db.caces_exam_attempts.find_one({"id": attempt_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Tentative introuvable")
    if attempt.get("finalized_certificate_id"):
        raise HTTPException(status_code=400, detail="CACES déjà délivré : retirez la catégorie de la carte d'abord")
    await db.caces_exam_attempts.delete_one({"id": attempt_id})
    return {"ok": True}


@router.get("/certificates/{certificate_id}/card.pdf")
async def download_card_pdf(certificate_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    certificate = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Carte introuvable")
    pdf_bytes = await _card_pdf(certificate)
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
    # Recadrage au format du cadre de la carte, visage centré (services/photo_crop.py).
    data = await asyncio.to_thread(crop_id_photo, data)
    path = f"{APP_NAME}/dossier_photos/{dossier_id}.jpg"
    result = await put_object(path, data, "image/jpeg")
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

def _public_view(certificate: dict) -> dict:
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


@router.get("/public/verify")
async def public_verify_by_numero(numero: str, nom: str):
    """Vérification par numéro CACES® + nom du titulaire (page publique
    /verif-caces). Même réponse « introuvable » que le numéro n'existe pas
    ou que le nom ne corresponde pas, pour ne rien révéler."""
    wanted = normalize_numero(numero)
    if not wanted or not (nom or "").strip():
        raise HTTPException(status_code=400, detail="Numéro et nom obligatoires")
    certs = await db.caces_certificates.find({}, {"_id": 0}).to_list(10000)
    for certificate in certs:
        entry = next((c for c in certificate.get("categories", []) if normalize_numero(c.get("numero_caces")) == wanted), None)
        if entry and name_matches(certificate.get("student_name"), nom):
            return {**_public_view(certificate), "numero_verifie": entry["numero_caces"], "categorie_verifiee": entry["category"]}
    raise HTTPException(status_code=404, detail="Aucun CACES® ne correspond à ce numéro et ce nom")


@router.get("/public/{certificate_id}")
async def public_verify_certificate(certificate_id: str):
    certificate = await db.caces_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificat introuvable")
    return _public_view(certificate)
