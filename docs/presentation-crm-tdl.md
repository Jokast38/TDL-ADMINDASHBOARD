# Présentation du dashboard TDL Formation — script de présentation à l'équipe

> Document de préparation pour la réunion de lancement. Objectif : présenter le dashboard, montrer un parcours complet par profil, et justifier l'arrêt (ou la réduction) des abonnements à ProStage / Digiforma / Formaest.

---

## 1. Message d'ouverture (2 min)

> "Depuis [date de démarrage du projet], on a construit un outil unique qui centralise tout ce qu'on faisait avant sur plusieurs plateformes séparées (ProStage, Digiforma, Formaest, plus nos outils internes type Trello/Excel). Aujourd'hui je vous montre comment il fonctionne, et pourquoi il va nous faire gagner du temps ET de l'argent."

Points clés à faire passer dès le départ :
- **Un seul outil** pour l'inscription, le suivi de dossier, la génération de documents, la signature électronique, la facturation et la communication avec l'apprenant.
- **Pensé pour notre métier précis** (VTC/Taxi, récupération de points, auto-école, CACES, SSIAP...) — pas un outil générique qu'on doit tordre pour qu'il corresponde à notre activité.
- **Toujours en évolution** : chaque semaine de nouvelles fonctionnalités sont ajoutées selon les besoins remontés par l'équipe.

---

## 2. Tour des fonctionnalités par grand domaine (15-20 min)

### 2.1 Inscriptions & apprenants
- Inscription en ligne (site public), sur place par un agent (avec encaissement carte Stripe immédiat), ou en masse via import Excel (ex: fichiers VTC/Taxi).
- Détection des doublons **intelligente** : bloque seulement une double inscription à la **même session**, jamais un nouvel essai (ex: repassage d'examen VTC sur un nouveau créneau).
- Affectation / réaffectation à une session en un clic, y compris pour replanifier un apprenant.
- Statuts de paiement enrichis : Payé, En attente, **CPF Validé**, **CPF en attente**, Remboursé.
- Filtres avancés : par formation, par origine (site internet / sur place / import Excel), par statut de contact, de paiement, de traitement.
- Vérification automatique du paiement directement auprès de Stripe si le webhook n'a pas mis à jour le statut (bouton "Vérifier auprès de Stripe").

### 2.2 Dossiers & documents
- Kanban de suivi de dossier (nouveau → en vérification → complet → soumis ANTS → terminé), avec recherche et pagination.
- Bibliothèque de documents générés depuis des modèles : attestations, factures, devis, conventions — avec choix de la source des données (saisie manuelle ou récupération automatique depuis un dossier existant) et choix du mode d'envoi (téléchargement ou envoi direct par email).
- **Signature électronique** partout où c'est pertinent : apprenant (attestation de stage), agent (documents générés), formateur (émargement, convention).
- **Dossier ANTS en un clic** : une fois la session terminée et l'attestation signée par toutes les parties, un bouton génère un zip nommé au nom de l'apprenant avec l'attestation signée + toutes ses pièces justificatives — plus besoin de rassembler les documents à la main avant l'envoi à l'ANTS. Le même principe existe au niveau d'une session entière (toutes les feuilles d'émargement signées).

### 2.3 Sessions de stage
- Calendrier des sessions groupé par mois, avec distinction JOUR/SOIR.
- Compteur de places en temps réel (X/Y inscrits), liste des inscrits accessible en un clic.
- Plusieurs formateurs assignables à une même session (formateur BAFM + psychologue, par exemple) — chacun signe les documents avec sa propre signature.
- Import Excel des sessions VTC/Taxi/Passerelle avec détection automatique des créneaux JOUR/SOIR et des candidats déjà financés par CPF.

### 2.4 Formateurs, animateurs, psychologues
- Répertoire dédié avec checklist des **10 pièces justificatives** obligatoires (identité, diplôme BAFM/PSY, autorisations, GTA, KBIS, vigilance URSSAF, justificatif de domicile).
- **Dossier à valider en 24h** dès la création du compte par un agent : le formateur charge ses documents et signe sa **convention de collaboration** directement depuis son espace (signature tactile) — l'agent est notifié automatiquement dès que c'est fait.
- Un compte "psychologue" se crée exactement comme un compte formateur, avec l'intitulé approprié — il apparaît alors correctement sur les attestations générées.

### 2.5 Notifications & rappels automatiques
- Récapitulatif matinal des dossiers et demandes de rappel non traités (exclut désormais les imports en masse déjà connus de l'équipe).
- Compte-rendu hebdomadaire aux admins (samedi soir / lundi matin) : ce qui a été fait, ce qu'il reste à faire.
- Rappel automatique de session (3 jours avant), envoyé aux apprenants inscrits ET aux formateurs assignés.
- Notifications de paiement, de dossier complété, de convention signée...

### 2.6 Marketing & contenu
- Blog avec génération d'articles par IA et synchronisation automatique avec WordPress.
- Suivi des leads, campagnes de relance par email, demandes de backlinks.
- Statistiques de trafic et de conversion.

### 2.7 Centre d'aide intégré
- Visites guidées par profil (chargé d'admission, commercial, employé, animateur, administrateur), qui pointent directement sur les boutons réels du dashboard.
- Permet à un nouvel arrivant de se former seul, sans mobiliser un collègue pendant des heures.

---

## 3. Parcours par type d'utilisateur (démo live — 20 min)

### 3.1 Parcours agent d'admission
1. Un candidat se présente en agence → **Inscrire sur place** (page Inscriptions), paiement carte immédiat, reçu généré.
2. L'inscription arrive dans le Kanban → vérification des documents déposés.
3. Affectation à une session disponible (ou réaffectation si changement de date).
4. Une fois la session terminée et l'attestation signée → **téléchargement du dossier ANTS** en un clic, prêt à envoyer.

### 3.2 Parcours apprenant (espace personnel)
1. Inscription en ligne, avec **choix de session en fonction des disponibilités réelles** (pour la récupération de points).
2. Suivi de son dossier, dépôt de documents.
3. Réception de la notification "attestation disponible" après la fin du stage.
4. **Signature manuscrite tactile** de son attestation directement dans son espace.
5. Téléchargement de son attestation signée.

### 3.3 Parcours formateur / animateur
1. Compte créé par un agent → email avec ses identifiants.
2. Connexion → **"Mon dossier"** : upload des 10 pièces justificatives, signature de la convention de collaboration (24h pour tout compléter).
3. Consultation de ses sessions assignées, émargement des apprenants (signature tactile de chacun).
4. Génération de la feuille d'émargement officielle en un clic.

### 3.4 Parcours administrateur
1. Vue d'ensemble (tableau de bord, activité de l'équipe).
2. Gestion de l'équipe (employés, formateurs) et des paramètres techniques.
3. Réception du compte-rendu hebdomadaire (ce qui a été fait / ce qui reste à faire).
4. Pilotage marketing (blog, leads, backlinks).

---

## 4. Comparaison avec ProStage / Digiforma / Formaest

| Besoin métier | ProStage / Digiforma / Formaest | Notre dashboard |
|---|---|---|
| Inscription en ligne + sur place | Oui, mais outil séparé du reste | Oui, intégré (paiement Stripe compris) |
| Génération de documents (attestations, conventions...) | Oui, modèles génériques | Oui, modèles sur-mesure pour nos formations (VTC/Taxi, récupération de points...) |
| Signature électronique | Souvent en option payante | Incluse, apprenant + formateur + agent |
| Gestion des formateurs (dossier, convention) | Variable selon l'outil | Dédiée, avec délai de 24h suivi automatiquement |
| Suivi CRM (leads, relances, marketing) | Non ou très limité | Complet (leads, blog, campagnes email) |
| Personnalisation | Limitée au paramétrage proposé | Illimitée — c'est notre code, on ajoute ce qu'on veut |
| Coût | Abonnement(s) mensuel/annuel [à compléter] | Coût de développement + hébergement, pas d'abonnement récurrent par apprenant/session |
| Dépendance | Si la plateforme ferme ou change ses tarifs, on subit | On maîtrise l'outil et les données de bout en bout |

**Argument central** : ces plateformes ont été pensées pour être génériques et servir un grand nombre d'organismes différents. Notre outil, lui, colle exactement à notre façon de travailler — pas de fonctionnalité qu'on paie sans s'en servir, pas de fonctionnalité qui nous manque et qu'on doit contourner avec un tableur à côté.

---

## 5. Rentabilité — à compléter avec les chiffres réels

> ⚠️ Les montants ci-dessous sont des exemples à remplacer par nos vrais abonnements avant la présentation — je n'ai pas de données fiables sur les tarifs actuels de ProStage/Digiforma/Formaest pour les avancer moi-même.

### 5.1 Coûts évités (abonnements actuels)

| Plateforme | Coût mensuel actuel | Coût annuel actuel |
|---|---|---|
| ProStage | [à compléter] € | [à compléter] € |
| Digiforma | [à compléter] € | [à compléter] € |
| Formaest | [à compléter] € | [à compléter] € |
| **Total** | **[à compléter] €** | **[à compléter] €** |

### 5.2 Coût du dashboard interne

| Poste | Coût |
|---|---|
| Hébergement (serveur + base de données) | [à compléter] €/mois |
| Nom de domaine, emails transactionnels, stockage documents | [à compléter] €/mois |
| Maintenance / évolutions | [à compléter] €/mois ou ponctuel |
| **Total** | **[à compléter] €/mois** |

### 5.3 Méthode de calcul du retour sur investissement

```
Économie annuelle = (Total abonnements évités par an) − (Coût annuel du dashboard interne)
Délai de rentabilisation = Coût de développement initial ÷ Économie mensuelle nette
```

En complément des coûts directs, valoriser aussi :
- **Temps gagné par dossier** (ex: X minutes économisées par dossier ANTS grâce au zip prêt-à-envoyer × nombre de dossiers/mois).
- **Temps gagné sur la génération de documents** (plus de ressaisie manuelle des informations apprenant).
- **Réduction des erreurs** (moins d'oublis de documents, suivi automatisé des délais de 24h pour les formateurs).

---

## 6. Accès à l'API ANTS — point en attente

Il n'existe pas, à notre connaissance, d'API publique ANTS accessible directement par un organisme de formation pour soumettre automatiquement les dossiers de récupération de points. La marche à suivre recommandée :
1. Contacter le support technique / la conformité ANTS pour vérifier l'existence d'un programme partenaire ou d'un accès EDI.
2. En attendant cette réponse, le dashboard prépare déjà le **dossier prêt à envoyer** (zip nommé, attestation + pièces regroupées) pour que l'envoi manuel (email, portail) prenne le minimum de temps possible.
3. Si un accès API est obtenu, l'intégration technique (dépôt automatique) pourra être développée à partir de cette préparation déjà en place.

---

## 7. Clôture

> "L'outil est déjà utilisable aujourd'hui pour l'essentiel du travail quotidien. Le Centre d'aide intégré vous permet de vous former en autonomie, fonctionnalité par fonctionnalité. On continue à l'améliorer chaque semaine selon vos retours — n'hésitez pas à nous remonter ce qui vous manque ou ce qui vous semble compliqué."

**Prochaines étapes suggérées :**
- Formation individuelle par profil (30 min chacun) dans les jours suivant cette présentation.
- Bascule progressive : arrêter les nouvelles inscriptions sur les anciennes plateformes dès [date], migration des dossiers en cours sur [période].
- Point de suivi à 1 mois pour recueillir les retours et ajuster.
