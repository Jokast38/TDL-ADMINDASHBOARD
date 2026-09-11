import asyncio
import base64
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from core.database import db
from core.security import require_role, get_current_user
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_ALL_STAFF, PUBLIC_FRONTEND_URL
from models.stage import EmargementIn, EmargementRequestIn, EmargementSelfSignIn
from services.email import send_email
from services.email_template import render_branded_email
from services.pdf import generate_attestation_pdf, render_html_pdf
from services.push import send_push_to_user, send_push_to_users
from routers.stages import _stage_days, _stage_animateur_ids

router = APIRouter(tags=["emargements"])

_PERIODES = ("matin", "apres_midi", "journee")


async def _path_to_data_url(path: str) -> str:
    data, content_type = await get_object(path)
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{content_type or 'image/png'};base64,{b64}"


async def _finalize_emargement(stage: dict, payload: EmargementIn, signed_by_animateur_id: Optional[str], signed_by_student: bool = False):
    """Cœur commun de l'émargement, partagé entre la saisie en présentiel par
    un animateur (POST /emargements) et la signature à distance par
    l'apprenant lui-même depuis son espace (POST /me/emargements/sign) :
    enregistre l'émargement, génère l'attestation de présence PDF et envoie
    l'email de confirmation à l'apprenant."""
    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
    student = await db.users.find_one({"id": payload.student_id}, {"_id": 0, "password_hash": 0}) or {"name": payload.student_name}
    animateur = None
    animateur_signature_data_url = None
    if signed_by_animateur_id:
        animateur = await db.users.find_one({"id": signed_by_animateur_id}, {"_id": 0, "password_hash": 0})
    if not animateur:
        # Signature à distance par l'apprenant : pas d'animateur présent pour
        # co-signer — on utilise le premier formateur assigné au stage pour
        # que l'attestation reste correctement mise en page (nom/signature),
        # sans quoi generate_attestation_pdf recevrait un intervenant vide.
        animateur_ids = _stage_animateur_ids(stage)
        if animateur_ids:
            animateur = await db.users.find_one({"id": animateur_ids[0]}, {"_id": 0, "password_hash": 0})
    animateur = animateur or {"name": "TDL Formation"}
    if animateur.get("signature_path"):
        try:
            animateur_signature_data_url = await _path_to_data_url(animateur["signature_path"])
        except Exception:
            pass

    periode = payload.periode or "journee"
    em_doc = {
        "id": str(uuid.uuid4()), "stage_id": payload.stage_id,
        "inscription_id": payload.inscription_id, "student_id": payload.student_id,
        "student_name": payload.student_name, "session_date": payload.session_date, "periode": periode,
        "present": payload.present, "signed_by_animateur": signed_by_animateur_id, "signed_at": now_iso(),
        "animateur_signed": bool(animateur_signature_data_url), "signed_by_student": signed_by_student,
    }
    await db.emargements.update_one(
        {"stage_id": payload.stage_id, "inscription_id": payload.inscription_id, "session_date": payload.session_date, "periode": periode},
        {"$set": em_doc}, upsert=True
    )

    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    pdf_bytes = await asyncio.to_thread(
        generate_attestation_pdf, stage, formation, student, animateur, payload.signature_data_url, payload.present,
        settings_doc, animateur_signature_data_url, periode,
    )
    path = f"{APP_NAME}/attestations/{payload.stage_id}/{payload.session_date}/{periode}/{payload.inscription_id}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")

    doc_meta = {
        "id": str(uuid.uuid4()), "type_doc": "attestation_presence",
        "nom_fichier": f"attestation_{student.get('name', '').replace(' ', '_')}_{payload.session_date}_{periode}_{stage.get('id', '')[:8]}.pdf",
        "stage_id": payload.stage_id, "inscription_id": payload.inscription_id,
        "student_id": payload.student_id, "session_date": payload.session_date, "periode": periode,
        "storage_path": result["path"], "size": result["size"],
        "generated_by": signed_by_animateur_id or payload.student_id, "generated_at": now_iso(), "signed": True,
    }
    await db.generated_docs.insert_one(doc_meta)

    if student.get("email"):
        try:
            await send_email(
                student["email"],
                f"Votre attestation de présence — {formation.get('title', '')}",
                render_branded_email(
                    f"Bonjour {student.get('name', '')},\n\n"
                    f"Votre présence à la session du {payload.session_date} a été enregistrée.\n\n"
                    "Vous trouverez votre attestation signée dans votre espace TDL Formation."
                ),
            )
        except Exception:
            pass

    doc_meta.pop("_id", None)
    em_doc.pop("_id", None)
    return em_doc, doc_meta


async def _notify_if_all_signed(stage: dict, session_date: str, periode: str):
    """Une fois TOUS les apprenants actifs de cette session signés (présents
    ou absents, peu importe — l'important est que l'émargement soit acté
    pour chacun), prévient automatiquement le(s) formateur(s) que la feuille
    est complète — ils n'ont plus besoin de vérifier manuellement. Ne
    notifie qu'une seule fois par session/période grâce au flag stocké sur
    le stage."""
    already = stage.get("emargement_complete_notified") or []
    key = f"{session_date}_{periode}"
    if key in already:
        return
    inscrits = await db.inscriptions.find(
        {"stage_id": stage["id"], "status": "active"}, {"_id": 0, "id": 1}
    ).to_list(500)
    if not inscrits:
        return
    signed_count = await db.emargements.count_documents({
        "stage_id": stage["id"], "session_date": session_date, "periode": periode,
        "inscription_id": {"$in": [i["id"] for i in inscrits]},
    })
    if signed_count < len(inscrits):
        return

    await db.stages.update_one({"id": stage["id"]}, {"$addToSet": {"emargement_complete_notified": key}})
    animateur_ids = _stage_animateur_ids(stage)
    if not animateur_ids:
        return
    formateurs = await db.users.find({"id": {"$in": animateur_ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(20)
    periode_label = {"matin": "matin", "apres_midi": "après-midi", "journee": "journée"}.get(periode, periode)
    message = (
        f"Bonjour,\n\n"
        f"Tous les apprenants ({len(inscrits)}) de la session du {session_date} ({periode_label}) — "
        f"{stage.get('formation_titre', '')} — ont désormais signé leur émargement.\n\n"
        "Vous pouvez générer la feuille d'émargement complète depuis votre espace formateur."
    )
    for f in formateurs:
        if f.get("email"):
            try:
                await send_email(f["email"], f"✅ Émargements complets — {session_date}", render_branded_email(message))
            except Exception:
                pass
    await send_push_to_users(
        [f["id"] for f in formateurs], "Émargements complets",
        f"Session du {session_date} ({periode_label}) — tous les apprenants ont signé", "/espace-animateur",
    )


@router.post("/emargements")
async def create_emargement(payload: EmargementIn, user: dict = Depends(require_role("admin", "animateur"))):
    stage = await db.stages.find_one({"id": payload.stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    if user["role"] == "animateur" and user["id"] not in _stage_animateur_ids(stage):
        raise HTTPException(status_code=403, detail="Accès refusé")
    if payload.present and not (payload.signature_data_url or "").startswith("data:image"):
        raise HTTPException(status_code=400, detail="Une signature est requise lorsque le stagiaire est marqué présent")
    valid_days = _stage_days(stage)
    if payload.session_date not in valid_days:
        raise HTTPException(status_code=400, detail=f"session_date doit être l'un de : {', '.join(valid_days)}")
    periode = payload.periode or "journee"
    if periode not in _PERIODES:
        raise HTTPException(status_code=400, detail=f"periode doit être l'un de : {', '.join(_PERIODES)}")

    em_doc, doc_meta = await _finalize_emargement(stage, payload, signed_by_animateur_id=user["id"])
    await db.emargement_requests.update_many(
        {"stage_id": payload.stage_id, "inscription_id": payload.inscription_id, "session_date": payload.session_date, "periode": periode, "status": "pending"},
        {"$set": {"status": "signed", "signed_at": now_iso()}},
    )
    await _notify_if_all_signed(stage, payload.session_date, periode)
    return {"emargement": em_doc, "document": doc_meta}


@router.post("/stages/{sid}/emargements/request")
async def request_emargements(sid: str, payload: EmargementRequestIn, user: dict = Depends(require_role("admin", "animateur"))):
    """Bouton « Demander les émargements » côté formateur : invite chaque
    apprenant actif de la session à signer lui-même à distance depuis son
    espace — utile quand la signature n'a pas pu être prise en présentiel sur
    tablette. N'envoie qu'aux apprenants pas déjà signés et pas déjà
    relancés pour ce créneau (évite les doublons si le bouton est cliqué
    plusieurs fois)."""
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    if user["role"] == "animateur" and user["id"] not in _stage_animateur_ids(stage):
        raise HTTPException(status_code=403, detail="Accès refusé")
    valid_days = _stage_days(stage)
    if payload.session_date not in valid_days:
        raise HTTPException(status_code=400, detail=f"session_date doit être l'un de : {', '.join(valid_days)}")
    periode = payload.periode or "journee"
    if periode not in _PERIODES:
        raise HTTPException(status_code=400, detail=f"periode doit être l'un de : {', '.join(_PERIODES)}")

    inscrits = await db.inscriptions.find({"stage_id": sid, "status": "active"}, {"_id": 0}).to_list(500)
    already_signed = {
        e["inscription_id"] for e in await db.emargements.find(
            {"stage_id": sid, "session_date": payload.session_date, "periode": periode}, {"_id": 0, "inscription_id": 1}
        ).to_list(500)
    }
    already_requested = {
        r["inscription_id"] for r in await db.emargement_requests.find(
            {"stage_id": sid, "session_date": payload.session_date, "periode": periode, "status": "pending"}, {"_id": 0, "inscription_id": 1}
        ).to_list(500)
    }
    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
    periode_label = {"matin": "matin", "apres_midi": "après-midi", "journee": "journée"}.get(periode, periode)
    notified = 0
    for insc in inscrits:
        if insc["id"] in already_signed or insc["id"] in already_requested:
            continue
        req_id = str(uuid.uuid4())
        await db.emargement_requests.insert_one({
            "id": req_id, "stage_id": sid, "inscription_id": insc["id"], "student_id": insc.get("student_id"),
            "student_name": insc.get("student_name"), "session_date": payload.session_date, "periode": periode,
            "status": "pending", "requested_by": user["id"], "requested_at": now_iso(),
        })
        if insc.get("student_email"):
            try:
                await send_email(
                    insc["student_email"],
                    f"Signature de votre émargement — {formation.get('title', '')}",
                    render_branded_email(
                        f"Bonjour {insc.get('student_name', '')},\n\n"
                        f"Merci de confirmer votre présence à la session du {payload.session_date} ({periode_label}) "
                        f"— {formation.get('title', '')} — en signant votre émargement depuis votre espace apprenant.",
                        "Signer mon émargement", f"{PUBLIC_FRONTEND_URL}/espace-eleve",
                    ),
                )
            except Exception:
                pass
        if insc.get("student_id"):
            await send_push_to_user(
                insc["student_id"], "Émargement à signer",
                f"Session du {payload.session_date} ({periode_label}) — merci de confirmer votre présence", "/espace-eleve",
            )
        notified += 1
    return {"notified": notified}


@router.get("/me/emargement-requests")
async def my_emargement_requests(user: dict = Depends(get_current_user)):
    """Émargements en attente de signature pour l'apprenant connecté —
    affichés dans son espace (bannière/notification « à faire »)."""
    if user["role"] != "etudiant":
        raise HTTPException(status_code=403, detail="Réservé aux apprenants")
    requests = await db.emargement_requests.find(
        {"student_id": user["id"], "status": "pending"}, {"_id": 0}
    ).sort("requested_at", -1).to_list(50)
    stage_ids = list({r["stage_id"] for r in requests})
    stages = await db.stages.find({"id": {"$in": stage_ids}}, {"_id": 0}).to_list(50) if stage_ids else []
    stages_by_id = {s["id"]: s for s in stages}
    for r in requests:
        stage = stages_by_id.get(r["stage_id"])
        r["formation_titre"] = stage.get("formation_titre") if stage else None
        r["lieu_ville"] = stage.get("lieu_ville") if stage else None
    return requests


@router.post("/me/emargements/sign")
async def sign_my_emargement(payload: EmargementSelfSignIn, user: dict = Depends(get_current_user)):
    """L'apprenant signe lui-même son émargement à distance, depuis son
    espace, en réponse à une demande du formateur (voir POST
    /stages/{sid}/emargements/request)."""
    if user["role"] != "etudiant":
        raise HTTPException(status_code=403, detail="Réservé aux apprenants")
    if not (payload.signature_data_url or "").startswith("data:image"):
        raise HTTPException(status_code=400, detail="Signature invalide")
    req = await db.emargement_requests.find_one({"id": payload.request_id, "student_id": user["id"], "status": "pending"}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande d'émargement introuvable ou déjà traitée")
    stage = await db.stages.find_one({"id": req["stage_id"]}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")

    emargement_payload = EmargementIn(
        stage_id=req["stage_id"], inscription_id=req["inscription_id"], student_id=req["student_id"],
        student_name=req.get("student_name") or user.get("name", ""), signature_data_url=payload.signature_data_url,
        present=True, session_date=req["session_date"], periode=req["periode"],
    )
    em_doc, doc_meta = await _finalize_emargement(stage, emargement_payload, signed_by_animateur_id=None, signed_by_student=True)
    await db.emargement_requests.update_one({"id": req["id"]}, {"$set": {"status": "signed", "signed_at": now_iso()}})
    await _notify_if_all_signed(stage, req["session_date"], req["periode"])
    return {"emargement": em_doc, "document": doc_meta}


@router.get("/emargements")
async def list_emargements(stage_id: Optional[str] = None, session_date: Optional[str] = None, periode: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    q = {}
    if stage_id: q["stage_id"] = stage_id
    if session_date: q["session_date"] = session_date
    if periode: q["periode"] = periode
    if user["role"] == "animateur":
        own = await db.stages.find(
            {"$or": [{"animateur_ids": user["id"]}, {"animateur_id": user["id"]}]}, {"_id": 0, "id": 1}
        ).to_list(500)
        q["stage_id"] = {"$in": [s["id"] for s in own]}
    return await db.emargements.find(q, {"_id": 0}).sort("signed_at", -1).to_list(2000)


@router.get("/stages/{sid}/emargement-pdf")
async def generate_emargement_sheet_pdf(sid: str, session_date: Optional[str] = None, periode: Optional[str] = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage introuvable")
    if user["role"] == "animateur" and user["id"] not in _stage_animateur_ids(stage):
        raise HTTPException(status_code=403, detail="Accès refusé")
    valid_days = _stage_days(stage)
    session_date = session_date or valid_days[0]
    if session_date not in valid_days:
        raise HTTPException(status_code=400, detail=f"session_date doit être l'un de : {', '.join(valid_days)}")
    periode = periode or "journee"
    if periode not in _PERIODES:
        raise HTTPException(status_code=400, detail=f"periode doit être l'un de : {', '.join(_PERIODES)}")
    periode_label = {"matin": "Matin", "apres_midi": "Après-midi", "journee": "Journée"}[periode]

    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
    inscrits = await db.inscriptions.find({"formation_id": stage["formation_id"]}, {"_id": 0}).to_list(500)
    animateur_ids = _stage_animateur_ids(stage)
    animateurs_docs = await db.users.find({"id": {"$in": animateur_ids}}, {"_id": 0, "password_hash": 0}).to_list(20) if animateur_ids else []
    animateur = animateurs_docs[0] if animateurs_docs else None

    periode_filter = {"$in": [periode, None]} if periode == "journee" else periode
    rows = ""
    for ins in inscrits:
        em = await db.emargements.find_one({"stage_id": sid, "inscription_id": ins["id"], "session_date": session_date, "periode": periode_filter}, {"_id": 0})
        signed = "✓ Signé" if em and em.get("present") else ("Absent" if em else "—")
        rows += f'<tr><td style="padding:6px;">{ins.get("student_name", "")}</td><td style="padding:6px;text-align:right;">{signed}</td></tr>'
    if not rows:
        rows = '<tr><td colspan="2" style="padding:6px;text-align:center;color:#999;">Aucun inscrit</td></tr>'

    if animateurs_docs:
        intervenant_row = "".join(
            f'<tr><td style="padding:6px;">{a.get("name", "")}</td><td style="padding:6px;text-align:right;">_____________</td></tr>'
            for a in animateurs_docs
        )
    else:
        intervenant_row = '<tr><td colspan="2" style="padding:6px;text-align:center;color:#999;">Aucun formateur assigné</td></tr>'

    tpl = await db.doc_templates.find_one({"nom": "Feuille d'émargement - Présence stagiaires", "actif": True}, {"_id": 0})
    context = {
        "organisme_nom": "TOP DRIVE LEARNING", "email": "tdlparisformation@gmail.com",
        "telephone": "01 80 90 72 49", "adresse": "59 avenue JOFFRE, 93800 EPINAY-SUR-SEINE",
        "code_postal": "93800", "ville": stage.get("lieu_ville", "EPINAY SUR SEINE"),
        "siret": "90096880100010", "numero_declaration_activite": "11930882293",
        "formation_titre": f"{formation.get('title', stage.get('formation_titre', ''))} — {periode_label}",
        "date_debut": session_date, "date_fin": session_date,
        "lieu_formation": f"{stage.get('lieu_adresse', '')}, {stage.get('lieu_ville', '')}",
        "duree_totale": str(formation.get("duration_hours", "")),
        "formateurs_list": ", ".join(a.get("name", "") for a in animateurs_docs) if animateurs_docs else "",
        "apprenants_list": rows, "intervenants_list": intervenant_row,
        "lieu_signature": stage.get("lieu_ville", "EPINAY SUR SEINE"), "date_signature": session_date,
    }
    if not tpl:
        raise HTTPException(status_code=404, detail="Modèle 'Feuille d'émargement' introuvable. Lancez seed_doc_templates.py.")
    html = tpl["contenu_html"]
    for k, v in context.items():
        html = html.replace("{{ " + k + " }}", str(v)).replace("{{" + k + "}}", str(v))
    pdf_bytes = await asyncio.to_thread(render_html_pdf, html)
    fname = f"emargement_{stage.get('formation_titre', 'session')}_{session_date}_{periode}.pdf".replace(" ", "_")
    path = f"{APP_NAME}/generated/emargement_{sid}_{session_date}_{periode}.pdf"
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
