import asyncio
import base64
import re
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from core.database import db
from core.security import get_current_user, require_role
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_DOCS_VIEW
from models.document import GeneratedDocIn
from services.pdf import render_html_pdf, overlay_signature_on_pdf, generate_stage_recup_points_attestation
from services.email import send_email

router = APIRouter(prefix="/documents-generated", tags=["generated-docs"])

# Champs de contexte courants susceptibles de contenir le nom de la personne
# concernée par le document (formulaires très variés d'un modèle à l'autre —
# voir seed_doc_templates.py) — utilisés uniquement pour nommer le fichier
# généré, voir _resolve_person_label ci-dessous.
_NAME_CONTEXT_KEYS = (
    "stagiaire_nom", "student_name", "apprenant_nom", "client_nom",
    "nom_complet", "candidat_nom", "beneficiaire_nom", "nom",
)
_INVALID_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|]')


def _resolve_person_label(context: dict, dossier: Optional[dict]) -> str:
    """Nom à utiliser dans le nom de fichier du document généré — priorité au
    dossier rattaché (base de données, fiable), puis aux champs du
    formulaire, sinon "Unnamed" plutôt qu'un nom de fichier trompeur."""
    if dossier and dossier.get("student_name"):
        return dossier["student_name"]
    for key in _NAME_CONTEXT_KEYS:
        if context.get(key):
            return str(context[key])
    prenom = context.get("prenom") or context.get("stagiaire_prenom") or ""
    nom = context.get("nom") or context.get("stagiaire_nom") or ""
    combined = f"{prenom} {nom}".strip()
    return combined or "Unnamed"


def _safe_filename(name: str) -> str:
    cleaned = _INVALID_FILENAME_CHARS.sub("", name).strip()
    return cleaned or "document"


@router.post("/preview")
async def preview_doc_from_template(payload: GeneratedDocIn, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    """Rendu PDF réel à partir du modèle + contexte fourni, SANS l'enregistrer
    dans la bibliothèque — pour prévisualiser avant de générer pour de bon
    (voir bouton Aperçu du formulaire de génération)."""
    tpl = await db.doc_templates.find_one({"id": payload.template_id, "actif": True}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    html = tpl["contenu_html"]
    for k, v in payload.context.items():
        html = html.replace("{{ " + k + " }}", str(v)).replace("{{" + k + "}}", str(v))
    pdf_bytes = await asyncio.to_thread(render_html_pdf, html)
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("")
async def generate_doc_from_template(payload: GeneratedDocIn, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    tpl = await db.doc_templates.find_one({"id": payload.template_id, "actif": True}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Modèle introuvable")

    dossier = None
    if payload.dossier_id:
        dossier = await db.dossiers.find_one({"id": payload.dossier_id}, {"_id": 0})
        if not dossier:
            raise HTTPException(status_code=404, detail="Dossier introuvable")

    if tpl.get("generator") == "stage_recup":
        # Modèle structuré (signatures, dates de stage...) — ne passe pas par
        # la substitution générique {{ variable }}, voir
        # routers/stage_attestations.py pour le flux officiel élève/agent ;
        # ici on ne fait que régénérer une copie depuis la Bibliothèque PDF,
        # à partir des données déjà enregistrées sur le dossier.
        if not dossier:
            raise HTTPException(status_code=400, detail="Ce modèle nécessite de choisir un dossier (récupération de points) dans la base")
        pdf_bytes = await _generate_stage_recup_copy(dossier)
    else:
        html = tpl["contenu_html"]
        for k, v in payload.context.items():
            html = html.replace("{{ " + k + " }}", str(v)).replace("{{" + k + "}}", str(v))
        pdf_bytes = await asyncio.to_thread(render_html_pdf, html)

    person_label = _resolve_person_label(payload.context, dossier)
    fname = payload.nom_fichier or _safe_filename(f"{person_label} - {tpl['nom']}.pdf")
    path = f"{APP_NAME}/generated/{uuid.uuid4()}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")
    doc_meta = {
        "id": str(uuid.uuid4()), "type_doc": tpl.get("type_doc", "autre"),
        "template_id": payload.template_id, "template_nom": tpl["nom"],
        "nom_fichier": fname, "dossier_id": payload.dossier_id,
        "storage_path": result["path"], "size": result["size"],
        "generated_by": user["id"], "generated_by_name": user.get("name"),
        "generated_at": now_iso(), "signed": False,
    }
    await db.generated_docs.insert_one(doc_meta)

    if payload.send_to_email:
        try:
            message_line = payload.send_message or f"Veuillez trouver ci-joint votre document « {tpl['nom']} »."
            await send_email(
                payload.send_to_email,
                f"Document : {tpl['nom']}",
                f"<p>Bonjour,</p><p>{message_line}</p><p>TDL Formation</p>",
                attachment={"filename": fname, "content_b64": base64.b64encode(pdf_bytes).decode("ascii")},
            )
            doc_meta["sent_to_email"] = payload.send_to_email
            doc_meta["sent_at"] = now_iso()
            await db.generated_docs.update_one(
                {"id": doc_meta["id"]}, {"$set": {"sent_to_email": payload.send_to_email, "sent_at": doc_meta["sent_at"]}}
            )
        except Exception as e:
            doc_meta["send_error"] = str(e)

    doc_meta.pop("_id", None)
    return doc_meta


async def _generate_stage_recup_copy(dossier: dict) -> bytes:
    """Régénère l'attestation de stage de récupération de points depuis la
    Bibliothèque PDF, à partir des données déjà connues du dossier (identité,
    stage, signatures déjà enregistrées le cas échéant) — réutilise la même
    fonction de rendu que le flux officiel (routers/stage_attestations.py)
    pour ne jamais désynchroniser la mise en page."""
    from routers.stage_attestations import _find_completed_stage, _path_to_data_url
    from routers.stages import _stage_animateur_ids, _stage_days

    stage = await _find_completed_stage(dossier)
    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    centre = {
        "nom": settings_doc.get("attestation_centre_nom") or "Top Drive Learning (TDL)",
        "adresse": settings_doc.get("attestation_centre_adresse") or "59 avenue Joffre",
        "ville": settings_doc.get("attestation_centre_ville") or "93800 Epinay-sur-seine",
        "siret": settings_doc.get("attestation_centre_siret") or "90096880100010",
        "directeur_nom": settings_doc.get("attestation_directeur_nom") or "",
        "agrement_numero": settings_doc.get("attestation_agrement_numero") or "",
    }
    animateur_ids = _stage_animateur_ids(stage) if stage else []
    animateur_docs = await db.users.find({"id": {"$in": animateur_ids}}, {"_id": 0}).to_list(20) if animateur_ids else []
    animateur = animateur_docs[0] if animateur_docs else None
    animateurs = {
        "bafm_nom": (animateur or {}).get("name", ""), "bafm_numero": (animateur or {}).get("agrement_bafm_numero", ""),
        "psychologue_nom": settings_doc.get("attestation_psychologue_nom") or "",
        "psychologue_numero": settings_doc.get("attestation_psychologue_numero") or "",
    }
    if len(animateur_docs) > 1:
        formateurs_list = []
        for a in animateur_docs:
            sig_url = None
            if a.get("signature_path"):
                try:
                    sig_url = await _path_to_data_url(a["signature_path"])
                except Exception:
                    sig_url = None
            formateurs_list.append({
                "nom": a.get("name", ""), "titre": a.get("titre") or "Formateur",
                "numero": a.get("agrement_bafm_numero") or "", "signature_data_url": sig_url,
            })
        animateurs["formateurs_list"] = formateurs_list

    async def _safe_data_url(path):
        if not path:
            return None
        try:
            return await _path_to_data_url(path)
        except Exception:
            return None

    cachet_data_url = await _safe_data_url(settings_doc.get("attestation_cachet_path"))
    formateur_signature_data_url = await _safe_data_url((animateur or {}).get("signature_path"))
    psychologue_signature_data_url = await _safe_data_url(settings_doc.get("attestation_psychologue_signature_path"))
    student_signature_data_url = None
    if dossier.get("attestation_pdf_path"):
        # Déjà signée par l'élève : on ne peut pas récupérer sa signature
        # isolément (elle est fusionnée dans le PDF final), on régénère donc
        # sans elle — l'agent doit utiliser le téléchargement officiel
        # (page Apprenants) pour obtenir la copie réellement signée.
        pass

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
    return generate_stage_recup_points_attestation(
        stagiaire, _stage_days(stage) if stage else [], f"{stage.get('lieu_adresse', '')} {stage.get('lieu_ville', '')}".strip() if stage else "",
        centre, animateurs,
        student_signature_data_url=student_signature_data_url,
        formateur_signature_data_url=formateur_signature_data_url,
        psychologue_signature_data_url=psychologue_signature_data_url,
        cachet_data_url=cachet_data_url,
        lieu_signature=(stage.get("lieu_ville") if stage else None) or centre["ville"],
        date_signature=today,
    )


@router.get("")
async def list_generated_docs(
    type_doc: Optional[str] = None,
    dossier_id: Optional[str] = None,
    user: dict = Depends(require_role(*ROLES_DOCS_VIEW))
):
    q = {}
    if type_doc: q["type_doc"] = type_doc
    if dossier_id: q["dossier_id"] = dossier_id
    return await db.generated_docs.find(q, {"_id": 0}).sort("generated_at", -1).to_list(1000)


@router.get("/{gid}/download")
async def download_generated_doc(gid: str, user: dict = Depends(get_current_user)):
    doc = await db.generated_docs.find_one({"id": gid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    if user["role"] not in ROLES_DOCS_VIEW:
        if user["role"] == "animateur":
            is_owner = doc.get("generated_by") == user["id"]
            owns_stage = False
            if doc.get("stage_id"):
                stage = await db.stages.find_one({"id": doc["stage_id"]}, {"_id": 0, "animateur_id": 1})
                owns_stage = bool(stage and stage.get("animateur_id") == user["id"])
            if not (is_owner or owns_stage):
                raise HTTPException(status_code=403, detail="Accès refusé")
        else:
            raise HTTPException(status_code=403, detail="Accès refusé")
    data, ct = await get_object(doc["storage_path"])
    return Response(
        content=data, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc.get("nom_fichier", "document.pdf")}"'}
    )


@router.delete("/{gid}")
async def delete_generated_doc(gid: str, user: dict = Depends(require_role("admin"))):
    await db.generated_docs.delete_one({"id": gid})
    return {"ok": True}


@router.put("/{gid}/sign")
async def sign_generated_doc(gid: str, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    """Appose la signature électronique personnelle de l'utilisateur connecté
    sur la dernière page du document (voir POST /me/signature pour l'enregistrer
    au préalable). Le cachet de l'entreprise reste physique, apposé après
    impression : ceci ne concerne que la signature individuelle."""
    doc = await db.generated_docs.find_one({"id": gid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    signer = await db.users.find_one({"id": user["id"]}, {"_id": 0, "signature_path": 1})
    if not signer or not signer.get("signature_path"):
        raise HTTPException(status_code=400, detail="Aucune signature enregistrée — ajoutez votre signature dans votre profil")
    pdf_bytes, _ = await get_object(doc["storage_path"])
    sig_bytes, _ = await get_object(signer["signature_path"])
    signed_at = now_iso()
    signed_pdf = await asyncio.to_thread(
        overlay_signature_on_pdf, pdf_bytes, sig_bytes, user.get("name", ""), signed_at[:10]
    )
    result = await put_object(doc["storage_path"], signed_pdf, "application/pdf")
    await db.generated_docs.update_one({"id": gid}, {"$set": {
        "signed": True, "signed_by": user["id"], "signed_by_name": user.get("name"),
        "signed_at": signed_at, "size": result["size"],
    }})
    return await db.generated_docs.find_one({"id": gid}, {"_id": 0})
