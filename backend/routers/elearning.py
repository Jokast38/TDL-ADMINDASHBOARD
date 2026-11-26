from fastapi import APIRouter, Depends, HTTPException

from core.security import require_role
from models.elearning import ElearningRegisterIn, ElearningUpdateIn
from services import tdl_brain

# Page E-learning du dashboard (26/11/2026) : gère les comptes e-learning VTC
# (3 niveaux - premium, standard, uber - voir TDL Brain lib/elearningTier.ts) en
# passant par l'API publique TDL Brain (app.tdl-formation.fr/api/v1/apprenants),
# authentifiée par TDL_BRAIN_API_KEY (voir services/tdl_brain.py).
router = APIRouter(prefix="/elearning", tags=["elearning"])

_ROLES = ("admin", "employe", "responsable_admission", "agent_admin")


@router.get("/apprenants")
async def list_apprenants(
    email: str = None,
    pending: bool = None,
    tier: str = None,
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(require_role(*_ROLES)),
):
    try:
        return await tdl_brain.list_apprenants(email=email, pending=pending, tier=tier, limit=limit, offset=offset)
    except tdl_brain.TdlBrainNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except tdl_brain.TdlBrainError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/apprenants/{apprenant_id}")
async def get_apprenant(apprenant_id: str, user: dict = Depends(require_role(*_ROLES))):
    try:
        return await tdl_brain.get_apprenant(apprenant_id)
    except tdl_brain.TdlBrainNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except tdl_brain.TdlBrainError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/apprenants")
async def register_apprenant(payload: ElearningRegisterIn, user: dict = Depends(require_role(*_ROLES))):
    if payload.elearning_tier not in ("premium", "standard"):
        raise HTTPException(status_code=400, detail="elearning_tier doit être 'premium' ou 'standard'")
    try:
        return await tdl_brain.create_or_match_apprenant(
            email=payload.email,
            first_name=payload.first_name,
            last_name=payload.last_name,
            partner_code=payload.partner_code,
            elearning_tier=payload.elearning_tier,
        )
    except tdl_brain.TdlBrainNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except tdl_brain.TdlBrainError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.patch("/apprenants/{apprenant_id}")
async def update_apprenant(apprenant_id: str, payload: ElearningUpdateIn, user: dict = Depends(require_role(*_ROLES))):
    if payload.elearning_tier and payload.elearning_tier not in ("premium", "standard", "uber"):
        raise HTTPException(status_code=400, detail="elearning_tier invalide")
    try:
        return await tdl_brain.update_apprenant(
            apprenant_id,
            elearning_tier=payload.elearning_tier,
            active=payload.active,
            reason=payload.reason,
        )
    except tdl_brain.TdlBrainNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    except tdl_brain.TdlBrainError as e:
        raise HTTPException(status_code=502, detail=str(e))
