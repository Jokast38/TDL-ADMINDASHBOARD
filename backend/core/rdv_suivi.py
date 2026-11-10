"""Suivi des rendez-vous du CRM (cahier des charges « Rendez-vous dans le
CRM », demande du 2026-11-10) — règles pures, sans accès base.

- Créneaux proposés à la réservation : 30 min, de 9h à 18h, du lundi au
  samedi (heure de Paris), moins ceux où la personne assignée a déjà un RDV
  planifié.
- Statut affiché : « Retour à renseigner » est dérivé (jamais stocké) d'un RDV
  encore « planifié » dont le créneau est terminé.
- Notification « Rendez-vous sans retour » : le lendemain à 9h, une seule
  fois, pour un RDV terminé la veille (ou dans les 3 derniers jours, pour
  rattraper un serveur arrêté) sans résultat saisi.
"""
from datetime import date, datetime, time, timedelta
from typing import Iterable, List, Optional
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
SLOT_MINUTES = 30
DEBUT_JOURNEE = time(9, 0)
FIN_JOURNEE = time(18, 0)
JOURS_OUVRES = {0, 1, 2, 3, 4, 5}  # lundi -> samedi
HEURE_NOTIFICATION = time(9, 0)
RATTRAPAGE_JOURS = 3

STATUTS = {
    "planifie": "Planifié",
    "retour_a_renseigner": "Retour à renseigner",
    "effectue": "Effectué",
    "absent": "Lead absent",
    "annule": "Annulé",
    # Statuts historiques de l'agenda d'appel (pool Cosmosia).
    "disponible": "Disponible",
    "traite": "Traité",
    "fait": "Effectué",
}
RESULTATS = ("effectue", "absent")


def parse(value) -> Optional[datetime]:
    """`scheduled_at` en heure de Paris (UTC « …Z » envoyé par le
    dashboard ; une heure sans fuseau est lue comme heure de Paris)."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=PARIS)
    return dt.astimezone(PARIS)


def fin(appt: dict) -> Optional[datetime]:
    debut = parse(appt.get("scheduled_at"))
    return debut + timedelta(minutes=SLOT_MINUTES) if debut else None


def statut_suivi(appt: dict, now: datetime) -> str:
    status = appt.get("status") or "planifie"
    if status == "planifie":
        end = fin(appt)
        if end and end <= now:
            return "retour_a_renseigner"
    return status


def creneaux(jour: date, rdv_existants: Iterable[dict], now: datetime) -> List[dict]:
    """Créneaux d'une journée pour une personne : `rdv_existants` = ses RDV
    planifiés. Un créneau est pris s'il chevauche un RDV existant, passé
    s'il commence avant maintenant."""
    if jour.weekday() not in JOURS_OUVRES:
        return []
    occupes = []
    for a in rdv_existants:
        d = parse(a.get("scheduled_at"))
        if d:
            occupes.append((d, d + timedelta(minutes=SLOT_MINUTES)))
    out = []
    t = datetime.combine(jour, DEBUT_JOURNEE, tzinfo=PARIS)
    limite = datetime.combine(jour, FIN_JOURNEE, tzinfo=PARIS)
    while t + timedelta(minutes=SLOT_MINUTES) <= limite:
        t_fin = t + timedelta(minutes=SLOT_MINUTES)
        pris = any(d < t_fin and t < f for d, f in occupes)
        out.append({"heure": t.strftime("%H:%M"), "scheduled_at": t.isoformat(),
                    "disponible": not pris and t > now, "pris": pris, "passe": t <= now})
        t = t_fin
    return out


def en_conflit(scheduled_at: str, rdv_existants: Iterable[dict], exclude_id: Optional[str] = None) -> bool:
    d = parse(scheduled_at)
    if not d:
        return False
    d_fin = d + timedelta(minutes=SLOT_MINUTES)
    for a in rdv_existants:
        if exclude_id and a.get("id") == exclude_id:
            continue
        o = parse(a.get("scheduled_at"))
        if o and o < d_fin and d < o + timedelta(minutes=SLOT_MINUTES):
            return True
    return False


def a_notifier(appt: dict, now: datetime) -> bool:
    """RDV sans retour à signaler maintenant : notification jamais envoyée,
    heure de 9h passée, créneau terminé un jour précédent (au plus
    RATTRAPAGE_JOURS jours avant)."""
    if appt.get("sans_retour_notified_at") or statut_suivi(appt, now) != "retour_a_renseigner":
        return False
    if now.timetz().replace(tzinfo=None) < HEURE_NOTIFICATION:
        return False
    end = fin(appt)
    jour_fin = end.date() if end else None
    return bool(jour_fin) and now.date() - timedelta(days=RATTRAPAGE_JOURS) <= jour_fin < now.date()
