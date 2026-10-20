"""Logique pure de l'unification des prospects (Phase 1 — voir demande du
2026-10-20) : normalisation, correspondance des anciens statuts vers le
nouveau vocabulaire unique, détection des fiches de test, calcul du prix
effectif. Fonctions pures (pas d'accès base), testées indépendamment dans
tests/test_lead_migration.py — le script de migration (scripts/
migrate_leads_unified.py) et le point d'écriture du webhook Stripe
(routers/payments.py) les réutilisent telles quelles.

Nouveau vocabulaire de `statut` (remplace à terme status/qualification/
pipeline_status, qui restent lisibles pendant la transition) :
  a_contacter | a_relancer | rendez_vous | inscrit | paye | injoignable | non_interesse
"""
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Optional

STATUTS = ("a_contacter", "a_relancer", "rendez_vous", "inscrit", "paye", "injoignable", "non_interesse")
CHALEURS = ("froid", "tiede", "chaud")
MOTIFS_CLOTURE = ("non_qualifie", "plus_interesse", "poubelle", "refus", "injoignable")

# Nombre de tentatives de relance sans réponse au-delà duquel un prospect est
# considéré injoignable — configurable à terme (Paramètres), valeur par
# défaut demandée explicitement : 5.
INJOIGNABLE_THRESHOLD = 5

# Correspondance ancien statut -> (statut, chaleur, motif_cloture, relancer_le_jours)
# — un seul des trois champs status/qualification/pipeline_status est mappé à
# la fois par map_legacy_status ; en cas de valeurs multiples sur le même
# document, l'appelant choisit laquelle utiliser (voir pick_legacy_value).
_LEGACY_MAP = {
    # status (db.leads)
    "nouveau": ("a_contacter", "froid", None, None),
    "contacte": ("a_relancer", "froid", None, None),
    "interesse": ("a_relancer", "chaud", None, None),
    "pas_interesse": ("non_interesse", None, "refus", None),
    # qualification (meta_lead_imports / leads)
    "a_contacter": ("a_contacter", "froid", None, None),
    "non_qualifie": ("non_interesse", None, "non_qualifie", None),
    "pas_de_reponse": ("a_relancer", "froid", None, None),
    "a_relancer": ("a_relancer", "froid", None, None),
    "a_relancer_1_an": ("a_relancer", None, None, 365),
    "plus_interesse": ("non_interesse", None, "plus_interesse", None),
    "inscrit": ("inscrit", None, None, None),
    # pipeline_status (Centre d'appel)
    "formulaire_rempli": ("a_contacter", "froid", None, None),
    "lead_entrant_sans_rdv": ("a_contacter", "froid", None, None),
    "a_recontacter": ("a_relancer", "froid", None, None),
    "premiere_relance": ("a_relancer", "froid", None, None),
    "deuxieme_relance": ("a_relancer", "froid", None, None),
    "troisieme_relance": ("a_relancer", "froid", None, None),
    "lead_tiede": ("a_relancer", "tiede", None, 7),
    "poubelle": ("non_interesse", None, "poubelle", None),
}


def normalize_phone_e164_fr(raw: Optional[str]) -> Optional[str]:
    """Numéro français vers E.164 (+33...). Renvoie None si non reconnaissable
    plutôt qu'une valeur à moitié normalisée qui fausserait le dédoublonnage."""
    if not raw:
        return None
    cleaned = re.sub(r"[^\d+]", "", raw.strip())
    if cleaned.startswith("+"):
        return cleaned if len(cleaned) >= 8 else None
    if cleaned.startswith("0033"):
        return "+33" + cleaned[4:]
    if cleaned.startswith("33") and len(cleaned) >= 10:
        return "+" + cleaned
    if cleaned.startswith("0") and len(cleaned) == 10:
        return "+33" + cleaned[1:]
    return None


def normalize_email(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    return raw.strip().lower().replace(" ", "")


_TEST_EMAIL_DOMAINS = ("tdl-formation.fr", "tdlformation.fr", "kamistreet.fr", "emergentagent.com", "example.com")


def is_test_record(name: Optional[str], email: Optional[str]) -> bool:
    """Détecte les fiches de test (créées pendant le développement/la recette)
    à exclure des statistiques et du CA — jamais supprimées, juste marquées
    `is_test=true`."""
    blob = f"{name or ''} {email or ''}".lower()
    if "test" in blob:
        return True
    norm_email = normalize_email(email)
    if norm_email and any(norm_email.endswith(f"@{d}") for d in _TEST_EMAIL_DOMAINS):
        return True
    return False


def pick_legacy_value(doc: dict) -> tuple:
    """Choisit laquelle des trois valeurs legacy (status/qualification/
    pipeline_status) utiliser quand plusieurs sont présentes sur le même
    document : la plus "avancée" dans le parcours commercial l'emporte (ex:
    pipeline_status="poubelle" prime sur qualification="a_contacter" restée
    par défaut à l'import). Renvoie (valeur_choisie, champ_source,
    conflit: bool, valeurs_en_conflit: list) pour que l'appelant puisse
    lister les conflits dans le rapport de migration."""
    # Ordre d'avancement : plus l'index est grand, plus le statut est "loin"
    # dans le parcours — sert à départager un conflit entre champs.
    rank = {
        "nouveau": 0, "a_contacter": 0, "formulaire_rempli": 0, "lead_entrant_sans_rdv": 0,
        "contacte": 1, "a_recontacter": 1, "premiere_relance": 1, "pas_de_reponse": 1, "a_relancer": 1,
        "deuxieme_relance": 2, "troisieme_relance": 3, "lead_tiede": 1, "a_relancer_1_an": 1,
        "interesse": 2,
        "inscrit": 5,
        "pas_interesse": 4, "non_qualifie": 4, "plus_interesse": 4, "poubelle": 4,
    }
    candidates = []
    for field in ("pipeline_status", "qualification", "status"):
        v = doc.get(field)
        if v and v in _LEGACY_MAP:
            candidates.append((field, v))
    if not candidates:
        return (None, None, False, [])
    if len(candidates) == 1:
        field, v = candidates[0]
        return (v, field, False, [])
    # Plusieurs champs renseignés : conflit seulement si les statuts cibles
    # (nouveau vocabulaire) diffèrent réellement, pas juste le libellé brut.
    mapped_targets = {_LEGACY_MAP[v][0] for _, v in candidates}
    best_field, best_value = max(candidates, key=lambda fv: rank.get(fv[1], 0))
    conflict = len(mapped_targets) > 1
    return (best_value, best_field, conflict, candidates)


def map_legacy_status(legacy_value: str) -> dict:
    """Traduit une valeur legacy (status/qualification/pipeline_status) vers
    les nouveaux champs. `relancer_le_jours` est un delta en jours à partir
    d'aujourd'hui, résolu par l'appelant (dépend de la date de migration)."""
    mapped = _LEGACY_MAP.get(legacy_value)
    if not mapped:
        return {"statut": "a_contacter", "chaleur": "froid", "motif_cloture": None, "relancer_le_jours": None}
    statut, chaleur, motif, jours = mapped
    return {"statut": statut, "chaleur": chaleur, "motif_cloture": motif, "relancer_le_jours": jours}


def status_from_facts(
    has_paid_payment: bool,
    has_active_inscription: bool,
    has_future_appointment: bool,
    relance_count: int,
) -> Optional[dict]:
    """Priorité aux faits (voir demande du 2026-10-20), dans cet ordre exact.
    Renvoie None si aucun fait ne s'applique — l'appelant retombe alors sur
    la correspondance de l'ancien statut (map_legacy_status)."""
    if has_paid_payment:
        return {"statut": "paye", "chaleur": None, "motif_cloture": None}
    if has_active_inscription:
        return {"statut": "inscrit", "chaleur": None, "motif_cloture": None}
    if has_future_appointment:
        return {"statut": "rendez_vous", "chaleur": "chaud", "motif_cloture": None}
    if relance_count >= INJOIGNABLE_THRESHOLD:
        return {"statut": "injoignable", "chaleur": None, "motif_cloture": "injoignable"}
    return None


def compute_prix_effectif(prix_personnalise: Optional[float], prix_grille: Optional[float], prix_catalogue: float) -> float:
    """prix_personnalise (si renseigné) > prix de la grille formation×ville
    (si une entrée existe) > prix catalogue de la formation."""
    if prix_personnalise is not None:
        return prix_personnalise
    if prix_grille is not None:
        return prix_grille
    return prix_catalogue or 0


def relancer_le_from_days(days: Optional[int], now: Optional[datetime] = None) -> Optional[str]:
    if days is None:
        return None
    base = now or datetime.now(timezone.utc)
    return (base + timedelta(days=days)).date().isoformat()


def merge_duplicate_docs(docs_in_priority_order: list) -> dict:
    """Fusionne plusieurs documents représentant la même personne, champ par
    champ : pour chaque champ, la valeur non vide la plus récente (selon
    `updated_at`/`created_at`, à défaut l'ordre de priorité des sources
    fourni par l'appelant : leads > meta_lead_imports > callback_requests).
    `sources` et `compte_meta`/`campagne` sont toujours conservés depuis
    TOUS les documents, même ceux qui perdent la fusion sur les autres champs."""
    def doc_timestamp(d):
        return d.get("updated_at") or d.get("created_at") or ""

    # Le premier document de la liste la plus récente sert de base ; les
    # champs vides sont comblés par les documents suivants, dans l'ordre de
    # priorité fourni (déjà trié par l'appelant), seulement si la base ne les
    # a pas déjà remplis avec une valeur plus récente.
    ordered = sorted(docs_in_priority_order, key=doc_timestamp, reverse=True)
    merged = {}
    for doc in ordered:
        for k, v in doc.items():
            if k in ("sources", "legacy_ids"):
                continue
            if v not in (None, "", []) and k not in merged:
                merged[k] = v

    merged["sources"] = sorted({s for d in docs_in_priority_order for s in (d.get("sources") or [])})
    merged["legacy_ids"] = {d.get("_origin", "unknown"): d.get("id") for d in docs_in_priority_order if d.get("id")}
    return merged
