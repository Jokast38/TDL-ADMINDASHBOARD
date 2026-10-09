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
    # Rythme de la session — "JOUR" ou "SOIR" (ex: formations VTC/Taxi avec
    # deux créneaux distincts sur les mêmes dates). None = pas de rythme
    # précis pour cette formation (ex: récupération de points, une seule
    # session par jour).
    creneau: Optional[str] = None
    # Horaires de la session elle-même (affichés dans la convocation et sur
    # la page Sessions) — distincts des heure_debut/heure_fin par module
    # (models/module.py), qui restent le détail jour par jour du programme.
    # Défaut au rythme JOUR (9h-17h) ; le rythme SOIR est 18h00-21h30.
    heure_debut: Optional[str] = "09:00"
    heure_fin: Optional[str] = "17:00"


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
    creneau: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None


class EmargementIn(BaseModel):
    stage_id: str
    inscription_id: str
    student_id: str
    student_name: str
    signature_data_url: str
    present: bool = True
    session_date: str
    # "matin" | "apres_midi" | "journee" — permet un émargement par demi-journée
    # (utile notamment pour les formations Carte VTC, voir cahier des charges).
    periode: Optional[str] = "journee"


class EmargementRequestIn(BaseModel):
    session_date: str
    periode: Optional[str] = "journee"


class EmargementSelfSignIn(BaseModel):
    request_id: str
    signature_data_url: str
