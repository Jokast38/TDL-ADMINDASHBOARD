"""Recadrage automatique des photos d'identité (demande du 2026-11-10) :
toute photo enregistrée pour un dossier (prise avec la caméra ou fichier
choisi) est recadrée au format exact du cadre de la carte CACES (3,0 x 3,7 cm,
voir services/pdf.py:generate_caces_card_pdf), visage centré, pour remplir le
cadre sans bande ni déformation.

Détection du visage : YuNet (OpenCV, modèle libre embarqué dans
backend/assets/models). Sans visage détecté (photo trop sombre, de profil…),
recadrage centré au même format — jamais d'échec de l'enregistrement."""
import io
import logging
from pathlib import Path
from typing import Optional, Tuple

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# Proportions du cadre photo de la carte (largeur / hauteur).
CARD_RATIO = 3.0 / 3.7
OUTPUT_SIZE = (600, 740)
# Le visage détecté (front-menton) occupe ~45 % de la hauteur, son centre à
# ~42 % du haut : place pour les cheveux au-dessus et le haut des épaules,
# comme une photo d'identité.
FACE_HEIGHT_SHARE = 0.45
FACE_CENTER_FROM_TOP = 0.42

_MODEL = Path(__file__).resolve().parent.parent / "assets" / "models" / "face_detection_yunet_2023mar.onnx"


def _detect_face(img: Image.Image) -> Optional[Tuple[float, float, float, float]]:
    """(x, y, largeur, hauteur) du plus grand visage, en pixels de `img`."""
    try:
        import cv2
        import numpy as np
    except Exception:
        return None
    if not _MODEL.exists():
        return None
    # Détection sur une version réduite (rapide), coordonnées remises à l'échelle.
    scale = min(1.0, 640 / max(img.size))
    small = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))))
    bgr = cv2.cvtColor(np.array(small.convert("RGB")), cv2.COLOR_RGB2BGR)
    try:
        cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)
        detector = cv2.FaceDetectorYN.create(str(_MODEL), "", (bgr.shape[1], bgr.shape[0]), 0.6, 0.3, 50)
        _, faces = detector.detect(bgr)
    except Exception as e:
        logger.warning(f"Détection de visage impossible : {e}")
        return None
    if faces is None or not len(faces):
        return None
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])[:4]
    return x / scale, y / scale, w / scale, h / scale


def _crop_box(width: int, height: int, face) -> Tuple[int, int, int, int]:
    if face:
        fx, fy, fw, fh = face
        crop_h = fh / FACE_HEIGHT_SHARE
        cx, cy = fx + fw / 2, fy + fh / 2
        top = cy - FACE_CENTER_FROM_TOP * crop_h
    else:
        crop_h = float(height)
        cx, top = width / 2, 0.0
    crop_w = crop_h * CARD_RATIO
    # Le cadre ne peut pas dépasser l'image : on le réduit en gardant le format.
    if crop_w > width:
        crop_w, crop_h = float(width), width / CARD_RATIO
    if crop_h > height:
        crop_h, crop_w = float(height), height * CARD_RATIO
    left = min(max(cx - crop_w / 2, 0), width - crop_w)
    top = min(max(top, 0), height - crop_h)
    return int(round(left)), int(round(top)), int(round(left + crop_w)), int(round(top + crop_h))


def crop_id_photo(data: bytes) -> bytes:
    """Photo recadrée (JPEG) ; renvoie l'image d'origine si elle est illisible."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        return data
    box = _crop_box(img.width, img.height, _detect_face(img))
    out = img.crop(box).resize(OUTPUT_SIZE, Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=90)
    return buf.getvalue()
