# LMS VTC → v2.0 IA — Faisabilité & plan technique (WordPress / Tutor LMS)

*Préparé pour Jokast, en vue du retour commun à Roddy Tafial (TDL Formation) — 10/09/2026*

---

## 0. Résumé — ce qui est faisable étant donné que c'est un WordPress

Bonne nouvelle : la stack actuelle (WordPress + **Tutor LMS / Tutor LMS Pro** + WooCommerce + Stripe) est un socle correct pour la V1 pédagogique. Rien dans le mail de Roddy n'est bloqué par le choix de WordPress. Le découpage est net :

- **Faisable en configuration/paramétrage** (quelques jours, pas de dev) : quiz chronométrés type "examen blanc", export/import de questions (module déjà actif), certificats, prérequis de parcours, gestion RGPD (Complianz déjà en place).
- **Faisable en développement custom raisonnable** (le gros du travail V1) : taxonomie Matière→Chapitre→Notion liée aux questions, moteur de règles "TDL Brain" (vert/orange/rouge), diagnostic initial, agrégation des scores par notion, fiche candidat unique (pédagogie + CMA + financier).
- **Faisable mais dépend d'un service externe** : le vrai moteur IA (RAG, explication de cours, chatbot CMA) — WordPress sert de "façade" et de source de données, l'intelligence tourne côté API (Claude/GPT + base vectorielle), connectée au site via API REST WordPress.
- **Pas faisable tant qu'on n'a pas les réponses d'Uber/CMA** : tout ce qui touche à la transmission de candidats, à l'identifiant unique, à la récupération du résultat d'examen réel, à l'inscription CMA elle-même. Roddy le dit lui-même : on ne développe pas sur des suppositions.

En clair : **on peut commencer la moitié du projet dès maintenant** (taxonomie, exploitation des données existantes, diagnostic, TDL Brain V1) sans attendre Uber, et l'autre moitié (parcours CMA, assistant d'inscription, intégration Uber) se prépare en conception mais s'implémente après le 21 septembre.

---

## 1. Ce qu'on a déjà sur le site (audit rapide du wp-admin)

| Brique | Outil en place | Pertinence pour le projet |
|---|---|---|
| LMS / quiz | **Tutor LMS 4.0.7 + Tutor LMS Pro 3.0.2** | Moteur de cours, leçons, quiz — c'est notre socle pédagogique |
| Export/Import de quiz | Module **Quiz Export/Import** (Tutor Pro), déjà activé | Point de départ direct pour le "système simple d'import/export par tableur" demandé par Roddy — à étendre avec les colonnes matière/chapitre/notion/difficulté/explication/remédiation |
| Suivi & scoring | Modules **Gradebook**, **Reports**, **Tentatives de quiz**, **Enrollment**, **Prerequisites**, déjà actifs | Les réponses individuelles par élève sont déjà stockées en base (confirmé par le menu "Tentatives de quiz") — exploitable en SQL/REST |
| Paiement / vente | WooCommerce + Stripe Gateway + Order Status Control | Utilisé aujourd'hui pour vendre l'accès à la formation (19 €) — à réutiliser pour tracer les paiements CMA plus tard |
| Page builder | Elementor (gratuit) + Royal Addons + Tutor LMS Elementor Addons | Pour les pages candidat, assistant CMA, etc. |
| RGPD | **Complianz** déjà installé et configuré | Bon point pour la partie sécurité/RGPD évoquée au point 9 du mail |
| Contenu actuel | 1 cours principal "Formation Complète VTC" avec 5 matières visibles (Réglementation, Gestion d'entreprise, Développement commercial/service client, Sécurité routière, Compétences linguistiques) + 2 autres cours en préparation | Ces 5 matières sont probablement le niveau 1 de la taxonomie à formaliser |
| Outillage dev | Plugin **Novamira** (MCP server : donne à un agent IA un accès PHP direct au site, pour dev/staging) | À utiliser avec prudence, mais peut accélérer le développement de la taxonomie/TDL Brain si on veut aller vite |

**Non trouvé** : LearnDash, LifterLMS, H5P, plugin RAG/IA, CPT "dossier candidat" ou "CMA" — tout ça reste à construire. Modules Tutor Pro disponibles mais **pas encore activés** et utiles pour la suite : Assignments (pour l'intervention humaine), Course Preview, Zoom/Google Meet (pour les sessions avec un formateur), Paid Memberships Pro/Subscriptions.

---

## 2. Faisabilité détaillée, point par point (repris du mail de Roddy)

### 2.1 Taxonomie VTC (Matière → Chapitre → Notion) + liaison des questions
**Faisable, c'est le premier chantier.** Tutor LMS n'a pas nativement 3 niveaux de taxonomie reliés aux questions de quiz. Il faut :
- Créer une taxonomie/table custom `matière > chapitre > notion` (via un plugin maison, pas de code dans le thème).
- Une table de liaison `question_id ↔ notion_id ↔ niveau_difficulté` (les questions Tutor LMS restent dans Tutor, on ajoute une couche de métadonnées à côté).
- Étendre le module **Quiz Export/Import** existant (ou construire un export/import maison en PHP/WP-CLI) pour que le tableur inclue : matière, chapitre, notion, difficulté, explication, contenu de remédiation.
- Le classement assisté par IA (proposé par le spécialiste IA) peut pré-remplir ce tableur automatiquement à partir du texte des questions, à valider ensuite par TDL avant import.

### 2.2 Exploitation des données déjà présentes
**Faisable immédiatement, avant même la taxonomie.** Les tentatives de quiz et réponses individuelles sont déjà en base Tutor LMS. On peut sortir dès maintenant : score global par candidat, score par quiz/cours, historique de progression. Le score **par matière/notion** ne sera fiable qu'une fois la taxonomie du point 2.1 branchée.
Ce qui manque et doit être ajouté dès maintenant (comme demandé) :
- **Temps de réponse par question** : pas capturé nativement par Tutor (seulement la durée globale de la tentative) → petit tracking JS custom à ajouter côté front du quiz.
- **Événements clés du parcours** (connexion, début/fin de leçon, échec répété) : à journaliser dans une table d'événements custom (log simple, pas besoin d'usine à gaz).
- **Résultat réel d'examen** : n'existe pas du tout aujourd'hui → nouveau champ/CPT, alimenté manuellement au départ, puis par un flux CMA quand on l'aura défini avec Uber.

### 2.3 Diagnostic initial simple (%, par matière)
**Faisable rapidement, pas besoin d'IA.** Un calcul (moyenne pondérée des réponses par matière) affiché sous forme de jauge/pourcentage, généré dès que 2.1 et 2.2 sont en place. Un plugin custom léger + un shortcode/bloc sur la page candidat suffisent.

### 2.4 TDL Brain V1 (règles simples vert/orange/rouge + boucle de remédiation)
**Faisable, c'est le cœur du développement V1**, et c'est volontairement simple (pas de ML) :
- Table `statut_notion` par candidat (vert/orange/rouge), recalculée après chaque tentative de quiz via un hook Tutor LMS (`tutor_quiz/attempt_ended` ou équivalent).
- Si rouge → afficher automatiquement la leçon de remédiation liée à la notion (grâce à la liaison créée en 2.1), puis un mini-quiz ciblé, puis recontrôle.
- Après plusieurs échecs sur la même notion → flag "intervention humaine" (le module **Assignments** de Tutor Pro, pas encore activé, ou une simple notification à un formateur, peuvent couvrir ce besoin sans développement lourd).

### 2.5 Examens blancs + indicateur TDL READY
**Faisable avec les outils existants.** Tutor LMS gère déjà les quiz chronométrés en mode "examen". L'indicateur READY EXAMEN est un calcul custom basé sur les résultats réels observés (pas de probabilité IA pour l'instant, comme demandé) — cohérent avec l'approche "on commence simple, on améliore avec la donnée réelle".

### 2.6 Parcours Uber/CMA — fiche candidat unique
**Faisable, mais c'est le plus gros morceau de développement.** Il faut un nouveau CPT (ou table dédiée) "dossier candidat" qui relie trois univers qui ne se parlent pas aujourd'hui : la progression pédagogique (Tutor LMS), le statut administratif CMA (workflow custom à définir), et le suivi financier (frais avancés/remboursement, part fixe/variable — WooCommerce peut servir de brique comptable mais le workflow de statuts est à construire à part). **Recommandation : concevoir la structure de données maintenant** (les champs, les statuts possibles) sans développer l'intégration Uber elle-même avant le 21 septembre, exactement comme le demande Roddy.

### 2.7 Assistant intelligent d'inscription CMA
**Faisable une fois le CPT "dossier candidat" en place**, mais à ne pas construire avant d'avoir la vraie procédure CMA (Roddy le précise aussi). Techniquement : une interface pas-à-pas (Elementor/Forminator peuvent suffire pour un premier squelette non-IA) branchée sur le statut du dossier, puis enrichie par l'IA pour détecter blocages et reformuler les instructions.

### 2.8 IA pédagogique connectée au LMS (pas un chatbot indépendant)
**Faisable, c'est le chantier propre au spécialiste IA**, indépendant de WordPress en soi :
- Corpus VTC structuré à partir de la taxonomie (2.1) et des contenus fournis par Roddy.
- Pipeline RAG (base vectorielle + API IA type Claude) hébergé en dehors de WordPress.
- Un endpoint WP REST custom fait le pont : le LMS envoie le contexte (notion, erreur, historique), l'IA répond, le LMS affiche/logue.
- Ce découpage garde WordPress comme source de vérité pédagogique et l'IA comme service branché dessus — exactement l'architecture "commune" que Roddy demande aux deux profils de construire ensemble.

### 2.9 Sécurité / RGPD
Complianz est déjà en place pour la partie cookies/consentement, mais le partage de données candidats avec Uber et la CMA (résultats d'examen, données d'identité) demandera un vrai point RGPD (base légale, DPA avec Uber) — à poser explicitement en question le 21 septembre.

---

## 3. Ce qui peut démarrer *immédiatement* (sans attendre Uber)

1. Taxonomie Matière → Chapitre → Notion + extension de l'export/import Tutor LMS.
2. Extraction des données existantes (scores, historique) + ajout du tracking manquant (temps de réponse, événements).
3. Diagnostic initial (%).
4. TDL Brain V1 (règles vert/orange/rouge + boucle de remédiation).
5. Examens blancs + TDL READY (V1 basée sur résultats observés).
6. Structuration du corpus VTC + début du RAG (côté IA), en parallèle.
7. Conception (pas développement) de la structure de données du parcours CMA/Uber, pour être prêts à en discuter le 21 septembre.

## 4. Ce qui doit attendre la réunion Uber du 21 septembre

- Intégration technique Uber (API ou fichiers, transmission de candidats, identifiant unique).
- Développement réel du suivi CMA (procédure d'inscription, pièces, statuts officiels).
- Assistant d'inscription CMA (tant que la procédure réelle n'est pas connue).
- Tout ce qui touche à la facturation Uber (90 € fixe + 20 € variable, avance des 241 €) — on prévoit juste les champs dans la structure de données, sans construire de facturation.

---

## 5. Répartition des tâches proposée

*À ajuster avec ton collègue développeur — voici une base de discussion cohérente avec le découpage ci-dessus.*

**Développeur LMS (le "concepteur")**
- Taxonomie technique (CPT/tables + relations) et extension de l'import/export tableur.
- Extraction des données existantes + ajout du tracking manquant (temps de réponse, événements).
- Moteur TDL Brain (règles + recalcul de statut + déclenchement de remédiation).
- Diagnostic initial et affichage des scores.
- Structure de données du dossier candidat CMA/Uber (sans l'intégration elle-même).

**Toi / volet IA**
- Structuration du corpus VTC (matières, notions, explications) en lien avec la taxonomie du développeur.
- Classement assisté par IA des questions existantes (pré-remplissage du tableur, à valider par TDL).
- Pipeline RAG + choix de l'architecture IA (base vectorielle, prompt, garde-fous, escalade vers humain).
- Endpoint/API entre le LMS et le service IA.
- Squelette de l'assistant conversationnel CMA (conception, pas branchement Uber).

**Ensemble**
- Architecture commune de l'endpoint WP REST ↔ service IA.
- Préparation des questions techniques pour Uber (section 7).
- Premier retour commun à Roddy.

## 6. Besoins/contenus à demander à Roddy

- Les déroulés pédagogiques, cours et éléments VTC réels (annoncés au point 2 de son mail) pour construire la taxonomie sur le vrai contenu, pas une maquette.
- Confirmation du périmètre exact des questions existantes (combien de questions, sur quel(s) cours/quiz).
- Accès ou export de la base de données Tutor LMS actuelle (candidats/tentatives) pour dimensionner le retraitement.
- Validation du processus de remédiation attendu (contenu déjà existant à réutiliser, ou à créer).

## 7. Questions techniques à préparer pour Uber (rendez-vous du 21 septembre)

- **Transmission des candidats** : comment un candidat Uber arrive-t-il sur notre LMS (lien, API, import) ?
- **Identifiant unique** : Uber a-t-il un identifiant candidat stable qu'on peut utiliser comme clé commune entre nos deux systèmes ?
- **Données disponibles côté Uber** : quelles infos candidat peuvent nous être transmises (et sous quelle forme) ?
- **Résultats d'examen** : comment et par qui le résultat réel de l'examen VTC est-il récupéré et transmis (Uber, CMA, préfecture) ?
- **Inscription CMA** : quelle est la procédure exacte, quelles pièces, quels délais, existe-t-il une API CMA ou uniquement un portail web ?
- **Échange de données** : API REST, webhooks, ou échange de fichiers (CSV/Excel) — et à quelle fréquence ?
- **Reporting attendu** : quels indicateurs Uber veut-il recevoir, à quelle fréquence, sous quel format ?
- **Sécurité / RGPD** : base légale du partage de données, durée de conservation, DPA à signer ?
- **Montée en volume** : au-delà des 100-150/mois pilotes, quel est l'ordre de grandeur visé et sur quel horizon (pour dimensionner l'infra dès maintenant) ?

---

## 8. Brouillon — premier retour commun à Roddy

*(à relire/compléter avec ton collègue avant envoi — les [ ] sont à ajuster ou compléter ensemble)*

> Bonjour Roddy,
>
> Merci pour ce cadrage détaillé. Voici notre premier retour, avec la répartition des tâches et ce dont nous avons besoin pour démarrer.
>
> **Ce que nous pouvons commencer immédiatement**, sans attendre l'échange Uber du 21 :
> - La taxonomie Matière → Chapitre → Notion, en lien avec les questions existantes.
> - L'extension du système d'export/import par tableur (nous avons déjà une base dans notre LMS actuel que nous allons enrichir).
> - L'exploitation des données déjà présentes (scores, historique de progression) et l'ajout du suivi manquant (temps de réponse, événements clés).
> - Le diagnostic initial et la première version du "TDL Brain" (règles simples vert/orange/rouge + boucle de remédiation).
> - Les examens blancs et un premier indicateur TDL READY basé sur les résultats réellement observés.
> - Côté IA : la structuration du corpus VTC et la préparation du RAG, en parallèle du travail sur la taxonomie.
>
> **Répartition proposée** : [Développeur] prend en charge la structure technique (taxonomie, données, TDL Brain, diagnostic) ; [Jokast] prend en charge le corpus IA, le RAG et la connexion IA ↔ LMS. Nous travaillons ensemble sur l'architecture commune (l'API qui relie les deux).
>
> **Ce dont nous avons besoin de ta part** :
> - Les déroulés pédagogiques, cours et éléments VTC pour construire la taxonomie sur le contenu réel.
> - Le périmètre des questions existantes (nombre, cours concernés).
> - Une validation du principe de remédiation (contenus existants à réutiliser ou à créer).
>
> **Ce qui sera opérationnel avant le pilote** : la taxonomie, le diagnostic, le TDL Brain V1, les examens blancs, et une première version connectée de l'IA pédagogique.
>
> **Ce que nous ne développons pas avant le 21 septembre** : toute intégration technique avec Uber, le workflow CMA réel et l'assistant d'inscription — nous préparons uniquement la structure de données pour être prêts à en discuter avec eux.
>
> **Questions à poser à Uber le 21** : transmission des candidats, identifiant unique, données disponibles, récupération du résultat d'examen réel, procédure et API d'inscription CMA, format des échanges (API/fichiers), reporting attendu, RGPD/sécurité, et montée en volume au-delà du pilote.
>
> Nous serons bien sûr présents tous les deux le 21.
>
> [Développeur] et Jokast
