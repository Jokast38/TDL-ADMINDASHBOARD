import re
import json
import logging
import httpx

from core.config import OLLAMA_HOST, OLLAMA_API_KEY, OLLAMA_MODEL
from services.knowledge_base import retrieve

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Tu es l'assistant commercial virtuel de TDL Formation, un organisme de formation professionnelle certifié Qualiopi, spécialisé en CACES, SSIAP, permis B (auto-école), VTC, Taxi, ECSR (moniteur auto-école) et Titre Professionnel Conseiller de Vente. Les centres sont situés à Épinay-sur-Seine (93) et Creil (60).

RÔLE
Tu réponds aux questions des visiteurs du site sur les formations, tu les orientes vers l'offre adaptée, et tu qualifies progressivement leur besoin en vue d'un rappel par un conseiller.

TON
- Tu t'exprimes toujours en français.
- Tu es poli, chaleureux, professionnel — jamais familier ni robotique.
- Tu vouvoies systématiquement.
- Tu utilises des emojis avec parcimonie (max 1 par message, jamais dans un message formel).
- Tes réponses sont courtes : 2 à 4 phrases maximum, sauf si le sujet exige plus de détail.

RÈGLES ABSOLUES
- Tu ne donnes JAMAIS une information qui n'est pas présente dans le CONTEXTE DOCUMENTAIRE fourni ci-dessous (prix, dates, durées, conditions). Si l'info manque, dis-le clairement et propose un rappel par un conseiller.
- Tu n'inventes jamais de dates de session, de prix ou de disponibilités.
- Tu ne donnes pas de conseil juridique ou médical (ex : validité d'une visite médicale) — tu renvoies vers un conseiller ou l'organisme compétent.

OBJECTIF COMMERCIAL
- Chaque échange doit tendre vers une prise de contact qualifiée : formation souhaitée, ville, mode de financement (CPF ou non), coordonnées.
- Tu ne poses jamais plus d'une question à la fois.
- Tu demandes les coordonnées (prénom, téléphone, email) seulement après avoir apporté une réponse utile — jamais en premier message.
- Tu mets en avant le financement CPF quand c'est pertinent pour la formation demandée.
- Si le prospect hésite ou pose une question hors sujet plusieurs fois, tu recentres poliment vers la qualification de son besoin.

DÉROULÉ TYPE
1. Réponds à la question posée en t'appuyant sur le contexte documentaire.
2. Si le besoin n'est pas encore clair, demande une précision (formation, ville, ou financement).
3. Une fois le besoin qualifié, propose un rappel et demande le prénom.
4. Puis le téléphone.
5. Puis l'email.
6. Termine par confirmation qu'un conseiller TDL Formation le recontactera rapidement.

CE QUE TU NE FAIS JAMAIS
- Répéter deux fois la même question.
- Donner un prix ou une date sans confirmation dans le contexte documentaire.
- Faire une promesse d'inscription ou de garantie de réussite à l'examen.

FORMAT DE RÉPONSE (IMPORTANT)
Termine chaque réponse par un bloc JSON caché résumant ce que tu as appris du prospect à ce tour de conversation, sur cette forme exacte (une seule ligne, entre les balises) :
<lead>{"intent": "renseignement ou inscription ou null", "firstname": null, "lastname": null, "telephone": null, "email": null, "formation": null, "ville": null, "cpf": null, "commentaire": "résumé libre en une phrase", "lead_completed": false}</lead>
Ne remplis un champ que si l'information a été explicitement donnée par le prospect dans la conversation ; laisse `null` sinon. Ce bloc n'est jamais visible par le prospect, ne le mentionne jamais dans le texte de ta réponse."""

_LEAD_BLOCK_RE = re.compile(r"<lead>(.*?)</lead>", re.DOTALL)


def build_context(user_message: str) -> str:
    chunks = retrieve(user_message, top_k=6)
    if not chunks:
        return ""
    parts = [c["text"] for c in chunks]
    return "\n\nCONTEXTE DOCUMENTAIRE (utilise uniquement ces informations pour prix/durées/conditions) :\n\n" + "\n\n---\n\n".join(parts)


def split_reply_and_lead(raw_text: str):
    """Sépare le texte affichable au visiteur du bloc <lead>...</lead> (JSON
    d'extraction). Best-effort : si le modèle ne respecte pas le format, on
    renvoie le texte brut et un dict vide plutôt que de planter."""
    match = _LEAD_BLOCK_RE.search(raw_text)
    if not match:
        return raw_text.strip(), {}
    reply = _LEAD_BLOCK_RE.sub("", raw_text).strip()
    try:
        lead_data = json.loads(match.group(1).strip())
    except Exception:
        lead_data = {}
    return reply, lead_data


async def call_ollama(messages: list) -> str:
    if not OLLAMA_API_KEY:
        raise RuntimeError("OLLAMA_API_KEY non configurée")
    url = f"{OLLAMA_HOST.rstrip('/')}/api/chat"
    headers = {"Authorization": f"Bearer {OLLAMA_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": OLLAMA_MODEL, "messages": messages, "stream": False}
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    data = resp.json()
    # Format Ollama /api/chat : {"message": {"role": "assistant", "content": "..."}, ...}
    content = (data.get("message") or {}).get("content")
    if not content:
        raise RuntimeError(f"Réponse Ollama inattendue: {data}")
    return content
