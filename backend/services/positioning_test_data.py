# Banque de questions du Test de positionnement, généralisée à toutes les
# catégories de formation (cahier des charges : « modèle commun, adaptable à
# chaque formation — VTC, Taxi, ECSR, SSIAP, TP Conseiller de Vente, autres
# formations TDL — avec une première question personnalisée selon le thème »).
# Utilisée à la fois par le formulaire public de passation en ligne
# (routers/positioning_tests.py) et par le modèle PDF "Test de positionnement".
# Pas de corrigé : comme sur le document papier d'origine, la notation reste
# manuelle (l'évaluateur remplit lui-même score/niveau/conclusion).

# Question 1, spécifique au métier/thème de chaque catégorie de formation —
# le reste du questionnaire (_COMMON_QUESTIONS ci-dessous) est commun à
# toutes les catégories.
_THEME_QUESTIONS_BY_CATEGORY = {
    "VTC_TAXI": {"theme": "A - T3P", "question": "Que signifie l'abréviation T3P ?", "options": ["Transport public particulier de personnes", "Transport privé de trois passagers", "Tarification professionnelle de proximité"]},
    "SSIAP": {"theme": "A - Sécurité incendie", "question": "Que signifie l'abréviation SSIAP ?", "options": ["Service de sécurité incendie et d'assistance à personnes", "Société de surveillance et d'intervention à Paris", "Système de sécurité informatique et audiovisuel professionnel"]},
    "ECSR": {"theme": "A - Éducation routière", "question": "Que signifie l'abréviation ECSR ?", "options": ["Éducation à la Conduite et à la Sécurité Routière", "État des Chaussées et Signalisation Routière", "Examen du Code et de la Signalisation Routière"]},
    "PERMIS": {"theme": "A - Stage de récupération de points", "question": "Un stage de récupération de points permet de récupérer au maximum :", "options": ["4 points", "12 points", "Tous les points perdus, sans limite"]},
    "CACES": {"theme": "A - Conduite d'engins", "question": "Que signifie l'abréviation CACES ?", "options": ["Certificat d'Aptitude à la Conduite En Sécurité", "Contrôle Annuel des Chariots Élévateurs et Sécurité", "Certification Avancée pour Chauffeurs d'Engins Spéciaux"]},
    "AUTO_ECOLE": {"theme": "A - Enseignement de la conduite", "question": "L'enseignement de la conduite vise en priorité à :", "options": ["Former des conducteurs autonomes et responsables", "Faire réussir l'examen coûte que coûte sans pédagogie", "Éviter tout apprentissage du code de la route"]},
    "VENTE": {"theme": "A - Conseil de vente", "question": "Le rôle principal d'un conseiller de vente est de :", "options": ["Accueillir, conseiller et fidéliser le client", "Uniquement encaisser les paiements", "Éviter tout contact avec la clientèle"]},
}

DEFAULT_CATEGORY = "VTC_TAXI"

# Questions 2 à 16 — tronc commun à toutes les catégories (gestion, sécurité,
# français, anglais, commercial, pratique, projet professionnel, outils
# numériques). Historiquement écrites pour VTC ; conservées telles quelles
# comme socle générique, seule la question 1 change selon la formation.
_COMMON_QUESTIONS = [
    {"theme": "G - Réglementation métier", "question": "Lors d'un contrôle, le professionnel doit pouvoir présenter notamment :", "options": ["Les documents professionnels et du véhicule/matériel requis", "Uniquement une pièce d'identité", "Aucun document n'est jamais demandé"]},
    {"theme": "G - Réglementation métier", "question": "L'exercice de l'activité nécessite notamment :", "options": ["Les inscriptions/habilitations réglementaires propres au métier", "Une simple déclaration orale", "Aucune démarche particulière"]},
    {"theme": "B - Gestion", "question": "Parmi les dépenses suivantes, laquelle est généralement une charge variable ?", "options": ["Le carburant", "Le loyer mensuel du local", "La cotisation annuelle d'assurance"]},
    {"theme": "B - Gestion", "question": "Une prestation est vendue 120 € et son coût de revient est de 80 €. Quelle est la marge en euros ?", "options": ["20 €", "40 €", "200 €"]},
    {"theme": "C - Sécurité", "question": "Face à une situation à risque, la priorité est :", "options": ["Garder son calme et appliquer les consignes de sécurité", "Ignorer la situation", "Improviser sans se référer aux consignes"]},
    {"theme": "C - Sécurité", "question": "Avant une prise de poste, quel contrôle est prioritaire ?", "options": ["Vérifier son matériel/équipement et son environnement de travail", "La couleur de sa tenue", "Rien, il n'y a rien à vérifier"]},
    {"theme": "D - Français", "question": "Choisir la formulation professionnelle correcte :", "options": ["Je vous accompagne pour votre prestation en toute sécurité.", "J'fais ça vite fait.", "Moi faire ça maintenant."]},
    {"theme": "E - Anglais A2", "question": "“Where would you like to go?” signifie :", "options": ["Où souhaitez-vous aller ?", "Comment souhaitez-vous payer ?", "Avez-vous des bagages ?"]},
    {"theme": "F - Développement commercial", "question": "Pour fidéliser une clientèle professionnelle, l'action la plus pertinente est :", "options": ["Assurer un service régulier et maintenir le contact", "Modifier le prix après chaque prestation sans explication", "Ne jamais demander d'avis client"]},
    {"theme": "F - Devis et facturation", "question": "Un devis doit être établi :", "options": ["Avant la prestation lorsque le client en fait la demande ou que la situation l'exige", "Uniquement après le paiement", "Seulement pour les petites prestations"]},
    {"theme": "Pratique - Préparation", "question": "Avant de commencer une prestation, le professionnel doit en priorité :", "options": ["Confirmer les modalités et préparer son intervention", "Commencer sans échange préalable", "Laisser le client s'organiser seul"]},
    {"theme": "Pratique - Facturation", "question": "Une prestation est facturée 75 € TTC. Le client paie 100 € en espèces. Quel montant doit être rendu ?", "options": ["15 €", "25 €", "35 €"]},
    {"theme": "Projet professionnel", "question": "Quel mode d'exercice est principalement envisagé ?", "options": ["Indépendant / exploitant", "Salarié", "Plateforme ou partenaire", "Projet non défini"]},
    {"theme": "Outils numériques", "question": "Niveau d'aisance avec les outils numériques (applications, messagerie, documents) :", "options": ["Autonome", "Partiellement autonome", "Besoin d'accompagnement"]},
]


def get_positioning_questions(category: str = None) -> list:
    theme_q = _THEME_QUESTIONS_BY_CATEGORY.get(category, _THEME_QUESTIONS_BY_CATEGORY[DEFAULT_CATEGORY])
    return [theme_q] + _COMMON_QUESTIONS


# Conservé pour compatibilité (code existant qui importerait encore la
# constante directement) — correspond au questionnaire par défaut (VTC/Taxi).
POSITIONING_QUESTIONS = get_positioning_questions(DEFAULT_CATEGORY)
