import uuid
import logging
from fastapi import APIRouter, HTTPException

from core.database import db
from core.utils import now_iso
from models.chatbot import ChatMessageIn
from services.chatbot import SYSTEM_PROMPT, build_context, call_ollama, split_reply_and_lead

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chatbot"])

MAX_HISTORY_TURNS = 12  # messages (user+assistant confondus) gardés en contexte


@router.post("/message")
async def chat_message(payload: ChatMessageIn):
    session_id = payload.session_id or str(uuid.uuid4())
    session = await db.chat_sessions.find_one({"id": session_id}, {"_id": 0})
    history = (session or {}).get("messages", [])

    context = build_context(payload.message)
    messages = [{"role": "system", "content": SYSTEM_PROMPT + context}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history[-MAX_HISTORY_TURNS:]]
    messages.append({"role": "user", "content": payload.message})

    try:
        raw_reply = await call_ollama(messages)
    except Exception as e:
        logger.error(f"Erreur chatbot Ollama (session {session_id}): {e}")
        raise HTTPException(status_code=502, detail=f"Assistant indisponible pour le moment: {e}")

    reply, lead_data = split_reply_and_lead(raw_reply)

    new_messages = history + [
        {"role": "user", "content": payload.message, "at": now_iso()},
        {"role": "assistant", "content": reply, "at": now_iso()},
    ]
    await db.chat_sessions.update_one(
        {"id": session_id},
        {"$set": {"id": session_id, "messages": new_messages, "updated_at": now_iso()},
         "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )

    if lead_data:
        await _upsert_lead_from_chat(session_id, lead_data)

    return {"session_id": session_id, "reply": reply}


async def _upsert_lead_from_chat(session_id: str, lead_data: dict):
    """Fusionne les infos extraites par le modèle dans la collection leads
    existante (même base que la page Leads de l'admin) — un lead par session
    de chat, mis à jour au fil de la conversation sans écraser les champs déjà
    renseignés par des valeurs null."""
    firstname = (lead_data.get("firstname") or "").strip()
    lastname = (lead_data.get("lastname") or "").strip()
    name = " ".join(p for p in [firstname, lastname] if p).strip()

    update = {}
    if name:
        update["name"] = name
    if lead_data.get("telephone"):
        update["phone"] = lead_data["telephone"]
    if lead_data.get("email"):
        update["email"] = lead_data["email"]
    if lead_data.get("formation"):
        update["interest"] = lead_data["formation"]
    if lead_data.get("commentaire"):
        update["notes"] = lead_data["commentaire"]

    if not update and lead_data.get("intent") is None:
        return  # rien d'exploitable à ce tour

    existing = await db.leads.find_one({"chat_session_id": session_id})
    if existing:
        if update:
            update["updated_at"] = now_iso()
            await db.leads.update_one({"id": existing["id"]}, {"$set": update})
        return

    # Un lead n'est créé qu'une fois qu'il y a au moins de quoi le recontacter
    # (nom + téléphone ou email) — pas de fiche vide pour une simple question.
    if not name or not (lead_data.get("telephone") or lead_data.get("email")):
        return

    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": lead_data.get("email"),
        "phone": lead_data.get("telephone"),
        "interest": lead_data.get("formation") or "",
        "notes": lead_data.get("commentaire") or "",
        "tags": ["chatbot"],
        "status": "nouveau",
        "contacted": False,
        "chat_session_id": session_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.leads.insert_one(doc)
