"""Page de test OCR — expérimentation, PAS une fonctionnalité de production.

But : comparer Tesseract (local) et le modèle Ollama hébergé (multimodal) sur
de vraies pièces (permis, CNI, justificatif...), avec une couche de
validation par champ, pour décider quel moteur (ou quelle combinaison) est
assez fiable pour préremplir l'attestation (voir routers/stage_attestations.py)
et, plus tard, servir de contrôle "document lisible ?" au dépôt d'une pièce.

Rien ici n'écrit en base — c'est un aller-retour fichier → résultat, affiché
sur la page frontend/src/pages/OcrTest.jsx. Réservé aux admins : ça déclenche
un appel au modèle hébergé (coût/latence) et manipule des pièces d'identité.
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from core.security import require_role
from services import ocr

router = APIRouter(prefix="/ocr-test", tags=["ocr-test"])
log = logging.getLogger(__name__)

MAX_SIZE = 15 * 1024 * 1024


@router.get("/doc-types")
async def doc_types(user: dict = Depends(require_role("admin"))):
    return {
        "doc_types": [
            {"value": k, "fields": [{"key": fk, "label": fv} for fk, fv in v.items()]}
            for k, v in ocr.FIELD_SCHEMAS.items()
        ],
        "tesseract_available": ocr.TESSERACT_AVAILABLE,
        "default_ollama_model": ocr.OLLAMA_MODEL,
    }


@router.post("/run")
async def run(
    file: UploadFile = File(...),
    doc_type: str = Form(ocr.DEFAULT_DOC_TYPE),
    ollama_model: str = Form(""),
    user: dict = Depends(require_role("admin")),
):
    if doc_type not in ocr.FIELD_SCHEMAS:
        raise HTTPException(status_code=400, detail=f"Type de document inconnu : {doc_type}")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 15MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide")

    try:
        images = ocr.load_as_images(data, file.content_type or "")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Fichier illisible : {e}")

    # Les deux moteurs tournent en parallèle (Tesseract est bloquant → thread
    # séparé) : c'est un simple comparatif, pas de raison d'attendre l'un
    # pour lancer l'autre.
    tesseract_result, ollama_result = await asyncio.gather(
        asyncio.to_thread(ocr.run_tesseract, images),
        ocr.run_ollama_vision(images, doc_type, ollama_model or None),
    )
    tesseract_fields = ocr.parse_fields_from_text(tesseract_result.get("text", ""), doc_type)

    return {
        "doc_type": doc_type,
        "page_count": len(images),
        "tesseract": {
            **tesseract_result,
            "fields": tesseract_fields,
            "validation": ocr.validate_fields(tesseract_fields, doc_type),
        },
        "ollama": {
            **ollama_result,
            "validation": ocr.validate_fields(ollama_result.get("fields", {}), doc_type),
        },
    }
