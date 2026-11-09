"""Accès des formateurs à leurs sessions (émargement, demandes de signature,
feuille PDF) — demande du 2026-11-05 :

  - une session est fermée par défaut : le formateur la voit dans son espace,
    grisée, sans pouvoir l'ouvrir ;
  - elle ne s'ouvre que le jour même (un des jours de la session) :
      * par un admin ou un agent, depuis la page Sessions de formation,
      * sinon automatiquement à 8h30 (heure de Paris — 9h30 jusqu'au
        2026-11-09, avancé pour les stages de récupération de points qui
        commencent à 8h) ;
  - elle se ferme automatiquement à 16h45 (heure de Paris), et un agent peut
    la fermer avant.

L'état est calculé à la demande à partir de l'heure et de `stage.acces`
(ouvertures/fermetures manuelles, par jour) : pas de tâche planifiée, donc
rien à rater si le serveur Render était en veille à 8h30 ou à 16h45.

    stage["acces"] = {"2026-11-06": {"ouvert_at": iso, "ouvert_par": nom,
                                     "ferme_at": iso, "ferme_par": nom}}
"""
from datetime import date, datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
OUVERTURE_AUTO = time(8, 30)
FERMETURE_AUTO = time(16, 45)


def paris_now() -> datetime:
    return datetime.now(PARIS)


def stage_days(stage: dict) -> list:
    try:
        d1 = date.fromisoformat(stage["date_debut"][:10])
        d2 = date.fromisoformat(stage["date_fin"][:10])
    except (KeyError, TypeError, ValueError):
        return [str(stage.get("date_debut", ""))[:10]]
    return [(d1 + timedelta(days=i)).isoformat() for i in range((d2 - d1).days + 1)]


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=PARIS)


def access_status(stage: dict, now: Optional[datetime] = None) -> dict:
    """État d'accès du formateur à cette session, maintenant."""
    now = (now or paris_now()).astimezone(PARIS)
    today = now.date().isoformat()
    days = stage_days(stage)
    base = {"jour": today, "ouverture_auto": OUVERTURE_AUTO.strftime("%H:%M"), "fermeture_auto": FERMETURE_AUTO.strftime("%H:%M")}

    if stage.get("statut") == "annule":
        return {**base, "ouvert": False, "raison": "annulee", "message": "Session annulée"}
    if today not in days:
        futur = [d for d in days if d > today]
        if futur:
            return {**base, "ouvert": False, "raison": "pas_le_jour", "prochain_jour": futur[0],
                    "message": f"Accessible le jour de la session, à partir de {base['ouverture_auto']}"}
        return {**base, "ouvert": False, "raison": "terminee", "message": "Session terminée"}
    if now.time() >= FERMETURE_AUTO:
        return {**base, "ouvert": False, "raison": "fermee_auto", "message": f"Fermée automatiquement à {base['fermeture_auto']}"}

    entry = (stage.get("acces") or {}).get(today) or {}
    ouvert_at, ferme_at = _parse(entry.get("ouvert_at")), _parse(entry.get("ferme_at"))
    if ferme_at and (not ouvert_at or ferme_at >= ouvert_at):
        return {**base, "ouvert": False, "raison": "fermee_agent", "par": entry.get("ferme_par"),
                "message": "Fermée par l'équipe TDL"}
    if ouvert_at:
        return {**base, "ouvert": True, "raison": "ouverte_agent", "par": entry.get("ouvert_par"),
                "message": f"Ouverte jusqu'à {base['fermeture_auto']}"}
    if now.time() >= OUVERTURE_AUTO:
        return {**base, "ouvert": True, "raison": "ouverte_auto", "message": f"Ouverte jusqu'à {base['fermeture_auto']}"}
    return {**base, "ouvert": False, "raison": "en_attente",
            "message": f"Ouverture par l'équipe TDL, ou automatiquement à {base['ouverture_auto']}"}
