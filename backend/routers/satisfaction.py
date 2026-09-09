import uuid
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import require_role
from core.utils import now_iso
from core.config import ROLES_ALL_STAFF
from models.satisfaction import SatisfactionResponseIn

router = APIRouter(prefix="/satisfaction", tags=["satisfaction"])


@router.get("/public/{inscription_id}")
async def get_survey_context(inscription_id: str, type: str):
    """Contexte minimal (nom, formation) pour affichage du formulaire public
    de satisfaction, sans exposer le reste du dossier — voir
    frontend/src/pages/SatisfactionSurvey.jsx."""
    insc = await db.inscriptions.find_one({"id": inscription_id}, {"_id": 0})
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription introuvable")
    existing = await db.satisfaction_responses.find_one({"inscription_id": inscription_id, "type": type}, {"_id": 0})
    return {
        "student_name": insc.get("student_name"),
        "formation_titre": insc.get("formation_title") or insc.get("formation_titre"),
        "already_submitted": bool(existing),
    }


@router.post("/public")
async def submit_survey(payload: SatisfactionResponseIn):
    insc = await db.inscriptions.find_one({"id": payload.inscription_id}, {"_id": 0})
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription introuvable")
    if payload.type not in ("chaud", "froid"):
        raise HTTPException(status_code=400, detail="Type de questionnaire invalide")
    existing = await db.satisfaction_responses.find_one({"inscription_id": payload.inscription_id, "type": payload.type})
    if existing:
        raise HTTPException(status_code=400, detail="Questionnaire déjà rempli")
    doc = {
        "id": str(uuid.uuid4()), "inscription_id": payload.inscription_id, "stage_id": insc.get("stage_id"),
        "student_name": insc.get("student_name"), "type": payload.type,
        "answers": payload.answers, "commentaire": payload.commentaire, "created_at": now_iso(),
    }
    await db.satisfaction_responses.insert_one(doc)
    return {"ok": True}


@router.get("")
async def list_survey_responses(type: str = None, inscription_id: str = None, user: dict = Depends(require_role(*ROLES_ALL_STAFF))):
    q = {}
    if type: q["type"] = type
    if inscription_id: q["inscription_id"] = inscription_id
    return await db.satisfaction_responses.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
