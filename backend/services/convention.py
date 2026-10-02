"""Convention de collaboration formateur — génération et régénération du PDF
(voir routers/employees.py pour la signature initiale, routers/stages.py pour
le déclenchement de la régénération).

La convention liste en annexe les sessions de récupération de points (catégorie
PERMIS) que le formateur anime (voir upcoming_permis_sessions_for) — cette
liste est lue au moment de la génération, donc si un agent assigne une
NOUVELLE session à un formateur qui a déjà signé, le PDF déjà signé devient
obsolète (annexe incomplète). regenerate_convention_pdf() régénère alors le
PDF avec l'annexe à jour, en réutilisant la signature manuscrite déjà
capturée (pas besoin de re-signer) — déclenché automatiquement par
routers/stages.py à chaque création/modification d'assignation."""
import base64 as _b64

from core.config import APP_NAME
from core.database import db
from core.storage import get_object, put_object
from core.utils import now_iso
from services.pdf import generate_formateur_convention_pdf


def _stage_animateur_ids(stage: dict) -> list:
    ids = list(stage.get("animateur_ids") or [])
    if stage.get("animateur_id") and stage["animateur_id"] not in ids:
        ids.append(stage["animateur_id"])
    return ids


async def upcoming_permis_sessions_for(uid: str) -> list:
    """Sessions de récupération de points (catégorie PERMIS) à venir que ce
    formateur animera — utilisées pour l'annexe « Dates et lieux de stages »
    de la convention, qui doit lister le planning réel plutôt qu'un
    calendrier générique."""
    formations = await db.formations.find({"category": "PERMIS"}, {"_id": 0, "id": 1}).to_list(200)
    permis_ids = [f["id"] for f in formations]
    if not permis_ids:
        return []
    today = now_iso()[:10]
    stages = await db.stages.find(
        {
            "formation_id": {"$in": permis_ids}, "date_debut": {"$gte": today}, "statut": {"$ne": "annule"},
            "$or": [{"animateur_ids": uid}, {"animateur_id": uid}],
        },
        {"_id": 0},
    ).sort("date_debut", 1).to_list(50)
    if not stages:
        return []
    other_ids = set()
    for s in stages:
        for aid in _stage_animateur_ids(s):
            if aid != uid:
                other_ids.add(aid)
    others_by_id = {}
    if other_ids:
        others = await db.users.find({"id": {"$in": list(other_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
        others_by_id = {o["id"]: o.get("name", "") for o in others}
    sessions = []
    for s in stages:
        co_names = [others_by_id[aid] for aid in _stage_animateur_ids(s) if aid != uid and aid in others_by_id]
        sessions.append({
            "date_debut": s.get("date_debut"), "date_fin": s.get("date_fin"),
            "lieu_adresse": s.get("lieu_adresse", ""), "lieu_ville": s.get("lieu_ville", ""),
            "co_animateur": ", ".join(co_names),
        })
    return sessions


async def _centre_and_cachet() -> tuple:
    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    centre = {
        "nom": settings_doc.get("attestation_centre_nom") or "Top Drive Learning (TDL)",
        "adresse": settings_doc.get("attestation_centre_adresse") or "59 avenue Joffre",
        "ville": settings_doc.get("attestation_centre_ville") or "93800 Epinay-sur-seine",
        "siret": settings_doc.get("attestation_centre_siret") or "90096880100010",
        "directeur_nom": settings_doc.get("attestation_directeur_nom") or "",
    }
    cachet_data_url = None
    if settings_doc.get("attestation_cachet_path"):
        try:
            data, ct = await get_object(settings_doc["attestation_cachet_path"])
            cachet_data_url = f"data:{ct or 'image/png'};base64,{_b64.b64encode(data).decode('ascii')}"
        except Exception:
            cachet_data_url = None
    return centre, cachet_data_url


async def generate_preview_pdf(u: dict) -> bytes:
    """Convention non signée (pas de signature apposée) — permet au formateur
    de lire le document complet avant de s'engager, avant même d'avoir
    capturé sa signature manuscrite."""
    centre, cachet_data_url = await _centre_and_cachet()
    sessions = await upcoming_permis_sessions_for(u["id"])
    return generate_formateur_convention_pdf(u, None, centre, cachet_data_url, sessions)


async def regenerate_convention_pdf(uid: str) -> bool:
    """Régénère le PDF de convention déjà signée avec l'annexe de sessions à
    jour, en réutilisant la signature manuscrite déjà enregistrée
    (`signature_path`). Ne fait rien si la convention n'a jamais été signée
    ou si aucune signature n'est en stock (cas impossible en pratique,
    signature_path étant renseigné au moment même de la première signature)."""
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u or not u.get("convention_signed_at") or not u.get("signature_path"):
        return False

    sig_data, sig_ct = await get_object(u["signature_path"])
    signature_data_url = f"data:{sig_ct or 'image/png'};base64,{_b64.b64encode(sig_data).decode('ascii')}"

    centre, cachet_data_url = await _centre_and_cachet()
    sessions = await upcoming_permis_sessions_for(uid)
    pdf_bytes = generate_formateur_convention_pdf(u, signature_data_url, centre, cachet_data_url, sessions)
    path = f"{APP_NAME}/conventions/{uid}.pdf"
    result = await put_object(path, pdf_bytes, "application/pdf")
    await db.users.update_one(
        {"id": uid}, {"$set": {"convention_pdf_path": result["path"], "convention_last_regenerated_at": now_iso(), "updated_at": now_iso()}}
    )
    return True
