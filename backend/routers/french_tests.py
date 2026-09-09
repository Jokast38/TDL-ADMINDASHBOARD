import asyncio
import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response

from core.database import db
from core.security import require_role
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_DOCS_VIEW, PUBLIC_FRONTEND_URL, PUBLIC_BACKEND_URL
from models.french_test import FrenchTestIn, FrenchTestSubmitIn, FrenchTestSendIn
from services.french_test_data import get_french_test_content
from services.pdf import render_html_pdf
from services.email import send_email
from services.push import send_push_to_users

router = APIRouter(prefix="/french-tests", tags=["french-tests"])

GOLD = "#d4af37"


@router.post("")
async def create_french_test(payload: FrenchTestIn, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    """Crée un lien de test de connaissance de la langue française, thématisé
    selon la catégorie de formation — même principe que les tests de
    positionnement (lien public, sans compte)."""
    doc = {
        "id": str(uuid.uuid4()),
        "token": secrets.token_urlsafe(16),
        "stagiaire_nom": payload.stagiaire_nom,
        "stagiaire_email": payload.stagiaire_email,
        "category": payload.category,
        "session": payload.session or "",
        "evaluateur": payload.evaluateur or "",
        "inscription_id": payload.inscription_id,
        "status": "pending",
        "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.french_tests.insert_one(doc)
    doc.pop("_id", None)
    doc["link"] = f"{PUBLIC_FRONTEND_URL}/test-francais/{doc['token']}"
    if payload.stagiaire_email:
        await _send_test_link_email(payload.stagiaire_email, payload.stagiaire_nom, doc["link"])
        doc["email_sent"] = True
    return doc


async def _send_test_link_email(email: str, nom: str, link: str) -> None:
    await send_email(
        email, "📝 Votre test de connaissance du français — TDL Formation",
        f"<p>Bonjour {nom},</p>"
        "<p>Merci de compléter votre test de connaissance de la langue française en ligne avant votre entrée en formation :</p>"
        f"<p><a href='{link}' style='background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold'>Accéder au test</a></p>"
        "<p>TDL Formation</p>",
    )


@router.post("/{tid}/send")
async def send_french_test_link(tid: str, payload: FrenchTestSendIn, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    """Envoie (ou renvoie) le lien du test par email — à l'adresse fournie,
    ou à celle déjà enregistrée à la création."""
    t = await db.french_tests.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Test introuvable")
    email = payload.email or t.get("stagiaire_email")
    if not email:
        raise HTTPException(status_code=400, detail="Aucune adresse email — indiquez-en une")
    if t["status"] != "pending":
        raise HTTPException(status_code=400, detail="Ce test a déjà été complété")
    link = f"{PUBLIC_FRONTEND_URL}/test-francais/{t['token']}"
    await _send_test_link_email(email, t["stagiaire_nom"], link)
    if email != t.get("stagiaire_email"):
        await db.french_tests.update_one({"id": tid}, {"$set": {"stagiaire_email": email}})
    return {"ok": True}


@router.get("")
async def list_french_tests(user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    items = await db.french_tests.find({}, {"_id": 0, "reponses": 0}).sort("created_at", -1).to_list(500)
    for it in items:
        it["link"] = f"{PUBLIC_FRONTEND_URL}/test-francais/{it['token']}"
    return items


@router.post("/image/{category}")
async def upload_french_test_image(category: str, file: UploadFile = File(...), user: dict = Depends(require_role("admin", "responsable_admission"))):
    """Dépose l'image de situation utilisée en partie 1] du test de français
    pour une catégorie de formation donnée (l'équipe choisit elle-même
    l'image, en remplacement du texte descriptif de secours)."""
    data = await file.read()
    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1][:5]
    path = f"{APP_NAME}/french-tests/images/{category}.{ext}"
    result = await put_object(path, data, file.content_type or "image/jpeg")
    await db.french_test_images.update_one(
        {"category": category},
        {"$set": {"category": category, "storage_path": result["path"], "content_type": file.content_type, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "image_url": f"{PUBLIC_BACKEND_URL}/api/french-tests/image/{category}"}


@router.get("/image/{category}")
async def get_french_test_image(category: str):
    """Public — sert l'image de situation d'une catégorie (affichée sur le
    formulaire public et incluse dans le PDF résultat)."""
    img = await db.french_test_images.find_one({"category": category}, {"_id": 0})
    if not img:
        raise HTTPException(status_code=404, detail="Aucune image déposée pour cette catégorie")
    data, ct = await get_object(img["storage_path"])
    return Response(content=data, media_type=ct or "image/jpeg")


async def _content_with_image(category: str) -> dict:
    content = dict(get_french_test_content(category))
    if await db.french_test_images.find_one({"category": category}, {"_id": 0, "category": 1}):
        content["image_url"] = f"{PUBLIC_BACKEND_URL}/api/french-tests/image/{category}"
    else:
        # Images déposées directement dans frontend/public/tdl-image/<CATEGORIE>.jpg
        # (une par catégorie de formation) — utilisées par défaut tant qu'aucune
        # image n'a été déposée via l'onglet Modules > Images test de français.
        content["image_url"] = f"{PUBLIC_FRONTEND_URL}/tdl-image/{category}.jpg"
    return content


@router.get("/{token}")
async def get_french_test_public(token: str):
    """Public — sert le contenu thématisé selon la catégorie de formation du
    candidat (pas de corrigé transmis : notation manuelle par l'évaluateur,
    comme sur le document papier d'origine)."""
    t = await db.french_tests.find_one({"token": token}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Lien de test introuvable")
    if t["status"] != "pending":
        raise HTTPException(status_code=410, detail="Ce test a déjà été complété")
    content = await _content_with_image(t["category"])
    return {"stagiaire_nom": t["stagiaire_nom"], "session": t["session"], "content": content}


def _build_result_html(t: dict, content: dict, payload: FrenchTestSubmitIn) -> str:
    qcm_rows = []
    for i, q in enumerate(content["qcm"]):
        chosen = payload.qcm_answers.get(str(i))
        opts = " &nbsp;&nbsp; ".join(
            f'<span style="{"font-weight:bold;background:#fff8e1;" if opt == chosen else ""}">'
            f'<span style="display:inline-block;border:1px solid #333;padding:2px 5px;margin-right:4px;">{"&#10003;" if opt == chosen else "&nbsp;"}</span>{opt}</span>'
            for opt in q["options"]
        )
        qcm_rows.append(f"""
        <tr><td style="padding:6px 4px;border-bottom:1px solid #eee;font-family:Helvetica;font-size:9.5pt;">
        <b>{i + 1}.</b> {q['question']}<br/><span style="font-size:9pt;">{opts}</span></td></tr>""")

    calc_rows = "".join(
        f'<tr><td style="padding:4px;font-family:Helvetica;font-size:9.5pt;width:50%;">{c} <b>{payload.calcul_answers.get(str(i), "—")}</b></td></tr>'
        for i, c in enumerate(content["calculs"])
    )
    phrase_rows = "".join(
        f'<tr><td style="padding:6px 4px;border-bottom:1px solid #eee;font-family:Helvetica;font-size:9.5pt;">'
        f'<span style="color:#666;">{p}</span><br/><b>&#8594; {payload.phrases_reponses[i] if i < len(payload.phrases_reponses) else "—"}</b></td></tr>'
        for i, p in enumerate(content["phrases"])
    )

    return f"""
    <table width="100%" style="margin-bottom:6px;">
      <tr><td><span style="font-family:Helvetica-Bold;font-size:16pt;color:#0a0a0a;">TDL FORMATION</span><br/>
      <span style="font-family:Helvetica;font-size:8.5pt;color:#666;">59 avenue Joffre, 93800 Épinay-sur-Seine</span></td></tr>
    </table>
    <hr/>
    <h1 style="font-family:Helvetica-Bold;font-size:17pt;color:#0a0a0a;text-align:center;margin-bottom:2px;">Test de connaissance de la langue française</h1>
    <p style="font-family:Helvetica-Bold;font-size:11pt;color:{GOLD};text-align:center;margin-top:0;">{content['theme_label']}</p>
    <table width="100%" style="font-family:Helvetica;font-size:9.5pt;margin:10px 0;">
      <tr><td width="50%">Nom et prénom : <b>{t['stagiaire_nom']}</b></td><td width="50%">Date de passation : <b>{now_iso()[:10]}</b></td></tr>
      <tr><td>Session : <b>{t.get('session') or '—'}</b></td><td>Évaluateur assigné : <b>{t.get('evaluateur') or '—'}</b></td></tr>
    </table>

    <p style="font-family:Helvetica-Bold;font-size:10.5pt;">1] Situation observée :</p>
    {f'<img src="{content["image_url"]}" style="max-width:100%;max-height:7cm;margin-bottom:6px;"/>' if content.get('image_url') else f'<p style="font-family:Helvetica;font-size:9pt;color:#666;font-style:italic;">{content["consigne_situation"]}</p>'}
    <p style="font-family:Helvetica;font-size:9.5pt;border:1px solid #ddd;padding:8px;white-space:pre-wrap;">{payload.redaction or '<i>Non renseigné</i>'}</p>

    <p style="font-family:Helvetica-Bold;font-size:10.5pt;margin-top:10px;">2] Choisissez la réponse exacte :</p>
    <table width="100%">{"".join(qcm_rows)}</table>

    <p style="font-family:Helvetica-Bold;font-size:10.5pt;margin-top:10px;">3] Tests de calcul :</p>
    <table width="100%">{calc_rows}</table>

    <p style="font-family:Helvetica-Bold;font-size:10.5pt;margin-top:10px;">4] Remettez les phrases dans le bon ordre :</p>
    <table width="100%">{phrase_rows}</table>

    <p style="font-family:Helvetica-Bold;font-size:10.5pt;margin-top:10px;">5] Texte de lecture proposé au candidat :</p>
    <p style="font-family:Helvetica;font-size:9pt;color:#666;">{content['texte_lecture']}</p>

    <div style="page-break-before: always;"></div>
    <h2 style="font-family:Helvetica-Bold;font-size:13pt;color:#0a0a0a;">Partie évaluateur — à compléter manuellement</h2>
    <table width="100%" style="border:1px solid #ddd;font-family:Helvetica;font-size:9pt;margin-top:10px;">
      <tr style="background-color:#0a0a0a;">
        <td style="padding:6px;color:{GOLD};"><b>Niveau de français observé</b></td>
        <td style="padding:6px;color:{GOLD};"><b>Adaptation pédagogique</b></td>
      </tr>
      <tr>
        <td style="padding:8px;">Bases fragiles &nbsp;&nbsp; Intermédiaire &nbsp;&nbsp; Satisfaisant</td>
        <td style="padding:8px;">Renforcement ciblé &nbsp;&nbsp; Parcours standard</td>
      </tr>
    </table>
    <table width="100%" style="margin-top:20px;">
      <tr>
        <td width="50%" style="font-family:Helvetica;font-size:9.5pt;">Signature du bénéficiaire :<hr style="width:150px;margin-top:26px;"/></td>
        <td width="50%" align="right" style="font-family:Helvetica;font-size:9.5pt;">Signature de l'évaluateur :<hr style="width:150px;margin-top:26px;"/></td>
      </tr>
    </table>
    <p style="font-family:Helvetica;font-size:7.5pt;color:#999;text-align:center;margin-top:20px;">
      TDL Formation | 59 avenue Joffre, 93800 Épinay-sur-Seine | SIRET: 90096880100010
    </p>
    """


@router.post("/{token}/submit")
async def submit_french_test(token: str, payload: FrenchTestSubmitIn):
    t = await db.french_tests.find_one({"token": token}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Lien de test introuvable")
    if t["status"] != "pending":
        raise HTTPException(status_code=410, detail="Ce test a déjà été complété")

    content = await _content_with_image(t["category"])
    html = _build_result_html(t, content, payload)
    pdf_bytes = await asyncio.to_thread(render_html_pdf, html)
    path = f"{APP_NAME}/french-tests/{uuid.uuid4()}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")

    await db.french_tests.update_one({"token": token}, {"$set": {
        "status": "submitted",
        "reponses": payload.model_dump(),
        "submitted_at": now_iso(),
        "result_storage_path": result["path"],
    }})

    if t.get("evaluateur"):
        evaluateur = await db.users.find_one({"name": t["evaluateur"], "active": True}, {"_id": 0, "id": 1, "email": 1})
        if evaluateur:
            if evaluateur.get("email"):
                await send_email(
                    evaluateur["email"],
                    f"Test de français complété — {t['stagiaire_nom']}",
                    f"<p>Bonjour,</p><p><b>{t['stagiaire_nom']}</b> vient de compléter son test de connaissance "
                    f"de la langue française{' (session ' + t['session'] + ')' if t.get('session') else ''}.</p>"
                    f"<p>Le résultat vous attend dans la bibliothèque de documents pour compléter la partie évaluateur.</p>",
                )
            await send_push_to_users(
                [evaluateur["id"]], "Test de français complété",
                f"{t['stagiaire_nom']} a répondu au test", "/admin/documents-library",
            )
    return {"ok": True}


@router.get("/{tid}/result/download")
async def download_french_test_result(tid: str, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    t = await db.french_tests.find_one({"id": tid}, {"_id": 0})
    if not t or not t.get("result_storage_path"):
        raise HTTPException(status_code=404, detail="Résultat introuvable — le candidat n'a pas encore répondu")
    data, ct = await get_object(t["result_storage_path"])
    return Response(content=data, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="test-francais-{t["stagiaire_nom"]}.pdf"'
    })


@router.delete("/{tid}")
async def delete_french_test(tid: str, user: dict = Depends(require_role("admin"))):
    await db.french_tests.delete_one({"id": tid})
    return {"ok": True}
