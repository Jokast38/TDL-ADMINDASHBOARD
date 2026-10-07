from typing import Optional
from pydantic import BaseModel, EmailStr


class InscriptionIn(BaseModel):
    formation_id: str
    student_name: str
    student_email: EmailStr
    student_phone: Optional[str] = None
    notes: Optional[str] = ""
    # Attribution marketing — quelle landing page a généré cette inscription
    # (ex: "stage_recuperation_points") et son URL exacte au moment de l'envoi,
    # utilisées pour que l'événement Purchase envoyé au Meta Pixel/CAPI soit
    # rattaché à la bonne page plutôt qu'à /inscription par défaut.
    source: Optional[str] = None
    landing_url: Optional[str] = None
    session: Optional[str] = None
    center: Optional[str] = None
    # Session de stage (backend/models/stage.py) déjà connue à l'inscription
    # — ex: agent affectant directement un candidat à une session lors d'une
    # inscription sur place. Optionnel : la plupart des inscriptions sont
    # créées sans session assignée, puis affectées plus tard (voir
    # PUT /inscriptions/{iid}/stage).
    stage_id: Optional[str] = None
    # Choix explicite de l'étudiant sur le formulaire public, uniquement
    # affiché/requis pour une formation cpf_eligible : "cpf" (prise en
    # charge, pas de paiement en ligne, l'équipe recontacte pour finaliser
    # le dossier) ou "auto" (auto-financement — débloque le paiement Stripe
    # normalement réservé aux formations non-CPF, voir routers/payments.py).
    financing_mode: Optional[str] = None
    # Suivi Meta Pixel/CAPI côté serveur (voir callback.py pour le même
    # pattern) — `event_id` permet la déduplication avec l'événement "Lead"
    # envoyé côté navigateur (même id des deux côtés), fbc/fbp sont les
    # cookies Meta du visiteur pour améliorer le score de correspondance.
    event_id: Optional[str] = None
    fbc: Optional[str] = None
    fbp: Optional[str] = None
    # Tarif promo landing page (ex: 179€ au lieu des 200€ catalogue pour le
    # stage récupération de points, réservé au trafic publicitaire Meta — voir
    # StageRecuperationPointsLanding.jsx). Optionnel : la plupart des flux
    # d'inscription (formulaire public générique, agent sur place...) ne
    # l'envoient pas et se voient appliquer le prix catalogue de la formation.
    price: Optional[float] = None


class InscriptionUpdate(BaseModel):
    student_name: Optional[str] = None
    student_phone: Optional[str] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None
    # Tag de suivi commercial manuel (voir CONTACT_STATUS_LABEL côté
    # frontend) : "en_cours", "a_contacter", "sans_reponse", "finalisee".
    # Distinct de `status` (active/annulee) et du statut du dossier.
    contact_status: Optional[str] = None
    # Financement CMA (Chambre de Métiers et de l'Artisanat) / CPF (Compte
    # Personnel de Formation) — repris du suivi papier/Excel existant
    # (ex: "OUI", "NON", un montant, ou une note libre type "EVALBOX ?") :
    # champ texte libre plutôt qu'un statut strict, pour ne pas perdre la
    # nuance déjà utilisée par l'équipe sur le fichier de suivi.
    cma: Optional[str] = None
    cpf: Optional[str] = None
    # Nom du titulaire du compte CPF utilisé pour financer la formation —
    # renseigné uniquement quand `cpf` = "OUI". Si le titulaire est la même
    # personne que l'inscrit, l'équipe y met simplement le nom de l'inscrit ;
    # sinon le nom réel du titulaire (cas d'un proche finançant pour un
    # tiers), pour que les évidences EDOF correspondent au bon titulaire CPF.
    cpf_titulaire: Optional[str] = None
    # Numéro de dossier CMA (Chambre de Métiers et de l'Artisanat) — renseigné
    # quand `cma` = "OUI" ; repris de la colonne "N° DOSSIER" du fichier Excel
    # VTC_TAXI à l'import, ou saisi manuellement par l'équipe.
    cma_dossier_number: Optional[str] = None
    # Mode de règlement réel (carte, espèces, virement, chèque, CPF, CMA,
    # Klarna...) — distinct de `payment_status` (payé/en attente/remboursé)
    # qui ne dit pas COMMENT la personne a payé, saisi manuellement par
    # l'équipe comme cma/cpf.
    payment_method: Optional[str] = None


class StageAssignIn(BaseModel):
    # None = retire l'affectation (inscription pas encore rattachée à une
    # session, ou à réaffecter plus tard).
    stage_id: Optional[str] = None


class DossierUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
