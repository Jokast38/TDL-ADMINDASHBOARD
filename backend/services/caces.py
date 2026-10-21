"""Règles métier CACES R.489 — génération de numéro, calcul d'échéance et
gestion de la fenêtre de 12 mois entre théorie et pratique.

Résumé des règles (demande du 2026-10-21, confirmées contre la
recommandation R.489 de la Cnam) :
- Épreuve théorique commune à toutes les catégories, valable 100 points /
  100 questions ; une fois réussie, elle reste acquise 12 mois pour
  valider une épreuve pratique d'UNE catégorie (puis, dans ce même délai,
  d'autres catégories de la même famille — voir R.489 §3/3/1, "CACES
  initial").
- Si la pratique est réussie avant la théorie (rare mais prévu), même
  règle inversée : 12 mois pour valider la théorie, sinon la pratique
  acquise est perdue.
- La première catégorie obtenue fixe la date d'échéance de la carte
  (aujourd'hui + 5 ans). Toute catégorie ajoutée ENSUITE (dans les 5 ans)
  garde cette échéance commune — elle n'en crée jamais une nouvelle,
  conformément à "l'extension" décrite en R.489 §3/3/1.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from pymongo import ReturnDocument

from core.database import db
from core.utils import now_iso

THEORIE_PRATIQUE_DELAI_JOURS = 365
CARTE_VALIDITE_ANS = 5


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except (ValueError, AttributeError):
        return None


def today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def add_years(date_iso: str, years: int) -> str:
    d = _parse_date(date_iso)
    try:
        return d.replace(year=d.year + years).date().isoformat()
    except ValueError:
        # 29 février sur une année non bissextile
        return (d.replace(month=2, day=28, year=d.year + years)).date().isoformat()


def compute_attempt_status(attempt: dict) -> str:
    """Statut dérivé de l'état théorie/pratique d'une tentative — jamais
    stocké tel quel comme source de vérité durable, recalculé à la lecture
    pour refléter l'expiration éventuelle du délai de 12 mois sans relire
    une tâche planifiée."""
    theorie = attempt.get("theorie")
    pratique = attempt.get("pratique")
    theorie_ok = bool(theorie and theorie.get("passed"))
    pratique_ok = bool(pratique and pratique.get("passed"))

    if theorie_ok and pratique_ok:
        return "valide"

    # Un seul des deux côtés réussi : fenêtre de 12 mois pour l'autre.
    passed_date = None
    if theorie_ok:
        passed_date = _parse_date(theorie.get("date"))
    elif pratique_ok:
        passed_date = _parse_date(pratique.get("date"))

    if passed_date:
        deadline = passed_date + timedelta(days=THEORIE_PRATIQUE_DELAI_JOURS)
        if datetime.now(timezone.utc) > deadline:
            return "expire"
        return "theorie_ok" if theorie_ok else "pratique_ok"

    return "en_attente"


def _numero_caces(category: str, seq: int) -> str:
    """Convention reprise du modèle fourni par l'équipe (ex: C1B.000012345678)
    — préfixe 'C' + catégorie + séquence globale sur 12 chiffres."""
    cat_code = re.sub(r"[^A-Za-z0-9]", "", category).upper()
    return f"C{cat_code}.{seq:012d}"


async def _next_sequence() -> int:
    """Compteur global atomique, partagé entre toutes les catégories — un
    numéro ne doit jamais être réutilisé, même entre deux catégories
    différentes (voir R.489 §6/2 : chaque CACES délivré a un numéro propre)."""
    doc = await db.counters.find_one_and_update(
        {"id": "caces_numero"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc["value"]


async def finalize_category(attempt: dict, testeur_name: Optional[str] = None) -> dict:
    """Appelée dès qu'une tentative passe à l'état 'valide' (théorie + pratique
    réussies, dans la fenêtre de 12 mois) — crée ou met à jour la carte CACES
    du candidat et y ajoute la catégorie."""
    student_id = attempt["student_id"]
    category = attempt["category"]
    date_obtention = today_iso()
    seq = await _next_sequence()
    numero_caces = _numero_caces(category, seq)

    certificate = await db.caces_certificates.find_one({"student_id": student_id}, {"_id": 0})
    category_entry = {
        "category": category,
        "numero_caces": numero_caces,
        "date_obtention": date_obtention,
        "testeur_name": testeur_name or (attempt.get("pratique") or {}).get("testeur_name"),
        "dossier_id": attempt.get("dossier_id"),
        # Lien vers la tentative d'examen d'origine — permet de retracer
        # l'examen complet (dates théorie/pratique, testeur) depuis la carte,
        # voir GET /caces/certificates/{id}/categories/{cat}/trace.
        "exam_attempt_id": attempt["id"],
        "external": None,
    }

    if certificate:
        if any(c["category"] == category for c in certificate.get("categories", [])):
            raise ValueError(f"La catégorie {category} est déjà présente sur cette carte")
        await db.caces_certificates.update_one(
            {"id": certificate["id"]},
            {"$push": {"categories": category_entry}, "$set": {"updated_at": now_iso()}},
        )
        certificate["categories"].append(category_entry)
        return certificate

    certificate = {
        "id": str(uuid.uuid4()),
        "student_id": student_id,
        "student_name": attempt.get("student_name"),
        "date_naissance": None,
        "signataire_name": None,
        "signataire_qualite": None,
        # Échéance fixée UNE SEULE FOIS, à la première catégorie — ne change
        # plus jamais, quelles que soient les catégories ajoutées ensuite.
        "expiration_date": add_years(date_obtention, CARTE_VALIDITE_ANS),
        "categories": [category_entry],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.caces_certificates.insert_one(certificate)
    certificate.pop("_id", None)
    return certificate


async def add_external_category(payload: dict) -> dict:
    """Enregistre, pour audit, une catégorie obtenue chez un AUTRE OTC —
    jamais de nouveau numéro officiel émis ; l'échéance fournie (celle du
    centre d'origine) est reprise telle quelle, jamais recalculée."""
    certificate = await db.caces_certificates.find_one({"student_id": payload["student_id"]}, {"_id": 0})
    category_entry = {
        "category": payload["category"],
        "numero_caces": payload["numero_externe"],
        "date_obtention": payload["date_obtention"],
        "testeur_name": None,
        "dossier_id": None,
        "external": {"otc_name": payload["otc_name"], "numero_externe": payload["numero_externe"]},
    }
    if certificate:
        if any(c["category"] == payload["category"] for c in certificate.get("categories", [])):
            raise ValueError(f"La catégorie {payload['category']} est déjà présente sur cette carte")
        await db.caces_certificates.update_one(
            {"id": certificate["id"]},
            {"$push": {"categories": category_entry}, "$set": {"updated_at": now_iso()}},
        )
        certificate["categories"].append(category_entry)
        return certificate

    certificate = {
        "id": str(uuid.uuid4()),
        "student_id": payload["student_id"],
        "student_name": payload["student_name"],
        "date_naissance": None,
        "signataire_name": None,
        "signataire_qualite": None,
        # Échéance = celle du centre d'origine, pas +5 ans à partir
        # d'aujourd'hui — c'est tout le sens de la règle "extension".
        "expiration_date": payload["date_echeance"],
        "categories": [category_entry],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.caces_certificates.insert_one(certificate)
    certificate.pop("_id", None)
    return certificate
