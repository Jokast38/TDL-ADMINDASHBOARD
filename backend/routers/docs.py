from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

from core.security import require_role

router = APIRouter(prefix="/docs", tags=["docs"])

_DOC_PATH = Path(__file__).resolve().parent.parent / "docs" / "technical_documentation.html"


@router.get("/technical-documentation", response_class=HTMLResponse)
async def get_technical_documentation(user: dict = Depends(require_role("admin"))):
    """Dossier de passation technique & métier — servi tel quel (page HTML
    autonome avec ses propres styles/polices), réservé aux admins. Le frontend
    la récupère via l'API authentifiée puis l'affiche dans un iframe, plutôt
    que de servir le fichier en statique public (qui n'aurait aucun contrôle
    d'accès par rôle)."""
    if not _DOC_PATH.exists():
        raise HTTPException(status_code=404, detail="Documentation non disponible")
    return _DOC_PATH.read_text(encoding="utf-8")
