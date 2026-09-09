"""Automatisation du parcours candidat (cahier des charges post-réunion) :
convocation J-7, attestation de fin de formation (dernier jour / J+1),
questionnaire de satisfaction à chaud (dernier jour) et à froid (1 à 2 mois
après la fin) — voir server.py pour les boucles de fond qui appellent ces
fonctions, et routers/reminders.py pour le déclenchement manuel."""
import base64
import uuid
from datetime import datetime, timedelta

from core.database import db
from core.storage import put_object
from core.utils import now_iso
from core.config import PUBLIC_FRONTEND_URL
from services.email import send_email
from services.pdf import generate_attestation_pdf

CONTACT_EMAIL = "contact@tdl-formation.fr"
CONTACT_PHONE = "01 XX XX XX XX"  # à ajuster depuis Paramètres si besoin


def _today():
    return datetime.now().date()


async def send_convocations() -> int:
    """Envoie la convocation 7 jours avant le début de chaque session, à
    tout candidat actif affecté et pas encore convoqué."""
    target = (_today() + timedelta(days=7)).isoformat()
    stages = await db.stages.find({"date_debut": target, "statut": {"$ne": "annule"}}, {"_id": 0}).to_list(200)
    count = 0
    for stage in stages:
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "convocation_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email"):
                continue
            body = (
                f"<p>Bonjour {insc.get('student_name', '')},</p>"
                f"<p>Nous vous confirmons votre convocation à la formation <b>{stage.get('formation_titre', '')}</b>.</p>"
                "<table style='border-collapse:collapse;margin:12px 0'>"
                f"<tr><td style='padding:4px 12px 4px 0;color:#666'>Dates</td><td><b>Du {stage.get('date_debut', '')} au {stage.get('date_fin', '')}</b></td></tr>"
                f"<tr><td style='padding:4px 12px 4px 0;color:#666'>Lieu</td><td>{stage.get('lieu_adresse', '')}, {stage.get('lieu_ville', '')}</td></tr>"
                "</table>"
                "<p>Merci de vous présenter avec une pièce d'identité valide et les documents demandés dans votre dossier.</p>"
                f"<p>Pour toute question, contactez-nous : {CONTACT_EMAIL}.</p>"
                "<p>TDL Formation</p>"
            )
            await send_email(insc["student_email"], f"📋 Convocation — {stage.get('formation_titre', '')}", body)
            await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"convocation_sent_at": now_iso()}})
            count += 1
    return count


async def send_auto_attestations() -> int:
    """Génère et envoie automatiquement l'attestation de fin de formation le
    dernier jour de la session ou le lendemain (rattrapage si la boucle
    tourne une fois par jour et a manqué le jour exact)."""
    today_iso = _today().isoformat()
    yesterday_iso = (_today() - timedelta(days=1)).isoformat()
    stages = await db.stages.find(
        {"date_fin": {"$in": [today_iso, yesterday_iso]}, "statut": {"$ne": "annule"}}, {"_id": 0}
    ).to_list(200)
    count = 0
    settings_doc = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    for stage in stages:
        formation = await db.formations.find_one({"id": stage["formation_id"]}, {"_id": 0}) or {}
        animateur_ids = list(stage.get("animateur_ids") or ([stage["animateur_id"]] if stage.get("animateur_id") else []))
        animateur = {"name": "TDL Formation"}
        if animateur_ids:
            found = await db.users.find_one({"id": animateur_ids[0]}, {"_id": 0, "name": 1})
            if found:
                animateur = found
        inscriptions = await db.inscriptions.find(
            {"stage_id": stage["id"], "status": "active", "attestation_auto_sent_at": {"$exists": False}}, {"_id": 0}
        ).to_list(300)
        for insc in inscriptions:
            if not insc.get("student_email"):
                continue
            student = {"name": insc.get("student_name", ""), "email": insc.get("student_email", "")}
            try:
                pdf_bytes = generate_attestation_pdf(stage, formation, student, animateur, None, True, settings_doc)
            except Exception:
                continue
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
                f"du {stage.get('date_debut', '')} au {stage.get('date_fin', '')}.</p>"
                "<p>Vous trouverez votre attestation de fin de formation en pièce jointe.</p>"
                "<p>TDL Formation</p>"
            )
            await send_email(
                insc["student_email"], f"🎓 Attestation de fin de formation — {stage.get('formation_titre', '')}", body,
                attachment={"filename": fname, "content_b64": base64.b64encode(pdf_bytes).decode()},
            )
            await db.inscriptions.update_one({"id": insc["id"]}, {"$set": {"attestation_auto_sent_at": now_iso()}})
            count += 1
    return count


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
