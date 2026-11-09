"""Modèles de messages WhatsApp (demande du 2026-11-03) — envoyés EN PLUS du
mail pour les messages importants à l'apprenant, jamais à sa place. Hors
réponse à un message de l'apprenant, WhatsApp n'accepte que des modèles
approuvés à l'avance par Meta : ce fichier est la source unique de leur
texte, utilisée à la fois pour les soumettre (scripts/whatsapp_templates.py)
et pour remplir leurs variables à l'envoi (services/whatsapp.py).

Règles Meta respectées ici : variables numérotées {{1}}, {{2}}... dans
l'ordre, le corps ne commence ni ne finit par une variable, chaque variable
a un exemple. L'accord de l'apprenant est donné en signant le contrat de
formation (article « Communications », voir seed_doc_templates.py) ; le pied
de message rappelle qu'il peut répondre STOP."""
from typing import Optional

LANGUAGE = "fr"
FOOTER = "Répondez STOP pour ne plus recevoir ces messages."

CONVOCATION = "tdl_convocation"
RAPPEL_VEILLE = "tdl_rappel_veille"
DOCUMENTS_MANQUANTS = "tdl_documents_manquants"
LIEN_PAIEMENT = "tdl_lien_paiement"
AVIS_GOOGLE = "tdl_avis_google"

TEMPLATES = {
    CONVOCATION: {
        "category": "UTILITY",
        "body": (
            "Bonjour {{1}},\n\n"
            "Votre convocation à la formation {{2}} est confirmée.\n\n"
            "Dates : du {{3}} au {{4}}\n"
            "Horaires : {{5}}\n"
            "Lieu : {{6}}\n\n"
            "Merci de venir avec une pièce d'identité valide. Le détail complet vous a été envoyé par email."
        ),
        "examples": ["Karim Benali", "VTC / TAXI", "lundi 16 novembre 2026", "vendredi 20 novembre 2026",
                     "de 9h à 17h", "59 avenue Joffre, Épinay-sur-Seine"],
    },
    RAPPEL_VEILLE: {
        "category": "UTILITY",
        "body": (
            "Bonjour {{1}},\n\n"
            "Rappel : votre formation {{2}} commence demain, {{3}} à {{4}}.\n"
            "Lieu : {{5}}\n\n"
            "Pensez à votre pièce d'identité. En cas d'empêchement, prévenez-nous au plus vite en répondant à ce message."
        ),
        "examples": ["Karim Benali", "Stage de récupération de points", "samedi 14 novembre 2026", "8h précises (arrivée dès 7h45)",
                     "59 avenue Joffre, Épinay-sur-Seine"],
    },
    DOCUMENTS_MANQUANTS: {
        "category": "UTILITY",
        "body": (
            "Bonjour {{1}},\n\n"
            "Il manque encore ces documents pour compléter votre dossier {{2}} : {{3}}.\n\n"
            "Vous pouvez les déposer depuis votre espace apprenant, ou venir directement en agence avec ces documents."
        ),
        "examples": ["Karim Benali", "VTC / TAXI", "pièce d'identité, justificatif de domicile"],
        "button": {"text": "Mon espace apprenant", "path": "/espace-etudiant"},
    },
    LIEN_PAIEMENT: {
        "category": "UTILITY",
        "body": (
            "Bonjour {{1}},\n\n"
            "Voici votre lien de paiement pour {{2}}, montant : {{3}} €.\n"
            "Payer en ligne : {{4}}\n\n"
            "Le paiement se fait par carte bancaire, en toute sécurité via Stripe."
        ),
        "examples": ["Karim Benali", "Formation VTC", "1200.00", "https://checkout.stripe.com/c/pay/cs_live_exemple"],
    },
    AVIS_GOOGLE: {
        "category": "UTILITY",
        "body": (
            "Bonjour {{1}},\n\n"
            "Nous espérons que votre formation {{2}} s'est bien passée !\n\n"
            "Votre avis compte beaucoup pour nous et pour les futurs apprenants. Auriez-vous deux minutes pour le partager sur Google ?"
        ),
        "examples": ["Karim Benali", "Stage de récupération de points"],
        # Bouton à lien variable : seule la fin de l'URL (l'identifiant de la
        # fiche Google) est passée à l'envoi.
        "button": {"text": "Laisser un avis Google", "url_prefix": "https://search.google.com/local/writereview?placeid="},
    },
}


def clean_param(value) -> str:
    """WhatsApp refuse une variable vide, ou contenant un retour à la ligne,
    une tabulation ou plus de 4 espaces d'affilée."""
    text = " ".join(str(value if value is not None else "").split())
    return text[:1000] or "-"


def template_payload(name: str, params: list, button_param: Optional[str] = None) -> dict:
    """Bloc `template` de l'appel d'envoi Meta pour le modèle `name`."""
    spec = TEMPLATES[name]
    expected = len(spec["examples"])
    if len(params) != expected:
        raise ValueError(f"Le modèle {name} attend {expected} variables, {len(params)} reçues")
    components = [{"type": "body", "parameters": [{"type": "text", "text": clean_param(p)} for p in params]}]
    if spec.get("button", {}).get("url_prefix"):
        if not button_param:
            raise ValueError(f"Le modèle {name} attend la fin de l'URL de son bouton")
        components.append({"type": "button", "sub_type": "url", "index": "0",
                           "parameters": [{"type": "text", "text": button_param}]})
    return {"name": name, "language": {"code": LANGUAGE}, "components": components}


def creation_payload(name: str, frontend_url: str, button_example: Optional[str] = None) -> dict:
    """Corps de la demande de création du modèle `name` auprès de Meta."""
    spec = TEMPLATES[name]
    components = [
        {"type": "BODY", "text": spec["body"], "example": {"body_text": [spec["examples"]]}},
        {"type": "FOOTER", "text": FOOTER},
    ]
    button = spec.get("button")
    if button:
        if button.get("url_prefix"):
            btn = {"type": "URL", "text": button["text"], "url": button["url_prefix"] + "{{1}}",
                   "example": [button["url_prefix"] + (button_example or "exemple")]}
        else:
            btn = {"type": "URL", "text": button["text"], "url": frontend_url.rstrip("/") + button["path"]}
        components.append({"type": "BUTTONS", "buttons": [btn]})
    return {"name": name, "language": LANGUAGE, "category": spec["category"], "components": components}


STOP_WORDS = {"stop", "arret", "arrêt", "arreter", "arrêter", "desabonner", "désabonner", "unsubscribe"}


def is_stop_request(text: str) -> bool:
    return " ".join((text or "").lower().split()).strip(" .!") in STOP_WORDS
