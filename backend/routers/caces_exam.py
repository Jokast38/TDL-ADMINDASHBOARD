"""Épreuves CACES® R.489 pendant la session (demande du 2026-11-10).

Côté équipe (page CACES) :
- banque des 5 grilles officielles de questions vrai/faux (chargement, saisie ou import
  d'un fichier Excel/CSV) ;
- jour d'examen de chaque session CACES et archives des documents.

Côté testeur (espace formateur, session ouverte) :
- le jour de l'examen uniquement : génération des questionnaires papier
  (une grille tirée au sort par candidat, questions dans un ordre aléatoire)
  et de leurs corrigés, puis correction des copies ;
- grilles d'évaluation pratique (annexe A3/2) ;
- examen d'adéquation du chariot, chaque jour de test.
Chaque document produit est archivé (PDF) au nom du testeur.

Le testeur est un formateur affecté à la session dont le titre est
« Testeur CACES » (le même qu'à la saisie de l'épreuve pratique, voir
routers/caces.py:list_testeurs)."""
import csv
import hashlib
import io
import secrets
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from core.caces_grilles import (
    GRILLES_THEORIE, THEME_KEYS, THEMES_THEORIE, answer_from_label, grille_pratique, score_pratique, score_theorie,
    theme_from_label,
)
from core.config import APP_NAME, ROLES_DOSSIERS_MGMT
from core.database import db
from core.security import get_current_user, require_role
from core.session_access import paris_now
from core.storage import get_object, put_object
from core.utils import now_iso
from models.caces import CACES_CATEGORIES, CACES_MAX_CANDIDATS
from routers.stages import _stage_animateur_ids, require_formateur_access
from services import caces_exam_pdf as pdfs
from services import caces_r489_pdf as r489
from services import caces_adequation_pdf as adequation_doc
from services import caces_pratique_pdf as pratique_doc
from services.caces import compute_attempt_status, today_iso

router = APIRouter(prefix="/caces", tags=["caces-examen"])

TITRE_TESTEUR = "Testeur CACES"
_rng = secrets.SystemRandom()

# Examen d'adéquation : vérifications du chariot et du site avant les tests
# (R.489 §3/3/1/2 et annexe 4) — (clé, libellé, groupe).
ADEQUATION_CHECKLIST = [
    ("notice", "Notice d'instructions en français présente", "Documents (à garder disponibles pendant le test)"),
    ("vgp", "Rapport de vérification générale périodique valide, vierge ou observations levées", "Documents (à garder disponibles pendant le test)"),
    ("examen_adequation", "Examen d'adéquation du chariot réalisé (arrêté du 1er mars 2004)", "Documents (à garder disponibles pendant le test)"),
    ("conformite", "Déclaration CE de conformité ou certificat de conformité (copie si chariot prêté ou loué)", "Documents (à garder disponibles pendant le test)"),
    ("structure", "Structure, protège-conducteur et dosseret sans dommage", "Vérification visuelle du chariot"),
    ("fourches", "Fourches / porte-charge sans fissure, usure ni déformation", "Vérification visuelle du chariot"),
    ("mat", "Mât, chaînes et galets de levage en bon état", "Vérification visuelle du chariot"),
    ("hydraulique", "Circuit hydraulique sans fuite (vérins, flexibles)", "Vérification visuelle du chariot"),
    ("roues", "Roues, bandages ou pneumatiques en bon état", "Vérification visuelle du chariot"),
    ("plaques", "Plaque constructeur et plaque / abaque de charge lisibles", "Vérification visuelle du chariot"),
    ("freins", "Freins de service et de stationnement efficaces", "Fonctionnement des mécanismes et dispositifs de sécurité"),
    ("direction", "Direction sans jeu anormal", "Fonctionnement des mécanismes et dispositifs de sécurité"),
    ("commandes", "Commandes de translation, levage et inclinaison", "Fonctionnement des mécanismes et dispositifs de sécurité"),
    ("maintien", "Dispositif de maintien du conducteur (ceinture, portillon, porte…)", "Fonctionnement des mécanismes et dispositifs de sécurité"),
    ("signalisation", "Avertisseur sonore, éclairage et signalisation lumineuse", "Fonctionnement des mécanismes et dispositifs de sécurité"),
    ("energie", "Niveau de carburant ou charge de la batterie suffisant", "Fonctionnement des mécanismes et dispositifs de sécurité"),
    ("arret_urgence", "Arrêt d'urgence / coupe-batterie fonctionnel", "Fonctionnement des mécanismes et dispositifs de sécurité"),
    ("aire", "Aire d'évolution dégagée, sol stabilisé, zone balisée", "Site d'évaluation"),
    ("charges", "Charges d'essai disponibles avec indication de la masse", "Site d'évaluation"),
    ("epi", "EPI candidats et testeur : chaussures de sécurité, gants, protections auditives, vêtement rétro-réfléchissant", "Site d'évaluation"),
]
_CHECK_KEYS = {k for k, _, _ in ADEQUATION_CHECKLIST}


# ---------------------------------------------------------------------------
# Outils
# ---------------------------------------------------------------------------

def _today() -> str:
    return paris_now().date().isoformat()


def exam_date(stage: dict) -> Optional[str]:
    """Jour de l'examen théorique : fixé sur la page CACES, sinon le dernier
    jour de la session."""
    return stage.get("date_examen_caces") or stage.get("date_fin") or stage.get("date_debut")


async def _caces_formation_ids() -> List[str]:
    return [f["id"] for f in await db.formations.find({"category": "CACES"}, {"_id": 0, "id": 1}).to_list(200)]


async def _stage(sid: str) -> dict:
    stage = await db.stages.find_one({"id": sid}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return stage


async def _is_caces(stage: dict) -> bool:
    f = await db.formations.find_one({"id": stage.get("formation_id")}, {"_id": 0, "category": 1})
    return bool(f and f.get("category") == "CACES")


def _is_staff(user: dict) -> bool:
    return user.get("role") in ROLES_DOSSIERS_MGMT


def _is_testeur(user: dict, stage: dict) -> bool:
    return (user.get("role") == "animateur" and user["id"] in _stage_animateur_ids(stage)
            and (user.get("titre") or "") == TITRE_TESTEUR)


def _require_testeur(user: dict, stage: dict, *, exam_day: bool = False) -> None:
    """Testeur affecté, session ouverte (core/session_access.py) et, pour les
    questionnaires, jour de l'examen uniquement."""
    if not _is_testeur(user, stage):
        raise HTTPException(status_code=403, detail="Réservé au testeur CACES affecté à cette session")
    require_formateur_access(user, stage)
    if exam_day and _today() != exam_date(stage):
        raise HTTPException(status_code=403, detail=f"Disponible uniquement le jour de l'examen ({exam_date(stage)})")


async def _candidats(stage: dict) -> List[dict]:
    inscs = await db.inscriptions.find(
        {"stage_id": stage["id"], "status": "active"},
        {"_id": 0, "id": 1, "student_id": 1, "student_name": 1, "student_email": 1},
    ).sort("student_name", 1).to_list(100)
    dossiers = await db.dossiers.find({"inscription_id": {"$in": [i["id"] for i in inscs]}}, {"_id": 0, "id": 1, "inscription_id": 1}).to_list(100)
    by_insc = {d["inscription_id"]: d["id"] for d in dossiers}
    return [{"inscription_id": i["id"], "student_id": i.get("student_id"), "student_name": i.get("student_name"),
             "student_email": i.get("student_email"), "dossier_id": by_insc.get(i["id"])} for i in inscs]


async def _signature(user_id: str) -> Optional[bytes]:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "signature_path": 1})
    if not u or not u.get("signature_path"):
        return None
    try:
        data, _ = await get_object(u["signature_path"])
        return data
    except Exception:
        return None


async def _archive(kind: str, titre: str, stage: dict, user: dict, pdf: bytes, **extra) -> dict:
    doc_id = str(uuid.uuid4())
    stored = await put_object(f"{APP_NAME}/caces_archives/{stage['id']}/{doc_id}.pdf", pdf, "application/pdf")
    doc = {
        "id": doc_id, "type": kind, "titre": titre, "stage_id": stage["id"],
        "formation_titre": stage.get("formation_titre"), "lieu_ville": stage.get("lieu_ville"),
        "testeur_id": user["id"], "testeur_name": user.get("name"), "date": _today(),
        "path": stored["path"], "created_at": now_iso(), **extra,
    }
    await db.caces_documents.insert_one(doc)
    doc.pop("_id", None)
    return doc


def _pdf_response(pdf: bytes, filename: str) -> Response:
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


async def theorie_reussie_recente(student_id: str) -> Optional[dict]:
    """Dernière épreuve théorique réussie sur copie papier, pour la reporter
    sur un nouvel examen de catégorie (bénéfice de la théorie 12 mois,
    R.489 §3/3/1 — l'expiration est gérée par compute_attempt_status)."""
    copie = await db.caces_theorie_copies.find_one(
        {"student_id": student_id, "resultat.passed": True}, {"_id": 0}, sort=[("resultat.date", -1)])
    if not copie:
        return None
    r = copie["resultat"]
    return {"passed": True, "date": r["date"], "testeur_name": r.get("testeur_name"), "source": "copie", "copie_id": copie["id"], "pct": r.get("pct")}


# ---------------------------------------------------------------------------
# Banque de questions théoriques (équipe)
# ---------------------------------------------------------------------------

class QuestionIn(BaseModel):
    theme: str
    enonce: str
    reponse: bool
    # Repères de la grille officielle (numérotation par thème, rubrique,
    # illustration) — gardés tels quels quand l'équipe modifie une question.
    theme_num: Optional[int] = None
    numero: Optional[int] = None
    rubrique: Optional[str] = None
    sous_rubrique: Optional[str] = None
    points: Optional[int] = None
    illustration: Optional[str] = None


class GrilleIn(BaseModel):
    questions: List[QuestionIn]


def _grille_summary(numero: str, doc: Optional[dict], reviews: Optional[dict] = None) -> dict:
    questions = (doc or {}).get("questions") or []
    par_theme = {k: sum(1 for q in questions if q.get("theme") == k) for k in THEME_KEYS}
    out = {"numero": numero, "nb_questions": len(questions), "par_theme": par_theme,
           "attendu": {k: b for k, _, b in THEMES_THEORIE}, "updated_at": (doc or {}).get("updated_at"),
           "updated_by": (doc or {}).get("updated_by")}
    if reviews is not None:
        out["revue"] = _revue_stats(numero, questions, reviews)
    return out


# ---- Revue des questions par le formateur CACES (demande du 2026-11-12) ----
# Le formateur passe chaque question en revue : « valide » ou « a_corriger »
# avec un commentaire ; c'est l'équipe qui corrige la banque. Une revue est
# rattachée au CONTENU de la question (thème, énoncé, réponse) : une question
# modifiée repasse donc automatiquement « à revoir ».
REVUE_STATUTS = ("valide", "a_corriger")


def _qid(q: dict) -> str:
    raw = f"{q.get('theme')}|{(q.get('enonce') or '').strip()}|{bool(q.get('reponse'))}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


async def _reviews() -> dict:
    """{(numero, qid): revue}"""
    docs = await db.caces_question_reviews.find({}, {"_id": 0}).to_list(5000)
    return {(d["numero"], d["qid"]): d for d in docs}


def _revue_stats(numero: str, questions: list, reviews: dict) -> dict:
    statuts = [(reviews.get((numero, _qid(q))) or {}).get("statut") for q in questions]
    return {"valide": statuts.count("valide"), "a_corriger": statuts.count("a_corriger"),
            "a_revoir": sum(1 for s in statuts if s not in REVUE_STATUTS)}


def _require_revue(user: dict) -> None:
    if user.get("role") in ROLES_DOSSIERS_MGMT:
        return
    if user.get("role") == "animateur" and "CACES" in (user.get("assigned_categories") or []):
        return
    raise HTTPException(status_code=403, detail="Réservé aux formateurs CACES")


class RevueIn(BaseModel):
    statut: Optional[str] = None  # valide | a_corriger | None (remettre à revoir)
    commentaire: Optional[str] = ""


@router.get("/theorie/grilles")
async def list_grilles(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    docs = {d["numero"]: d for d in await db.caces_theorie_grilles.find({}, {"_id": 0}).to_list(10)}
    reviews = await _reviews()
    return {"themes": [{"key": k, "label": l, "bareme": b} for k, l, b in THEMES_THEORIE],
            "grilles": [_grille_summary(n, docs.get(n), reviews) for n in GRILLES_THEORIE]}


@router.get("/theorie/grilles/{numero}")
async def get_grille(numero: str, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    if numero not in GRILLES_THEORIE:
        raise HTTPException(status_code=404, detail="Grille inconnue")
    doc = await db.caces_theorie_grilles.find_one({"numero": numero}, {"_id": 0}) or {}
    reviews = await _reviews()
    questions = [{**q, "revue": reviews.get((numero, _qid(q)))} for q in doc.get("questions") or []]
    return {"numero": numero, "questions": questions}


@router.get("/theorie/grilles/{numero}/questionnaire.pdf")
async def download_grille(numero: str, corrige: bool = False, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Grille à imprimer depuis la page CACES (demande du 2026-11-16) :
    questionnaire vierge, questions dans l'ordre de la grille, en-tête du
    candidat à remplir à la main — ou son corrigé. `numero` = « toutes » pour
    les 4 grilles dans un seul PDF."""
    numeros = list(GRILLES_THEORIE) if numero == "toutes" else [numero]
    if any(n not in GRILLES_THEORIE for n in numeros):
        raise HTTPException(status_code=404, detail="Grille inconnue")
    docs = {d["numero"]: d for d in await db.caces_theorie_grilles.find({"numero": {"$in": numeros}}, {"_id": 0}).to_list(10)}
    copies = [{"vierge": True, "grille": n, "numero_copie": n, "questions": docs[n]["questions"]}
              for n in numeros if (docs.get(n) or {}).get("questions")]
    if not copies:
        raise HTTPException(status_code=404, detail="Aucune question saisie dans cette grille")
    if all(_officielle(c["questions"], c["grille"]) for c in copies):
        doc = None
        for c in copies:
            doc = r489.render(c["grille"], "corrige" if corrige else "vierge",
                              reponses_bank=_bank_answers(c["questions"]), out=doc)
        name = f"{'corrige' if corrige else 'grille'}_caces_r489_{numero}.pdf"
        return _pdf_response(r489.pdf_bytes(doc), name)
    stage = {"formation_titre": "Banque de questions", "lieu_ville": "TDL Formation"}
    if corrige:
        return _pdf_response(pdfs.corriges_pdf(copies, stage), f"corrige_caces_grille_{numero}.pdf")
    return _pdf_response(pdfs.questionnaires_pdf(copies, stage), f"questionnaire_caces_grille_{numero}.pdf")


def _officielle(questions: List[dict], grille: str) -> bool:
    """Copie tirée d'une grille officielle R.489 (questions numérotées comme
    sur le PDF d'origine) : imprimée à l'identique (services/caces_r489_pdf.py)."""
    return grille in GRILLES_THEORIE and bool(questions) and all(q.get("numero") and q.get("theme_num") for q in questions)


def _bank_answers(questions: List[dict]) -> Dict[str, bool]:
    return {r489.qkey(q): bool(q.get("reponse")) for q in questions}


@router.post("/theorie/grilles/officielles")
async def load_official_grids(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Remplace la banque par les 5 grilles officielles R.489 (V1 - 12/2024) :
    énoncés, réponses, rubriques et illustrations, dans l'ordre de la grille."""
    keep = ("theme", "theme_num", "numero", "rubrique", "sous_rubrique", "points", "enonce", "reponse", "illustration")
    for numero in GRILLES_THEORIE:
        questions = [{k: q.get(k) for k in keep if q.get(k) is not None} for q in r489.official_questions(numero)]
        await _save_grille(numero, questions, {**user, "name": f"{user.get('name')} (grilles officielles R.489 {r489.grilles()['version']})"})
    return await list_grilles(user)


@router.get("/theorie/illustrations/{name}")
async def question_illustration(name: str, user: dict = Depends(get_current_user)):
    """Illustration d'une question (image ou schéma de la grille officielle) :
    équipe et formateurs CACES uniquement — le contenu de l'examen ne sort pas."""
    import re as _re
    _require_revue(user)
    if not _re.fullmatch(r"g[1-5]_t[1-4]_q\d{1,2}\.png", name):
        raise HTTPException(status_code=404, detail="Illustration inconnue")
    path = r489.BASE / "images" / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Illustration inconnue")
    return Response(content=path.read_bytes(), media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})


async def _save_grille(numero: str, questions: List[dict], user: dict) -> None:
    await db.caces_theorie_grilles.update_one(
        {"numero": numero},
        {"$set": {"numero": numero, "questions": questions, "updated_at": now_iso(), "updated_by": user.get("name")}},
        upsert=True,
    )


@router.put("/theorie/grilles/{numero}")
async def save_grille(numero: str, payload: GrilleIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    if numero not in GRILLES_THEORIE:
        raise HTTPException(status_code=404, detail="Grille inconnue")
    questions = []
    for i, q in enumerate(payload.questions, start=1):
        if q.theme not in THEME_KEYS:
            raise HTTPException(status_code=400, detail=f"Question {i} : thème inconnu")
        if not q.enonce.strip():
            raise HTTPException(status_code=400, detail=f"Question {i} : énoncé vide")
        meta = {k: getattr(q, k) for k in ("theme_num", "numero", "rubrique", "sous_rubrique", "points", "illustration")
                if getattr(q, k) is not None}
        questions.append({"theme": q.theme, "enonce": q.enonce.strip(), "reponse": q.reponse, **meta})
    await _save_grille(numero, questions, user)
    return _grille_summary(numero, {"questions": questions, "updated_at": now_iso(), "updated_by": user.get("name")})


@router.get("/theorie/revue")
async def revue_grilles(user: dict = Depends(get_current_user)):
    """Les 5 grilles avec la revue de chaque question (espace formateur,
    onglet « Validation des questions »)."""
    _require_revue(user)
    docs = {d["numero"]: d for d in await db.caces_theorie_grilles.find({}, {"_id": 0}).to_list(10)}
    reviews = await _reviews()
    grilles = []
    for n in GRILLES_THEORIE:
        qs = (docs.get(n) or {}).get("questions") or []
        grilles.append({
            "numero": n, "stats": _revue_stats(n, qs, reviews),
            "questions": [{"qid": _qid(q), "numero_question": i, "theme": q["theme"], "enonce": q["enonce"],
                           "reponse": q["reponse"], "revue": reviews.get((n, _qid(q))),
                           "theme_num": q.get("theme_num"), "numero": q.get("numero"), "illustration": q.get("illustration"),
                           "sous_rubrique": q.get("sous_rubrique")} for i, q in enumerate(qs, start=1)],
        })
    return {"themes": [{"key": k, "label": l} for k, l, _ in THEMES_THEORIE], "grilles": grilles}


@router.put("/theorie/revue/{numero}/{qid}")
async def revue_question(numero: str, qid: str, payload: RevueIn, user: dict = Depends(get_current_user)):
    _require_revue(user)
    doc = await db.caces_theorie_grilles.find_one({"numero": numero}, {"_id": 0}) or {}
    q = next((q for q in doc.get("questions") or [] if _qid(q) == qid), None)
    if not q:
        raise HTTPException(status_code=404, detail="Question introuvable (modifiée entre-temps ?) — rechargez la page")
    rid = f"{numero}:{qid}"
    if payload.statut is None:
        await db.caces_question_reviews.delete_one({"id": rid})
        return {"qid": qid, "revue": None}
    if payload.statut not in REVUE_STATUTS:
        raise HTTPException(status_code=400, detail="Statut inconnu")
    commentaire = (payload.commentaire or "").strip()
    if payload.statut == "a_corriger" and not commentaire:
        raise HTTPException(status_code=400, detail="Indiquez ce qu'il faut corriger")
    revue = {"id": rid, "numero": numero, "qid": qid, "statut": payload.statut, "commentaire": commentaire,
             "enonce": q["enonce"], "by_id": user["id"], "by_name": user.get("name", ""), "at": now_iso()}
    await db.caces_question_reviews.update_one({"id": rid}, {"$set": revue}, upsert=True)
    return {"qid": qid, "revue": revue}


@router.post("/theorie/revue/envoyer")
async def envoyer_revue(user: dict = Depends(get_current_user)):
    """Le formateur a fini (ou fait une pause) : un seul email récapitulatif
    à l'équipe avec les questions à corriger — pas un email par question."""
    _require_revue(user)
    reviews = await _reviews()
    docs = {d["numero"]: d for d in await db.caces_theorie_grilles.find({}, {"_id": 0}).to_list(10)}
    lignes, total = [], {"valide": 0, "a_corriger": 0, "a_revoir": 0}
    for n in GRILLES_THEORIE:
        qs = (docs.get(n) or {}).get("questions") or []
        st = _revue_stats(n, qs, reviews)
        for k in total:
            total[k] += st[k]
        for i, q in enumerate(qs, start=1):
            r = reviews.get((n, _qid(q)))
            if r and r.get("statut") == "a_corriger":
                lignes.append(f"<li><b>Grille {n}, question {i}</b> : {q['enonce']}<br><i>Remarque : {r.get('commentaire', '')}</i></li>")
    from services.email import send_email
    from core.config import PUBLIC_FRONTEND_URL
    equipe = await db.users.find({"role": {"$in": ["admin", "responsable_admission"]}, "active": {"$ne": False},
                                  "email": {"$exists": True, "$ne": ""}}, {"_id": 0, "email": 1}).to_list(20)
    body = (
        f"<p>{user.get('name', '')} a passé en revue les questions des grilles théoriques CACES® :</p>"
        f"<p><b>{total['valide']}</b> validée(s), <b>{total['a_corriger']}</b> à corriger, {total['a_revoir']} pas encore revue(s).</p>"
        + (f"<p>Questions à corriger :</p><ul>{''.join(lignes)}</ul>" if lignes else "")
        + f"<p>Corrigez-les dans <a href=\"{PUBLIC_FRONTEND_URL}/admin/caces\">CACES → Banque de questions</a> : "
          "une question modifiée repasse automatiquement « à revoir » pour le formateur.</p>"
    )
    for e in equipe:
        await send_email(e["email"], f"CACES : revue des questions par {user.get('name', '')} ({total['a_corriger']} à corriger)", body)
    await db.caces_revue_envois.insert_one({"id": str(uuid.uuid4()), "by_id": user["id"], "by_name": user.get("name"),
                                            "at": now_iso(), **total})
    return {**total, "destinataires": len(equipe)}


def _rows_from_upload(filename: str, data: bytes) -> List[List]:
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        return [list(r) for r in ws.iter_rows(values_only=True)]
    if name.endswith(".csv") or name.endswith(".txt"):
        text = None
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                text = data.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        dialect = csv.Sniffer().sniff(text[:2000], delimiters=";,\t") if text.strip() else csv.excel
        return [row for row in csv.reader(io.StringIO(text), dialect)]
    raise HTTPException(status_code=400, detail="Format non pris en charge : Excel (.xlsx) ou CSV")


def _norm(h) -> str:
    import unicodedata
    return unicodedata.normalize("NFKD", str(h or "")).encode("ascii", "ignore").decode().lower().strip()


@router.post("/theorie/import")
async def import_grilles(file: UploadFile = File(...), user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Import Excel/CSV : une ligne par question, colonnes « grille »,
    « numéro » (facultatif, ordre), « thème », « question », « réponse »
    (V/F). Chaque grille présente dans le fichier est remplacée en entier ;
    rien n'est enregistré si une ligne est invalide."""
    rows = [r for r in _rows_from_upload(file.filename, await file.read()) if any(c not in (None, "") for c in r)]
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="Fichier vide")
    header = [_norm(h) for h in rows[0]]

    def col(*names):
        return next((i for i, h in enumerate(header) if any(h.startswith(n) for n in names)), None)
    c_grille, c_num, c_theme = col("grille"), col("numero", "num", "n°"), col("theme")
    c_q, c_rep = col("question", "affirmation", "enonce", "intitule"), col("reponse", "bonne")
    missing = [n for n, c in (("grille", c_grille), ("thème", c_theme), ("question", c_q), ("réponse", c_rep)) if c is None]
    if missing:
        raise HTTPException(status_code=400, detail="Colonnes manquantes : " + ", ".join(missing))
    grilles: Dict[str, list] = {}
    erreurs = []
    for line, r in enumerate(rows[1:], start=2):
        r = list(r) + [None] * len(header)
        g = str(r[c_grille]).strip().replace(".0", "") if r[c_grille] is not None else ""
        g = "".join(ch for ch in g if ch.isdigit()) or g
        theme, rep = theme_from_label(r[c_theme]), answer_from_label(r[c_rep])
        enonce = str(r[c_q] or "").strip()
        if g not in GRILLES_THEORIE:
            erreurs.append(f"Ligne {line} : grille « {r[c_grille]} » inconnue (1 à 4)")
        elif not theme:
            erreurs.append(f"Ligne {line} : thème « {r[c_theme]} » non reconnu")
        elif rep is None:
            erreurs.append(f"Ligne {line} : réponse « {r[c_rep]} » non reconnue (V ou F)")
        elif not enonce:
            erreurs.append(f"Ligne {line} : question vide")
        else:
            try:
                order = float(r[c_num]) if c_num is not None and r[c_num] not in (None, "") else line
            except (TypeError, ValueError):
                order = line
            grilles.setdefault(g, []).append((order, {"theme": theme, "enonce": enonce, "reponse": rep}))
    if erreurs:
        raise HTTPException(status_code=400, detail="Import annulé — " + " ; ".join(erreurs[:15]) + (" …" if len(erreurs) > 15 else ""))
    for g, items in grilles.items():
        await _save_grille(g, [q for _, q in sorted(items, key=lambda x: x[0])], user)
    return {"grilles": {g: len(items) for g, items in sorted(grilles.items())}}


@router.get("/theorie/modele.xlsx")
async def import_template(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Questions"
    ws.append(["Grille", "Numéro", "Thème", "Question", "Réponse"])
    ws.append([1, 1, "Connaissances générales", "Exemple : l'autorisation de conduite est délivrée par l'employeur.", "V"])
    ws.append([1, 2, "Exploitation", "Exemple : on peut transporter une personne sur les fourches.", "F"])
    ws.column_dimensions["C"].width = 28
    ws.column_dimensions["D"].width = 90
    help_ws = wb.create_sheet("Aide")
    for line in (
        ["Grille : 1, 2, 3 ou 4"], ["Numéro : ordre de la question dans la grille (facultatif)"],
        ["Thème : Connaissances générales / Technologie / Abaque / Exploitation (ou 1, 2, 3, 4)"],
        ["Réponse : V (vrai) ou F (faux)"], ["Barème R.489 : 15 / 25 / 10 / 50 questions par thème (100 au total)"],
        ["Chaque grille présente dans le fichier remplace la grille existante."],
    ):
        help_ws.append(line)
    buf = io.BytesIO()
    wb.save(buf)
    return Response(content=buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="modele_questions_caces_r489.xlsx"'})


# ---------------------------------------------------------------------------
# Sessions CACES (équipe)
# ---------------------------------------------------------------------------

class ExamDateIn(BaseModel):
    date: str


@router.get("/sessions")
async def list_caces_sessions(user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    ids = await _caces_formation_ids()
    stages = await db.stages.find({"formation_id": {"$in": ids}, "statut": {"$ne": "annule"}}, {"_id": 0}).sort("date_debut", -1).to_list(300)
    anim_ids = list({a for s in stages for a in _stage_animateur_ids(s)})
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": anim_ids}}, {"_id": 0, "id": 1, "name": 1, "titre": 1}).to_list(500)}
    out = []
    for s in stages:
        n = await db.inscriptions.count_documents({"stage_id": s["id"], "status": "active"})
        team = [users[a] for a in _stage_animateur_ids(s) if a in users]
        out.append({
            "id": s["id"], "formation_titre": s.get("formation_titre"), "date_debut": s.get("date_debut"),
            "date_fin": s.get("date_fin"), "lieu_ville": s.get("lieu_ville"), "date_examen": exam_date(s),
            "nb_candidats": n, "max_candidats": CACES_MAX_CANDIDATS,
            "testeurs": [u.get("name") for u in team if u.get("titre") == TITRE_TESTEUR],
            "formateurs": [u.get("name") for u in team if u.get("titre") != TITRE_TESTEUR],
        })
    return out


@router.put("/sessions/{sid}/date-examen")
async def set_exam_date(sid: str, payload: ExamDateIn, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    stage = await _stage(sid)
    if not (stage.get("date_debut") or "") <= payload.date <= (stage.get("date_fin") or payload.date):
        raise HTTPException(status_code=400, detail="Le jour de l'examen doit être pendant la session")
    await db.stages.update_one({"id": sid}, {"$set": {"date_examen_caces": payload.date, "updated_at": now_iso()}})
    return {"date_examen": payload.date}


# ---------------------------------------------------------------------------
# Session : vue du testeur / de l'équipe
# ---------------------------------------------------------------------------

@router.get("/sessions/{sid}/examen")
async def session_exam_state(sid: str, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    if not await _is_caces(stage):
        return {"is_caces": False}
    if not _is_staff(user) and user["id"] not in _stage_animateur_ids(stage):
        raise HTTPException(status_code=403, detail="Accès refusé")
    candidats = await _candidats(stage)
    copies = {}
    for c in await db.caces_theorie_copies.find({"stage_id": sid}, {"_id": 0}).to_list(200):
        qs = c.pop("questions", None) or []  # le contenu des questions ne sort pas d'ici
        c["nb_questions"] = len(qs)
        c["officielle"] = _officielle(qs, c.get("grille"))
        c["copie_pdf"] = bool((c.get("resultat") or {}).get("reponses"))
        (c.get("resultat") or {}).pop("reponses", None)
        copies[c["inscription_id"]] = c
    evals = await db.caces_pratique_evaluations.find({"stage_id": sid}, {"_id": 0, "notes": 0}).sort("created_at", 1).to_list(500)
    attempts = await db.caces_exam_attempts.find({"student_id": {"$in": [c["student_id"] for c in candidats if c.get("student_id")]}}, {"_id": 0}).to_list(500)
    for c in candidats:
        c["copie"] = copies.get(c["inscription_id"])
        c["pratiques"] = [e for e in evals if e["inscription_id"] == c["inscription_id"]]
        c["examens"] = [{"category": a["category"], "status": compute_attempt_status(a)} for a in attempts if a["student_id"] == c.get("student_id")]
    grilles = await db.caces_theorie_grilles.find({}, {"_id": 0, "numero": 1, "questions": 1}).to_list(10)
    doc_query = {"stage_id": sid} if _is_staff(user) else {"stage_id": sid, "testeur_id": user["id"]}
    return {
        "is_caces": True, "stage_id": sid, "date_examen": exam_date(stage), "jour_examen": _today() == exam_date(stage),
        "is_testeur": _is_testeur(user, stage), "max_candidats": CACES_MAX_CANDIDATS,
        "grilles_pretes": sorted(g["numero"] for g in grilles if g.get("questions")),
        "categories": list(CACES_CATEGORIES), "candidats": candidats,
        "adequations": await db.caces_adequations.find({"stage_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(100),
        "documents": await db.caces_documents.find(doc_query, {"_id": 0, "path": 0}).sort("created_at", -1).to_list(300),
        "checklist": [{"key": k, "label": l, "groupe": g} for k, l, g in ADEQUATION_CHECKLIST],
        "adequation_officielle": adequation_doc.checklist(),
    }


# ---------------------------------------------------------------------------
# Théorie : questionnaires papier
# ---------------------------------------------------------------------------

class GenerateIn(BaseModel):
    regenerer: bool = False


async def _copies(sid: str) -> List[dict]:
    return await db.caces_theorie_copies.find({"stage_id": sid}, {"_id": 0}).sort("numero_copie", 1).to_list(200)


def _entete(copie: dict, stage: dict) -> dict:
    d = copie.get("date") or ""
    return {"candidat": copie.get("student_name"), "numero_copie": copie.get("numero_copie"),
            "date": f"{d[8:10]}/{d[5:7]}/{d[:4]}" if len(d) >= 10 else "", "testeur": copie.get("testeur_name")}


def _papers_pdf(copies: List[dict], stage: dict, corrige: bool) -> bytes:
    """Questionnaires (ou corrigés) de la session : grilles officielles à
    l'identique avec le nom du candidat ; ancien format pour les copies tirées
    d'une grille saisie à la main."""
    if not all(_officielle(c.get("questions") or [], c.get("grille")) for c in copies):
        return pdfs.corriges_pdf(copies, stage) if corrige else pdfs.questionnaires_pdf(copies, stage)
    doc = None
    for c in copies:
        doc = r489.render(c["grille"], "corrige" if corrige else "vierge", _entete(c, stage),
                          reponses_bank=_bank_answers(c["questions"]), out=doc)
    return r489.pdf_bytes(doc)


def copie_corrigee_pdf(copie: dict, stage: dict) -> bytes:
    res = copie.get("resultat") or {}
    doc = r489.render(copie["grille"], "copie", _entete(copie, stage), reponses_bank=_bank_answers(copie["questions"]),
                      reponses_candidat=res.get("reponses") or {}, resultat=res)
    return r489.pdf_bytes(doc)


@router.post("/sessions/{sid}/theorie/generer")
async def generate_papers(sid: str, payload: GenerateIn, user: dict = Depends(get_current_user)):
    """Une copie par candidat : grille tirée au sort parmi les grilles
    saisies, questions mélangées. Une copie déjà corrigée n'est jamais
    refaite ; les autres ne le sont que si `regenerer`."""
    stage = await _stage(sid)
    _require_testeur(user, stage, exam_day=True)
    grilles = {g["numero"]: g["questions"] for g in await db.caces_theorie_grilles.find({}, {"_id": 0}).to_list(10) if g.get("questions")}
    if not grilles:
        raise HTTPException(status_code=400, detail="Aucune grille de questions n'est saisie — à faire sur la page CACES")
    candidats = await _candidats(stage)
    if not candidats:
        raise HTTPException(status_code=400, detail="Aucun candidat inscrit à cette session")
    existing = {c["inscription_id"]: c for c in await _copies(sid)}
    next_num = max([c.get("numero_copie") or 0 for c in existing.values()] + [0]) + 1
    for cand in candidats:
        old = existing.get(cand["inscription_id"])
        if old and (old.get("resultat") or not payload.regenerer):
            continue
        numero = _rng.choice(sorted(grilles))
        questions = list(grilles[numero])
        if not _officielle(questions, numero):
            _rng.shuffle(questions)  # grille officielle : ordre et pages de la grille d'origine
        doc = {
            "id": old["id"] if old else str(uuid.uuid4()), "stage_id": sid, "inscription_id": cand["inscription_id"],
            "student_id": cand.get("student_id"), "student_name": cand.get("student_name"),
            "numero_copie": old["numero_copie"] if old else next_num, "grille": numero,
            # Questions recopiées : la copie ne change pas si la banque est modifiée ensuite.
            "questions": questions, "date": _today(), "testeur_id": user["id"], "testeur_name": user.get("name"),
            "generated_at": now_iso(), "resultat": None,
        }
        if not old:
            next_num += 1
        await db.caces_theorie_copies.replace_one({"id": doc["id"]}, doc, upsert=True)
    copies = await _copies(sid)
    await _archive("questionnaires", f"Questionnaires théoriques ({len(copies)} copies)", stage, user, _papers_pdf(copies, stage, False))
    await _archive("corriges", f"Corrigés des questionnaires ({len(copies)} copies)", stage, user, _papers_pdf(copies, stage, True))
    return await session_exam_state(sid, user)


@router.get("/sessions/{sid}/emargement.pdf")
async def download_emargement(sid: str, date: Optional[str] = None, user: dict = Depends(require_role(*ROLES_DOSSIERS_MGMT))):
    """Feuille d'émargement papier d'un jour de la session, matin et
    après-midi (demande du 2026-11-16) — services/emargement_creneaux_pdf.py."""
    from core.utils import format_date_long_fr
    from routers.caces_attestations import _centre, split_name
    from services.emargement_creneaux_pdf import feuille_pdf
    stage = await _stage(sid)
    jour = (date or _today())[:10]
    if not (stage.get("date_debut", "")[:10] <= jour <= (stage.get("date_fin") or stage.get("date_debut", ""))[:10]):
        raise HTTPException(status_code=400, detail=f"Le {jour} ne fait pas partie de cette session")
    apprenants = []
    for c in await _candidats(stage):
        nom, prenom = split_name(c.get("student_name") or "")
        apprenants.append(f"{nom.upper()} {prenom}".strip())
    apprenants.sort()
    ids = _stage_animateur_ids(stage)
    formateurs = [u["name"] for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0, "name": 1}).to_list(10) if u.get("name")] if ids else []
    centre = (await _centre())["centre"]
    lieu = ", ".join(p.strip() for p in (stage.get("lieu_adresse"), stage.get("lieu_ville")) if p and p.strip()) or f"{centre['adresse']}, {centre['ville']}"
    pdf = feuille_pdf(centre, stage.get("formation_titre") or "", format_date_long_fr(jour), lieu, formateurs, apprenants,
                      stage.get("heure_debut"), stage.get("heure_fin"))
    return _pdf_response(pdf, f"emargement_{jour}.pdf")


@router.get("/sessions/{sid}/theorie/questionnaires.pdf")
async def download_papers(sid: str, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    _require_testeur(user, stage, exam_day=True)
    copies = await _copies(sid)
    if not copies:
        raise HTTPException(status_code=404, detail="Questionnaires pas encore générés")
    return _pdf_response(_papers_pdf(copies, stage, False), f"questionnaires_caces_{exam_date(stage)}.pdf")


@router.get("/sessions/{sid}/theorie/corriges.pdf")
async def download_answer_keys(sid: str, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    _require_testeur(user, stage, exam_day=True)
    copies = await _copies(sid)
    if not copies:
        raise HTTPException(status_code=404, detail="Questionnaires pas encore générés")
    return _pdf_response(_papers_pdf(copies, stage, True), f"corriges_caces_{exam_date(stage)}.pdf")


class CorrectionIn(BaseModel):
    erreurs: List[int] = []
    # Réponses cochées par le candidat, question par question (clé « t{thème}_{numéro} »
    # de la grille officielle) : le testeur recopie la copie, les erreurs sont déduites.
    reponses: Optional[Dict[str, Optional[bool]]] = None


async def _apply_result(student_id: str, category: Optional[str], field: str, result: dict) -> List[dict]:
    """Reporte un résultat sur les examens de catégorie du candidat (tous
    pour la théorie, celui de la catégorie pour la pratique) et délivre la
    carte quand les deux épreuves sont réussies (routers/caces.py)."""
    from routers.caces import _maybe_finalize
    q = {"student_id": student_id}
    if category:
        q["category"] = category
    updated = []
    for att in await db.caces_exam_attempts.find(q, {"_id": 0}).to_list(50):
        if compute_attempt_status(att) == "valide":
            continue
        await db.caces_exam_attempts.update_one({"id": att["id"]}, {"$set": {field: result, "updated_at": now_iso()}})
        att[field] = result
        updated.append(await _maybe_finalize(att))
    return updated


@router.post("/sessions/{sid}/theorie/copies/{cid}/correction")
async def correct_paper(sid: str, cid: str, payload: CorrectionIn, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    _require_testeur(user, stage)
    if _today() < (exam_date(stage) or ""):
        raise HTTPException(status_code=403, detail="La correction n'est possible qu'à partir du jour de l'examen")
    copie = await db.caces_theorie_copies.find_one({"id": cid, "stage_id": sid}, {"_id": 0})
    if not copie:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    n = len(copie["questions"])
    erreurs = payload.erreurs
    if payload.reponses is not None:
        if not _officielle(copie["questions"], copie.get("grille")):
            raise HTTPException(status_code=400, detail="Cette copie se corrige par numéros d'erreurs")
        # Réponse fausse ou absente = erreur (numérotation de la copie, 1..N).
        erreurs = [i for i, q in enumerate(copie["questions"], start=1)
                   if payload.reponses.get(r489.qkey(q)) is None or bool(payload.reponses.get(r489.qkey(q))) != bool(q.get("reponse"))]
    if any(e < 1 or e > n for e in erreurs):
        raise HTTPException(status_code=400, detail=f"Numéros de questions entre 1 et {n}")
    result = score_theorie(copie["questions"], erreurs)
    result.update({"date": today_iso(), "testeur_id": user["id"], "testeur_name": user.get("name"), "corrige_at": now_iso()})
    if payload.reponses is not None:
        result["reponses"] = {r489.qkey(q): payload.reponses.get(r489.qkey(q)) for q in copie["questions"]}
    await db.caces_theorie_copies.update_one({"id": cid}, {"$set": {"resultat": result}})
    if copie.get("student_id"):
        await _apply_result(copie["student_id"], None, "theorie", {
            "passed": result["passed"], "date": result["date"], "testeur_name": user.get("name"),
            "source": "copie", "copie_id": cid, "pct": result["pct"]})
    await _archive("resultat_theorie", f"Résultat théorique — {copie.get('student_name')}", stage, user,
                   pdfs.resultat_theorie_pdf(copie, result, stage, user.get("name") or "", await _signature(user["id"])),
                   student_name=copie.get("student_name"))
    if result.get("reponses"):
        await _archive("copie_theorie", f"Copie corrigée (grille {copie['grille']}) — {copie.get('student_name')}", stage, user,
                       copie_corrigee_pdf({**copie, "resultat": result}, stage), student_name=copie.get("student_name"))
    return result


@router.get("/sessions/{sid}/theorie/copies/{cid}/grille")
async def copie_grille(sid: str, cid: str, user: dict = Depends(get_current_user)):
    """Questions d'une copie pour la saisie VRAI / FAUX du testeur : numéro et
    thème — sans l'énoncé ni la réponse attendue."""
    stage = await _stage(sid)
    _require_testeur(user, stage)
    copie = await db.caces_theorie_copies.find_one({"id": cid, "stage_id": sid}, {"_id": 0})
    if not copie:
        raise HTTPException(status_code=404, detail="Copie introuvable")
    if not _officielle(copie["questions"], copie.get("grille")):
        return {"officielle": False, "nb_questions": len(copie["questions"])}
    return {"officielle": True, "grille": copie["grille"], "student_name": copie.get("student_name"),
            "reponses": ((copie.get("resultat") or {}).get("reponses") or {}),
            "themes": [{"num": n, "label": label, "questions": [{"key": r489.qkey(q), "numero": q["numero"]}
                                                              for q in copie["questions"] if q.get("theme_num") == n]}
                       for n, (_k, label, _b) in enumerate(THEMES_THEORIE, start=1)]}


@router.get("/sessions/{sid}/theorie/copies/{cid}/copie.pdf")
async def copie_corrigee(sid: str, cid: str, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    if not _is_staff(user):
        _require_testeur(user, stage)
    copie = await db.caces_theorie_copies.find_one({"id": cid, "stage_id": sid}, {"_id": 0})
    if not copie or not (copie.get("resultat") or {}).get("reponses"):
        raise HTTPException(status_code=404, detail="Copie pas encore corrigée case par case")
    return _pdf_response(copie_corrigee_pdf(copie, stage), f"copie_corrigee_{copie.get('numero_copie')}.pdf")


# ---------------------------------------------------------------------------
# Pratique
# ---------------------------------------------------------------------------

@router.get("/grilles-pratiques/{category}")
async def get_practical_grid(category: str, user: dict = Depends(get_current_user)):
    grille = grille_pratique(category)
    if not grille:
        raise HTTPException(status_code=404, detail="Catégorie inconnue")
    return grille


class PratiqueIn(BaseModel):
    inscription_id: str
    category: str
    notes: Dict[str, float] = {}
    chariot: Optional[str] = None
    observations: Optional[str] = None
    # Fiche officielle TDL (2026-11-19) : horaires de l'épreuve et temps des
    # trois séquences (prise de poste, conduite + manœuvres, fin de poste).
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    temps: Dict[str, str] = {}


@router.post("/sessions/{sid}/pratique")
async def record_practical(sid: str, payload: PratiqueIn, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    _require_testeur(user, stage)
    cand = next((c for c in await _candidats(stage) if c["inscription_id"] == payload.inscription_id), None)
    if not cand or not cand.get("student_id"):
        raise HTTPException(status_code=404, detail="Candidat introuvable dans cette session")
    grille = grille_pratique(payload.category)
    if not grille:
        raise HTTPException(status_code=400, detail="Catégorie CACES inconnue")
    try:
        score = score_pratique(payload.category, payload.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Examen de la catégorie : créé s'il n'existe pas (avec la théorie déjà
    # réussie reportée), refusé si la catégorie est déjà obtenue.
    attempt = await db.caces_exam_attempts.find_one({"student_id": cand["student_id"], "category": payload.category}, {"_id": 0})
    if attempt and compute_attempt_status(attempt) == "valide":
        raise HTTPException(status_code=400, detail=f"Le CACES catégorie {payload.category} est déjà obtenu par ce candidat")
    if not attempt or compute_attempt_status(attempt) == "expire":
        attempt = {
            "id": str(uuid.uuid4()), "dossier_id": cand.get("dossier_id"), "student_id": cand["student_id"],
            "student_name": cand.get("student_name"), "student_email": cand.get("student_email"),
            "category": payload.category, "notes": f"Créé par le testeur — session du {stage.get('date_debut')}",
            "theorie": await theorie_reussie_recente(cand["student_id"]), "pratique": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.caces_exam_attempts.insert_one(dict(attempt))

    evaluation = {
        "id": str(uuid.uuid4()), "stage_id": sid, "inscription_id": cand["inscription_id"], "student_id": cand["student_id"],
        "student_name": cand.get("student_name"), "category": payload.category, "notes": payload.notes,
        "chariot": payload.chariot, "observations": payload.observations, "date": today_iso(),
        "heure_debut": payload.heure_debut, "heure_fin": payload.heure_fin,
        "temps": {k: v for k, v in (payload.temps or {}).items() if k in ("T1", "T2", "T3") and v},
        "total": score["total"], "passed": score["passed"], "detail": score["volets"],
        "testeur_id": user["id"], "testeur_name": user.get("name"), "attempt_id": attempt["id"], "created_at": now_iso(),
    }
    await db.caces_pratique_evaluations.insert_one(dict(evaluation))
    await _apply_result(cand["student_id"], payload.category, "pratique", {
        "passed": score["passed"], "date": evaluation["date"], "testeur_name": user.get("name"),
        "total": score["total"], "evaluation_id": evaluation["id"]})
    signature = await _signature(user["id"])
    d = evaluation["date"]
    # Fiche officielle TDL (catégories 1B, 3, 5) remplie à l'identique, sinon la grille générique.
    pdf = pratique_doc.render(payload.category, grille, payload.notes, score, {
        "candidat": cand.get("student_name"), "date": f"{d[8:10]}/{d[5:7]}/{d[:4]}", "debut": payload.heure_debut,
        "fin": payload.heure_fin, "testeur": user.get("name")}, evaluation["temps"], signature) or pdfs.grille_pratique_pdf(evaluation, grille, score, stage, user.get("name") or "", signature)
    await _archive("grille_pratique", f"Évaluation pratique cat. {payload.category} — {cand.get('student_name')}", stage, user, pdf,
                   student_name=cand.get("student_name"), category=payload.category)
    evaluation.pop("notes", None)
    return evaluation


# ---------------------------------------------------------------------------
# Examen d'adéquation (chaque jour de test)
# ---------------------------------------------------------------------------

class AdequationIn(BaseModel):
    categories: Optional[str] = None
    chariot_type: Optional[str] = None
    chariot_marque: Optional[str] = None
    chariot_modele: Optional[str] = None
    chariot_numero: Optional[str] = None
    chariot_capacite: Optional[str] = None
    vgp_date: Optional[str] = None
    checks: Dict[str, bool] = {}
    conforme: bool
    observations: Optional[str] = None
    # Document officiel TDL 4.5.2 (2026-11-19) : clés des cases cochées
    # (services/caces_adequation_pdf.py) — remplace la liste ci-dessus.
    cases: Optional[List[str]] = None


@router.post("/sessions/{sid}/adequation")
async def record_adequation(sid: str, payload: AdequationIn, user: dict = Depends(get_current_user)):
    stage = await _stage(sid)
    _require_testeur(user, stage)
    if payload.cases is not None:
        return await _record_adequation_officielle(stage, payload, user)
    if not (payload.chariot_numero or payload.chariot_modele):
        raise HTTPException(status_code=400, detail="Identifiez le chariot (modèle ou numéro de série)")
    checks = {k: bool(payload.checks.get(k)) for k in _CHECK_KEYS}
    if payload.conforme and not all(checks.values()):
        raise HTTPException(status_code=400, detail="Un chariot avec un point non conforme ne peut pas être déclaré apte")
    entry = {**payload.model_dump(), "checks": checks, "id": str(uuid.uuid4()), "stage_id": sid, "date": _today(),
             "testeur_id": user["id"], "testeur_name": user.get("name"), "created_at": now_iso()}
    pdf = pdfs.adequation_pdf(entry, ADEQUATION_CHECKLIST, stage, user.get("name") or "", await _signature(user["id"]))
    archived = await _archive("adequation", f"Examen d'adéquation — {entry.get('chariot_modele') or entry.get('chariot_numero')}",
                              stage, user, pdf)
    entry["document_id"] = archived["id"]
    await db.caces_adequations.insert_one(dict(entry))
    return entry


async def _record_adequation_officielle(stage: dict, payload: AdequationIn, user: dict) -> dict:
    """Examen d'adéquation sur le document officiel : cases cochées par le
    testeur, document regénéré à l'identique (nom, date, signature)."""
    unknown = [c for c in payload.cases if c not in adequation_doc.KEYS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Cases inconnues : {', '.join(unknown)}")
    cases = list(dict.fromkeys(payload.cases))
    resume = adequation_doc.summary(cases)
    if not resume["categories"]:
        raise HTTPException(status_code=400, detail="Cochez au moins une catégorie testée aujourd'hui")
    if payload.conforme and resume["manquantes"]:
        raise HTTPException(status_code=400, detail=f"{len(resume['manquantes'])} vérification(s) non cochée(s) : "
                                                    "le site et le matériel ne peuvent pas être déclarés adaptés")
    today = _today()
    entry = {"id": str(uuid.uuid4()), "stage_id": stage["id"], "date": today, "officiel": True, "cases": cases,
             "categories": ", ".join(resume["categories"]), "manquantes": resume["manquantes"], "conforme": payload.conforme,
             "observations": payload.observations, "testeur_id": user["id"], "testeur_name": user.get("name"), "created_at": now_iso()}
    pdf = adequation_doc.render(cases, user.get("name") or "", f"{today[8:10]}/{today[5:7]}/{today[:4]}", await _signature(user["id"]))
    archived = await _archive("adequation", f"Examen d'adéquation du {today[8:10]}/{today[5:7]}/{today[:4]} — catégories {entry['categories']}",
                              stage, user, pdf)
    entry["document_id"] = archived["id"]
    await db.caces_adequations.insert_one(dict(entry))
    return entry


# ---------------------------------------------------------------------------
# Archives
# ---------------------------------------------------------------------------

@router.get("/documents")
async def list_documents(stage_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Toutes les archives pour l'équipe ; celles du testeur connecté sinon."""
    q: dict = {}
    if stage_id:
        q["stage_id"] = stage_id
    if not _is_staff(user):
        if user.get("role") != "animateur":
            raise HTTPException(status_code=403, detail="Accès refusé")
        q["testeur_id"] = user["id"]
    return await db.caces_documents.find(q, {"_id": 0, "path": 0}).sort("created_at", -1).to_list(1000)


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.caces_documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    if not _is_staff(user):
        if doc.get("testeur_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Accès refusé")
        # Questionnaires et corrigés : pour le testeur, le jour de l'examen seulement.
        if doc["type"] in ("questionnaires", "corriges"):
            stage = await _stage(doc["stage_id"])
            if _today() != exam_date(stage):
                raise HTTPException(status_code=403, detail="Questionnaires et corrigés disponibles uniquement le jour de l'examen")
    data, _ = await get_object(doc["path"])
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in doc["titre"])[:80]
    return _pdf_response(data, f"{doc['date']}_{safe}.pdf")
