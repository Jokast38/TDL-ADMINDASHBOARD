from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core.placement_rules import planning_year, reminder_window_open
from core.security import require_role
from core.config import ROLES_TEAM_MGMT
from services.formateur_placement import agenda, planning_for, place_formateur, retirer_formateur, planning_overview
from services.activity import log_action

router = APIRouter(tags=["formateur-planning"])


def _resolve_year(year: Optional[int]) -> int:
    today = datetime.now(timezone.utc).date()
    default = planning_year(today)
    if year is None:
        return default
    if year not in (today.year, default):
        raise HTTPException(status_code=400, detail="Année de planning invalide")
    return year


@router.get("/me/planning")
async def my_planning(year: Optional[int] = None, user: dict = Depends(require_role("animateur"))):
    return await planning_for(user, _resolve_year(year))


@router.post("/me/planning/{stage_id}")
async def choose_date(stage_id: str, user: dict = Depends(require_role("animateur"))):
    return await place_formateur(user, stage_id)


@router.delete("/me/planning/{stage_id}")
async def remove_date(stage_id: str, user: dict = Depends(require_role("animateur"))):
    return await retirer_formateur(user, stage_id)


@router.get("/formateurs/planning-overview")
async def formateurs_planning_overview(
    year: Optional[int] = None,
    user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "agent_admin", "responsable_admission")),
):
    resolved = _resolve_year(year)
    return {"year": resolved, "jours": await planning_overview(resolved)}


@router.post("/formateurs/planning-reminder")
async def formateurs_planning_reminder(
    user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "agent_admin", "responsable_admission")),
):
    """Relance immédiate (page Formateurs) des formateurs sans aucune date sur
    l'année suivante — même message que le rappel hebdomadaire automatique,
    seulement entre le 1er août et le 30 novembre."""
    from services.staff_notify import send_formateur_planning_reminders
    today = datetime.now(timezone.utc).date()
    if not reminder_window_open(today):
        raise HTTPException(status_code=400, detail="Les rappels de planning ne partent qu'entre le 1er août et le 30 novembre")
    notified = await send_formateur_planning_reminders(force=True)
    await log_action(user, "relance_planning_formateurs", "user", None, {"year": planning_year(today), "notified": notified})
    return {"notified": notified, "year": planning_year(today)}


@router.get("/formateurs/agenda")
async def formateurs_agenda(
    start: date,
    end: date,
    user: dict = Depends(require_role(*ROLES_TEAM_MGMT, "agent_admin", "responsable_admission")),
):
    if end < start or (end - start).days > 62:
        raise HTTPException(status_code=400, detail="Période invalide (62 jours au plus)")
    return await agenda(start.isoformat(), end.isoformat())
