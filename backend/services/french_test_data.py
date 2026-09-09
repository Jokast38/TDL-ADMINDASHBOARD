"""Contenu du test de connaissance de la langue française, thématisé par
catégorie de formation — reproduit le format du document papier historique
(voir Test-de-niveau-de-français-TDL.pdf, exemple SSIAP) : observation d'une
situation, QCM de compréhension, calcul, remise en ordre de phrases, lecture.
Le contenu détaillé (image, textes) pourra être affiné plus tard par
formation ; la structure ci-dessous est déjà exploitable pour toutes les
catégories existantes (voir CATEGORIES dans Modules.jsx)."""

_CALCULS_STANDARD = ["108 - 72 =", "98 + 2 + 7 =", "15 / 3 =", "7 x 2 ="]

FRENCH_TEST_CONTENT = {
    "SSIAP": {
        "theme_label": "Agent de sécurité incendie (SSIAP)",
        "consigne_situation": (
            "Un homme pousse un chariot chargé de cartons près d'un poste de sécurité. Le chariot bascule : "
            "une voiture miniature et des cartons tombent au sol. Un agent de sécurité, présent à proximité, "
            "observe la scène."
        ),
        "consigne_redaction": "En 5 ou 6 lignes, rendez compte en détail de la situation observée en utilisant autant que possible un vocabulaire approprié, et développez brièvement votre analyse de l'incident.",
        "qcm": [
            {"question": "Le nombre de personnes présentes sur l'image :", "options": ["0 personne", "3 personnes", "2 personnes"]},
            {"question": "Dans quel endroit se trouvent ces personnes ?", "options": ["Entrepôt", "Mer", "Route"]},
            {"question": "Combien de cartons vont tomber ?", "options": ["4 cartons", "3 cartons", "2 cartons"]},
        ],
        "calculs": _CALCULS_STANDARD,
        "phrases": ["L'AGENT — LES — MAGASINS — SURVEILLE", "SUR LES LIEUX — LES POMPIERS — ARRIVENT", "ACCUEILLE — LES GENS — L'AGENT DE SECURITE", "INCONSCIENTE — LA VICTIME — EST"],
        "texte_lecture": "L'agent de sécurité est chargé de la protection des biens et des personnes. Il accueille, surveille et contrôle l'accès des sites. Il est en relation permanente avec son équipe.",
    },
    "VTC_TAXI": {
        "theme_label": "Transport de personnes (VTC / Taxi)",
        "consigne_situation": (
            "Un chauffeur attend un client devant un immeuble. Une valise est posée sur le trottoir à côté d'un "
            "véhicule dont le coffre est ouvert. Le client semble pressé et regarde son téléphone."
        ),
        "consigne_redaction": "En 5 ou 6 lignes, rendez compte en détail de la situation observée en utilisant autant que possible un vocabulaire approprié, et développez brièvement votre analyse (accueil du client, prise en charge des bagages).",
        "qcm": [
            {"question": "Le nombre de personnes présentes sur l'image :", "options": ["0 personne", "2 personnes", "3 personnes"]},
            {"question": "Où se trouvent ces personnes ?", "options": ["Aéroport", "Devant un immeuble", "Gare"]},
            {"question": "Que fait le chauffeur ?", "options": ["Il attend le client", "Il répare le véhicule", "Il déjeune"]},
        ],
        "calculs": _CALCULS_STANDARD,
        "phrases": ["LE CHAUFFEUR — LE CLIENT — ACCUEILLE", "LA COURSE — COMMENCE — MAINTENANT", "LE VEHICULE — PROPRE — EST", "LA DESTINATION — INDIQUE — LE CLIENT"],
        "texte_lecture": "Le chauffeur VTC assure le transport de personnes avec un véhicule de qualité. Il accueille le client, l'aide avec ses bagages et veille à son confort et sa sécurité durant tout le trajet.",
    },
    "ECSR": {
        "theme_label": "Éducation à la sécurité routière (ECSR)",
        "consigne_situation": (
            "Un cycliste traverse un passage piéton alors qu'une voiture arrive à vive allure. Un piéton, sur le "
            "trottoir, observe la scène avec inquiétude."
        ),
        "consigne_redaction": "En 5 ou 6 lignes, rendez compte en détail de la situation observée en utilisant autant que possible un vocabulaire approprié, et développez brièvement votre analyse des risques.",
        "qcm": [
            {"question": "Le nombre de personnes présentes sur l'image :", "options": ["1 personne", "2 personnes", "3 personnes"]},
            {"question": "Où se trouvent ces personnes ?", "options": ["Autoroute", "Passage piéton", "Parking"]},
            {"question": "Quel est le principal danger ?", "options": ["La pluie", "La vitesse du véhicule", "Le bruit"]},
        ],
        "calculs": _CALCULS_STANDARD,
        "phrases": ["LE PIETON — LA ROUTE — TRAVERSE", "LE CONDUISEUR — RALENTIT — DANGER", "LE CODE — RESPECTER — IL FAUT", "LA CEINTURE — ATTACHER — IL FAUT"],
        "texte_lecture": "La sécurité routière concerne tous les usagers de la route : piétons, cyclistes et automobilistes. Chacun doit respecter le code de la route pour éviter les accidents.",
    },
    "PERMIS": {
        "theme_label": "Stage de récupération de points",
        "consigne_situation": (
            "Un automobiliste est arrêté par un agent après avoir grillé un feu rouge. Un autre véhicule a dû "
            "freiner brusquement pour éviter la collision."
        ),
        "consigne_redaction": "En 5 ou 6 lignes, rendez compte en détail de la situation observée en utilisant autant que possible un vocabulaire approprié, et développez brièvement votre analyse de l'infraction.",
        "qcm": [
            {"question": "Le nombre de véhicules présents sur l'image :", "options": ["1 véhicule", "2 véhicules", "3 véhicules"]},
            {"question": "Quelle infraction est commise ?", "options": ["Stationnement gênant", "Franchissement d'un feu rouge", "Excès de vitesse"]},
            {"question": "Qui intervient sur la scène ?", "options": ["Un pompier", "Un agent", "Un médecin"]},
        ],
        "calculs": _CALCULS_STANDARD,
        "phrases": ["LE FEU — ROUGE — EST", "L'AGENT — LE CONDUCTEUR — ARRETE", "LES POINTS — RETIRES — SONT", "LA PRUDENCE — S'IMPOSE — TOUJOURS"],
        "texte_lecture": "Le respect du code de la route permet de préserver la sécurité de tous. Un comportement responsable au volant évite les accidents et les pertes de points sur le permis.",
    },
    "CACES": {
        "theme_label": "Conduite d'engins (CACES)",
        "consigne_situation": (
            "Un cariste manœuvre un chariot élévateur chargé de palettes dans un entrepôt. Un collègue, à pied, "
            "traverse la zone de circulation sans regarder."
        ),
        "consigne_redaction": "En 5 ou 6 lignes, rendez compte en détail de la situation observée en utilisant autant que possible un vocabulaire approprié, et développez brièvement votre analyse des risques.",
        "qcm": [
            {"question": "Le nombre de personnes présentes sur l'image :", "options": ["1 personne", "2 personnes", "3 personnes"]},
            {"question": "Où se trouvent ces personnes ?", "options": ["Entrepôt", "Bureau", "Parking"]},
            {"question": "Quel est le principal danger ?", "options": ["Le bruit", "Le piéton dans la zone de circulation", "La météo"]},
        ],
        "calculs": _CALCULS_STANDARD,
        "phrases": ["LE CARISTE — LA CHARGE — SOULEVE", "LA ZONE — DEGAGEE — DOIT ETRE", "LES PALETTES — RANGEES — SONT", "LA VITESSE — REDUITE — EST"],
        "texte_lecture": "La conduite d'un engin de manutention nécessite vigilance et respect des consignes de sécurité, en particulier dans les zones où circulent des piétons.",
    },
    "AUTO_ECOLE": {
        "theme_label": "Auto-école",
        "consigne_situation": (
            "Un élève conducteur, accompagné de son moniteur, s'engage dans un rond-point sans céder le passage à "
            "un véhicule déjà engagé."
        ),
        "consigne_redaction": "En 5 ou 6 lignes, rendez compte en détail de la situation observée en utilisant autant que possible un vocabulaire approprié, et développez brièvement votre analyse de l'erreur commise.",
        "qcm": [
            {"question": "Le nombre de véhicules présents sur l'image :", "options": ["1 véhicule", "2 véhicules", "3 véhicules"]},
            {"question": "Où se déroule la scène ?", "options": ["Autoroute", "Rond-point", "Parking"]},
            {"question": "Quelle règle n'est pas respectée ?", "options": ["La priorité à droite", "La priorité aux véhicules déjà engagés", "Le stationnement"]},
        ],
        "calculs": _CALCULS_STANDARD,
        "phrases": ["LE MONITEUR — L'ELEVE — ACCOMPAGNE", "LA PRIORITE — RESPECTER — IL FAUT", "LE ROND POINT — ENGAGE — LE VEHICULE", "LES CLIGNOTANTS — UTILISER — IL FAUT"],
        "texte_lecture": "L'apprentissage de la conduite passe par la maîtrise du code de la route et des règles de priorité, en particulier dans les intersections et les ronds-points.",
    },
    "VENTE": {
        "theme_label": "TP Conseiller de Vente",
        "consigne_situation": (
            "Un conseiller de vente accueille un client en magasin. Le client hésite devant un rayon et pose une "
            "question sur un produit."
        ),
        "consigne_redaction": "En 5 ou 6 lignes, rendez compte en détail de la situation observée en utilisant autant que possible un vocabulaire approprié, et développez brièvement votre analyse de la relation client.",
        "qcm": [
            {"question": "Le nombre de personnes présentes sur l'image :", "options": ["1 personne", "2 personnes", "3 personnes"]},
            {"question": "Où se trouvent ces personnes ?", "options": ["Magasin", "Entrepôt", "Bureau"]},
            {"question": "Que fait le conseiller ?", "options": ["Il range le rayon", "Il conseille le client", "Il encaisse"]},
        ],
        "calculs": _CALCULS_STANDARD,
        "phrases": ["LE CONSEILLER — LE CLIENT — ACCUEILLE", "LE PRODUIT — PRESENTE — IL", "LA VENTE — CONCLUE — EST", "LE CLIENT — SATISFAIT — REPART"],
        "texte_lecture": "Le conseiller de vente accueille, écoute et conseille le client pour répondre au mieux à ses besoins, jusqu'à la conclusion de la vente.",
    },
}

DEFAULT_CATEGORY = "SSIAP"


def get_french_test_content(category: str) -> dict:
    return FRENCH_TEST_CONTENT.get(category, FRENCH_TEST_CONTENT[DEFAULT_CATEGORY])


def get_category_or_default(category: str) -> str:
    return category if category in FRENCH_TEST_CONTENT else DEFAULT_CATEGORY
