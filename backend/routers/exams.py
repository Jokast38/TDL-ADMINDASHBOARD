import uuid
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role, get_current_user
from core.utils import now_iso
from core.config import ROLES_DOSSIERS_MGMT
from models.exam import ExamTheoriqueNotifyIn, ExamJourIn, ExamPratiqueIn, ExamPratiqueResultIn
from services.email import send_email
from services.push import send_push_to_user
from services.staff_notify import notify_staff_exam_theorique_result

router = APIRouter(tags=["exams"])

# Lien externe officiel pour consulter son résultat d'examen (section 2.3 du
# cahier des charges) — pas d'API disponible, juste un lien vers le site.
EXAMENT3P_URL = "https://www.exament3p.fr/id/14"

# Le workflow examen CMA (théorique/pratique, vérif sur exament3p.fr) ne
# concerne que les formations passant un examen ETG/pratique via la CMA :
# VTC/Taxi (VTC, passerelle VTC-Taxi, Taxi banlieue) et le permis B
# (catégorie AUTO_ECOLE). Explicitement exclus : ECSR, TP Vente (VENTE), et
# la récupération de points de permis (catégorie PERMIS) — à ne pas
# confondre avec le permis B malgré le nom proche.
CMA_CATEGORIES = ("VTC_TAXI", "AUTO_ECOLE")

REINSCRIPTION_FORMATION_TITLE = "Réinscription examen pratique (après échec)"
REINSCRIPTION_PRICE = 119


def _missing_docs(dossier: dict, docs: list) -> list:
    requis = dossier.get("documents_requis") or []
    fournis = {d["doc_type"] for d in docs if d.get("verification_status") != "rejected"}
    return [r for r in requis if r not in fournis]


async def _get_owned_dossier(dossier_id: str, user: dict) -> dict:
    d = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if d.get("student_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return d


async def _get_dossier(dossier_id: str) -> dict:
    d = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    return d


async def _ensure_reinscription_formation(category: str) -> dict:
    existing = await db.formations.find_one(
        {"title": REINSCRIPTION_FORMATION_TITLE, "category": category}, {"_id": 0}
    )
    if existing:
        return existing
    doc = {
        "id": str(uuid.uuid4()), "title": REINSCRIPTION_FORMATION_TITLE, "category": category,
        "description": "Frais de réinscription suite à un échec à l'examen pratique.",
        "duration_hours": 0, "price": REINSCRIPTION_PRICE, "sessions_per_month": 0,
        # Inactive : ne doit jamais apparaître dans le catalogue public
        # (GET /formations?active_only=true), seulement utilisée en interne
        # pour le paiement via /payments/checkout.
        "active": False, "image_url": None, "documents_requis": [], "cpf_eligible": False,
        "created_at": now_iso(),
    }
    await db.formations.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Examen théorique (section 1.2 côté apprenant, 2.1 côté admin)
# ---------------------------------------------------------------------------

@router.post("/dossiers/{dossier_id}/exam-theorique/notify")
async def notify_exam_theorique_result(dossier_id: str, payload: ExamTheoriqueNotifyIn, user: dict = Depends(get_current_user)):
    if payload.result not in ("reussi", "echoue"):
        raise HTTPException(status_code=400, detail="Résultat invalide (reussi ou echoue)")
    dossier = await _get_owned_dossier(dossier_id, user)
    if dossier.get("category") not in CMA_CATEGORIES:
        raise HTTPException(status_code=400, detail="Cette formation ne passe pas par l'examen CMA")

    update = {"exam_theorique_result": payload.result, "exam_theorique_notified_at": now_iso(), "updated_at": now_iso()}
    await db.dossiers.update_one({"id": dossier_id}, {"$set": update})
    dossier.update(update)

    await notify_staff_exam_theorique_result(dossier, payload.result)

    if payload.result == "reussi" and dossier.get("student_email"):
        manquants = dossier.get("documents_manquants") or dossier.get("documents_requis") or []
        await send_email(
            dossier["student_email"],
            f"Félicitations pour votre examen théorique — {dossier.get('formation_title', '')}",
            (
                f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                f"<p>Félicitations pour la réussite de votre examen théorique ! 🎉</p>"
                f"<p>Prochaine étape : la préparation à l'épreuve pratique. Rendez-vous dans votre "
                f"espace apprenant pour choisir un créneau de préparation disponible.</p>"
                + (f"<p>Pensez à préparer les documents suivants : <b>{', '.join(manquants)}</b>.</p>" if manquants else "")
                + "<p>TDL Formation</p>"
            ),
        )
    return await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})


@router.post("/dossiers/{dossier_id}/exam-theorique/check")
async def check_exam_theorique_readiness(dossier_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Bouton admin "Examen théorique" (section 2.1) : vérifie que le dossier
    est complet pour se présenter à l'examen théorique. S'il manque des
    éléments, envoie automatiquement un email à l'apprenant qui les liste."""
    dossier = await _get_dossier(dossier_id)
    docs = await db.documents.find(
        {"id": {"$in": dossier.get("documents", [])}, "is_deleted": False}, {"_id": 0}
    ).to_list(200)
    missing = _missing_docs(dossier, docs)

    if missing:
        if dossier.get("student_email"):
            await send_email(
                dossier["student_email"],
                f"Éléments manquants avant l'examen théorique — {dossier.get('formation_title', '')}",
                (
                    f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                    f"<p>Avant de passer votre examen théorique, il manque encore :</p>"
                    f"<p><b>{', '.join(missing)}</b></p>"
                    f"<p>Vous pouvez les téléverser depuis votre espace apprenant, ou venir en agence.</p>"
                    f"<p>TDL Formation</p>"
                ),
            )
        return {"ok": False, "missing": missing}

    await db.dossiers.update_one({"id": dossier_id}, {"$set": {"exam_theorique_ready": True, "updated_at": now_iso()}})
    return {"ok": True, "missing": []}


@router.get("/dossiers/exam-theorique/passed")
async def list_exam_theorique_passed(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Vue admin (section 2.1) : apprenants ayant déclaré avoir réussi
    l'examen théorique — à contacter pour la suite (RDV pratique) et à
    classer en conséquence."""
    return await db.dossiers.find(
        {"exam_theorique_result": "reussi", "category": {"$in": list(CMA_CATEGORIES)}}, {"_id": 0}
    ).sort("exam_theorique_notified_at", -1).to_list(1000)


# ---------------------------------------------------------------------------
# Jour d'examen (section 2.3)
# ---------------------------------------------------------------------------

@router.put("/dossiers/{dossier_id}/exam-jour")
async def set_exam_jour(dossier_id: str, payload: ExamJourIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    dossier = await _get_dossier(dossier_id)
    await db.dossiers.update_one(
        {"id": dossier_id},
        {"$set": {"exam_jour_date": payload.date, "exam_jour_confirmed": False, "updated_at": now_iso()}},
    )
    return await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})


@router.post("/dossiers/{dossier_id}/exam-jour/confirm")
async def confirm_exam_jour(dossier_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    dossier = await _get_dossier(dossier_id)
    if not dossier.get("exam_jour_date"):
        raise HTTPException(status_code=400, detail="Aucun jour d'examen renseigné")
    await db.dossiers.update_one(
        {"id": dossier_id},
        {"$set": {"exam_jour_confirmed": True, "updated_at": now_iso()}},
    )
    if dossier.get("student_email"):
        await send_email(
            dossier["student_email"],
            f"Confirmation de votre jour d'examen — {dossier.get('formation_title', '')}",
            (
                f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                f"<p>Votre jour d'examen est confirmé : <b>{dossier['exam_jour_date']}</b>.</p>"
                f"<p>Vous pourrez consulter votre résultat ici une fois disponible : "
                f"<a href='{EXAMENT3P_URL}'>{EXAMENT3P_URL}</a></p>"
                f"<p>TDL Formation</p>"
            ),
        )
        await send_push_to_user(dossier["student_id"], "Jour d'examen confirmé", dossier["exam_jour_date"], "/espace-etudiant")
    return await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Formations internes sans examen CMA (TP Vente, etc.) — la vérification de
# résultat sur exament3p.fr ne concerne que les formations VTC/Taxi ; pour le
# reste, l'agent envoie directement un email de réussite depuis la page
# Apprenants du dashboard une fois le résultat connu.
# ---------------------------------------------------------------------------

@router.post("/dossiers/{dossier_id}/success-email")
async def send_success_email(dossier_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    dossier = await _get_dossier(dossier_id)
    if not dossier.get("student_email"):
        raise HTTPException(status_code=400, detail="Aucun email d'apprenant sur ce dossier")

    await db.dossiers.update_one(
        {"id": dossier_id},
        {"$set": {"status": "termine", "updated_at": now_iso()}},
    )
    await send_email(
        dossier["student_email"],
        f"Félicitations, vous avez réussi ! — {dossier.get('formation_title', '')}",
        (
            f"<p>Bonjour {dossier.get('student_name', '')},</p>"
            f"<p>Félicitations, vous avez réussi votre formation <b>{dossier.get('formation_title', '')}</b> 🎉</p>"
            f"<p>Votre dossier est désormais terminé.</p><p>TDL Formation</p>"
        ),
    )
    if dossier.get("student_id"):
        await send_push_to_user(dossier["student_id"], "Félicitations !", f"{dossier.get('formation_title', '')} — réussite", "/espace-etudiant")
    return await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Examen pratique (sections 2.4 et 2.6)
# ---------------------------------------------------------------------------

@router.put("/dossiers/{dossier_id}/exam-pratique")
async def set_exam_pratique(dossier_id: str, payload: ExamPratiqueIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    dossier = await _get_dossier(dossier_id)
    update = {
        "exam_pratique_date": payload.date, "exam_pratique_department": payload.department,
        "exam_pratique_result": None, "updated_at": now_iso(),
    }
    await db.dossiers.update_one({"id": dossier_id}, {"$set": update})
    if dossier.get("student_email"):
        await send_email(
            dossier["student_email"],
            f"Date de votre examen pratique — {dossier.get('formation_title', '')}",
            (
                f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                f"<p>Votre examen pratique est prévu le <b>{payload.date}</b>"
                + (f" (département {payload.department})" if payload.department else "")
                + ".</p>"
                f"<p>Informations pratiques à conserver : présentez-vous avec votre convocation, "
                f"une pièce d'identité valide et le véhicule utilisé pour l'examen en bon état "
                f"(papiers du véhicule à jour, contrôle technique valide).</p>"
                f"<p>Une formation pratique et un examen blanc seront calés avant cette date — "
                f"choisissez votre créneau depuis votre espace apprenant.</p>"
                f"<p>TDL Formation</p>"
            ),
        )
        await send_push_to_user(dossier["student_id"], "Date d'examen pratique fixée", payload.date, "/espace-etudiant")
    return await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})


@router.post("/dossiers/{dossier_id}/exam-pratique/result")
async def set_exam_pratique_result(dossier_id: str, payload: ExamPratiqueResultIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    if payload.result not in ("reussi", "echoue"):
        raise HTTPException(status_code=400, detail="Résultat invalide (reussi ou echoue)")
    dossier = await _get_dossier(dossier_id)

    if payload.result == "reussi":
        await db.dossiers.update_one(
            {"id": dossier_id},
            {"$set": {"exam_pratique_result": "reussi", "status": "termine", "updated_at": now_iso()}},
        )
        if dossier.get("student_email"):
            await send_email(
                dossier["student_email"],
                f"Félicitations, vous avez réussi ! — {dossier.get('formation_title', '')}",
                (
                    f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                    f"<p>Félicitations, vous avez réussi votre examen pratique 🎉 Votre dossier est "
                    f"désormais terminé.</p><p>TDL Formation</p>"
                ),
            )
        return await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})

    # Échec : le parcours est à refaire, réinscription payante (119€), et on
    # conserve la prochaine date d'examen (CMA) si déjà connue.
    history_entry = {
        "date": dossier.get("exam_pratique_date"), "department": dossier.get("exam_pratique_department"),
        "result": "echoue", "recorded_at": now_iso(),
    }
    formation = await _ensure_reinscription_formation(dossier.get("category") or "PERMIS")
    reinscription_id = str(uuid.uuid4())
    reinscription = {
        "id": reinscription_id, "formation_id": formation["id"], "formation_title": formation["title"],
        "category": formation["category"], "student_id": dossier["student_id"],
        "student_name": dossier.get("student_name"), "student_email": dossier.get("student_email"),
        "student_phone": None, "price": REINSCRIPTION_PRICE, "payment_status": "pending", "status": "active",
        "notes": f"Réinscription après échec examen pratique (dossier {dossier_id})",
        "created_at": now_iso(), "source": "reinscription_examen_pratique",
        "landing_url": "", "session": "", "center": "",
    }
    await db.inscriptions.insert_one(reinscription)

    await db.dossiers.update_one(
        {"id": dossier_id},
        {
            "$set": {
                "exam_pratique_result": "echoue",
                "exam_pratique_date": None, "exam_pratique_department": None,
                "exam_theorique_result": None, "exam_theorique_ready": False,
                "exam_cma_next_date": payload.next_exam_date,
                "reinscription_inscription_id": reinscription_id,
                "reinscription_paid": False,
                "updated_at": now_iso(),
            },
            "$push": {"exam_pratique_history": history_entry},
        },
    )

    if dossier.get("student_email"):
        next_date_html = (
            f"<p>Votre prochaine date d'examen (CMA) : <b>{payload.next_exam_date}</b>.</p>"
            if payload.next_exam_date else
            "<p>La prochaine date d'examen vous sera communiquée dès qu'elle sera connue.</p>"
        )
        await send_email(
            dossier["student_email"],
            f"Résultat examen pratique — {dossier.get('formation_title', '')}",
            (
                f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                f"<p>Vous n'avez pas été reçu(e) à votre examen pratique cette fois-ci. Pas d'inquiétude, "
                f"le parcours est à refaire : une réinscription de <b>{REINSCRIPTION_PRICE} €</b> est "
                f"nécessaire pour reprendre le cursus.</p>"
                f"{next_date_html}"
                f"<p>Rendez-vous dans votre espace apprenant pour régler la réinscription et reprendre "
                f"le parcours.</p><p>TDL Formation</p>"
            ),
        )
        await send_push_to_user(dossier["student_id"], "Résultat examen pratique", "Réinscription nécessaire — voir votre espace", "/espace-etudiant")

    return await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
