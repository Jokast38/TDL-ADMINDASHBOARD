"""Automatisation du parcours candidat (cahier des charges post-réunion) :
convocation J-7, attestation de fin de formation (dernier jour / J+1),
questionnaire de satisfaction à chaud (dernier jour) et à froid (1 à 2 mois
après la fin) — voir server.py pour les boucles de fond qui appellent ces
fonctions, et routers/reminders.py pour le déclenchement manuel."""
import base64
import uuid
from datetime import datetime, timedelta
from typing import Optional

from core.database import db
from core.storage import put_object
from core.utils import now_iso, format_date_long_fr, format_date_fr
from core.config import PUBLIC_FRONTEND_URL, GOOGLE_PLACE_ID
from services.email import send_email
from services.email_template import render_branded_email
from services.pdf import generate_attestation_pdf
from services.whatsapp import send_whatsapp, send_whatsapp_or_sms
from core import whatsapp_templates as wa
from core.stage_hours import RECUP_ACCUEIL, is_recup, stage_hours

CONTACT_EMAIL = "contact@tdl-formation.fr"
CONTACT_PHONE = "01 XX XX XX XX"  # à ajuster depuis Paramètres si besoin


def _today():
    return datetime.now().date()


def _minus_30min(hhmm: str) -> str:
    try:
        h, m = (int(x) for x in hhmm.split(":"))
        total = h * 60 + m - 30
        return f"{(total // 60) % 24:02d}h{total % 60:02d}"
    except Exception:
        return hhmm


def _hhmm_to_h(hhmm: str) -> str:
    try:
        h, m = (int(x) for x in hhmm.split(":"))
        return f"{h}h{m:02d}" if m else f"{h}h"
    except Exception:
        return hhmm


def convocation_message(stage: dict, insc: dict) -> str:
    """Corps du mail de convocation — version détaillée (consignes de
    ponctualité, matériel à prévoir...) pour les formations VTC/Taxi, version
    courte pour les autres catégories (stage récup de points, CACES...), qui
    n'ont pas le même format pédagogique."""
    student_name = insc.get("student_name", "")
    date_debut = format_date_long_fr(stage.get("date_debut", ""))
    date_fin = format_date_long_fr(stage.get("date_fin", ""))
    heure_debut, heure_fin = stage_hours(stage)
    lieu = f"{stage.get('lieu_adresse', '')}, {stage.get('lieu_ville', '')}"

    if stage.get("formation_category") == "VTC_TAXI":
        arrivee = _minus_30min(heure_debut)
        return (
            "Madame, Monsieur,\n\n"
            "Nous avons le plaisir de vous confirmer votre inscription à la formation VTC / TAXI organisée par TDL Formation.\n\n"
            "La session se déroulera selon les modalités suivantes :\n\n"
            f"Dates : du {date_debut} au {date_fin}\n"
            f"Horaires : de {_hhmm_to_h(heure_debut)} à {_hhmm_to_h(heure_fin)}\n"
            f"Lieu de formation : TDL Formation – {lieu}\n\n"
            "Merci de bien vouloir confirmer votre présence à cette formation par retour de mail.\n\n"
            "PREMIER JOUR DE FORMATION\n"
            f"Le {date_debut}, nous vous demandons de vous présenter 30 minutes avant le début de la formation, soit à {arrivee}.\n\n"
            "Cette arrivée anticipée permettra d'effectuer votre accueil, les éventuelles vérifications administratives ainsi que la présentation de l'organisation et du déroulement de la formation.\n\n"
            "PONCTUALITÉ – RETARDS – ABSENCES\n"
            "La ponctualité et l'assiduité sont indispensables au bon déroulement de votre formation.\n\n"
            "En cas de retard ou d'absence, vous devez impérativement prévenir la Direction de TDL Formation dans les meilleurs délais.\n\n"
            "Nous vous remercions de respecter les horaires prévus pendant toute la durée de la session.\n\n"
            "MATÉRIEL À PRÉVOIR\n"
            "Afin de suivre votre formation dans de bonnes conditions, merci de vous munir de :\n\n"
            "Un cahier ou un bloc-notes\n"
            "Un stylo\n"
            "Tout matériel nécessaire à votre prise de notes\n\n"
            "UN MOT POUR VOTRE FORMATION\n"
            "Cette formation constitue une étape importante dans votre projet professionnel.\n\n"
            "Notre objectif est de vous préparer dans les meilleures conditions à la réussite de votre examen, mais également de vous transmettre les connaissances, les méthodes de travail et les bonnes pratiques nécessaires à l'exercice de votre futur métier.\n\n"
            "Nous souhaitons vous accompagner afin que vous deveniez des chauffeurs VTC ou TAXI professionnels, responsables, ponctuels, rigoureux et attentifs à la qualité du service proposé à vos futurs clients.\n\n"
            "Votre implication, votre assiduité et votre sérieux tout au long de la formation seront essentiels à votre réussite.\n\n"
            "Toute l'équipe de TDL Formation vous souhaite une excellente formation et beaucoup de réussite dans votre projet professionnel.\n\n"
            "Cordialement"
        )

    return (
        f"Bonjour {student_name},\n\n"
        f"Nous vous confirmons votre convocation à la formation {stage.get('formation_titre', '')}.\n\n"
        f"Dates : du {date_debut} au {date_fin}\n"
        f"Horaires : de {_hhmm_to_h(heure_debut)} à {_hhmm_to_h(heure_fin)}\n"
        f"Lieu : {lieu}\n\n"
        + (_recup_ponctualite(heure_debut) if is_recup(stage) else "") +
        "Merci de vous présenter avec une pièce d'identité valide et les documents demandés dans votre dossier.\n\n"
        f"Pour toute question, contactez-nous : {CONTACT_EMAIL}."
    )


def _recup_accueil(heure_debut: str) -> str:
    """Heure d'accueil d'un stage de récupération de points : 7h45 pour un
    début à 8h, sinon 15 minutes avant le début."""
    if heure_debut == "08:00":
        return _hhmm_to_h(RECUP_ACCUEIL)
    try:
        h, m = (int(x) for x in heure_debut.split(":"))
        t = h * 60 + m - 15
        return _hhmm_to_h(f"{t // 60:02d}:{t % 60:02d}")
    except Exception:
        return _hhmm_to_h(heure_debut)


def _recup_ponctualite(heure_debut: str) -> str:
    return (
        f"IMPORTANT : le stage commence à {_hhmm_to_h(heure_debut)} précises. Merci d'arriver dès "
        f"{_recup_accueil(heure_debut)} pour l'accueil et l'émargement. La présence est obligatoire "
        "pendant toute la durée du stage : un retard peut entraîner un refus d'accès et la non-délivrance "
        "de l'attestation de stage.\n\n"
    )


def convocation_sms(stage: dict, insc: dict) -> str:
    """Version courte de la convocation pour SMS — secours quand l'email
    n'est pas ouvert ou arrive en spam, voir services/sms.py."""
    date_debut = format_date_long_fr(stage.get("date_debut", ""))
    heure_debut = stage_hours(stage)[0]
    lieu = stage.get("lieu_ville", "")
    if is_recup(stage):
        return (
            f"TDL Formation : stage récup. de points le {date_debut} à {_hhmm_to_h(heure_debut)} PRÉCISES — {lieu}. "
            f"Arrivée dès {_recup_accueil(heure_debut)}, tout retard peut être refusé. Pièce d'identité + permis."
        )
    return (
        f"TDL Formation : convocation confirmée pour {stage.get('formation_titre', '')} "
        f"le {date_debut} à {_hhmm_to_h(heure_debut)} — {lieu}. Pièce d'identité requise."
    )


def _lieu(stage: dict) -> str:
    return ", ".join(p for p in (stage.get("lieu_adresse"), stage.get("lieu_ville")) if p) or "TDL Formation"


async def send_convocation_whatsapp(stage: dict, insc: dict) -> dict:
    """Convocation par WhatsApp, en plus du mail — le SMS ne part qu'en
    secours, si WhatsApp n'a pas pu être envoyé."""
    debut, fin = stage_hours(stage)
    horaires = f"de {_hhmm_to_h(debut)} à {_hhmm_to_h(fin)}"
    if is_recup(stage):
        horaires += f" (arrivée dès {_recup_accueil(debut)})"
    return await send_whatsapp_or_sms(
        insc.get("student_phone"), wa.CONVOCATION,
        [insc.get("student_name"), stage.get("formation_titre"), format_date_long_fr(stage.get("date_debut", "")),
         format_date_long_fr(stage.get("date_fin", "")), horaires, _lieu(stage)],
        sms_text=convocation_sms(stage, insc), extra={"inscription_id": insc["id"]},
    )


async def send_convocations() -> int:
    """Envoie la convocation 7 jours avant le début de chaque session, à
    tout candidat actif affecté et pas encore convoqué."""
    target = (_today() + timedelta(days=7)).isoformat()
    stages = await db.stages.find({"date_debut": target, "statut": {"$ne": "annule"}}, {"_id": 0}).to_list(200)
    count = 0
    for stage in stages:
        formation = await db.formations.find_one({"id": stage.get("formation_id")}, {"_id": 0, "category": 1}) or {}
        stage["formation_category"] = formation.get("category")
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "convocation_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email"):
                continue
            message = convocation_message(stage, insc)
            await send_email(insc["student_email"], f"📋 Convocation — {stage.get('formation_titre', '')}", render_branded_email(message))
            await send_convocation_whatsapp(stage, insc)
            await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"convocation_sent_at": now_iso()}})
            count += 1
    return count


async def send_session_eve_reminders() -> int:
    """Rappel la veille du premier jour de la session (demande du
    2026-11-03), par mail et par WhatsApp, à tout candidat actif affecté et
    pas encore rappelé (`eve_reminder_sent_at`)."""
    target = (_today() + timedelta(days=1)).isoformat()
    stages = await db.stages.find({"date_debut": target, "statut": {"$ne": "annule"}}, {"_id": 0}).to_list(200)
    count = 0
    for stage in stages:
        heure = _hhmm_to_h(stage_hours(stage)[0])
        recup = is_recup(stage)
        date_debut = format_date_long_fr(stage.get("date_debut", ""))
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "eve_reminder_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email") and not insc.get("student_phone"):
                continue
            if insc.get("student_email"):
                message = (
                    f"Bonjour {insc.get('student_name', '')},\n\n"
                    f"Rappel : votre formation {stage.get('formation_titre', '')} commence demain, {date_debut} à {heure}"
                    + (" précises" if recup else "") + ".\n"
                    f"Lieu : {_lieu(stage)}\n\n"
                    + (_recup_ponctualite(stage_hours(stage)[0]) if recup else "") +
                    "Pensez à votre pièce d'identité. En cas d'empêchement, prévenez-nous au plus vite."
                )
                await send_email(insc["student_email"], f"⏰ C'est demain — {stage.get('formation_titre', '')}", render_branded_email(message))
            if insc.get("student_phone"):
                await send_whatsapp(
                    insc["student_phone"], wa.RAPPEL_VEILLE,
                    [insc.get("student_name"), stage.get("formation_titre"), date_debut,
                     f"{heure} précises (arrivée dès {_recup_accueil(stage_hours(stage)[0])})" if recup else heure, _lieu(stage)],
                    extra={"inscription_id": insc["id"]},
                )
            await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"eve_reminder_sent_at": now_iso()}})
            count += 1
    return count


def _hours_since_end(stage: dict) -> Optional[float]:
    """Nombre d'heures écoulées depuis minuit le lendemain de `date_fin`, ou
    None si la date est absente/invalide. Sert de garde-fou unique, partagé
    par l'envoi automatique et le déclenchement manuel (voir
    routers/inscriptions.py) : jamais d'attestation de fin de formation avant
    que 24h ne soient passées depuis la fin de la session."""
    date_fin = stage.get("date_fin")
    if not date_fin:
        return None
    try:
        end = datetime.strptime(date_fin, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return None
    return (datetime.now() - end).total_seconds() / 3600


async def _send_attestation_for_inscription(insc: dict, stage: dict, formation: dict, settings_doc: dict) -> bool:
    """Génère, enregistre et envoie l'attestation de fin de formation pour
    UNE inscription. Ne vérifie ni l'éligibilité (24h, déjà envoyée...) ni
    l'existence de l'email — laissé aux appelants (send_auto_attestations et
    le déclenchement manuel), qui n'ont pas les mêmes garde-fous à appliquer
    autour (silencieux pour la boucle de fond, erreurs explicites pour un
    humain qui clique)."""
    animateur_ids = list(stage.get("animateur_ids") or ([stage["animateur_id"]] if stage.get("animateur_id") else []))
    animateur = {"name": "TDL Formation"}
    if animateur_ids:
        found = await db.users.find_one({"id": animateur_ids[0]}, {"_id": 0, "name": 1})
        if found:
            animateur = found
    student = {"name": insc.get("student_name", ""), "email": insc.get("student_email", "")}
    pdf_bytes = generate_attestation_pdf(stage, formation, student, animateur, None, True, settings_doc)
    fname = f"Attestation_{(insc.get('student_name') or 'candidat').replace(' ', '_')}.pdf"
    try:
        path = f"generated/attestations/{uuid.uuid4()}.pdf"
        result = await put_object(path, pdf_bytes, "application/pdf")
        await db.generated_docs.insert_one({
            "id": str(uuid.uuid4()), "type_doc": "attestation", "nom_fichier": fname,
            "storage_path": result["path"], "size": result["size"], "stage_id": stage["id"],
            "inscription_id": insc["id"], "student_name": insc.get("student_name"),
            "auto_generated": True, "created_at": now_iso(),
        })
    except Exception:
        pass
    body = (
        f"<p>Bonjour {insc.get('student_name', '')},</p>"
        f"<p>Félicitations pour avoir suivi la formation <b>{stage.get('formation_titre', '')}</b> "
        f"du {format_date_long_fr(stage.get('date_debut', ''))} au {format_date_long_fr(stage.get('date_fin', ''))}.</p>"
        "<p>Vous trouverez votre attestation de fin de formation en pièce jointe.</p>"
        "<p>TDL Formation</p>"
    )
    await send_email(
        insc["student_email"], f"🎓 Attestation de fin de formation — {stage.get('formation_titre', '')}", body,
        attachment={"filename": fname, "content_b64": base64.b64encode(pdf_bytes).decode()},
    )
    await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"attestation_auto_sent_at": now_iso()}})
    return True


async def send_auto_attestations() -> int:
    """Génère et envoie automatiquement l'attestation de fin de formation
    24h après le dernier jour de la session — jamais le jour même (voir
    incident du 18/09/2026 : des sessions VTC créées en masse par l'import
    Excel, routers/vtc_import.py, avaient une date_fin provisoire/approximative
    jamais corrigée ; l'envoi le jour J même laisse zéro marge pour repérer et
    corriger une date fausse avant que l'attestation ne parte). La requête
    Mongo ne fait qu'un premier filtrage large (jusqu'à 7 jours en arrière,
    pour rattraper une boucle restée arrêtée quelques jours) ; la décision
    précise par session utilise ensuite _hours_since_end (même règle,
    exactement, que le déclenchement manuel — voir send_attestation_manual) :
    cette boucle tournant en continu depuis le démarrage du serveur (pas à
    heure fixe), un simple filtre par date pourrait sinon laisser passer un
    envoi entre 0 et 24h après la vraie limite selon l'heure d'exécution."""
    week_ago_iso = (_today() - timedelta(days=7)).isoformat()
    today_iso = _today().isoformat()
    stages = await db.stages.find(
        {"date_fin": {"$gte": week_ago_iso, "$lte": today_iso}, "statut": {"$ne": "annule"}}, {"_id": 0}
    ).to_list(200)
    count = 0
    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    for stage in stages:
        hours = _hours_since_end(stage)
        if hours is None or hours < 24:
            continue
        formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "attestation_auto_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email"):
                continue
            try:
                await _send_attestation_for_inscription(insc, stage, formation, settings_doc)
                count += 1
            except Exception:
                continue
    return count


async def send_attestation_manual(inscription_id: str) -> dict:
    """Déclenchement manuel, depuis la page Apprenants (voir
    routers/inscriptions.py), avec la MÊME règle des 24h que l'envoi
    automatique — appliquée ici côté serveur, jamais seulement côté écran :
    un bouton désactivé dans le navigateur ne protège de rien si l'API
    l'accepte quand même."""
    insc = await db.inscriptions.find_one({"id": inscription_id}, {"_id": 0})
    if not insc:
        raise ValueError("Inscription introuvable")
    if not insc.get("stage_id"):
        raise ValueError("Aucune session assignée à cette inscription")
    stage = await db.stages.find_one({"id": insc["stage_id"]}, {"_id": 0})
    if not stage:
        raise ValueError("Session introuvable")
    hours = _hours_since_end(stage)
    if hours is None:
        raise ValueError("Date de fin de session absente ou invalide — à corriger avant l'envoi")
    if hours < 24:
        raise ValueError(
            f"La session se termine le {format_date_fr(stage.get('date_fin'))} — l'attestation ne peut être envoyée que "
            "24h après (le lendemain minuit)."
        )
    if not insc.get("student_email"):
        raise ValueError("Aucun email connu pour cet apprenant")
    formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    await _send_attestation_for_inscription(insc, stage, formation, settings_doc)
    return {"sent": True, "stage_titre": stage.get("formation_titre"), "date_fin": stage.get("date_fin")}


def _survey_link(insc_id: str, survey_type: str) -> str:
    return f"{PUBLIC_FRONTEND_URL}/satisfaction/{survey_type}/{insc_id}"


async def send_satisfaction_chaud() -> int:
    """Envoie le questionnaire de satisfaction « à chaud » le dernier jour de
    la formation."""
    today_iso = _today().isoformat()
    stages = await db.stages.find({"date_fin": today_iso, "statut": {"$ne": "annule"}}, {"_id": 0}).to_list(200)
    count = 0
    for stage in stages:
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "chaud_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email"):
                continue
            link = _survey_link(insc["id"], "chaud")
            body = (
                f"<p>Bonjour {insc.get('student_name', '')},</p>"
                f"<p>Votre formation <b>{stage.get('formation_titre', '')}</b> se termine aujourd'hui — merci de prendre "
                "quelques minutes pour nous donner votre avis à chaud, cela nous aide à améliorer nos formations.</p>"
                f"<p><a href='{link}' style='background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold'>Répondre au questionnaire</a></p>"
                "<p>TDL Formation</p>"
            )
            await send_email(insc["student_email"], "📝 Votre avis nous intéresse — Questionnaire de satisfaction", body)
            await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"chaud_sent_at": now_iso()}})
            count += 1
    return count


async def send_satisfaction_froid() -> int:
    """Envoie le questionnaire de satisfaction « à froid » 30 jours après la
    fin de la formation (fenêtre de rattrapage jusqu'à 60 jours si la boucle
    a manqué la date exacte)."""
    d30 = (_today() - timedelta(days=30)).isoformat()
    d60 = (_today() - timedelta(days=60)).isoformat()
    stages = await db.stages.find(
        {"date_fin": {"$gte": d60, "$lte": d30}, "statut": {"$ne": "annule"}}, {"_id": 0}
    ).to_list(500)
    count = 0
    for stage in stages:
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "froid_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email"):
                continue
            link = _survey_link(insc["id"], "froid")
            body = (
                f"<p>Bonjour {insc.get('student_name', '')},</p>"
                f"<p>Vous avez suivi la formation <b>{stage.get('formation_titre', '')}</b> il y a maintenant quelques semaines. "
                "Nous aimerions savoir comment cette formation vous a été utile au quotidien.</p>"
                f"<p><a href='{link}' style='background:#d4af37;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold'>Répondre au questionnaire</a></p>"
                "<p>TDL Formation</p>"
            )
            await send_email(insc["student_email"], "📝 Retour d'expérience — quelques mois après votre formation", body)
            await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"froid_sent_at": now_iso()}})
            count += 1
    return count


# Délai avant relance avis Google après la fin de la formation — plus court
# pour la récupération de points (rotation rapide, beaucoup de sessions,
# l'expérience est encore fraîche) que pour les autres formations (on laisse
# le temps à l'apprenant d'en tirer un vrai retour avant de le solliciter).
REVIEW_CATEGORY_FAST = "PERMIS"
REVIEW_DELAY_FAST_HOURS = 48
REVIEW_DELAY_OTHERS_DAYS = 7


async def _send_review_requests_for(formation_ids: list, target_dates: list) -> int:
    if not formation_ids or not GOOGLE_PLACE_ID:
        return 0
    write_review_url = f"https://search.google.com/local/writereview?placeid={GOOGLE_PLACE_ID}"
    stages = await db.stages.find(
        {"formation_id": {"$in": formation_ids}, "date_fin": {"$in": target_dates}, "statut": {"$ne": "annule"}},
        {"_id": 0},
    ).to_list(500)
    count = 0
    for stage in stages:
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "review_request_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email"):
                continue
            message = (
                f"Bonjour {insc.get('student_name', '')},\n\n"
                f"Nous espérons que votre formation {stage.get('formation_titre', '')} s'est bien passée !\n\n"
                "Votre avis compte beaucoup pour nous et pour les futurs apprenants — auriez-vous deux minutes "
                "pour partager votre expérience sur Google ? Ça nous aide énormément."
            )
            await send_email(
                insc["student_email"], f"Votre avis sur {stage.get('formation_titre', '')} ?",
                render_branded_email(message, "Laisser un avis Google", write_review_url),
            )
            if insc.get("student_phone"):
                await send_whatsapp(
                    insc["student_phone"], wa.AVIS_GOOGLE, [insc.get("student_name"), stage.get("formation_titre")],
                    button_param=GOOGLE_PLACE_ID, extra={"inscription_id": insc["id"]},
                )
            await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"review_request_sent_at": now_iso()}})
            count += 1
    return count


async def send_review_requests() -> int:
    """Invite les apprenants à laisser un avis Google une fois leur formation
    terminée : 48h après pour les stages de récupération de points, 1
    semaine après pour les autres formations. Fenêtre de rattrapage de 3
    jours (comme send_satisfaction_froid) au cas où la boucle journalière
    manquerait le créneau exact. N'envoie qu'une fois par inscription
    (`review_request_sent_at`)."""
    if not GOOGLE_PLACE_ID:
        return 0
    formations = await db.formations.find({}, {"_id": 0, "id": 1, "category": 1}).to_list(500)
    fast_ids = [f["id"] for f in formations if f.get("category") == REVIEW_CATEGORY_FAST]
    other_ids = [f["id"] for f in formations if f.get("category") != REVIEW_CATEGORY_FAST]

    today = _today()
    fast_target = today - timedelta(hours=REVIEW_DELAY_FAST_HOURS)
    fast_window = [(fast_target - timedelta(days=d)).isoformat() for d in range(0, 3)]
    others_target = today - timedelta(days=REVIEW_DELAY_OTHERS_DAYS)
    others_window = [(others_target - timedelta(days=d)).isoformat() for d in range(0, 3)]

    count = await _send_review_requests_for(fast_ids, fast_window)
    count += await _send_review_requests_for(other_ids, others_window)
    return count
