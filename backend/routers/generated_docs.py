import asyncio
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
from services.pdf import render_html_pdf, overlay_signature_on_pdf

router = APIRouter(prefix="/documents-generated", tags=["generated-docs"])


@router.post("")
async def generate_doc_from_template(payload: GeneratedDocIn, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    tpl = await db.doc_templates.find_one({"id": payload.template_id, "actif": True}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Modèle introuvable")
    html = tpl["contenu_html"]
    for k, v in payload.context.items():
        html = html.replace("{{ " + k + " }}", str(v)).replace("{{" + k + "}}", str(v))
    pdf_bytes = await asyncio.to_thread(render_html_pdf, html)
    fname = payload.nom_fichier or f"{tpl['nom']}_{uuid.uuid4().hex[:8]}.pdf"
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
    doc_meta.pop("_id", None)
    return doc_meta


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
