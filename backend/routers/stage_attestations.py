import base64
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from core.database import db
from core.security import require_role, get_current_user
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_DOSSIERS_MGMT
from models.attestation import AttestationIdentityIn, AttestationSignIn
from services.email import send_email
from services.push import send_push_to_user
from services.pdf import generate_stage_recup_points_attestation
from routers.stages import _stage_days

router = APIRouter(prefix="/dossiers", tags=["attestations"])

# Seule la catégorie "Récupération de points" (voir CATEGORY_LABELS dans
# services/staff_notify.py) donne lieu à cette attestation officielle —
# jamais les autres formations (VTC/Taxi, permis B classique, ECSR, etc.).
ATTESTATION_CATEGORY = "PERMIS"


async def _get_dossier_for_admin(dossier_id: str) -> dict:
    d = await db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    return d


async def _get_owned_dossier(dossier_id: str, user: dict) -> dict:
    d = await db.dossiers.find_one({"id": dossier_id, "student_id": user["id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    return d


async def _find_completed_stage(dossier: dict) -> dict | None:
    """Le stage suivi par cet apprenant n'est pas stocké directement sur le
    dossier — on le retrouve via les émargements signés (voir
    routers/emargements.py), qui sont le seul lien fiable entre une
    inscription et une session de stage précise. Retourne le stage le plus
    récent dont la date de fin est passée, ou None si aucun."""
    if not dossier.get("inscription_id"):
        return None
    emargements = await db.emargements.find(
        {"inscription_id": dossier["inscription_id"]}, {"_id": 0, "stage_id": 1}
    ).to_list(200)
    stage_ids = list({e["stage_id"] for e in emargements})
    if not stage_ids:
        return None
    stages = await db.stages.find({"id": {"$in": stage_ids}}, {"_id": 0}).sort("date_fin", -1).to_list(50)
    today = now_iso()[:10]
    for s in stages:
        if (s.get("date_fin") or "") <= today:
            return s
    return None


async def _path_to_data_url(path: str) -> str:
    data, content_type = await get_object(path)
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{content_type or 'image/png'};base64,{b64}"


@router.get("/{dossier_id}/attestation")
async def get_attestation_status(dossier_id: str, user: dict = Depends(get_current_user)):
    """État de l'attestation pour ce dossier — accessible à l'apprenant
    concerné (pour savoir si elle est disponible et pré-remplir sa fiche
    identité) et au staff (pour vérifier avant de lancer la notification)."""
    if user["role"] == "etudiant":
        dossier = await _get_owned_dossier(dossier_id, user)
    else:
        dossier = await _get_dossier_for_admin(dossier_id)

    eligible = dossier.get("category") == ATTESTATION_CATEGORY
    stage = await _find_completed_stage(dossier) if eligible else None
    return {
        "eligible": eligible,
        "stage_completed": bool(stage),
        "disponible": bool(dossier.get("attestation_disponible")),
        "signed": bool(dossier.get("attestation_signed_at")),
        "identity": {
            "adresse": dossier.get("attestation_adresse", ""),
            "ville": dossier.get("attestation_ville", ""),
            "date_naissance": dossier.get("attestation_date_naissance", ""),
            "lieu_naissance": dossier.get("attestation_lieu_naissance", ""),
            "numero_permis": dossier.get("attestation_numero_permis", ""),
            "date_delivrance_permis": dossier.get("attestation_date_delivrance_permis", ""),
            "prefecture_delivrance": dossier.get("attestation_prefecture_delivrance", ""),
        },
        "stage": {
            "date_debut": stage.get("date_debut"), "date_fin": stage.get("date_fin"),
            "lieu_adresse": stage.get("lieu_adresse"), "lieu_ville": stage.get("lieu_ville"),
        } if stage else None,
    }


@router.put("/{dossier_id}/attestation/identity")
async def save_attestation_identity(dossier_id: str, payload: AttestationIdentityIn, user: dict = Depends(get_current_user)):
    if user["role"] != "etudiant":
        raise HTTPException(status_code=403, detail="Réservé à l'apprenant concerné")
    dossier = await _get_owned_dossier(dossier_id, user)
    if dossier.get("category") != ATTESTATION_CATEGORY:
        raise HTTPException(status_code=400, detail="Cette formation ne donne pas lieu à cette attestation")
    update = {
        "attestation_adresse": payload.adresse, "attestation_ville": payload.ville,
        "attestation_date_naissance": payload.date_naissance, "attestation_lieu_naissance": payload.lieu_naissance,
        "attestation_numero_permis": payload.numero_permis,
        "attestation_date_delivrance_permis": payload.date_delivrance_permis,
        "attestation_prefecture_delivrance": payload.prefecture_delivrance,
        "updated_at": now_iso(),
    }
    await db.dossiers.update_one({"id": dossier_id}, {"$set": update})
    return {"ok": True}


@router.post("/{dossier_id}/attestation/notify")
async def notify_attestation_available(dossier_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Bouton agent (page Apprenants) : rend l'attestation disponible côté
    apprenant et le notifie — uniquement pour les stages de récupération de
    points déjà terminés (jamais avant la fin réelle du stage)."""
    dossier = await _get_dossier_for_admin(dossier_id)
    if dossier.get("category") != ATTESTATION_CATEGORY:
        raise HTTPException(status_code=400, detail="Cette formation ne donne pas lieu à cette attestation")
    stage = await _find_completed_stage(dossier)
    if not stage:
        raise HTTPException(status_code=400, detail="Aucun stage terminé trouvé pour cet apprenant — vérifiez que les émargements ont bien été signés")

    await db.dossiers.update_one(
        {"id": dossier_id},
        {"$set": {"attestation_disponible": True, "attestation_notified_at": now_iso(), "updated_at": now_iso()}},
    )
    if dossier.get("student_email"):
        await send_email(
            dossier["student_email"],
            "Votre attestation de stage est disponible",
            (
                f"<p>Bonjour {dossier.get('student_name', '')},</p>"
                f"<p>Votre attestation de suivi de stage de sensibilisation à la sécurité routière est "
                f"disponible dans votre espace apprenant. Il ne reste plus qu'à la signer.</p>"
                f"<p>TDL Formation</p>"
            ),
        )
    if dossier.get("student_id"):
        await send_push_to_user(dossier["student_id"], "Attestation disponible", "Votre attestation de stage est prête à signer", "/espace-etudiant")
    return {"ok": True}


@router.post("/{dossier_id}/attestation/sign")
async def sign_attestation(dossier_id: str, payload: AttestationSignIn, user: dict = Depends(get_current_user)):
    if user["role"] != "etudiant":
        raise HTTPException(status_code=403, detail="Réservé à l'apprenant concerné")
    dossier = await _get_owned_dossier(dossier_id, user)
    if dossier.get("category") != ATTESTATION_CATEGORY:
        raise HTTPException(status_code=400, detail="Cette formation ne donne pas lieu à cette attestation")
    if not dossier.get("attestation_disponible"):
        raise HTTPException(status_code=400, detail="Attestation pas encore disponible")
    required = ["attestation_adresse", "attestation_ville", "attestation_date_naissance", "attestation_lieu_naissance",
                "attestation_numero_permis", "attestation_date_delivrance_permis", "attestation_prefecture_delivrance"]
    if any(not dossier.get(f) for f in required):
        raise HTTPException(status_code=400, detail="Complétez d'abord votre fiche identité")
    if not payload.signature_data_url.startswith("data:image"):
        raise HTTPException(status_code=400, detail="Signature invalide")

    stage = await _find_completed_stage(dossier)
    if not stage:
        raise HTTPException(status_code=400, detail="Aucun stage terminé trouvé")

    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    centre = {
        "nom": settings_doc.get("attestation_centre_nom") or "Top Drive Learning (TDL)",
        "adresse": settings_doc.get("attestation_centre_adresse") or "59 avenue Joffre",
        "ville": settings_doc.get("attestation_centre_ville") or "93800 Epinay-sur-seine",
        "siret": settings_doc.get("attestation_centre_siret") or "90096880100010",
        "directeur_nom": settings_doc.get("attestation_directeur_nom") or "",
        "agrement_numero": settings_doc.get("attestation_agrement_numero") or "",
    }
    animateur = await db.users.find_one({"id": stage.get("animateur_id")}, {"_id": 0}) if stage.get("animateur_id") else None
    animateurs = {
        "bafm_nom": (animateur or {}).get("name", ""), "bafm_numero": (animateur or {}).get("agrement_bafm_numero", ""),
        "psychologue_nom": settings_doc.get("attestation_psychologue_nom") or "",
        "psychologue_numero": settings_doc.get("attestation_psychologue_numero") or "",
    }

    cachet_data_url = None
    if settings_doc.get("attestation_cachet_path"):
        try:
            cachet_data_url = await _path_to_data_url(settings_doc["attestation_cachet_path"])
        except Exception:
            cachet_data_url = None
    formateur_signature_data_url = None
    if animateur and animateur.get("signature_path"):
        try:
            formateur_signature_data_url = await _path_to_data_url(animateur["signature_path"])
        except Exception:
            formateur_signature_data_url = None
    psychologue_signature_data_url = None
    if settings_doc.get("attestation_psychologue_signature_path"):
        try:
            psychologue_signature_data_url = await _path_to_data_url(settings_doc["attestation_psychologue_signature_path"])
        except Exception:
            psychologue_signature_data_url = None

    stagiaire = {
        "nom": (dossier.get("student_name") or "").split(" ")[-1].upper() if dossier.get("student_name") else "",
        "prenom": " ".join((dossier.get("student_name") or "").split(" ")[:-1]).upper() if dossier.get("student_name") else "",
        "adresse": dossier.get("attestation_adresse"), "ville": dossier.get("attestation_ville"),
        "date_naissance": dossier.get("attestation_date_naissance"), "lieu_naissance": dossier.get("attestation_lieu_naissance"),
        "numero_permis": dossier.get("attestation_numero_permis"),
        "date_delivrance_permis": dossier.get("attestation_date_delivrance_permis"),
        "prefecture_delivrance": dossier.get("attestation_prefecture_delivrance"),
    }
    today = now_iso()[:10]
    pdf_bytes = generate_stage_recup_points_attestation(
        stagiaire, _stage_days(stage), f"{stage.get('lieu_adresse', '')} {stage.get('lieu_ville', '')}".strip(),
        centre, animateurs,
        student_signature_data_url=payload.signature_data_url,
        formateur_signature_data_url=formateur_signature_data_url,
        psychologue_signature_data_url=psychologue_signature_data_url,
        cachet_data_url=cachet_data_url,
        lieu_signature=stage.get("lieu_ville") or centre["ville"],
        date_signature=today,
    )
    path = f"{APP_NAME}/attestations_recup/{dossier_id}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")

    await db.dossiers.update_one(
        {"id": dossier_id},
        {"$set": {
            "attestation_pdf_path": result["path"], "attestation_signed_at": now_iso(),
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


@router.get("/{dossier_id}/attestation/download")
async def download_attestation(dossier_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "etudiant":
        dossier = await _get_owned_dossier(dossier_id, user)
    else:
        dossier = await _get_dossier_for_admin(dossier_id)
    if not dossier.get("attestation_pdf_path"):
        raise HTTPException(status_code=404, detail="Attestation pas encore générée")
    data, content_type = await get_object(dossier["attestation_pdf_path"])
    return Response(content=data, media_type=content_type or "application/pdf")
