from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from core.config import ROLES_DOSSIERS_MGMT
from core.database import db
from core.utils import now_iso
from services.email import send_email
from services.push import send_push_to_users

CONTACT_EMAIL = "contact@tdl-formation.fr"

# Rôles concernés par les demandes de rappel (mêmes que _NOTIFY_ROLES dans
# routers/callback.py — dupliqué ici pour éviter un import circulaire).
CALLBACK_NOTIFY_ROLES = ("responsable_admission", "agent_admin", "commercial", "responsable_commercial")

# Une demande toute fraîche (< 1h) ne doit pas déclencher de rappel dès le
# premier passage de la boucle — l'email de notification immédiate suffit,
# le rappel concerne les demandes qui traînent.
_MIN_AGE_FOR_REMINDER = timedelta(hours=1)

CATEGORY_LABELS = {
    "CACES": "CACES", "PERMIS": "Récupération de points", "AUTO_ECOLE": "Auto-école",
    "SSIAP": "SSIAP", "VTC_TAXI": "VTC / Taxi", "ECSR": "ECSR", "VENTE": "Conseiller de Vente",
}


async def _assigned_staff(category: Optional[str], center: Optional[str], roles: Iterable[str]) -> list:
    staff = await db.users.find(
        {"active": True, "role": {"$in": list(roles)}},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "assigned_categories": 1, "assigned_centers": 1, "assigned_training_assignments": 1},
    ).to_list(100)
    result = []
    for member in staff:
        assignments = member.get("assigned_training_assignments") or []
        if assignments:
            matches = (not category or not center) or any(
                a.get("category") == category and a.get("center") == center for a in assignments
            )
        else:
            categories = member.get("assigned_categories") or []
            centers = member.get("assigned_centers") or []
            matches = (not categories or not category or category in categories) and (not centers or not center or center in centers)
        if matches:
            result.append(member)
    return result


async def notify_new_contact(
    category: Optional[str], roles: Iterable[str],
    email_subject: str, email_body_html: str,
    push_title: str, push_body: str, push_url: str = "/admin/leads",
    center: Optional[str] = None,
) -> None:
    """Route un nouveau lead/demande de rappel vers le personnel assigné à cette
    catégorie de formation (email + push). Si personne n'est assigné à cette
    catégorie (ou catégorie inconnue), on retombe sur l'email de contact
    générique — comportement historique conservé, aucun lead perdu."""
    staff = await _assigned_staff(category, center, roles)
    if not staff:
        await send_email(CONTACT_EMAIL, email_subject, email_body_html)
        return
    for member in staff:
        if member.get("email"):
            await send_email(member["email"], email_subject, email_body_html)
    await send_push_to_users([m["id"] for m in staff], push_title, push_body, push_url)


def _parse_iso(value: str):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def send_pending_callback_reminders() -> int:
    """Relance par email/push le personnel assigné pour chaque demande de
    rappel encore non traitée (`handled=False`) depuis plus d'1h — appelée
    toutes les 4h par la boucle de fond (voir server.py) et manuellement via
    POST /reminders/callbacks/run. Regroupe toutes les demandes en attente
    d'un même employé dans un seul email (pas un email par demande)."""
    now = datetime.now(timezone.utc)
    pending = await db.callback_requests.find({"handled": {"$ne": True}}, {"_id": 0}).to_list(2000)
    pending = [p for p in pending if (ref := _parse_iso(p.get("created_at"))) and (now - ref) >= _MIN_AGE_FOR_REMINDER]
    if not pending:
        return 0

    staff = await db.users.find(
        {"active": True, "role": {"$in": list(CALLBACK_NOTIFY_ROLES)}},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "assigned_categories": 1, "assigned_centers": 1, "assigned_training_assignments": 1},
    ).to_list(200)

    notified = 0
    for member in staff:
        assigned = member.get("assigned_categories") or []
        assigned_centers = member.get("assigned_centers") or []
        assignments = member.get("assigned_training_assignments") or []
        # Sans catégorie assignée, cette personne voit déjà toutes les demandes
        # dans son dashboard (voir GET /callback-requests) — elle reçoit donc
        # un rappel sur tout ce qui est en attente, pas seulement "le sien".
        mine = []
        for pending_item in pending:
            if assignments:
                matches = (
                    not pending_item.get("interest") or not pending_item.get("center")
                    or any(a.get("category") == pending_item.get("interest") and a.get("center") == pending_item.get("center") for a in assignments)
                )
            else:
                matches = (
                    (not assigned or not pending_item.get("interest") or pending_item["interest"] in assigned)
                    and (not assigned_centers or not pending_item.get("center") or pending_item["center"] in assigned_centers)
                )
            if matches:
                mine.append(pending_item)
        if not mine or not member.get("email"):
            continue

        rows = "".join(
            f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee;'>{p['prenom']} {p['nom']}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{p.get('telephone','')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{CATEGORY_LABELS.get(p.get('interest'), 'Non précisé')}</td>"
            f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{p.get('center') or 'Non précisé'}</td></tr>"
            for p in mine
        )
        subject = f"⏰ {len(mine)} demande(s) de rappel toujours en attente"
        body = (
            f"<p>Bonjour {member.get('name','')},</p>"
            f"<p>Les demandes de rappel suivantes n'ont toujours pas été traitées :</p>"
            f"<table style='border-collapse:collapse;width:100%;'>"
            f"<tr><th style='text-align:left;padding:6px 10px;'>Nom</th><th style='text-align:left;padding:6px 10px;'>Téléphone</th><th style='text-align:left;padding:6px 10px;'>Intérêt</th><th style='text-align:left;padding:6px 10px;'>Centre</th></tr>"
            f"{rows}</table>"
            f"<p style='margin-top:16px;'>Rendez-vous sur la page Inscriptions du dashboard pour les traiter.</p>"
        )
        await send_email(member["email"], subject, body)
        await send_push_to_users(
            [member["id"]], "Demandes de rappel en attente",
            f"{len(mine)} demande(s) non traitée(s)", "/admin/inscriptions",
        )
        notified += 1
    return notified


async def send_daily_pending_dossiers_digest(min_gap: Optional[timedelta] = None) -> int:
    """Envoie chaque matin (10h — voir _daily_dossiers_digest_loop dans
    server.py) à chaque employé assigné un récapitulatif des dossiers
    d'inscription encore au statut "nouveau" (= pas encore pris en charge),
    avec ceux arrivés depuis le dernier envoi mis en avant séparément. Dès
    qu'un employé fait avancer un dossier (bouton "Traitement en cours" dans
    Inscriptions.jsx, qui passe le statut à "en_verification", ou tout autre
    statut suivant), il sort automatiquement de ce récap — pas besoin d'un
    champ dédié pour le "mute".

    `min_gap` évite les envois en rafale si le process redémarre plusieurs
    fois de suite (déploiements, rechargement en dev) : si le dernier envoi
    date de moins de `min_gap`, on ne renvoie rien. Utilisé par l'envoi
    immédiat au démarrage et par la boucle planifiée ; le déclenchement
    manuel (POST /reminders/dossiers-digest/run) ne le passe pas, donc force
    toujours l'envoi pour permettre de tester à la demande."""
    settings = await db.settings.find_one({"id": "global"}, {"_id": 0, "dossiers_digest_last_sent_at": 1}) or {}
    last_sent = _parse_iso(settings.get("dossiers_digest_last_sent_at"))

    if min_gap and last_sent and (datetime.now(timezone.utc) - last_sent) < min_gap:
        return 0

    pending = await db.dossiers.find({"status": "nouveau"}, {"_id": 0}).to_list(2000)
    if not pending:
        await db.settings.update_one({"id": "global"}, {"$set": {"dossiers_digest_last_sent_at": now_iso()}}, upsert=True)
        return 0

    staff = await db.users.find(
        {"active": True, "role": {"$in": list(ROLES_DOSSIERS_MGMT)}},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "assigned_categories": 1, "assigned_training_assignments": 1},
    ).to_list(200)

    notified = 0
    for member in staff:
        assignments = member.get("assigned_training_assignments") or []
        categories = member.get("assigned_categories") or []

        mine = []
        for d in pending:
            if d.get("assigned_to") and d.get("assigned_to") != member["id"]:
                # Déjà pris en charge par quelqu'un d'autre : ne pas polluer
                # la boîte mail du reste de l'équipe avec ce dossier.
                continue
            if d.get("assigned_to") == member["id"]:
                mine.append(d)
                continue
            if assignments:
                matches = any(a.get("category") == d.get("category") for a in assignments)
            else:
                matches = not categories or d.get("category") in categories
            if matches:
                mine.append(d)

        if not mine or not member.get("email"):
            continue

        new_ids = {
            d["id"] for d in mine
            if last_sent is None or ((ref := _parse_iso(d.get("created_at"))) and ref > last_sent)
        }
        new_ones = [d for d in mine if d["id"] in new_ids]
        older_ones = [d for d in mine if d["id"] not in new_ids]

        def _rows(items, highlight=False):
            style = "background:#fff8e1;" if highlight else ""
            return "".join(
                f"<tr style='{style}'>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{d.get('student_name','')}</td>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{d.get('formation_title','')}</td>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{CATEGORY_LABELS.get(d.get('category'), d.get('category') or '')}</td>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{d.get('status','')}</td>"
                f"<td style='padding:6px 10px;border-bottom:1px solid #eee;'>{(d.get('created_at') or '')[:10]}</td></tr>"
                for d in items
            )

        header = (
            "<tr><th style='text-align:left;padding:6px 10px;'>Étudiant</th>"
            "<th style='text-align:left;padding:6px 10px;'>Formation</th>"
            "<th style='text-align:left;padding:6px 10px;'>Catégorie</th>"
            "<th style='text-align:left;padding:6px 10px;'>Statut</th>"
            "<th style='text-align:left;padding:6px 10px;'>Reçu le</th></tr>"
        )
        sections = ""
        if new_ones:
            sections += (
                f"<p style='margin:16px 0 6px;'><b>🆕 {len(new_ones)} nouvelle(s) inscription(s) depuis le dernier récap :</b></p>"
                f"<table style='border-collapse:collapse;width:100%;'>{header}{_rows(new_ones, highlight=True)}</table>"
            )
        if older_ones:
            sections += (
                f"<p style='margin:16px 0 6px;'><b>{len(older_ones)} dossier(s) toujours en attente :</b></p>"
                f"<table style='border-collapse:collapse;width:100%;'>{header}{_rows(older_ones)}</table>"
            )

        subject = f"📋 {len(mine)} dossier(s) en attente de traitement" + (f" — {len(new_ones)} nouveau(x)" if new_ones else "")
        body = (
            f"<p>Bonjour {member.get('name','')},</p>"
            f"<p>Voici le récapitulatif du matin des dossiers d'inscription qui ne sont pas encore finalisés.</p>"
            f"{sections}"
            f"<p style='margin-top:16px;'>Rendez-vous sur la page Inscriptions du dashboard pour les traiter.</p>"
        )
        await send_email(member["email"], subject, body)
        await send_push_to_users(
            [member["id"]], "Dossiers en attente",
            f"{len(mine)} dossier(s) non traité(s)" + (f", {len(new_ones)} nouveau(x)" if new_ones else ""),
            "/admin/inscriptions",
        )
        notified += 1

    await db.settings.update_one({"id": "global"}, {"$set": {"dossiers_digest_last_sent_at": now_iso()}}, upsert=True)
    return notified


async def notify_staff_exam_theorique_result(dossier: dict, result: str) -> None:
    """Notifie le personnel assigné qu'un apprenant a déclaré son résultat à
    l'examen théorique (section 1.2 du cahier des charges — bouton "Réussi /
    Échoué" côté apprenant). Priorité au responsable du dossier
    (`assigned_to`) s'il y en a un, sinon routage par catégorie comme pour
    les autres notifications staff."""
    decision_label = "réussi ✅" if result == "reussi" else "échoué ❌"
    subject = f"📝 Résultat examen théorique — {dossier.get('student_name', '')} : {decision_label}"
    body = (
        f"<p><b>{dossier.get('student_name', '')}</b> a déclaré avoir <b>{decision_label}</b> son examen théorique.</p>"
        f"<p>Formation : <b>{dossier.get('formation_title', '')}</b></p>"
        f"<p style='margin-top:16px;'>Le dossier a été mis à jour automatiquement. "
        f"Rendez-vous sur la page Dossiers du dashboard pour la suite.</p>"
    )
    recipients = []
    if dossier.get("assigned_to"):
        assignee = await db.users.find_one({"id": dossier["assigned_to"], "active": True}, {"_id": 0, "id": 1, "email": 1})
        if assignee:
            recipients.append(assignee)
    if not recipients:
        recipients = await _assigned_staff(dossier.get("category"), None, ROLES_DOSSIERS_MGMT)
    if not recipients:
        await send_email(CONTACT_EMAIL, subject, body)
        return
    for member in recipients:
        if member.get("email"):
            await send_email(member["email"], subject, body)
    await send_push_to_users(
        [m["id"] for m in recipients], "Résultat examen théorique",
        f"{dossier.get('student_name', '')} — {decision_label}", "/admin/dossiers",
    )


async def send_document_reminders(min_gap_hours: int = 72) -> int:
    """Relance les apprenants dont le dossier a des documents manquants, au
    plus une fois tous les `min_gap_hours` par dossier (72h par défaut) —
    invite explicitement à venir en agence avec les documents manquants pour
    compléter le dossier sur place (section 1.3). Le personnel assigné à la
    catégorie du dossier reçoit la même relance en copie, pour pouvoir
    lui-même recontacter l'apprenant si besoin. Appelée par la boucle de fond
    (voir server.py) et via POST /reminders/documents/run pour un test/cron
    externe."""
    now = datetime.now(timezone.utc)
    dossiers = await db.dossiers.find({"status": {"$ne": "termine"}}, {"_id": 0}).to_list(5000)
    notified = 0
    staff_cache: dict = {}

    for d in dossiers:
        requis = d.get("documents_requis") or []
        if not requis or not d.get("student_email"):
            continue
        docs = await db.documents.find(
            {"id": {"$in": d.get("documents", [])}, "is_deleted": False}, {"_id": 0}
        ).to_list(200)
        fournis = {doc["doc_type"] for doc in docs if doc.get("verification_status") != "rejected"}
        manquants = [r for r in requis if r not in fournis]
        if not manquants:
            continue

        last_reminded = _parse_iso(d.get("doc_reminder_last_sent_at"))
        if last_reminded and (now - last_reminded) < timedelta(hours=min_gap_hours):
            continue

        manquants_label = ", ".join(manquants)
        await send_email(
            d["student_email"],
            f"Documents manquants — {d.get('formation_title', '')}",
            (
                f"<p>Bonjour {d.get('student_name', '')},</p>"
                f"<p>Il manque encore les documents suivants pour compléter votre dossier "
                f"<b>{d.get('formation_title', '')}</b> :</p>"
                f"<p><b>{manquants_label}</b></p>"
                f"<p>Vous pouvez les téléverser depuis votre espace apprenant, ou venir "
                f"directement en agence avec ces documents pour compléter votre dossier sur place.</p>"
                f"<p>TDL Formation</p>"
            ),
        )
        await db.dossiers.update_one({"id": d["id"]}, {"$set": {"doc_reminder_last_sent_at": now_iso()}})
        notified += 1

        category = d.get("category")
        if category not in staff_cache:
            staff_cache[category] = await _assigned_staff(category, None, ROLES_DOSSIERS_MGMT)
        staff = staff_cache[category]
        for member in staff:
            if member.get("email"):
                await send_email(
                    member["email"],
                    f"📎 Relance documents envoyée — {d.get('student_name', '')}",
                    (
                        f"<p>Une relance automatique a été envoyée à <b>{d.get('student_name', '')}</b> "
                        f"pour les documents manquants (<b>{manquants_label}</b>) — formation "
                        f"<b>{d.get('formation_title', '')}</b>.</p>"
                        f"<p>Vous pouvez aussi le recontacter vous-même si besoin.</p>"
                    ),
                )
        if staff:
            await send_push_to_users(
                [m["id"] for m in staff], "Relance documents envoyée",
                f"{d.get('student_name', '')} ({manquants_label})", "/admin/dossiers",
            )

    return notified
