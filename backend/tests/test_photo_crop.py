"""Recadrage des photos d'identité au format du cadre de la carte CACES
(demande du 2026-11-10) — services/photo_crop.py."""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from services.photo_crop import CARD_RATIO, OUTPUT_SIZE, _crop_box, crop_id_photo  # noqa: E402


def _jpeg(w, h):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 130, 140)).save(buf, "JPEG")
    return buf.getvalue()


def test_sortie_au_format_du_cadre_sans_visage():
    out = Image.open(io.BytesIO(crop_id_photo(_jpeg(1600, 900))))
    assert out.size == OUTPUT_SIZE


def test_cadre_centre_sur_le_visage_et_dans_l_image():
    left, top, right, bottom = _crop_box(2000, 1500, (1500, 600, 200, 260))
    assert abs((right - left) / (bottom - top) - CARD_RATIO) < 0.01
    assert abs((left + right) / 2 - 1600) < 2  # centré sur le visage
    assert 0 <= left and right <= 2000 and 0 <= top and bottom <= 1500
    # Visage au bord : le cadre reste dans l'image.
    left, top, right, bottom = _crop_box(800, 1000, (700, 10, 100, 130))
    assert right <= 800 and top >= 0


def test_fichier_illisible_rendu_tel_quel():
    assert crop_id_photo(b"pas une image") == b"pas une image"
