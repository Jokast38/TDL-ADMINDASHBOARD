import uuid
from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.security import get_current_user
from core.utils import now_iso
from models.settings import ChatIn
from services.chatbot import call_ollama

router = APIRouter(tags=["ai"])
MAX_HISTORY_MESSAGES = 12

CONTEXT_PROMPTS = {
    "general": "Tu es l'assistant IA de TDL Formation, organisme français de formation (CACES, permis, auto-école, SSIAP, VTC/Taxi) et vente de mobilité électrique (KAMI STREET). Tu réponds en français, de manière professionnelle, claire et concise.",
    "document_verification": "Tu es un assistant spécialisé dans la vérification de documents administratifs français (ANTS, permis de conduire, pièce d'identité, justificatif de domicile). Analyse les documents fournis ou décrits et donne un avis structuré: conformité, anomalies détectées, actions recommandées.",
    "pricing": "Tu es un expert TDL Formation. Génère une proposition de prix détaillée pour le client, avec décomposition (formation, frais administratifs, accompagnement), justification de la valeur, et conditions de paiement (en français).",
    "marketing": "Tu es un expert marketing digital pour TDL Formation. Propose des actions marketing concrètes (SEO, campagnes Ads, email, social), avec budget, cible et KPIs en français."
}


@router.post("/ai/chat")
async def ai_chat(payload: ChatIn, user: dict = Depends(get_current_user)):
    session_id = payload.session_id or str(uuid.uuid4())
    system = CONTEXT_PROMPTS.get(payload.context, CONTEXT_PROMPTS["general"])
    history = await db.ai_messages.find(
        {"session_id": session_id, "user_id": user["id"]},
        {"_id": 0, "user_message": 1, "ai_response": 1},
    ).sort("created_at", -1).to_list(MAX_HISTORY_MESSAGES)
    history.reverse()
    messages = [{"role": "system", "content": system}]
    for item in history:
        messages.append({"role": "user", "content": item["user_message"]})
        messages.append({"role": "assistant", "content": item["ai_response"]})
    messages.append({"role": "user", "content": payload.message})

    try:
        response = await call_ollama(messages)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur IA Ollama: {e}")

    log = {
        "id": str(uuid.uuid4()), "session_id": session_id, "user_id": user["id"],
        "context": payload.context, "user_message": payload.message,
        "ai_response": response,
        "created_at": now_iso()
    }
    await db.ai_messages.insert_one(log)
    log.pop("_id", None)
    return {"session_id": session_id, "response": log["ai_response"]}


@router.get("/ai/history")
async def ai_history(session_id: str, user: dict = Depends(get_current_user)):
    return await db.ai_messages.find(
        {"session_id": session_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
