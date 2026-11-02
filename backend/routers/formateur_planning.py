from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core.placement_rules import planning_year
from core.security import require_role
from core.config import ROLES_TEAM_MGMT
from services.formateur_placement import planning_for, place_formateur, retirer_formateur, planning_overview

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
