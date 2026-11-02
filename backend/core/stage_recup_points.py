"""Cas de stage de récupération de points — demande du 2026-11-02 : avant
cette date, l'attestation individuelle de CHAQUE candidat affichait toujours
"Cas 1 : Stage volontaire", même pour quelqu'un faisant en réalité un stage
obligatoire (lettre 48N, permis probatoire) — `cas_stage_label` existait déjà
comme paramètre de services.pdf.generate_stage_recup_points_attestation mais
n'était jamais renseigné par l'appelant (routers/stage_attestations.py).

Libellés courts (pour l'attestation PDF, même format que l'existant "Cas 1 : ...
(art. ...)") et descriptions longues (pour le formulaire public, texte fourni
tel quel par l'équipe — jamais reformulé, document officiel) :
- Cas 2 (obligatoire, permis probatoire) : référence d'article à confirmer
  par l'équipe avant mise en production si elle doit figurer sur
  l'attestation — en son absence, seul le libellé court sans citation
  d'article est utilisé, jamais une référence inventée."""

CAS_STAGE_CHOICES = ("volontaire", "obligatoire_probatoire")

# Libellé court imprimé sur l'attestation individuelle (PDF officiel) — garder
# la citation d'article UNIQUEMENT si elle a été explicitement confirmée par
# l'équipe (voir note ci-dessus), jamais inventée.
CAS_STAGE_LABELS = {
    "volontaire": "Cas n°1 : Stage volontaire (art. L.223-6 alinéa 4 et R.223-8 du code de la route).",
    "obligatoire_probatoire": "Cas n°2 : Stage obligatoire en période probatoire, suite à la réception de la lettre 48N du ministère de l'Intérieur.",
}

# Texte explicatif complet, fourni par l'équipe (demande du 2026-11-02),
# affiché tel quel sur le formulaire public pour aider le candidat à
# identifier son propre cas avant de s'inscrire.
CAS_STAGE_DESCRIPTIONS = {
    "volontaire": (
        "Vous décidez de vous inscrire de votre propre initiative parce que votre solde de points est bas. "
        "Il permet de récupérer jusqu'à 4 points (dans la limite du plafond de votre permis), à condition de ne pas "
        "avoir suivi un autre stage similaire depuis moins d'un an de date à date."
    ),
    "obligatoire_probatoire": (
        "Il s'adresse aux jeunes conducteurs. Si vous commettez une infraction entraînant la perte d'au moins 3 points "
        "durant votre période probatoire, vous recevez la lettre 48N du ministère de l'Intérieur. Vous avez alors "
        "l'obligation de vous inscrire au stage dans un délai de 4 mois. Ce stage vous permet également de récupérer "
        "jusqu'à 4 points et d'obtenir le remboursement de l'amende forfaitaire."
    ),
}

CAS_STAGE_SHORT_NAMES = {
    "volontaire": "Stage volontaire (Cas n°1)",
    "obligatoire_probatoire": "Stage obligatoire en période probatoire (Cas n°2)",
}


def cas_stage_label(cas_stage) -> str:
    """Libellé à imprimer sur l'attestation — retombe sur le Cas 1 (volontaire)
    si rien n'est renseigné, pour ne jamais faire échouer la génération d'un
    dossier créé avant la mise en place de ce champ (comportement identique
    à l'ancien défaut implicite de la fonction)."""
    return CAS_STAGE_LABELS.get(cas_stage, CAS_STAGE_LABELS["volontaire"])
