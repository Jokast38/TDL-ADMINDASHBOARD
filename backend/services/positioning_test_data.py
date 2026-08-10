# Banque de questions du Test de positionnement VTC (RS5637) — utilisée à la
# fois par le formulaire public de passation en ligne (routers/positioning_tests.py)
# et par le modèle PDF "Test de positionnement - Formation VTC" (seed_doc_templates.py).
# Pas de corrigé : comme sur le document papier d'origine, la notation reste
# manuelle (l'évaluateur remplit lui-même score/niveau/conclusion).
POSITIONING_QUESTIONS = [
    {"theme": "A - T3P", "question": "Que signifie l'abréviation T3P ?", "options": ["Transport public particulier de personnes", "Transport privé de trois passagers", "Tarification professionnelle de proximité"]},
    {"theme": "A - T3P", "question": "Lors d'un contrôle, le conducteur VTC doit pouvoir présenter notamment :", "options": ["Les documents du conducteur et du véhicule", "Uniquement son permis de conduire", "Uniquement la facture du véhicule"]},
    {"theme": "G(V) - Réglementation VTC", "question": "Un conducteur VTC peut-il prendre un client qui le hèle dans la rue sans réservation préalable ?", "options": ["Oui", "Non", "Oui, uniquement la nuit"]},
    {"theme": "G(V) - Réglementation VTC", "question": "L'activité d'exploitant VTC nécessite notamment :", "options": ["Une inscription au registre des exploitants VTC", "Une licence de débit de boissons", "Une autorisation de stationnement taxi"]},
    {"theme": "B - Gestion", "question": "Parmi les dépenses suivantes, laquelle est généralement une charge variable ?", "options": ["Le carburant", "Le loyer mensuel du local", "La cotisation annuelle d'assurance"]},
    {"theme": "B - Gestion", "question": "Une prestation est vendue 120 € et son coût de revient est de 80 €. Quelle est la marge en euros ?", "options": ["20 €", "40 €", "200 €"]},
    {"theme": "C - Sécurité routière", "question": "À 50 km/h, l'usage du téléphone tenu en main augmente principalement :", "options": ["La vigilance", "Le temps de réaction et le risque d'accident", "La stabilité du véhicule"]},
    {"theme": "C - Sécurité routière", "question": "Avant une prise de service, quel contrôle est prioritaire ?", "options": ["Pneumatiques, éclairage et niveaux", "Couleur de la carrosserie", "Station de radio préférée du client"]},
    {"theme": "D - Français", "question": "Choisir la formulation professionnelle correcte :", "options": ["Je vous conduis à votre destination en toute sécurité.", "J'vous dépose où vous voulez.", "Moi conduire vous maintenant."]},
    {"theme": "E - Anglais A2", "question": "“Where would you like to go?” signifie :", "options": ["Où souhaitez-vous aller ?", "Comment souhaitez-vous payer ?", "Avez-vous des bagages ?"]},
    {"theme": "F(V) - Développement commercial", "question": "Pour fidéliser une clientèle professionnelle, l'action la plus pertinente est :", "options": ["Assurer un service régulier et maintenir le contact", "Modifier le prix après chaque course sans explication", "Ne jamais demander d'avis client"]},
    {"theme": "F(V) - Devis et facturation", "question": "Un devis doit être établi :", "options": ["Avant la prestation lorsque le client en fait la demande ou que la situation l'exige", "Uniquement après le paiement", "Seulement pour les courses de moins de 10 €"]},
    {"theme": "Pratique - Préparation du parcours", "question": "Avant le départ, le conducteur doit en priorité :", "options": ["Confirmer la destination et préparer l'itinéraire", "Commencer à conduire sans échange", "Demander au client de programmer le GPS"]},
    {"theme": "Pratique - Facturation", "question": "Une mission est facturée 75 € TTC. Le client paie 100 € en espèces. Quel montant doit être rendu ?", "options": ["15 €", "25 €", "35 €"]},
    {"theme": "Projet professionnel", "question": "Quel mode d'exercice est principalement envisagé ?", "options": ["Indépendant / exploitant", "Salarié", "Plateforme ou partenaire", "Projet non défini"]},
    {"theme": "Outils numériques", "question": "Niveau d'aisance avec GPS, applications mobiles, messagerie et documents numériques :", "options": ["Autonome", "Partiellement autonome", "Besoin d'accompagnement"]},
]
