"""Extraction OCR des pièces d'un dossier (permis, CNI, justificatif...) —
brique expérimentale pour préremplir les champs de l'attestation
(models/attestation.py) au lieu de les saisir à la main
(routers/stage_attestations.py).

Deux moteurs comparés (voir routers/ocr_test.py, page de test dédiée) :
- Tesseract (local, gratuit) : OCR "brut" — on récupère juste le texte, puis
  on essaie d'en extraire les champs par motifs (regex). Fiable sur du texte
  net, mais un permis/une CNI n'est pas un texte suivi (mise en page dense,
  hologrammes, polices variables) donc le texte brut est souvent haché.
- Modèle Ollama hébergé, multimodal (image envoyée dans le message) : on lui
  demande directement le JSON des champs voulus. Peut halluciner un champ
  plutôt que dire qu'il ne l'a pas trouvé — d'où la couche de validation
  ci-dessous, appliquée aux deux moteurs, qui ne fait confiance à aucun champ
  sans vérifier qu'il a une forme plausible.

Rien ici n'écrit en base ni ne préremplit quoi que ce soit tout seul : cette
couche ne fait que proposer des valeurs + un verdict de validation par champ,
à relire par un humain avant tout usage (a fortiori sur un document engageant
comme une attestation officielle).
"""
import base64
import io
import logging
import os
import re
import time
from datetime import datetime
from typing import Optional

import httpx
from PIL import Image, ImageOps

from core.config import OLLAMA_API_KEY, OLLAMA_HOST, OLLAMA_MODEL

log = logging.getLogger(__name__)

# ── Tesseract ────────────────────────────────────────────────────────────────
# Pack de langue local au projet (backend/tessdata/), pour ne pas dépendre de
# droits admin sur la machine ni d'une install système figée — voir
# l'installation faite en même temps que ce module (tesseract via winget,
# packs fra/eng téléchargés ici). TESSERACT_CMD reste surchargeable par env
# var pour un déploiement où le binaire est ailleurs (ex. Linux prod).
_TESSDATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tessdata")
TESSERACT_CMD = os.getenv("TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\tesseract.exe")

try:
    import pytesseract

    if os.path.isfile(TESSERACT_CMD):
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
    os.environ.setdefault("TESSDATA_PREFIX", _TESSDATA_DIR)
    TESSERACT_AVAILABLE = True
except ImportError:
    pytesseract = None
    TESSERACT_AVAILABLE = False

try:
    import pymupdf
except ImportError:
    pymupdf = None


# ── Schéma des champs attendus, par type de pièce ───────────────────────────
# Aligné sur models/attestation.py (AttestationIdentityIn) : c'est ce
# formulaire, aujourd'hui rempli à la main, que l'OCR doit préremplir.
FIELD_SCHEMAS = {
    "permis": {
        "numero_permis": "Numéro du permis de conduire (12 caractères, imprimé au recto, case 5)",
        "date_delivrance_permis": "Date de délivrance du permis (JJ/MM/AAAA, case 4a)",
        "prefecture_delivrance": "Préfecture ou autorité de délivrance (case 4c)",
        "nom": "Nom de famille du titulaire (case 1)",
        "prenom": "Prénom du titulaire (case 2)",
        "date_naissance": "Date de naissance (JJ/MM/AAAA, case 3)",
    },
    "identite": {
        "nom": "Nom de famille",
        "prenom": "Prénom",
        "date_naissance": "Date de naissance (JJ/MM/AAAA)",
        "lieu_naissance": "Lieu de naissance",
    },
    "justificatif_domicile": {
        "nom": "Nom du titulaire du justificatif",
        "adresse": "Adresse complète (numéro et voie)",
        "ville": "Ville",
        "code_postal": "Code postal",
    },
}
DEFAULT_DOC_TYPE = "permis"


# ── Chargement du fichier en images (PDF → 1 image par page, à 300 dpi) ────
def load_as_images(data: bytes, content_type: str) -> list[Image.Image]:
    if content_type == "application/pdf" or data[:4] == b"%PDF":
        if not pymupdf:
            raise RuntimeError("PyMuPDF non installé : impossible de lire un PDF")
        images = []
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            for page in doc:
                pix = page.get_pixmap(dpi=300)
                # .convert("RGB") force le décodage immédiat (comme pour le
                # cas image ci-dessous) : sans ça, l'objet PIL reste
                # "paresseux", encore lié au flux mémoire dont il vient — et
                # les deux moteurs OCR tournent en parallèle sur cette même
                # liste d'images (routers/ocr_test.py), donc une lecture
                # différée ici se fait lue en même temps par les deux,
                # corrompant l'une des deux lectures ("unrecognized data
                # stream contents" observé sur Tesseract).
                images.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
        return images
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    return [img.convert("RGB")]


def _preprocess_for_tesseract(img: Image.Image) -> Image.Image:
    # Prétraitement volontairement simple (niveaux de gris + contraste) :
    # une binarisation agressive perd souvent plus qu'elle n'aide sur des
    # photos de téléphone (reflets, angle) — à ajuster une fois qu'on a des
    # échantillons réels via la page de test.
    gray = img.convert("L")
    return ImageOps.autocontrast(gray)


# ── Moteur 1 : Tesseract ────────────────────────────────────────────────────
def run_tesseract(images: list[Image.Image], lang: str = "fra+eng") -> dict:
    if not TESSERACT_AVAILABLE:
        return {"error": "pytesseract non installé côté serveur", "text": "", "duration_ms": 0}
    t0 = time.monotonic()
    try:
        pages_text = [
            pytesseract.image_to_string(_preprocess_for_tesseract(img), lang=lang)
            for img in images
        ]
        text = "\n\n".join(pages_text)
        return {"text": text, "duration_ms": round((time.monotonic() - t0) * 1000)}
    except Exception as e:
        log.warning(f"Tesseract a échoué : {e}")
        return {"error": str(e), "text": "", "duration_ms": round((time.monotonic() - t0) * 1000)}


# Regex volontairement permissives : on préfère proposer une valeur à
# vérifier (couche de validation ci-dessous) plutôt que d'en manquer une par
# un motif trop strict sur un texte OCR déjà bruité.
_DATE_RE = r"\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}"
_TEXT_FIELD_PATTERNS = {
    "numero_permis": [r"\b([0-9]{12})\b", r"\b([0-9A-Z]{10,15})\b"],
    "date_delivrance_permis": [rf"(?:le|d[ée]livr[ée].{{0,15}}?)\s*({_DATE_RE})"],
    "date_naissance": [rf"(?:n[ée].{{0,15}}?|naissance.{{0,15}}?)\s*({_DATE_RE})"],
    "prefecture_delivrance": [r"(?:pr[ée]fecture|autorit[ée])\s*(?:de|:)?\s*([A-ZÀ-Ü][\w\s\-']{2,40})"],
    "code_postal": [r"\b(\d{5})\b"],
}


def parse_fields_from_text(text: str, doc_type: str) -> dict:
    """Extraction par motifs depuis le texte brut Tesseract — la seule façon
    d'en tirer des champs, puisque Tesseract ne rend que du texte, jamais de
    structure. Heuristique volontairement simple : à affiner avec de vrais
    échantillons plutôt que deviner à l'aveugle."""
    fields = {}
    for field in FIELD_SCHEMAS.get(doc_type, {}):
        for pattern in _TEXT_FIELD_PATTERNS.get(field, []):
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                fields[field] = m.group(1).strip()
                break
    return fields


# ── Moteur 2 : modèle Ollama hébergé, multimodal ────────────────────────────
def _image_to_base64(img: Image.Image, max_side: int = 1600) -> str:
    # Réduit les images énormes (photo de téléphone) avant l'envoi : accélère
    # l'appel et reste largement suffisant pour la résolution de texte d'un
    # permis/CNI.
    if max(img.size) > max_side:
        ratio = max_side / max(img.size)
        img = img.resize((int(img.width * ratio), int(img.height * ratio)))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


async def run_ollama_vision(images: list[Image.Image], doc_type: str, model: Optional[str] = None) -> dict:
    if not OLLAMA_API_KEY:
        return {"error": "OLLAMA_API_KEY non configurée", "fields": {}, "raw": "", "duration_ms": 0}
    schema = FIELD_SCHEMAS.get(doc_type, FIELD_SCHEMAS[DEFAULT_DOC_TYPE])
    fields_desc = "\n".join(f'- "{k}" : {v}' for k, v in schema.items())
    prompt = (
        "Tu es un assistant qui lit un document administratif français (image ci-jointe) "
        f"et en extrait des informations. Type de document déclaré : {doc_type}.\n\n"
        f"Renvoie UNIQUEMENT un objet JSON avec exactement ces clés :\n{fields_desc}\n\n"
        'Si un champ est illisible ou absent du document, mets la valeur "" (chaîne vide) '
        "pour ce champ — n'invente jamais une valeur. Ne renvoie que le JSON, sans texte autour."
    )
    b64_images = [_image_to_base64(img) for img in images[:3]]  # 3 pages max, évite un payload énorme
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{OLLAMA_HOST.rstrip('/')}/api/chat",
                headers={"Authorization": f"Bearer {OLLAMA_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": model or OLLAMA_MODEL,
                    "messages": [{"role": "user", "content": prompt, "images": b64_images}],
                    "format": "json",
                    "stream": False,
                },
            )
        resp.raise_for_status()
        content = (resp.json().get("message") or {}).get("content", "")
        duration_ms = round((time.monotonic() - t0) * 1000)
        import json as _json
        # Malgré `format: "json"`, le modèle enveloppe parfois sa réponse
        # dans un bloc markdown ```json ... ``` — on le retire avant de
        # parser plutôt que d'échouer dessus.
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*\n?|```$", "", cleaned.strip()).strip()
        try:
            fields = _json.loads(cleaned)
            if not isinstance(fields, dict):
                raise ValueError("réponse JSON qui n'est pas un objet")
        except (ValueError, TypeError) as e:
            return {"error": f"réponse non-JSON du modèle : {e}", "fields": {}, "raw": content, "duration_ms": duration_ms}
        return {"fields": fields, "raw": content, "duration_ms": duration_ms}
    except Exception as e:
        log.warning(f"OCR via Ollama a échoué : {e}")
        return {"error": str(e), "fields": {}, "raw": "", "duration_ms": round((time.monotonic() - t0) * 1000)}


# ── Couche de validation, commune aux deux moteurs ──────────────────────────
# But : ne jamais faire confiance aveuglément à un champ extrait — donner un
# verdict par champ (forme plausible ou non) pour guider la relecture
# humaine, et pouvoir servir plus tard de contrôle "document lisible ?" au
# moment du dépôt de la pièce (voir routers/documents.py).
def _valid_date(value: str) -> bool:
    if not value:
        return False
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            d = datetime.strptime(value.strip(), fmt)
            return 1900 <= d.year <= datetime.now().year
        except ValueError:
            continue
    return False


def validate_fields(fields: dict, doc_type: str) -> dict:
    schema = FIELD_SCHEMAS.get(doc_type, {})
    result = {}
    for field in schema:
        value = (fields.get(field) or "").strip()
        if not value:
            result[field] = {"value": "", "valid": False, "reason": "champ non trouvé"}
            continue
        if field in ("date_naissance", "date_delivrance_permis"):
            ok = _valid_date(value)
            result[field] = {"value": value, "valid": ok, "reason": "" if ok else "date invalide ou peu plausible"}
        elif field == "numero_permis":
            ok = bool(re.fullmatch(r"[0-9A-Za-z]{8,15}", value))
            result[field] = {"value": value, "valid": ok, "reason": "" if ok else "longueur/format inhabituels pour un numéro de permis"}
        elif field == "code_postal":
            ok = bool(re.fullmatch(r"\d{5}", value))
            result[field] = {"value": value, "valid": ok, "reason": "" if ok else "un code postal fait 5 chiffres"}
        else:
            # nom/prénom/lieu/adresse/préfecture : heuristique large — au
            # moins 2 caractères, majoritairement des lettres (repère un
            # champ resté rempli de bruit OCR plutôt qu'un vrai mot).
            letters = sum(1 for c in value if c.isalpha())
            ok = len(value) >= 2 and letters / max(len(value), 1) >= 0.5
            result[field] = {"value": value, "valid": ok, "reason": "" if ok else "valeur trop courte ou peu lisible"}
    return result
