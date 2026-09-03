from typing import List, Optional
from pydantic import BaseModel


class StageIn(BaseModel):
    formation_id: str
    date_debut: str
    date_fin: str
    lieu_adresse: str
    lieu_ville: str
    capacite_max: int = 20
    # `animateur_id` reste accepté pour compatibilité (1 seul formateur,
    # ancien flux) mais `animateur_ids` (0..n formateurs) est désormais la
    # source de vérité — voir services/pdf.py generate_stage_recup_points_attestation
    # pour la génération multi-signature quand il y en a plusieurs.
    animateur_id: Optional[str] = None
    animateur_ids: Optional[List[str]] = None
    notes: Optional[str] = ""


class StageUpdate(BaseModel):
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    lieu_adresse: Optional[str] = None
    lieu_ville: Optional[str] = None
    capacite_max: Optional[int] = None
    animateur_id: Optional[str] = None
    animateur_ids: Optional[List[str]] = None
    statut: Optional[str] = None
    notes: Optional[str] = None


class EmargementIn(BaseModel):
    stage_id: str
    inscription_id: str
    student_id: str
    student_name: str
    signature_data_url: str
    present: bool = True
    session_date: str
