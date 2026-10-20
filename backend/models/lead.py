from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class LeadIn(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    interest: Optional[str] = ""
    notes: Optional[str] = ""
    tags: List[str] = []


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    interest: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    contacted: Optional[bool] = None
    status: Optional[str] = None
    # Qualification fine (à contacter / intéressé / pas de réponse / injoignable /
    # à relancer / plus intéressé / inscrit) — distincte de `status` qui pilote
    # la logique d'appel (voir routers/call_center.py) ; sert à l'affichage et au
    # filtrage dans les tableaux Meta/Cosmosia (mêmes libellés, voir
    # routers.meta_lead_import.QUALIFICATION_LABELS).
    qualification: Optional[str] = None
    # Colonne du kanban du Centre d'appel (voir frontend/src/pages/CentreAppel.jsx
    # et core.config.PIPELINE_STATUS_LABELS) — distincte de `status`/`qualification`
    # ci-dessus : c'est le pipeline d'appel propre aux agents téléphoniques
    # (formulaire_rempli, lead_entrant_sans_rdv, a_recontacter, premiere_relance,
    # deuxieme_relance, troisieme_relance, pas_de_reponse, lead_tiede, poubelle).
    pipeline_status: Optional[str] = None
    # Agent téléphonique en charge de ce prospect (id utilisateur) — un
    # agent_telephonique ne voit que les leads qui lui sont assignés (voir
    # scoping dans GET /leads), les autres rôles voient tout.
    assigned_to: Optional[str] = None

    # ─── Unification des prospects (Phase 1, 2026-10-20) ───────────────────
    # Nouveau vocabulaire de statut unique, qui remplace à terme status/
    # qualification/pipeline_status (coexistent pendant la transition — voir
    # services/lead_migration.py). Valeurs : a_contacter, a_relancer,
    # rendez_vous, inscrit, paye, injoignable, non_interesse.
    statut: Optional[str] = None
    # froid, tiede, chaud — indépendant du statut (ex: a_relancer peut être
    # froid ou chaud selon l'historique de contact).
    chaleur: Optional[str] = None
    # Raison de clôture quand statut=non_interesse : non_qualifie,
    # plus_interesse, poubelle, refus, injoignable.
    motif_cloture: Optional[str] = None
    # Date (ISO, YYYY-MM-DD) à laquelle relancer ce prospect — remplace les
    # statuts "lead_tiede"/"a_relancer_1_an" par une vraie date planifiable.
    relancer_le: Optional[str] = None
    # Prix négocié au cas par cas, prioritaire sur la grille formation×ville
    # et sur le prix catalogue (voir services/lead_migration.compute_prix_effectif).
    prix_personnalise: Optional[float] = None
    # Obligatoire côté UI quand prix_personnalise est renseigné — pas de
    # contrainte Pydantic ici (le champ reste optionnel pour un PUT partiel
    # qui ne touche pas au prix), la validation se fait côté frontend/endpoint.
    motif_prix: Optional[str] = None
    # Dernier prix effectif calculé (cache, recalculé à la mise à jour du
    # prix personnalisé/de la grille — voir compute_prix_effectif).
    prix_effectif: Optional[float] = None
    # Somme des paiements Stripe réussis liés à ce prospect (custom_payments +
    # inscriptions), recalculée par le webhook Stripe à chaque paiement reçu —
    # voir services/lead_payment_sync.sync_lead_payment.
    montant_encaisse: Optional[float] = None
    # Canaux d'origine cumulés (un prospect peut arriver par plusieurs canaux
    # au fil du temps) : meta, cosmosia, site_web, landing_rappel,
    # import_excel, manuel.
    sources: Optional[List[str]] = None
    compte_meta: Optional[str] = None
    campagne: Optional[str] = None
    # Identifiants d'origine dans les anciennes collections fusionnées
    # (meta_lead_imports, callback_requests) — permet de revenir en arrière
    # et de retrouver la fiche d'origine en cas de doute.
    legacy_ids: Optional[Dict[str, str]] = None
    # Fiche de test (recette/développement) détectée à la migration ou
    # manuellement — exclue des statistiques et du CA, jamais supprimée.
    is_test: Optional[bool] = None


class DocumentRequestIn(BaseModel):
    # Libellés libres des pièces demandées (ex: "Pièce d'identité", "Permis de
    # conduire", "Justificatif de domicile") plutôt qu'un enum strict — un
    # agent peut avoir besoin de demander une pièce qui ne correspond à aucun
    # DOC_TYPE_LABELS existant (voir routers/documents.py).
    documents: List[str]
    message: Optional[str] = None


class LeadImportJsonIn(BaseModel):
    leads: List[Dict[str, Any]]


class LeadRelanceIn(BaseModel):
    lead_ids: List[str]
    subject: str
    body: str
    mark_contacted: bool = True
    add_tag: Optional[str] = None


class LeadRelanceSingleIn(BaseModel):
    lead_id: str
    subject: str
    body: str
    mark_contacted: bool = True
    add_tag: Optional[str] = None


class LeadAutomationIn(BaseModel):
    name: str
    active: bool = True
    # "interest": cible les leads dont l'intérêt correspond à interest_in (mêmes valeurs
    # brutes "|"-jointes que LeadBroadcastIn.interest_in). "selection": cible un instantané
    # figé de lead_ids (la sélection faite par l'utilisateur au moment de la création).
    target_type: str
    interest_in: Optional[str] = None
    lead_ids: Optional[List[str]] = None
    frequency_days: int
    subject: str
    body: str
    mark_contacted: bool = True
    add_tag: Optional[str] = "relance_auto"


class LeadAutomationUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    target_type: Optional[str] = None
    interest_in: Optional[str] = None
    lead_ids: Optional[List[str]] = None
    frequency_days: Optional[int] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    mark_contacted: Optional[bool] = None
    add_tag: Optional[str] = None


class LeadBroadcastIn(BaseModel):
    # Valeurs brutes d'intérêt (jointes par "|"), calculées côté frontend à partir
    # du regroupement canonique (voir canonicalizeInterest) — même format que le
    # paramètre interest_in de GET /leads, pour filtrer sur toute la base et pas
    # seulement une page chargée. None/vide = tous les leads.
    interest_in: Optional[str] = None
    subject: str
    body: str
    mark_contacted: bool = True
    add_tag: Optional[str] = None
