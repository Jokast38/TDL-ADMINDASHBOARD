"""Préremplissage du profil apprenant (db.users) à partir des pièces
déposées dans un dossier — suite de la page de test OCR (services/ocr.py,
routers/ocr_test.py) : le comparatif Tesseract/Ollama a tranché en faveur
d'Ollama (modèle hébergé, multimodal), seul utilisé ici.

But : que le numéro de permis, les dates d'état civil etc. ne soient saisis
qu'une fois (par OCR ou à la main) et réutilisables ensuite pour n'importe
quel dossier/attestation de cet apprenant, plutôt que ressaisis à chaque
formation.

Deux façons dont un champ arrive sur le profil, avec deux niveaux de
confiance différents :
1. Extraction automatique au dépôt d'une pièce (cette fonction) — n'écrit
   QUE les champs encore vides sur le profil, et seulement ceux validés
   comme plausibles (services.ocr.validate_fields). Ne remplace jamais une
   valeur déjà présente : une correction humaine antérieure ne doit jamais
   être écrasée silencieusement par une nouvelle extraction automatique.
2. Validation explicite du formulaire d'attestation par un humain (voir
   routers/stage_attestations.py) — là, on écrase sans condition : c'est une
   action volontaire de l'apprenant ou du staff, qui doit primer.

Tout est best-effort et journalisé : un échec d'extraction ne doit jamais
faire échouer le dépôt du document lui-même.
"""
import logging

from core.database import db
from core.utils import now_iso
from services import ocr

log = logging.getLogger(__name__)

# Quels champs du profil un type de pièce peut renseigner, et quels champs de
# services.ocr.FIELD_SCHEMAS y correspondent (mêmes noms ici, donc identité,
# mais gardé comme mapping explicite pour pouvoir diverger plus tard sans
# retoucher l'appelant).
DOC_TYPE_TO_PROFILE_FIELDS = {
    "permis": ["numero_permis", "date_delivrance_permis", "prefecture_delivrance", "nom", "prenom", "date_naissance"],
    "identite": ["nom", "prenom", "date_naissance", "lieu_naissance"],
    "justificatif_domicile": ["adresse", "ville", "code_postal"],
}


# Verdict par défaut quand on n'a pas pu juger (type de pièce sans schéma,
# panne du modèle...) : `checked=False` — ne JAMAIS accuser le document
# d'être illisible pour une raison qui n'a rien à voir avec lui (une panne
# réseau/API n'est pas la faute de la pièce déposée).
_NOT_CHECKED = {"checked": False, "likely_legible": None, "valid_fields": 0, "total_fields": 0}


def _legibility_verdict(validation: dict, doc_type: str) -> dict:
    schema_fields = list(ocr.FIELD_SCHEMAS.get(doc_type, {}))
    if not schema_fields:
        return dict(_NOT_CHECKED)
    valid = sum(1 for f in schema_fields if validation.get(f, {}).get("valid"))
    total = len(schema_fields)
    # Au moins la moitié des champs attendus lisibles — seuil volontairement
    # tolérant : mieux vaut laisser passer une pièce correcte à tort suspectée
    # que bloquer/alarmer sur une pièce en réalité illisible (voir le
    # commentaire sur "checked" ci-dessus, même logique de prudence).
    return {"checked": True, "likely_legible": (valid / total) >= 0.5, "valid_fields": valid, "total_fields": total}


async def extract_and_prefill_profile(student_id: str, doc_type: str, data: bytes, content_type: str, source_document_id: str) -> dict:
    """Lance l'OCR sur une pièce qui vient d'être déposée : complète le
    profil de l'apprenant avec les champs encore vides, et renvoie un verdict
    de lisibilité (voir routers/documents.py — sert à avertir l'apprenant
    sans jamais bloquer son dépôt). Ne lève jamais d'exception (appelée après
    l'enregistrement du document, ne doit pas faire échouer l'upload)."""
    empty = {"written": [], "skipped_existing": [], "skipped_invalid": [], "legibility": dict(_NOT_CHECKED)}
    if doc_type not in DOC_TYPE_TO_PROFILE_FIELDS:
        return empty
    try:
        images = ocr.load_as_images(data, content_type or "")
        result = await ocr.run_ollama_vision(images, doc_type)
        if result.get("error"):
            # Panne du modèle, pas un jugement sur la pièce — voir _NOT_CHECKED.
            log.info(f"OCR profil {student_id} ({doc_type}) : {result['error']}")
            return empty
        validation = ocr.validate_fields(result.get("fields", {}), doc_type)
        legibility = _legibility_verdict(validation, doc_type)

        user = await db.users.find_one({"id": student_id}, {"_id": 0})
        if not user:
            return {**empty, "legibility": legibility}

        to_set = {}
        written, skipped_existing, skipped_invalid = [], [], []
        for field in DOC_TYPE_TO_PROFILE_FIELDS[doc_type]:
            v = validation.get(field, {})
            if not v.get("valid"):
                if v.get("value"):
                    skipped_invalid.append(field)
                continue
            if user.get(field):
                # Un profil déjà renseigné (OCR précédent ou saisie humaine)
                # n'est jamais écrasé automatiquement.
                skipped_existing.append(field)
                continue
            to_set[field] = v["value"]
            written.append(field)

        if to_set:
            to_set["identity_ocr_last"] = {
                "source_document_id": source_document_id, "doc_type": doc_type,
                "fields_written": written, "extracted_at": now_iso(),
            }
            await db.users.update_one({"id": student_id}, {"$set": to_set})
            log.info(f"OCR profil {student_id} : champs renseignés {written} (ignorés déjà remplis={skipped_existing}, peu fiables={skipped_invalid})")
        return {"written": written, "skipped_existing": skipped_existing, "skipped_invalid": skipped_invalid, "legibility": legibility}
    except Exception as e:
        log.warning(f"Échec extraction OCR pour préremplir le profil {student_id} : {e}")
        return empty


async def get_profile_defaults(student_id: str) -> dict:
    """Valeurs déjà connues sur le profil apprenant, pour préremplir un
    formulaire (ex. identité de l'attestation) sans resaisie — voir usage
    dans routers/stage_attestations.py."""
    user = await db.users.find_one({"id": student_id}, {"_id": 0})
    if not user:
        return {}
    fields = set()
    for f in DOC_TYPE_TO_PROFILE_FIELDS.values():
        fields.update(f)
    return {f: user[f] for f in fields if user.get(f)}


async def save_confirmed_fields(student_id: str, fields: dict) -> None:
    """Un humain (apprenant ou staff) vient de valider/corriger ces champs
    dans le formulaire d'attestation — contrairement à l'extraction
    automatique, une action explicite remplace sans condition la valeur du
    profil : elle est plus fiable qu'une extraction OCR non relue."""
    to_set = {k: v for k, v in fields.items() if v}
    if not to_set:
        return
    await db.users.update_one({"id": student_id}, {"$set": to_set})
