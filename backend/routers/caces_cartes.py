"""Cartes CACES® générées par le testeur après l'examen (demande du 2026-11-26).

Parcours dans l'espace du testeur, onglet « Cartes CACES » :
1. il déclare, candidat par candidat, les catégories obtenues (admis) ou non
   (ajourné) — les catégories proposées sont celles choisies à l'inscription ;
2. pour chaque admis, il renseigne ce qu'il manque à la carte (nom en toutes
   lettres, date de naissance, signataire) et prend la photo, avec l'aide au
   cadrage (même composant que sur le dashboard) ;
3. il génère la carte (PDF archivé à son nom).

Fenêtre de génération (fenetre_cartes) : à partir du jour de l'examen (par
défaut le dernier jour de la session) jusqu'au lendemain soir, soit 24 h
après l'examen ; rouverte tant que le testeur est placé sur une autre
session CACES à venir ou en cours. L'équipe peut forcer l'ouverture ou la
fermeture session par session (page CACES → Sessions). L'équipe garde tous
les droits sur les cartes depuis le dashboard, fenêtre ou pas.
"""
import uuid
from datetime import date, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from core.config import ROLES_DOSSIERS_MGMT
from core.database import db
from core.security import get_current_user, require_role
from core.storage import get_object
from core.utils import now_iso
from models.caces import CACES_CATEGORIES
from routers.caces_exam import (
    TITRE_TESTEUR, _archive, _candidats, _caces_formation_ids, _is_staff, _stage, _today, exam_date,
)
from routers.stages import _stage_animateur_ids
from services.caces import categories_inscription, compute_attempt_status, finalize_category

router = APIRouter(prefix="/caces", tags=["caces-cartes"])

MODES = ("auto", "autorise", "bloque")


def _fr(d: str) -> str:
    return f"{d[8:10]}/{d[5:7]}/{d[:4]}" if d and len(d) >= 10 else d or ""


def fenetre_cartes(stage: dict, today: str, autre_session_active: bool) -> dict:
    """Le testeur peut-il générer les cartes de cette session aujourd'hui ?"""
    mode = stage.get("cartes_testeur") or "auto"
    ex = exam_date(stage) or ""
    if mode == "bloque":
        return {"ouvert": False, "mode": mode, "message": "Génération des cartes bloquée par l'équipe TDL"}
    if mode == "autorise":
        return {"ouvert": True, "mode": mode, "message": "Génération des cartes autorisée par l'équipe TDL"}
    if not ex or today < ex:
        return {"ouvert": False, "mode": mode, "message": f"Ouverte à partir du jour de l'examen ({_fr(ex)})"}
    limite = (date.fromisoformat(ex[:10]) + timedelta(days=1)).isoformat()
    if today <= limite:
        return {"ouvert": True, "mode": mode, "limite": limite, "message": f"Ouverte jusqu'au {_fr(limite)} au soir (24 h après l'examen)"}
    if autre_session_active:
        return {"ouvert": True, "mode": mode, "message": "Rouverte : vous êtes placé sur une autre session CACES"}
    return {"ouvert": False, "mode": mode, "message": f"Fermée depuis le {_fr(limite)} — demandez l'autorisation à l'équipe TDL"}


async def _sessions_caces_du_testeur(user_id: str) -> List[dict]:
    ids = await _caces_formation_ids()
    stages = await db.stages.find({"formation_id": {"$in": ids}, "statut": {"$ne": "annule"}}, {"_id": 0}).sort("date_debut", -1).to_list(300)
    return [s for s in stages if user_id in _stage_animateur_ids(s)]


async def _autre_session_active(user_id: str, stage_id: str, today: str) -> bool:
    return any(s["id"] != stage_id and (s.get("date_fin") or s.get("date_debut") or "") >= today
               for s in await _sessions_caces_du_testeur(user_id))


async def _acces_cartes(user: dict, stage: dict) -> dict:
    """Équipe : toujours. Testeur affecté : selon la fenêtre."""
    if _is_staff(user):
        return {"ouvert": True, "mode": stage.get("cartes_testeur") or "auto", "message": "Équipe TDL"}
    if not (user.get("role") == "animateur" and user["id"] in _stage_animateur_ids(stage)
            and (user.get("titre") or "") == TITRE_TESTEUR):
        raise HTTPException(status_code=403, detail="Réservé au testeur CACES affecté à cette session")
    today = _today()
    f = fenetre_cartes(stage, today, await _autre_session_active(user["id"], stage["id"], today))
    if not f["ouvert"]:
        raise HTTPException(status_code=403, detail=f["message"])
    return f


async def _candidat(stage: dict, iid: str) -> dict:
    cand = next((c for c in await _candidats(stage) if c["inscription_id"] == iid), None)
    if not cand or not cand.get("student_id"):
        raise HTTPException(status_code=404, detail="Candidat introuvable dans cette session")
    return cand


def _manque(cert: Optional[dict], has_photo: bool) -> List[str]:
    if not cert:
        return []
    out = []
    if not cert.get("date_naissance"):
        out.append("date de naissance")
    if not cert.get("signataire_name"):
        out.append("signataire")
    if not has_photo:
        out.append("photo")
    return out


async def _etat_session(stage: dict, user: dict) -> dict:
    today = _today()
    if _is_staff(user):
        f = {"ouvert": True, "mode": stage.get("cartes_testeur") or "auto", "message": "Équipe TDL"}
    else:
        f = fenetre_cartes(stage, today, await _autre_session_active(user["id"], stage["id"], today))
    cands = await _candidats(stage)
    inscs = {i["id"]: i for i in await db.inscriptions.find(
        {"id": {"$in": [c["inscription_id"] for c in cands]}},
        {"_id": 0, "id": 1, "caces_categories": 1, "formation_title": 1, "stage_titre": 1, "session": 1, "caces_declaration": 1}).to_list(100)}
    dossiers = {d["id"]: d for d in await db.dossiers.find(
        {"id": {"$in": [c["dossier_id"] for c in cands if c.get("dossier_id")]}}, {"_id": 0, "id": 1, "id_photo_path": 1}).to_list(100)}
    certs = {c["student_id"]: c for c in await db.caces_certificates.find(
        {"student_id": {"$in": [c["student_id"] for c in cands if c.get("student_id")]}}, {"_id": 0}).to_list(100)}
    out = []
    for c in cands:
        insc = inscs.get(c["inscription_id"], {})
        cert = certs.get(c.get("student_id"))
        has_photo = bool((dossiers.get(c.get("dossier_id")) or {}).get("id_photo_path"))
        out.append({
            **c, "categories": categories_inscription(insc), "declaration": insc.get("caces_declaration") or {},
            "has_photo": has_photo,
            "carte": {k: cert.get(k) for k in ("id", "student_name", "date_naissance", "signataire_name", "signataire_qualite",
                                                "expiration_date", "carte_generee_at", "carte_generee_par")}
                     | {"categories": [x["category"] for x in cert.get("categories", [])]} if cert else None,
            "manque": _manque(cert, has_photo),
        })
    ex = exam_date(stage)
    return {"stage_id": stage["id"], "formation_titre": stage.get("formation_titre"), "date_debut": stage.get("date_debut"),
            "date_fin": stage.get("date_fin"), "date_examen": ex, "lieu_ville": stage.get("lieu_ville"),
            "fenetre": f, "candidats": out,
            "a_faire": sum(1 for x in out if any(v == "admis" for v in x["declaration"].values()) and (x["manque"] or not (x["carte"] or {}).get("carte_generee_at")))}


@router.get("/testeur/cartes")
async def mes_cartes(user: dict = Depends(get_current_user)):
    """Sessions CACES du testeur dont l'examen est passé (les 10 dernières)."""
    if user.get("role") != "animateur" or (user.get("titre") or "") != TITRE_TESTEUR:
        raise HTTPException(status_code=403, detail="Réservé aux testeurs CACES")
    today = _today()
    sessions = [s for s in await _sessions_caces_du_testeur(user["id"]) if (exam_date(s) or "9999") <= today][:10]
    return {"sessions": [await _etat_session(s, user) for s in sessions]}


@router.get("/sessions/{sid}/cartes")
async def cartes_session(sid: str, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    if not _is_staff(user) and user["id"] not in _stage_animateur_ids(stage):
        raise HTTPException(status_code=403, detail="Accès refusé")
    return await _etat_session(stage, user)


class ModeIn(BaseModel):
    mode: str


@router.put("/sessions/{sid}/cartes-testeur")
async def set_mode(sid: str, payload: ModeIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Bouton de l'équipe : « auto » (24 h après l'examen), « autorise »
    (le testeur peut générer, même session terminée) ou « bloque »."""
    if payload.mode not in MODES:
        raise HTTPException(status_code=400, detail="Mode inconnu")
    await _stage(sid)
    await db.stages.update_one({"id": sid}, {"$set": {"cartes_testeur": payload.mode, "cartes_testeur_par": user.get("name"),
                                                      "updated_at": now_iso()}})
    return {"mode": payload.mode}


class DeclarationIn(BaseModel):
    # {"3": "admis", "1B": "ajourne"} ; une catégorie absente n'est pas touchée.
    resultats: Dict[str, str]


@router.post("/sessions/{sid}/candidats/{iid}/declaration")
async def declarer(sid: str, iid: str, payload: DeclarationIn, user: dict = Depends(get_current_user)):
    """Le testeur déclare les catégories obtenues : chaque « admis » valide
    l'examen de la catégorie (théorie + pratique au jour de l'examen) et
    l'inscrit sur la carte du candidat (créée au besoin)."""
    stage = await _stage(sid)
    await _acces_cartes(user, stage)
    cand = await _candidat(stage, iid)
    bad = [k for k, v in payload.resultats.items() if k not in CACES_CATEGORIES or v not in ("admis", "ajourne")]
    if bad:
        raise HTTPException(status_code=400, detail=f"Catégorie ou résultat inconnu : {', '.join(bad)}")
    ex = exam_date(stage) or _today()
    insc = await db.inscriptions.find_one({"id": iid}, {"_id": 0, "caces_declaration": 1, "caces_categories": 1,
                                                       "formation_title": 1, "stage_titre": 1, "session": 1}) or {}
    declaration = dict(insc.get("caces_declaration") or {})
    cert = await db.caces_certificates.find_one({"student_id": cand["student_id"]}, {"_id": 0, "categories": 1}) or {}
    sur_carte = {x["category"] for x in cert.get("categories", [])}
    for cat, res in payload.resultats.items():
        if res == "ajourne" and cat in sur_carte:
            raise HTTPException(status_code=400, detail=f"La catégorie {cat} est déjà sur la carte : à retirer par l'équipe TDL")
        resultat = {"passed": res == "admis", "date": ex, "testeur_name": user.get("name"), "source": "declaration_testeur"}
        attempt = await db.caces_exam_attempts.find_one({"student_id": cand["student_id"], "category": cat}, {"_id": 0})
        if attempt and compute_attempt_status(attempt) == "valide":
            if res == "admis" and cat not in sur_carte and not attempt.get("finalized_certificate_id"):
                await _finaliser(attempt, ex)
            declaration[cat] = res
            continue
        if not attempt or compute_attempt_status(attempt) == "expire":
            attempt = {"id": str(uuid.uuid4()), "dossier_id": cand.get("dossier_id"), "student_id": cand["student_id"],
                       "student_name": cand.get("student_name"), "student_email": cand.get("student_email"), "category": cat,
                       "notes": f"Déclaré par le testeur — session du {_fr(stage.get('date_debut') or '')}",
                       "theorie": None, "pratique": None, "created_at": now_iso(), "updated_at": now_iso()}
            await db.caces_exam_attempts.insert_one(dict(attempt))
        # Admis : les deux épreuves sont réussies. Ajourné : la pratique est
        # échouée, la théorie réussie (copie corrigée) est gardée.
        upd = {"pratique": resultat, "updated_at": now_iso()}
        if res == "admis":
            upd["theorie"] = resultat
        await db.caces_exam_attempts.update_one({"id": attempt["id"]}, {"$set": upd})
        attempt.update(upd)
        if res == "admis":
            await _finaliser(attempt, ex)
        declaration[cat] = res
    cats = list(dict.fromkeys(categories_inscription(insc) + list(payload.resultats)))
    await db.inscriptions.update_one({"id": iid}, {"$set": {
        "caces_declaration": declaration, "caces_categories": cats,
        "caces_declaration_par": user.get("name"), "caces_declaration_at": now_iso()}})
    return await _etat_session(stage, user)


async def _finaliser(attempt: dict, date_examen: str) -> None:
    try:
        cert = await finalize_category(attempt, testeur_name=(attempt.get("pratique") or {}).get("testeur_name"),
                                       date_obtention=date_examen)
    except ValueError:
        return  # catégorie déjà sur la carte
    await db.caces_exam_attempts.update_one({"id": attempt["id"]}, {"$set": {"finalized_certificate_id": cert["id"], "updated_at": now_iso()}})


class CarteInfosIn(BaseModel):
    student_name: Optional[str] = None
    date_naissance: Optional[str] = None
    signataire_name: Optional[str] = None
    signataire_qualite: Optional[str] = None


async def _certificat(cand: dict) -> dict:
    cert = await db.caces_certificates.find_one({"student_id": cand["student_id"]}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=400, detail="Déclarez d'abord le candidat admis dans au moins une catégorie")
    return cert


@router.put("/sessions/{sid}/candidats/{iid}/carte")
async def infos_carte(sid: str, iid: str, payload: CarteInfosIn, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    await _acces_cartes(user, stage)
    cert = await _certificat(await _candidat(stage, iid))
    upd = {k: v.strip() for k, v in payload.model_dump().items() if v is not None and v.strip()}
    if upd:
        upd["updated_at"] = now_iso()
        await db.caces_certificates.update_one({"id": cert["id"]}, {"$set": upd})
    return await _etat_session(stage, user)


@router.post("/sessions/{sid}/candidats/{iid}/photo")
async def photo_candidat(sid: str, iid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    from routers.caces import _store_dossier_photo
    stage = await _stage(sid)
    await _acces_cartes(user, stage)
    cand = await _candidat(stage, iid)
    if not cand.get("dossier_id"):
        raise HTTPException(status_code=400, detail="Ce candidat n'a pas de dossier : l'équipe TDL doit le créer")
    return await _store_dossier_photo(cand["dossier_id"], file)


@router.get("/sessions/{sid}/candidats/{iid}/photo")
async def voir_photo(sid: str, iid: str, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    if not _is_staff(user) and user["id"] not in _stage_animateur_ids(stage):
        raise HTTPException(status_code=403, detail="Accès refusé")
    cand = await _candidat(stage, iid)
    d = await db.dossiers.find_one({"id": cand.get("dossier_id") or "-"}, {"_id": 0, "id_photo_path": 1}) or {}
    if not d.get("id_photo_path"):
        raise HTTPException(status_code=404, detail="Aucune photo enregistrée")
    data, ct = await get_object(d["id_photo_path"])
    return Response(content=data, media_type=ct or "image/jpeg")


@router.get("/sessions/{sid}/candidats/{iid}/carte.pdf")
async def generer_carte(sid: str, iid: str, user: dict = Depends(get_current_user)):
    from routers.caces import _card_pdf
    stage = await _stage(sid)
    await _acces_cartes(user, stage)
    cand = await _candidat(stage, iid)
    cert = await _certificat(cand)
    dossier = await db.dossiers.find_one({"id": cand.get("dossier_id") or "-"}, {"_id": 0, "id_photo_path": 1}) or {}
    manque = _manque(cert, bool(dossier.get("id_photo_path")))
    if manque:
        raise HTTPException(status_code=400, detail=f"À compléter avant de générer la carte : {', '.join(manque)}")
    # La photo de la carte est celle du dossier de la session (voir _card_pdf).
    if cand.get("dossier_id") and not any(c.get("dossier_id") for c in cert.get("categories", [])):
        cert["categories"][0]["dossier_id"] = cand["dossier_id"]
        await db.caces_certificates.update_one({"id": cert["id"]}, {"$set": {"categories": cert["categories"]}})
    pdf = await _card_pdf(cert)
    await _archive("carte_caces", f"Carte CACES — {cert.get('student_name')} (cat. {', '.join(c['category'] for c in cert['categories'])})",
                   stage, user, pdf, student_name=cert.get("student_name"))
    await db.caces_certificates.update_one({"id": cert["id"]}, {"$set": {"carte_generee_at": now_iso(), "carte_generee_par": user.get("name")}})
    nom = "".join(ch if ch.isalnum() else "_" for ch in (cert.get("student_name") or "carte"))
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="carte_caces_{nom}.pdf"'})
