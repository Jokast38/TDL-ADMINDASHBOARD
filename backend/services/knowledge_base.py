"""Base de connaissances du chatbot commercial (RAG léger).

Les fichiers markdown de knowledge/ sont découpés par section ("## ...") au
démarrage, puis retrouvés par recouvrement de mots-clés (pas d'embeddings —
pas de dépendance vectorielle à opérer pour un premier lancement). Chaque
chunk garde son fichier d'origine pour le contexte donné au modèle.
"""
import math
import re
from pathlib import Path
from typing import List, Dict

KNOWLEDGE_DIR = Path(__file__).parent.parent / "knowledge"

_ACCENTS = str.maketrans("àâäéèêëîïôöùûüç", "aaaeeeeiioouuuc")


def _normalize(text: str) -> str:
    return text.lower().translate(_ACCENTS)


def _tokenize(text: str) -> set:
    return set(re.findall(r"[a-z0-9]+", _normalize(text)))


_STOPWORDS = _tokenize(
    "le la les un une des de du et en est sont pour avec sur dans que qui ne pas "
    "plus au aux se sa son ses ce cette il elle vous je tu nous ils elles à d l "
    # Mots interrogatifs/conversationnels : rares dans une base documentaire
    # déclarative (donc IDF élevé) mais fréquents dans les questions posées —
    # sans ce filtre, l'IDF les surpondère à tort au détriment des mots
    # réellement distinctifs du sujet (ex: "caces", "prix").
    "combien coute coûte comment pourquoi quand quel quelle quels quelles "
    "cela ca ça faut dois veux voudrais aimerais merci bonjour svp voila voilà "
    "peux peut peuvent puis y a avoir etre être fait faire dit dire"
)


# Route explicite par thème : si l'un de ces mots apparaît dans la question,
# les chunks du fichier correspondant sont fortement boostés. Ça évite qu'un
# mot incident rare mais hors-sujet (ex: "chez") ne l'emporte par IDF sur le
# fichier réellement pertinent — un bag-of-words seul reste trop fragile pour
# ça, ce garde-fou corrige les cas les plus fréquents (une formation nommée).
_TOPIC_KEYWORDS = {
    "caces": {"caces", "chariot", "nacelle", "grue"},
    "ssiap": {"ssiap"},
    "vtc": {"vtc"},
    "taxi": {"taxi"},
    "auto-ecole": {"autoecole", "conduite"},  # "permis" seul est ambigu avec permis-points
    "ecsr": {"ecsr", "moniteur"},
    "vente": {"vente", "vendeur", "commerce"},
    "permis-points": {"point", "points", "rattrapage", "recuperation"},
    "cpf": {"cpf"},
    "financement": {"financement", "paiement", "payer"},
    "documents": {"document", "documents", "piece", "pieces"},
    "tarifs": {"tarif", "tarifs", "prix", "grille"},
    "planning": {"planning", "session", "sessions", "horaire", "horaires", "adresse", "centre", "centres"},
}
_TOPIC_BOOST = 8.0
_MAX_IDF = 2.5

_chunks: List[Dict] = []
_idf: Dict[str, float] = {}


def _compute_idf(chunks: List[Dict]) -> Dict[str, float]:
    """Poids inverse-fréquence-documentaire : un mot présent dans presque tous
    les chunks (ex: "formation", omniprésent puisque tout le corpus en parle)
    pèse presque rien ; un mot rare et distinctif (ex: "caces", "r489", "prix")
    pèse beaucoup plus dans le score de pertinence."""
    n = max(len(chunks), 1)
    df: Dict[str, int] = {}
    for chunk in chunks:
        for token in chunk["tokens"]:
            df[token] = df.get(token, 0) + 1
    return {token: min(math.log((n + 1) / (count + 1)) + 0.1, _MAX_IDF) for token, count in df.items()}


def _load_chunks() -> List[Dict]:
    chunks = []
    if not KNOWLEDGE_DIR.exists():
        return chunks
    for path in sorted(KNOWLEDGE_DIR.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        # Découpe par titre de section ("## ..."), en gardant le titre de
        # premier niveau ("# ...") comme préfixe de contexte sur chaque chunk.
        title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        doc_title = title_match.group(1).strip() if title_match else path.stem
        sections = re.split(r"\n(?=##\s)", text)
        for section in sections:
            section = section.strip()
            if not section or section.startswith("# "):
                # La première "section" avant le premier "##" est l'intro/titre.
                if section and len(section) > 20:
                    chunks.append({
                        "source": path.stem, "title": doc_title,
                        "text": section, "tokens": _tokenize(section) - _STOPWORDS,
                    })
                continue
            chunks.append({
                "source": path.stem, "title": doc_title,
                "text": f"# {doc_title}\n\n{section}", "tokens": _tokenize(section) - _STOPWORDS,
            })
    return chunks


def get_chunks() -> List[Dict]:
    global _chunks, _idf
    if not _chunks:
        _chunks = _load_chunks()
        _idf = _compute_idf(_chunks)
    return _chunks


def reload_chunks() -> int:
    """Force le rechargement des fichiers knowledge/ (utile après une édition à chaud)."""
    global _chunks, _idf
    _chunks = _load_chunks()
    _idf = _compute_idf(_chunks)
    return len(_chunks)


def retrieve(query: str, top_k: int = 4) -> List[Dict]:
    """Retourne les top_k chunks les plus pertinents, par recouvrement de
    mots-clés pondéré IDF (les mots rares et distinctifs comptent plus que les
    mots omniprésents dans le corpus, ex: "formation")."""
    q_tokens = _tokenize(query) - _STOPWORDS
    if not q_tokens:
        return []
    chunks = get_chunks()
    scored = []
    for chunk in chunks:
        overlap = q_tokens & chunk["tokens"]
        topic_keywords = _TOPIC_KEYWORDS.get(chunk["source"])
        topic_match = bool(topic_keywords and (topic_keywords & q_tokens))
        if not overlap and not topic_match:
            continue
        score = sum(_idf.get(t, 1.0) for t in overlap)
        if topic_match:
            score += _TOPIC_BOOST
        scored.append((score, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:top_k]]
