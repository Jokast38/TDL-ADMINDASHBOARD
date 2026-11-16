"""Attestations individuelles de formation CACES® R.489, générées par
l'équipe depuis la page CACES (demande du 2026-11-16) — PDF :
services/caces_attestation_pdf.py.

L'agent cherche l'apprenant (dossiers CACES), le formulaire est pré-rempli
avec ce que l'on sait (identité, catégories, session, formateur, durée,
résultats) et tout reste modifiable : les données des dossiers CACES sont
souvent incomplètes (pas de session liée, pas de date de naissance). Chaque
attestation générée est archivée et rechargée pour pré-remplir la suivante.
"""
import asyncio
import re
import uuid
from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from core.config import APP_NAME, ROLES_DOSSIERS_MGMT
from core.database import db
from core.placement_rules import place_for, stage_nb_jours
from core.security import require_role
from core.storage import get_object, put_object
from core.utils import MOIS_FR, now_iso
from models.caces import CACES_CATEGORIES
from routers.stages import _stage_animateur_ids
from services import caces_attestation_pdf as pdf
from services.caces import compute_attempt_status

router = APIRouter(prefix="/caces/attestations-formation", tags=["caces-attestations"])

CENTRE_PAR_DEFAUT = {
    "nom": "Top Drive Learning (TDL Formation)",
    "adresse": "59 avenue Joffre",
    "ville": "93800 Épinay-sur-Seine",
    "telephone": "01 80 90 72 49",
    "email": "contact@tdl-formation.fr",
    "siret": "90096880100010",
    "nda": "11930882293",
}
LIEU_SIGNATURE_PAR_DEFAUT = "Épinay-sur-Seine"


def parse_date(value: Optional[str]) -> Optional[date]:
    """ISO (AAAA-MM-JJ, avec ou sans heure) ou JJ/MM/AAAA (saisie OCR)."""
    if not value:
        return None
    s = str(value).strip()
    try:
        m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)
        if m:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def date_label(value: Optional[str]) -> str:
    """« 1er décembre 2026 », « 16 novembre 2026 »."""
    d = parse_date(value)
    if not d:
        return ""
    jour = "1er" if d.day == 1 else str(d.day)
    return f"{jour} {MOIS_FR[d.month - 1]} {d.year}"


def split_name(full: str) -> tuple:
    """(nom, prénom) : les mots en MAJUSCULES sont le nom ; sinon, le dernier
    mot (comme l'attestation de stage, routers/stage_attestations.py)."""
    words = (full or "").split()
    if not words:
        return "", ""
    upper = [w for w in words if len(w) > 1 and w.isupper()]
    if upper and len(upper) < len(words):
        return " ".join(upper), " ".join(w for w in words if w not in upper)
    return words[-1], " ".join(words[:-1])


def categories_of_title(title: Optional[str]) -> List[str]:
    """« CACES R489 Cat. 3 - Chariot élévateur » -> ["3"]."""
    found = re.findall(r"[Cc]at(?:[ée]gories?)?\.?\s*((?:\d[AB]?)(?:\s*(?:,|et|/|-)\s*\d[AB]?)*)", title or "")
    cats = []
    for group in found:
        for c in re.findall(r"\d[AB]?", group.upper()):
            if c in CACES_CATEGORIES and c not in cats:
                cats.append(c)
    return cats


def duree_session(stage: Optional[dict]) -> Optional[float]:
    """Heures réellement faites sur la session : (fin - début - 1 h de pause
    déjeuner) × nombre de jours. 09:00-17:00 sur 1 jour -> 7."""
    if not stage or not stage.get("heure_debut") or not stage.get("heure_fin"):
        return None
    try:
        h1, m1 = map(int, stage["heure_debut"].split(":"))
        h2, m2 = map(int, stage["heure_fin"].split(":"))
    except ValueError:
        return None
    par_jour = (h2 * 60 + m2 - h1 * 60 - m1) / 60 - 1
    if par_jour <= 0:
        return None
    return round(par_jour * stage_nb_jours(stage), 1)


async def _centre() -> dict:
    s = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    centre = dict(CENTRE_PAR_DEFAUT)
    for key, field in (("adresse", "attestation_centre_adresse"), ("siret", "attestation_centre_siret")):
        if s.get(field):
            centre[key] = s[field]
    if s.get("caces_otc_numero_inrs"):
        centre["otc_numero_inrs"] = s["caces_otc_numero_inrs"]
    return {"centre": centre, "directeur": s.get("attestation_directeur_nom") or "", "cachet_path": s.get("attestation_cachet_path")}


async def _signature_png(cachet_path: Optional[str]) -> bytes:
    """Signature + cachet de Paramètres > Attestations ; à défaut, celle du
    centre fournie avec le serveur."""
    if cachet_path:
        try:
            data, _ = await get_object(cachet_path)
            if data:
                return data
        except Exception:
            pass
    return pdf.SIGNATURE_PAR_DEFAUT.read_bytes()


async def _formateurs_caces() -> List[str]:
    users = await db.users.find({"role": "animateur"}, {"_id": 0, "name": 1, "titre": 1, "assigned_categories": 1, "active": 1}).to_list(500)
    return sorted({u["name"] for u in users if u.get("name") and u.get("active", True) is not False
                   and "CACES" in (u.get("assigned_categories") or [])})


async def _session_of(dossier: dict) -> Optional[dict]:
    insc = None
    if dossier.get("inscription_id"):
        insc = await db.inscriptions.find_one({"id": dossier["inscription_id"]}, {"_id": 0, "stage_id": 1})
    if not insc and dossier.get("student_id"):
        q = {"student_id": dossier["student_id"], "stage_id": {"$exists": True}}
        if dossier.get("formation_id"):
            q["formation_id"] = dossier["formation_id"]
        found = await db.inscriptions.find(q, {"_id": 0, "stage_id": 1, "created_at": 1}).sort("created_at", -1).to_list(1)
        insc = found[0] if found else None
    if not insc or not insc.get("stage_id"):
        return None
    return await db.stages.find_one({"id": insc["stage_id"]}, {"_id": 0})


@router.get("/formateurs")
async def list_formateurs(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    return await _formateurs_caces()


@router.get("/prefill/{dossier_id}")
async def prefill(dossier_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    dossier = await db.dossiers.find_one({"id": dossier_id, "category": "CACES"}, {"_id": 0})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier CACES introuvable")
    info = await _centre()
    last = await db.caces_attestations_formation.find(
        {"dossier_id": dossier_id}, {"_id": 0}).sort("created_at", -1).to_list(1)
    if last:
        # Dernière attestation : on reprend la saisie (corrections comprises).
        return {**last[0]["donnees"], "date_emission": date.today().isoformat(), "deja_generee": last[0]["created_at"]}

    profile = await db.users.find_one({"id": dossier.get("student_id")}, {"_id": 0}) if dossier.get("student_id") else None
    profile = profile or {}
    nom, prenom = split_name(dossier.get("student_name") or profile.get("name") or "")
    attempts = await db.caces_exam_attempts.find({"student_id": dossier.get("student_id")}, {"_id": 0}).to_list(50) if dossier.get("student_id") else []
    cats = []
    for c in [a.get("category") for a in attempts] + categories_of_title(dossier.get("formation_title")):
        if c in CACES_CATEGORIES and c not in cats:
            cats.append(c)

    formation = await db.formations.find_one({"id": dossier.get("formation_id")}, {"_id": 0, "duration_hours": 1}) if dossier.get("formation_id") else None
    stage = await _session_of(dossier)
    formateur = ""
    lieu = f"{info['centre']['adresse']}, {info['centre']['ville']}"
    if stage:
        ids = _stage_animateur_ids(stage)
        anims = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "name": 1, "titre": 1}).to_list(10) if ids else []
        # Place « formateur » de la session ; sinon le seul intervenant (ex. Anas,
        # formateur et testeur, enregistré avec le titre « Testeur CACES »).
        formateur = next((a["name"] for a in anims if place_for(a.get("titre"), "CACES") == "FORMATEUR"),
                         anims[0].get("name", "") if anims else "")
        if stage.get("lieu_adresse") or stage.get("lieu_ville"):
            lieu = ", ".join(p for p in (stage.get("lieu_adresse"), stage.get("lieu_ville")) if p)

    valides = [a for a in attempts if compute_attempt_status(a) == "valide"]
    resultat, detail = "", ""
    if valides:
        resultat = "atteints"
        detail = "tests CACES® réussis (" + ", ".join(
            f"cat. {a['category']} le {date_label((a.get('pratique') or {}).get('date'))}" for a in valides) + ")"

    naissance = parse_date(profile.get("date_naissance"))
    return {
        "dossier_id": dossier_id, "student_id": dossier.get("student_id"),
        "civilite": "", "nom": (profile.get("nom") or nom).upper(), "prenom": profile.get("prenom") or prenom,
        "date_naissance": naissance.isoformat() if naissance else "",
        "categories": cats, "lieu": lieu,
        "date_debut": ((stage or {}).get("date_debut") or "")[:10], "date_fin": ((stage or {}).get("date_fin") or "")[:10],
        "duree_heures": duree_session(stage) or (formation or {}).get("duration_hours") or "",
        "formateur_nom": formateur, "resultat": resultat, "resultat_detail": detail,
        "signataire_nom": info["directeur"], "signataire_qualite": "Directeur",
        "lieu_signature": LIEU_SIGNATURE_PAR_DEFAUT, "date_emission": date.today().isoformat(),
        "deja_generee": None,
    }


class AttestationFormationIn(BaseModel):
    dossier_id: Optional[str] = None
    student_id: Optional[str] = None
    civilite: Literal["M.", "Mme"]
    nom: str = Field(..., max_length=120)
    prenom: str = Field(..., max_length=120)
    date_naissance: Optional[str] = None
    categories: List[str]
    lieu: str = Field(..., max_length=200)
    date_debut: str
    date_fin: str
    duree_heures: float = Field(..., gt=0, le=400)
    formateur_nom: str = Field(..., max_length=120)
    resultat: Literal["atteints", "partiellement_atteints", "non_atteints"]
    resultat_detail: Optional[str] = Field("", max_length=300)
    signataire_nom: str = Field(..., max_length=120)
    signataire_qualite: str = Field(..., max_length=80)
    lieu_signature: str = Field(..., max_length=80)
    date_emission: str


def _check(payload: AttestationFormationIn) -> dict:
    data = payload.model_dump()
    for key, label in (("nom", "le nom"), ("prenom", "le prénom"), ("lieu", "le lieu de la formation"),
                       ("formateur_nom", "le nom du formateur"), ("signataire_nom", "le nom du signataire"),
                       ("signataire_qualite", "la qualité du signataire"), ("lieu_signature", "le lieu de signature")):
        data[key] = (data.get(key) or "").strip()
        if not data[key]:
            raise HTTPException(status_code=400, detail=f"Renseignez {label}")
    cats = [c for c in CACES_CATEGORIES if c in set(data["categories"])]
    if not cats or len(cats) != len(set(data["categories"])):
        raise HTTPException(status_code=400, detail="Choisissez au moins une catégorie R.489 valide")
    data["categories"] = cats
    debut, fin, emission = parse_date(data["date_debut"]), parse_date(data["date_fin"]), parse_date(data["date_emission"])
    if not debut or not fin:
        raise HTTPException(status_code=400, detail="Renseignez les dates de la formation")
    if fin < debut:
        raise HTTPException(status_code=400, detail="La date de fin est avant la date de début")
    if not emission:
        raise HTTPException(status_code=400, detail="Renseignez la date de l'attestation")
    if emission < fin:
        raise HTTPException(status_code=400, detail="L'attestation se délivre à l'issue de la formation : sa date ne peut pas précéder la fin de la formation")
    if data.get("date_naissance") and not parse_date(data["date_naissance"]):
        raise HTTPException(status_code=400, detail="Date de naissance invalide")
    data["resultat_detail"] = (data.get("resultat_detail") or "").strip()
    return data


@router.post("")
async def generate(payload: AttestationFormationIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    data = _check(payload)
    info = await _centre()
    signature = await _signature_png(info["cachet_path"])
    pdf_data = {
        **data, "centre": info["centre"],
        "date_naissance_label": date_label(data.get("date_naissance")),
        "date_debut_label": date_label(data["date_debut"]), "date_fin_label": date_label(data["date_fin"]),
        "date_emission_label": date_label(data["date_emission"]),
    }
    pdf_bytes = await asyncio.to_thread(pdf.attestation_formation_pdf, pdf_data, signature)
    att_id = str(uuid.uuid4())
    stored = await put_object(f"{APP_NAME}/caces_attestations/{att_id}.pdf", pdf_bytes, "application/pdf")
    doc = {
        "id": att_id, "dossier_id": data.get("dossier_id"), "student_id": data.get("student_id"),
        "student_name": f"{data['prenom']} {data['nom'].upper()}", "categories": data["categories"],
        "formateur_nom": data["formateur_nom"], "date_emission": data["date_emission"], "donnees": data,
        "path": stored["path"], "generated_by": user.get("name"), "generated_by_id": user["id"], "created_at": now_iso(),
    }
    await db.caces_attestations_formation.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("")
async def list_attestations(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    return await db.caces_attestations_formation.find({}, {"_id": 0, "donnees": 0}).sort("created_at", -1).to_list(500)


@router.get("/{att_id}/download")
async def download(att_id: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    doc = await db.caces_attestations_formation.find_one({"id": att_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Attestation introuvable")
    data, _ = await get_object(doc["path"])
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", doc.get("student_name") or "apprenant").strip("_")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="attestation_formation_caces_{name}.pdf"'})
