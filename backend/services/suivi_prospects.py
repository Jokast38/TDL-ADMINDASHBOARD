"""Suivi précis des prospects (demande du 2026-11-24) : qui a traité chaque
prospect, combien de fois (1er contact, 2e contact...), et classement de
l'équipe par traitements de leads par jour.

Source unique : le journal d'activité (db.activity_log, voir
services/activity.log_action), déjà alimenté à chaque note, qualification,
appel, rendez-vous, rappel... — rien de nouveau à saisir pour les équipes,
et l'historique déjà en base compte aussi.

Définitions :
- une « action de traitement » est une entrée du journal dont l'action est
  dans TREATMENT_ACTIONS et qui vise un prospect ;
- un « contact » = une personne qui traite ce prospect un jour donné (deux
  notes de la même personne le même jour = un seul contact) : 1er contact,
  2e contact... dans l'ordre chronologique ;
- au classement, un « lead traité » = un prospect distinct traité par cette
  personne ce jour-là.
"""
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional

from core.database import db
from core.rdv_suivi import PARIS

TREATMENT_ACTIONS = {
    "lead_note": "Note",
    "lead_qualifie": "Qualification",
    "lead_contacte": "Contact",
    "appel": "Appel",
    "rdv_appel_cree": "Rendez-vous placé",
    "rdv_note": "Note de rendez-vous",
    "rappel_planifie": "Rappel planifié",
    "rappel_tentative": "Rappel",
    "paiement_lien_envoye": "Lien de paiement",
    "lead_demande_documents": "Demande de documents",
    "lead_pipeline_status": "Étape du suivi",
}
NOTE_ACTIONS = {"lead_note", "rdv_note"}
LEAD_TARGETS = ("lead", "meta_lead")


def jour_paris(iso: Optional[str]) -> Optional[str]:
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return str(iso)[:10]
    if d.tzinfo is None:
        return d.date().isoformat()
    return d.astimezone(PARIS).date().isoformat()


def contacts_from_entries(entries: Iterable[dict]) -> List[dict]:
    """Regroupe les actions d'un prospect en contacts numérotés (une
    personne, un jour), du plus ancien au plus récent."""
    contacts: List[dict] = []
    index: Dict[tuple, dict] = {}
    for e in sorted(entries, key=lambda x: x.get("at") or ""):
        if e.get("action") not in TREATMENT_ACTIONS:
            continue
        key = (e.get("user_id") or e.get("user_name"), jour_paris(e.get("at")))
        c = index.get(key)
        if c is None:
            c = {"numero": len(contacts) + 1, "jour": key[1], "by_id": e.get("user_id"),
                 "by_name": e.get("user_name") or "", "first_at": e.get("at"), "last_at": e.get("at"), "actions": []}
            index[key] = c
            contacts.append(c)
        c["last_at"] = e.get("at")
        meta = e.get("meta") or {}
        detail = meta.get("note") or meta.get("qualification") or meta.get("resultat") or meta.get("outcome") \
            or meta.get("pipeline_status") or meta.get("scheduled_at") or ""
        c["actions"].append({"action": e["action"], "label": TREATMENT_ACTIONS[e["action"]],
                             "at": e.get("at"), "detail": str(detail)[:300]})
    return contacts


async def _entries_for(lead_ids: List[str]) -> List[dict]:
    if not lead_ids:
        return []
    return await db.activity_log.find(
        {"target_id": {"$in": lead_ids}, "action": {"$in": list(TREATMENT_ACTIONS)}},
        {"_id": 0, "target_id": 1, "action": 1, "user_id": 1, "user_name": 1, "at": 1, "meta": 1},
    ).to_list(20000)


async def suivi_resume(lead_ids: List[str]) -> Dict[str, dict]:
    """Pour une page de prospects : dernière personne qui a traité, quand,
    nombre de contacts et nombre de traitements (actions)."""
    by_lead: Dict[str, list] = defaultdict(list)
    for e in await _entries_for(lead_ids):
        by_lead[e["target_id"]].append(e)
    out = {}
    for lid, entries in by_lead.items():
        contacts = contacts_from_entries(entries)
        if not contacts:
            continue
        last = max(entries, key=lambda x: x.get("at") or "")
        out[lid] = {
            "traite_par_name": last.get("user_name") or "", "traite_par_id": last.get("user_id"),
            "traite_le": last.get("at"), "nb_contacts": len(contacts),
            "nb_traitements": sum(len(c["actions"]) for c in contacts),
            "nb_notes": sum(1 for e in entries if e.get("action") in NOTE_ACTIONS),
            "intervenants": sorted({c["by_name"] for c in contacts if c["by_name"]}),
        }
    return out


async def suivi_detail(lead_id: str) -> dict:
    entries = await _entries_for([lead_id])
    contacts = contacts_from_entries(entries)
    return {"lead_id": lead_id, "contacts": list(reversed(contacts)), "nb_contacts": len(contacts),
            "nb_traitements": sum(len(c["actions"]) for c in contacts)}


def classement_from_entries(entries: Iterable[dict]) -> dict:
    """Classement de l'équipe : par personne et par jour, prospects distincts
    traités, notes, qualifications, RDV placés, rappels, total d'actions."""
    per_user: Dict[str, dict] = {}
    per_day: Dict[tuple, dict] = {}
    for e in entries:
        if e.get("action") not in TREATMENT_ACTIONS or e.get("target_type") not in LEAD_TARGETS:
            continue
        uid = e.get("user_id") or e.get("user_name") or "?"
        jour = jour_paris(e.get("at"))
        u = per_user.setdefault(uid, {"user_id": e.get("user_id"), "user_name": e.get("user_name") or "",
                                      "_leads": set(), "_jours": set(), "actions": 0, "notes": 0,
                                      "qualifications": 0, "rdv": 0, "rappels": 0, "appels": 0})
        d = per_day.setdefault((uid, jour), {"user_id": e.get("user_id"), "user_name": e.get("user_name") or "",
                                             "jour": jour, "_leads": set(), "actions": 0, "notes": 0})
        for bucket in (u, d):
            bucket["_leads"].add(e.get("target_id"))
            bucket["actions"] += 1
            if e["action"] in NOTE_ACTIONS:
                bucket["notes"] += 1
        u["_jours"].add(jour)
        if e["action"] == "lead_qualifie":
            u["qualifications"] += 1
        elif e["action"] == "rdv_appel_cree":
            u["rdv"] += 1
        elif e["action"] in ("rappel_planifie", "rappel_tentative"):
            u["rappels"] += 1
        elif e["action"] in ("appel", "lead_contacte"):
            u["appels"] += 1

    jours_par_user: Dict[str, list] = defaultdict(list)
    for (uid, _), d in per_day.items():
        d["leads_traites"] = len(d.pop("_leads"))
        jours_par_user[uid].append(d)
    classement = []
    for uid, u in per_user.items():
        nb_jours = len(u.pop("_jours")) or 1
        u["leads_traites"] = sum(d["leads_traites"] for d in jours_par_user[uid])
        u.pop("_leads")
        u["jours_actifs"] = nb_jours
        u["moyenne_par_jour"] = round(u["leads_traites"] / nb_jours, 1)
        u["par_jour"] = sorted(jours_par_user[uid], key=lambda d: d["jour"], reverse=True)
        classement.append(u)
    classement.sort(key=lambda u: (-u["leads_traites"], -u["actions"], u["user_name"].lower()))
    for i, u in enumerate(classement, 1):
        u["rang"] = i
    jours = sorted({d["jour"] for d in per_day.values()}, reverse=True)
    return {"classement": classement, "jours": jours}


async def classement(date_from: str, date_to: str) -> dict:
    start = datetime.fromisoformat(date_from).replace(tzinfo=PARIS)
    end = datetime.fromisoformat(date_to).replace(tzinfo=PARIS) + timedelta(days=1)
    # Marge d'un jour de chaque côté (heures UTC), puis filtre exact en heure de Paris.
    entries = await db.activity_log.find(
        {"at": {"$gte": (start - timedelta(days=1)).isoformat(), "$lt": (end + timedelta(days=1)).isoformat()},
         "action": {"$in": list(TREATMENT_ACTIONS)}},
        {"_id": 0, "target_id": 1, "target_type": 1, "action": 1, "user_id": 1, "user_name": 1, "at": 1},
    ).to_list(100000)
    entries = [e for e in entries if date_from <= (jour_paris(e.get("at")) or "") <= date_to]
    return {**classement_from_entries(entries), "date_from": date_from, "date_to": date_to}
