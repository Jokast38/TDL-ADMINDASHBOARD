import asyncio
import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.storage import put_object, get_object
from core.utils import now_iso
from core.config import APP_NAME, ROLES_DOCS_VIEW, PUBLIC_FRONTEND_URL
from models.positioning_test import PositioningTestIn, PositioningTestSubmitIn
from services.positioning_test_data import POSITIONING_QUESTIONS
from services.pdf import render_html_pdf
from services.email import send_email
from services.push import send_push_to_users

router = APIRouter(prefix="/positioning-tests", tags=["positioning-tests"])

GOLD = "#d4af37"


@router.post("")
async def create_positioning_test(payload: PositioningTestIn, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    """Crée un lien de test de positionnement à envoyer au futur stagiaire —
    il le remplit lui-même en ligne, sans compte à créer."""
    doc = {
        "id": str(uuid.uuid4()),
        "token": secrets.token_urlsafe(16),
        "stagiaire_nom": payload.stagiaire_nom,
        "session": payload.session or "",
        "evaluateur": payload.evaluateur or "",
        "inscription_id": payload.inscription_id,
        "status": "pending",
        "answers": None,
        "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.positioning_tests.insert_one(doc)
    doc.pop("_id", None)
    doc["link"] = f"{PUBLIC_FRONTEND_URL}/test-positionnement/{doc['token']}"
    return doc


@router.get("")
async def list_positioning_tests(user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    items = await db.positioning_tests.find({}, {"_id": 0, "answers": 0}).sort("created_at", -1).to_list(500)
    for it in items:
        it["link"] = f"{PUBLIC_FRONTEND_URL}/test-positionnement/{it['token']}"
    return items


@router.get("/{token}")
async def get_positioning_test_public(token: str):
    """Public — sert les questions (sans corrigé, il n'y en a pas : la
    notation reste manuelle, comme sur le document papier d'origine)."""
    t = await db.positioning_tests.find_one({"token": token}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Lien de test introuvable")
    if t["status"] != "pending":
        raise HTTPException(status_code=410, detail="Ce test a déjà été complété")
    return {
        "stagiaire_nom": t["stagiaire_nom"],
        "session": t["session"],
        "questions": POSITIONING_QUESTIONS,
    }


def _cb(checked: bool, label: str) -> str:
    inner = "&#10003;" if checked else "&nbsp;"
    weight = "font-weight:bold;" if checked else ""
    box = f'<span style="display:inline-block;border:1px solid #333333;padding:2px 5px;margin-right:5px;{weight}">{inner}</span>'
    return f'<span style="{"background:#fff8e1;" if checked else ""}">{box}{label}</span>'


def _build_result_html(t: dict, answers: dict, reponse_q17: str, domaines: list) -> str:
    rows = []
    for i, q in enumerate(POSITIONING_QUESTIONS):
        chosen = answers.get(str(i))
        opts_html = " &nbsp;&nbsp; ".join(_cb(opt == chosen, opt) for opt in q["options"])
        rows.append(f"""
        <tr>
          <td width="4%" style="padding:6px 4px;font-family:Helvetica-Bold;font-size:9pt;vertical-align:top;">{i + 1}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #eeeeee;">
            <span style="font-family:Helvetica-Bold;font-size:9pt;color:{GOLD};">{q['theme']}</span> —
            <span style="font-family:Helvetica;font-size:9pt;">{q['question']}</span><br/>
            <span style="font-family:Helvetica;font-size:8.5pt;">{opts_html}</span>
          </td>
        </tr>""")

    domaines_html = " &nbsp; ".join(
        _cb(d in domaines, d) for d in ["Réglementation", "Gestion/calcul", "Sécurité routière", "Français/anglais", "Commercial", "Pratique"]
    )

    return f"""
    <table width="100%" style="margin-bottom:6px;">
      <tr>
        <td width="70%">
          <span style="font-family:Helvetica-Bold;font-size:16pt;color:#0a0a0a;">TDL FORMATION</span><br/>
          <span style="font-family:Helvetica;font-size:8.5pt;color:#666666;">59 avenue Joffre, 93800 Épinay-sur-Seine</span>
        </td>
      </tr>
    </table>
    <hr/>
    <h1 style="font-family:Helvetica-Bold;font-size:17pt;color:#0a0a0a;text-align:center;margin-bottom:2px;">Test de positionnement — Résultats</h1>
    <p style="font-family:Helvetica-Bold;font-size:11pt;color:{GOLD};text-align:center;margin-top:0;">Formation VTC — Rempli en ligne par le candidat (RS5637)</p>
    <table width="100%" style="font-family:Helvetica;font-size:9.5pt;margin:10px 0;">
      <tr><td width="50%">Nom et prénom : <b>{t['stagiaire_nom']}</b></td><td width="50%">Date de passation : <b>{now_iso()[:10]}</b></td></tr>
      <tr><td>Session : <b>{t.get('session') or '—'}</b></td><td>Évaluateur assigné : <b>{t.get('evaluateur') or '—'}</b></td></tr>
    </table>
    <table width="100%" style="font-family:Helvetica;font-size:9pt;">
      {"".join(rows)}
    </table>
    <p style="font-family:Helvetica;font-size:9.5pt;margin-top:10px;">
      <b>17. Deux comportements favorisant une prise en charge professionnelle (réponse libre) :</b><br/>
      {reponse_q17 or '<i>Non renseigné</i>'}
    </p>
    <p style="font-family:Helvetica;font-size:9.5pt;">
      <b>18. Domaines à renforcer selon le candidat :</b><br/>{domaines_html}
    </p>
    <div style="page-break-before: always;"></div>
    <h2 style="font-family:Helvetica-Bold;font-size:13pt;color:#0a0a0a;">Partie évaluateur — à compléter manuellement</h2>
    <table width="100%" style="border:1px solid #dddddd;font-family:Helvetica;font-size:9pt;margin-top:10px;">
      <tr style="background-color:#0a0a0a;">
        <td style="padding:6px;color:{GOLD};"><b>Score QCM</b></td>
        <td style="padding:6px;color:{GOLD};"><b>Niveau observé</b></td>
        <td style="padding:6px;color:{GOLD};"><b>Adaptation pédagogique</b></td>
      </tr>
      <tr>
        <td style="padding:8px;">........ / 16</td>
        <td style="padding:8px;">{_cb(False, "Bases fragiles")} {_cb(False, "Intermédiaire")} {_cb(False, "Satisfaisant")}</td>
        <td style="padding:8px;">{_cb(False, "Renforcement ciblé")} {_cb(False, "Parcours standard")} {_cb(False, "Accompagnement individuel")}</td>
      </tr>
    </table>
    <table width="100%" style="margin-top:20px;">
      <tr>
        <td width="50%" style="font-family:Helvetica;font-size:9.5pt;">Signature du bénéficiaire :<hr style="width:150px;margin-top:26px;"/></td>
        <td width="50%" align="right" style="font-family:Helvetica;font-size:9.5pt;">Signature de l'évaluateur :<hr style="width:150px;margin-top:26px;"/></td>
      </tr>
    </table>
    <p style="font-family:Helvetica;font-size:7.5pt;color:#999999;text-align:center;margin-top:20px;">
      TDL Formation | 59 avenue Joffre, 93800 Épinay-sur-Seine | SIRET: 90096880100010
    </p>
    """


@router.post("/{token}/submit")
async def submit_positioning_test(token: str, payload: PositioningTestSubmitIn):
    """Public — le candidat soumet ses réponses. Génère immédiatement le PDF
    récapitulatif (réponses cochées + partie évaluateur restée vierge, comme
    sur le document papier d'origine) et le stocke pour l'équipe."""
    t = await db.positioning_tests.find_one({"token": token}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Lien de test introuvable")
    if t["status"] != "pending":
        raise HTTPException(status_code=410, detail="Ce test a déjà été complété")

    html = _build_result_html(t, payload.answers, payload.reponse_q17, payload.domaines_a_renforcer)
    pdf_bytes = await asyncio.to_thread(render_html_pdf, html)
    path = f"{APP_NAME}/positioning-tests/{uuid.uuid4()}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")

    await db.positioning_tests.update_one({"token": token}, {"$set": {
        "status": "submitted",
        "answers": payload.answers,
        "reponse_q17": payload.reponse_q17,
        "domaines_a_renforcer": payload.domaines_a_renforcer,
        "submitted_at": now_iso(),
        "result_storage_path": result["path"],
    }})

    if t.get("evaluateur"):
        evaluateur = await db.users.find_one({"name": t["evaluateur"], "active": True}, {"_id": 0, "id": 1, "email": 1})
        if evaluateur:
            if evaluateur.get("email"):
                await send_email(
                    evaluateur["email"],
                    f"Test de positionnement complété — {t['stagiaire_nom']}",
                    f"<p>Bonjour,</p><p><b>{t['stagiaire_nom']}</b> vient de compléter son test de positionnement"
                    f"{' (session ' + t['session'] + ')' if t.get('session') else ''}.</p>"
                    f"<p>Le résultat vous attend dans la bibliothèque de documents pour compléter la partie évaluateur.</p>",
                )
            await send_push_to_users(
                [evaluateur["id"]], "Test de positionnement complété",
                f"{t['stagiaire_nom']} a répondu au test", "/admin/documents-library",
            )
    return {"ok": True}


@router.get("/{tid}/result/download")
async def download_positioning_test_result(tid: str, user: dict = Depends(require_role(*ROLES_DOCS_VIEW))):
    t = await db.positioning_tests.find_one({"id": tid}, {"_id": 0})
    if not t or not t.get("result_storage_path"):
        raise HTTPException(status_code=404, detail="Résultat introuvable — le candidat n'a pas encore répondu")
    from fastapi.responses import Response
    data, ct = await get_object(t["result_storage_path"])
    return Response(content=data, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="test-positionnement-{t["stagiaire_nom"]}.pdf"'
    })


@router.delete("/{tid}")
async def delete_positioning_test(tid: str, user: dict = Depends(require_role("admin"))):
    await db.positioning_tests.delete_one({"id": tid})
    return {"ok": True}
