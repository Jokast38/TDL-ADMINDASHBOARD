"""Ville du centre visé par un prospect Meta — Meta Lead Ads ne fournit pas de
champ ville : elle est déduite de ce que l'équipe écrit dans la publicité
(demande du 2026-11-03).

Sources, de la plus fiable à la moins fiable :
1. les questions du formulaire ("pouvez-vous participer à deux journées
   consécutives à Épinay-sur-Seine ?") et leurs réponses ;
2. le nom de la publicité ("crea stat prix | Épinay") ;
3. le nom de l'ensemble de publicités ("adset CREIL +15KM") ;
4. le nom du formulaire, puis celui de la campagne.

La campagne passe en dernier : une même campagne ("ENGHIEN +7 CREA STAT 1")
contient des publicités pour Épinay ET pour Creil.
"""
import unicodedata
from typing import Optional

_VILLES = (("EPINAY", "Épinay-sur-Seine"), ("CREIL", "Creil"))


def _normalize(text: Optional[str]) -> str:
    """Sans accents ni ponctuation : "Épinay", "épinay-sur-seine",
    "EPINAY_SUR_SEINE" deviennent tous "EPINAY SUR SEINE"."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    plain = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join("".join(c if c.isalnum() else " " for c in plain).upper().split())


def ville_in(text: Optional[str]) -> Optional[str]:
    normalized = _normalize(text)
    found = {ville for keyword, ville in _VILLES if keyword in normalized}
    # Les deux villes citées (ex: "Épinay ou Creil") : impossible de trancher.
    return found.pop() if len(found) == 1 else None


def meta_ville(
    answers: Optional[dict] = None, ad_name: Optional[str] = None, adset_name: Optional[str] = None,
    form_name: Optional[str] = None, campaign_name: Optional[str] = None,
) -> Optional[str]:
    questions = " ".join(f"{k} {v}" for k, v in (answers or {}).items())
    for source in (questions, ad_name, adset_name, form_name, campaign_name):
        ville = ville_in(source)
        if ville:
            return ville
    return None


def meta_ville_of(doc: dict) -> Optional[str]:
    """Pour un prospect déjà enregistré : à plat (ancienne collection
    meta_lead_imports) ou sous `meta_details` (db.leads)."""
    details = doc.get("meta_details") or doc
    return meta_ville(
        details.get("answers"), details.get("ad_name"), details.get("adset_name"),
        details.get("form_name"), doc.get("campaign_name") or doc.get("campagne"),
    )
