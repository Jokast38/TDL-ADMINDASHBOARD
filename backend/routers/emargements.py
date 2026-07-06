import asyncio
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from core.database import db
from core.security import require_role
from core.storage import put_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_ALL_STAFF
from models.stage import EmargementIn
from services.email import send_email
from services.pdf import generate_attestation_pdf, render_html_pdf
from routers.stages import _stage_days

router = APIRouter(tags=["emargements"])


@router.post("/emargements")
async def create_emargement(payload: EmargementIn, user: dict = Depends(require_role("admin", "animateur"))):
    stage = await db.stages.find_one({"id": payload.stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    if user["role"] == "animateur" and stage.get("animateur_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if payload.present and not (payload.signature_data_url or "").startswith("data:image"):
        raise HTTPException(status_code=400, detail="Une signature est requise lorsque le stagiaire est marqué présent")
    valid_days = _stage_days(stage)
    if payload.session_date not in valid_days:
        raise HTTPException(status_code=400, detail=f"session_date doit être l'un de : {', '.join(valid_days)}")

    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
    student = await db.users.find_one({"id": payload.student_id}, {"_id": 0, "password_hash": 0}) or {"name": payload.student_name}
    animateur = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0}) or {"name": user.get("name")}

    em_doc = {
        "id": str(uuid.uuid4()), "stage_id": payload.stage_id,
        "inscription_id": payload.inscription_id, "student_id": payload.student_id,
        "student_name": payload.student_name, "session_date": payload.session_date,
        "present": payload.present, "signed_by_animateur": user["id"], "signed_at": now_iso(),
    }
    await db.emargements.update_one(
        {"stage_id": payload.stage_id, "inscription_id": payload.inscription_id, "session_date": payload.session_date},
        {"$set": em_doc}, upsert=True
    )

    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    pdf_bytes = await asyncio.to_thread(generate_attestation_pdf, stage, formation, student, animateur, payload.signature_data_url, payload.present, settings_doc)
    path = f"{APP_NAME}/attestations/{payload.stage_id}/{payload.session_date}/{payload.inscription_id}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")

    doc_meta = {
        "id": str(uuid.uuid4()), "type_doc": "attestation_presence",
        "nom_fichier": f"attestation_{student.get('name', '').replace(' ', '_')}_{payload.session_date}_{stage.get('id', '')[:8]}.pdf",
        "stage_id": payload.stage_id, "inscription_id": payload.inscription_id,
        "student_id": payload.student_id, "session_date": payload.session_date,
        "storage_path": result["path"], "size": result["size"],
        "generated_by": user["id"], "generated_at": now_iso(), "signed": True,
    }
    await db.generated_docs.insert_one(doc_meta)

    try:
        await send_email(
            student.get("email", ""),
            f"Votre attestation de présence — {formation.get('title', '')}",
            f"<p>Bonjour {student.get('name', '')},</p><p>Votre présence à la session du {payload.session_date} a été enregistrée.</p><p>Vous trouverez votre attestation signée dans votre espace TDL Formation.</p>"
        )
    except Exception:
        pass

    doc_meta.pop("_id", None)
    em_doc.pop("_id", None)
    return {"emargement": em_doc, "document": doc_meta}


@router.get("/emargements")
async def list_emargements(stage_id: Optional[str] = None, session_date: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    q = {}
    if stage_id: q["stage_id"] = stage_id
    if session_date: q["session_date"] = session_date
    if user["role"] == "animateur":
        own = await db.stages.find({"animateur_id": user["id"]}, {"_id": 0, "id": 1}).to_list(500)
        q["stage_id"] = {"$in": [s["id"] for s in own]}
    return await db.emargements.find(q, {"_id": 0}).sort("signed_at", -1).to_list(2000)


@router.get("/stages/{sid}/emargement-pdf")
async def generate_emargement_sheet_pdf(sid: str, session_date: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    if user["role"] == "animateur" and stage.get("animateur_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    valid_days = _stage_days(stage)
    session_date = session_date or valid_days[0]
    if session_date not in valid_days:
        raise HTTPException(status_code=400, detail=f"session_date doit être l'un de : {', '.join(valid_days)}")

    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
    inscrits = await db.inscriptions.find({"formation_id": stage["formation_id"]}, {"_id": 0}).to_list(500)
    animateur = await db.users.find_one({"id": stage.get("animateur_id")}, {"_id": 0, "password_hash": 0}) if stage.get("animateur_id") else None

    rows = ""
    for ins in inscrits:
        em = await db.emargements.find_one({"stage_id": sid, "inscription_id": ins["id"], "session_date": session_date}, {"_id": 0})
        signed = "✓ Signé" if em and em.get("present") else ("Absent" if em else "—")
        rows += f'<tr><td style="padding:6px;">{ins.get("student_name", "")}</td><td style="padding:6px;text-align:right;">{signed}</td></tr>'
    if not rows:
        rows = '<tr><td colspan="2" style="padding:6px;text-align:center;color:#999;">Aucun inscrit</td></tr>'

    intervenant_row = f'<tr><td style="padding:6px;">{animateur.get("name", "")}</td><td style="padding:6px;text-align:right;">_____________</td></tr>' if animateur else '<tr><td colspan="2" style="padding:6px;text-align:center;color:#999;">Aucun formateur assigné</td></tr>'

    tpl = await db.doc_templates.find_one({"nom": "Feuille d'émargement - Présence stagiaires", "actif": True}, {"_id": 0})
    context = {
        "organisme_nom": "TOP DRIVE LEARNING", "email": "tdlparisformation@gmail.com",
        "telephone": "01 80 90 72 49", "adresse": "59 avenue JOFFRE, 93800 EPINAY-SUR-SEINE",
        "code_postal": "93800", "ville": stage.get("lieu_ville", "EPINAY SUR SEINE"),
        "siret": "90096880100010", "numero_declaration_activite": "11930882293",
        "formation_titre": formation.get("title", stage.get("formation_titre", "")),
        "date_debut": session_date, "date_fin": session_date,
        "lieu_formation": f"{stage.get('lieu_adresse', '')}, {stage.get('lieu_ville', '')}",
        "duree_totale": str(formation.get("duration_hours", "")),
        "formateurs_list": animateur.get("name", "") if animateur else "",
        "apprenants_list": rows, "intervenants_list": intervenant_row,
        "lieu_signature": stage.get("lieu_ville", "EPINAY SUR SEINE"), "date_signature": session_date,
    }
    if not tpl:
        raise HTTPException(status_code=404, detail="Modèle 'Feuille d'émargement' introuvable. Lancez seed_doc_templates.py.")
    html = tpl["contenu_html"]
    for k, v in context.items():
        html = html.replace("{{ " + k + " }}", str(v)).replace("{{" + k + "}}", str(v))
    pdf_bytes = await asyncio.to_thread(render_html_pdf, html)
    fname = f"emargement_{stage.get('formation_titre', 'session')}_{session_date}.pdf".replace(" ", "_")
    path = f"{APP_NAME}/generated/emargement_{sid}_{session_date}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")
    doc_meta = {
        "id": str(uuid.uuid4()), "type_doc": "attestation",
        "template_nom": "Feuille d'émargement - Présence stagiaires",
        "nom_fichier": fname, "stage_id": sid,
        "storage_path": result["path"], "size": result["size"],
        "generated_by": user["id"], "generated_by_name": user.get("name"),
        "generated_at": now_iso(), "signed": False,
    }
    await db.generated_docs.insert_one(doc_meta)
    doc_meta.pop("_id", None)
    return doc_meta
