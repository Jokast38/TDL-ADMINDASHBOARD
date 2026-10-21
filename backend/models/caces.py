from typing import Optional
from pydantic import BaseModel

# Catégories CACES R.489 (chariots de manutention à conducteur porté) — voir
# annexe 1 de la recommandation R.489. TDL Formation ne propose, pour
# l'instant, que les catégories 1B / 3 / 5 (voir modèle de carte fourni) ;
# les autres sont gardées dans la liste pour ne pas bloquer un futur ajout
# de catégorie sans migration.
CACES_CATEGORIES = ("1A", "1B", "2A", "2B", "3", "4", "5", "6", "7")

# Durée en minutes de l'épreuve pratique par catégorie proposée — affichée à
# l'agent lors de la planification, purement informative (ne bloque rien).
CACES_PRATIQUE_DUREE_MIN = {"1B": 45, "3": 60, "5": 45}


class CacesExamAttemptIn(BaseModel):
    dossier_id: Optional[str] = None
    student_id: str
    student_name: str
    student_email: Optional[str] = None
    category: str
    # Centre d'origine si le candidat vient avec un CACES théorique déjà
    # validé ailleurs — rare mais prévu par la recommandation (A1/3, dispense
    # R.389) ; laissé à None dans le cas normal (théorie passée chez nous).
    notes: Optional[str] = None


class CacesTheorieResultIn(BaseModel):
    passed: bool
    date: Optional[str] = None  # YYYY-MM-DD, défaut: aujourd'hui


class CacesPratiqueResultIn(BaseModel):
    passed: bool
    date: Optional[str] = None  # YYYY-MM-DD, défaut: aujourd'hui
    testeur_name: str


class CacesExternalCertificateIn(BaseModel):
    """Enregistrement (pour audit) d'un CACES déjà délivré par un AUTRE
    OTC — le candidat vient passer une catégorie supplémentaire chez nous
    mais possède déjà une carte ailleurs. On ne réémet jamais le numéro
    d'origine : on le journalise, avec la même échéance que celle fixée par
    le premier centre (voir 3|3|1 de la recommandation : la date d'échéance
    d'une extension est toujours celle du CACES initial)."""
    student_id: str
    student_name: str
    category: str
    numero_externe: str
    otc_name: str
    date_obtention: str  # YYYY-MM-DD
    date_echeance: str  # YYYY-MM-DD — reprise telle quelle, jamais recalculée


class CacesCertificateUpdateIn(BaseModel):
    student_name: Optional[str] = None
    date_naissance: Optional[str] = None
    signataire_name: Optional[str] = None
    signataire_qualite: Optional[str] = None
