"""Règles pures des notifications email à l'équipe (sans accès base, voir
services/staff_notify.py).

Principe (demande du 2026-11-02) : un email immédiat uniquement pour ce qui
demande une action rapide — nouveau lead, demande de rappel, inscription venue
du site public. Tout le reste passe par le récap du matin, avec une
notification push pour rester informé sans encombrer les boîtes mail.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

_PARIS = ZoneInfo("Europe/Paris")

PAYMENT_LABELS = {
    "pending": "Non payé", "processing": "Paiement en cours", "paid": "Payé",
    "cpf_valide": "CPF validé", "refunded": "Remboursé",
}

# 4h : l'étudiant reçoit "Nous vous contactons sous 24h" — le rappel doit
# arriver à temps pour tenir cette promesse. Au-delà de 7 jours, le récap
# quotidien suffit : ça évite aussi une rafale au premier déploiement.
INSCRIPTION_REMINDER_MIN_AGE = timedelta(hours=4)
INSCRIPTION_REMINDER_MAX_AGE = timedelta(days=7)


def payment_label(status: str) -> str:
    return PAYMENT_LABELS.get(status, status or "Non renseigné")


def is_public_inscription(inscription: dict) -> bool:
    """Venue du site public : ni créée par un membre de l'équipe (sur place,
    centre d'appel, depuis un lead), ni importée."""
    source = inscription.get("source") or ""
    return not inscription.get("created_by") and source != "admin_walkin" and not source.startswith("excel_import")


def inscription_needs_reminder(inscription: dict, dossier: dict) -> bool:
    """Mêmes critères que "Non traité" sur la page Inscriptions."""
    return (
        is_public_inscription(inscription)
        and inscription.get("status") == "active"
        and inscription.get("contact_status") != "finalisee"
        and dossier.get("status") == "nouveau"
    )


def reminder_age_due(created_at: datetime, now: datetime) -> bool:
    return INSCRIPTION_REMINDER_MIN_AGE <= now - created_at <= INSCRIPTION_REMINDER_MAX_AGE


def is_business_hours(now: datetime) -> bool:
    """Lundi-vendredi, 9h-18h à Paris : les horaires affichés de l'équipe."""
    local = now.astimezone(_PARIS)
    return local.weekday() < 5 and 9 <= local.hour < 18
