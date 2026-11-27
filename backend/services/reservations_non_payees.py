"""Stages de récupération de points réservés sur le site (règle du
2026-11-27, précisée le même jour) : tant que l'inscription n'est pas
passée à « Payé », la personne n'est PAS dans la session.

- À l'inscription sur le site, la session choisie est gardée à part
  (`stage_choisi_id`) ; `stage_id` reste vide : ni place prise, ni
  convocation, ni rappel, ni présence dans la liste du formateur.
- Au passage à « Payé » (Stripe, ou l'équipe sur la page Inscriptions), la
  personne entre dans la session choisie et reçoit sa convocation — ou passe
  « en attente de placement » si la session est complète ou commencée.
- Le jour de la session choisie, sans paiement, la session choisie est
  retirée : « en attente de placement ».
- Paiement en ligne abandonné : relance par email 5 min puis 24 h après
  l'ouverture du paiement, puis plus rien (voir `relancer_paiements_abandonnes`).

Ne concerne que les inscriptions venues du site : une inscription faite par
l'équipe (sur place, au téléphone) reste sous sa responsabilité.
"""
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo

from core.database import db
from core.notification_rules import is_public_inscription
from core.utils import now_iso, format_date_long_fr

PARIS = ZoneInfo("Europe/Paris")
PAYE = ("paid", "cpf_valide")


def reservation_non_payee(insc: dict) -> bool:
    """Stage de récupération de points réservé sur le site, pas encore payé."""
    return (insc.get("category") == "PERMIS" and insc.get("status", "active") == "active"
            and insc.get("payment_status") not in PAYE and is_public_inscription(insc))


def _aujourdhui(now: Optional[datetime] = None) -> str:
    return (now or datetime.now(PARIS)).astimezone(PARIS).date().isoformat()


async def _places_prises(stage_id: str) -> int:
    return await db.inscriptions.count_documents({"stage_id": stage_id, "status": "active"})


async def _capacite(stage: dict) -> int:
    from routers.inscriptions import _capacite as cap
    return await cap(stage)


async def _attente_placement(insc: dict, motif: str, stage: Optional[dict]) -> None:
    from services.staff_notify import queue_recap_event
    await db.inscriptions.update_one({"id": insc["id"]}, {
        "$set": {"stage_id": None, "stage_titre": None, "stage_choisi_id": None, "stage_choisi_titre": None,
                 "en_attente_placement": True, "updated_at": now_iso(),
                 "session_choisie_retiree": {"stage_id": (stage or {}).get("id") or insc.get("stage_choisi_id"),
                                             "date_debut": (stage or {}).get("date_debut"), "at": now_iso(), "motif": motif}},
    })
    quand = format_date_long_fr((stage or {}).get("date_debut", "")) if stage else "?"
    await queue_recap_event(
        "PERMIS", f"🪑 À placer — {insc.get('student_name', '')} : {motif} (session choisie du {quand})",
        f"/admin/inscriptions?q={quote(insc.get('student_email') or '')}",
    )


async def placer_apres_paiement(inscription_id: str) -> Optional[str]:
    """Passage à « Payé » : entrée dans la session choisie. Renvoie
    « place », « attente » ou None (rien à faire)."""
    insc = await db.inscriptions.find_one({"id": inscription_id}, {"_id": 0})
    if not insc or insc.get("payment_status") not in PAYE or insc.get("stage_id") or not insc.get("stage_choisi_id"):
        return None
    stage = await db.stages.find_one({"id": insc["stage_choisi_id"]}, {"_id": 0})
    if not stage or stage.get("statut") == "annule":
        await _attente_placement(insc, "payé, session choisie annulée", stage)
        return "attente"
    if (stage.get("date_debut") or "") < _aujourdhui():
        await _attente_placement(insc, "payé après le début de la session choisie", stage)
        return "attente"
    if stage.get("statut") == "complet" or await _places_prises(stage["id"]) + (stage.get("external_reserved") or 0) >= await _capacite(stage):
        await _attente_placement(insc, "payé mais session choisie complète", stage)
        return "attente"
    await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {
        "stage_id": stage["id"], "stage_titre": stage.get("formation_titre"), "stage_choisi_id": None,
        "stage_choisi_titre": None, "en_attente_placement": False, "updated_at": now_iso()}})
    from services.candidate_automation import convoquer_apres_paiement
    await convoquer_apres_paiement(insc["id"])
    return "place"


async def retirer_sessions_non_payees(now: Optional[datetime] = None) -> int:
    """Boucle des 15 min :
    1. anciennes réservations du site non payées encore placées dans une
       session à venir (avant cette règle) : sorties de la session, la
       session reste « choisie » ;
    2. jour de la session choisie sans paiement : session choisie retirée,
       « en attente de placement »."""
    aujourdhui = _aujourdhui(now)
    n = 0
    anciennes = [i for i in await db.inscriptions.find(
        {"category": "PERMIS", "status": "active", "stage_id": {"$ne": None}, "payment_status": {"$nin": list(PAYE)}},
        {"_id": 0}).to_list(5000) if i.get("stage_id") and reservation_non_payee(i)]
    for insc in anciennes:
        stage = await db.stages.find_one({"id": insc["stage_id"]}, {"_id": 0, "date_debut": 1, "formation_titre": 1})
        if not stage or (stage.get("date_debut") or "") <= aujourdhui:
            continue  # session commencée ou passée : on n'y touche pas
        await db.inscriptions.update_one({"id": insc["id"]}, {
            "$set": {"stage_id": None, "stage_titre": None, "stage_choisi_id": insc["stage_id"],
                     "stage_choisi_titre": stage.get("formation_titre"), "updated_at": now_iso()},
            "$unset": {"convocation_sent_at": "", "eve_reminder_sent_at": ""},
        })
        n += 1

    choisies = [i for i in await db.inscriptions.find(
        {"category": "PERMIS", "status": "active", "stage_choisi_id": {"$ne": None}, "payment_status": {"$nin": list(PAYE)}},
        {"_id": 0}).to_list(5000) if i.get("stage_choisi_id") and reservation_non_payee(i)]
    for insc in choisies:
        stage = await db.stages.find_one({"id": insc["stage_choisi_id"]}, {"_id": 0})
        if stage and (stage.get("date_debut") or "") > aujourdhui:
            continue
        await _attente_placement(insc, "aucun paiement le jour de la session choisie", stage)
        n += 1
    return n


# ---------------------------------------------------------------------------
# Paiements en ligne abandonnés (toutes formations, inscriptions du site).
# ---------------------------------------------------------------------------
RELANCES = (("relance_paiement_5min_at", timedelta(minutes=5), timedelta(hours=2)),
            ("relance_paiement_24h_at", timedelta(hours=24), timedelta(hours=48)))


def _parse(v: Optional[str]) -> Optional[datetime]:
    try:
        d = datetime.fromisoformat((v or "").replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=PARIS)
    except ValueError:
        return None


def _message_relance(insc: dict, stage: Optional[dict], seconde: bool) -> str:
    session = ""
    if stage and stage.get("date_debut"):
        session = f" pour la session du {format_date_long_fr(stage['date_debut'])}"
    debut = (f"Bonjour {insc.get('student_name', '')},\n\n"
             f"Votre inscription à {insc.get('formation_title', '')}{session} n'est pas encore finalisée : "
             "le paiement n'a pas été effectué.\n\n")
    if insc.get("category") == "PERMIS":
        debut += "Votre place dans la session n'est réservée qu'une fois le paiement reçu.\n\n"
    fin = ("C'est notre dernier rappel. " if seconde else "") + \
        "Vous pouvez finaliser votre paiement en toute sécurité avec le bouton ci-dessous."
    return debut + fin


async def relancer_paiements_abandonnes(now: Optional[datetime] = None) -> int:
    """Toutes les minutes : vérifie sur Stripe les paiements ouverts depuis le
    site et pas encore confirmés ; si le paiement est abandonné, relance par
    email 5 min puis 24 h après, puis plus rien. Les fenêtres (2 h / 48 h)
    évitent de relancer d'anciens paiements au premier déploiement."""
    from routers.payments import _mark_paid_and_notify, _settings
    from services import stripe_service
    from services.email import send_email
    from services.email_template import render_branded_email
    from core.config import PUBLIC_BACKEND_URL

    if not (await _settings()).get("payments_enabled"):
        return 0
    now = now or datetime.now(PARIS)
    candidats = await db.inscriptions.find(
        {"status": "active", "payment_status": {"$in": ["processing", "pending"]}, "stripe_session_id": {"$exists": True, "$ne": None}},
        {"_id": 0}).to_list(5000)
    envoyees = 0
    for insc in candidats:
        if not is_public_inscription(insc) or not insc.get("student_email"):
            continue
        # Seulement les paiements ouverts depuis ce suivi (checkout_started_at,
        # posé par POST /payments/checkout) : pas de relance d'anciens dossiers.
        ouvert = _parse(insc.get("checkout_started_at"))
        if not ouvert:
            continue
        age = now - ouvert
        a_faire = next(((champ, i) for i, (champ, apres, limite) in enumerate(RELANCES)
                        if not insc.get(champ) and apres <= age < limite), None)
        if not a_faire:
            continue
        # Toujours vérifier sur Stripe avant de relancer : un paiement fait
        # dont le webhook n'est pas arrivé ne doit pas recevoir de relance.
        try:
            session = await stripe_service.retrieve_checkout_session(insc["stripe_session_id"])
            statut = session.get("payment_status") if isinstance(session, dict) else session.payment_status
        except Exception:
            continue
        if statut == "paid":
            total = session.get("amount_total") if isinstance(session, dict) else session.amount_total
            intent = session.get("payment_intent") if isinstance(session, dict) else session.payment_intent
            await _mark_paid_and_notify(insc["id"], (total or 0) / 100, intent)
            continue
        champ, rang = a_faire
        stage = None
        if insc.get("stage_choisi_id") or insc.get("stage_id"):
            stage = await db.stages.find_one({"id": insc.get("stage_choisi_id") or insc.get("stage_id")}, {"_id": 0, "date_debut": 1})
            if stage and (stage.get("date_debut") or "") < _aujourdhui(now):
                stage = None
        lien = f"{PUBLIC_BACKEND_URL}/api/payments/reprendre/{insc['id']}"
        await send_email(
            insc["student_email"], f"Finalisez votre paiement — {insc.get('formation_title', '')}",
            render_branded_email(_message_relance(insc, stage, rang == 1), "Finaliser mon paiement", lien),
        )
        await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {champ: now_iso()}})
        envoyees += 1
    return envoyees
