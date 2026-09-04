import {
  House, GraduationCap, Folders, IdentificationCard, UsersThree, FilePdf, FileText,
  Archive, ShoppingCart, Storefront, Robot, Article, Users, Gear, ChartBar,
  CalendarCheck, PenNib, TrendUp, LinkSimple, Student, Signature, ArrowsClockwise,
  CreditCard,
} from "@phosphor-icons/react";

// Contenu du Centre d'aide (visites guidées) — une catégorie par profil
// d'employé, chacune listant les fonctionnalités importantes de ce profil
// sous forme d'étapes (voir components/GuidedTour.jsx). Chaque étape porte
// aussi un `question` formulé comme une question métier ("Comment... ?") —
// affiché comme bouton dans HelpCenter.jsx pour lancer directement la visite
// sur cette fonctionnalité précise, sans avoir à parcourir toute la
// catégorie. Pensé pour former rapidement un nouvel employé sans avoir à
// repasser derrière lui pour chaque fonctionnalité.
export const HELP_CATEGORIES = [
  {
    key: "admission",
    label: "Chargé(e) d'admission / Agent administratif",
    roles: ["responsable_admission", "agent_admin"],
    icon: IdentificationCard,
    description: "Inscriptions, dossiers candidats, documents et sessions de stage.",
    steps: [
      {
        title: "Demandes de rappel",
        question: "Comment traiter les demandes de rappel ?",
        icon: IdentificationCard,
        route: "/admin/inscriptions",
        targetSelector: '[data-testid="callback-requests-card"]',
        description:
          "Liste de toutes les inscriptions (en ligne ou saisies par vous) et, encadré ici, les demandes de rappel non traitées — pensez à les marquer « traité » une fois le candidat rappelé. La section se replie automatiquement dès qu'il n'y a plus de nouvelle demande.",
      },
      {
        title: "Inscrire un apprenant sur place",
        question: "Comment inscrire un apprenant qui se présente en agence ?",
        icon: CreditCard,
        route: "/admin/inscriptions",
        targetSelector: '[data-testid="walkin-btn"]',
        description:
          "Un candidat se présente en agence ? Ce bouton crée son inscription et peut lancer immédiatement le paiement par carte (Stripe) — vous revenez ensuite automatiquement sur la liste, avec un reçu téléchargeable. Dans la colonne « Session », affectez-le à une session existante (ou changez-en pour un repassage d'examen).",
      },
      {
        title: "Filtres et statut de contact",
        question: "Comment retrouver rapidement une inscription précise ?",
        icon: IdentificationCard,
        route: "/admin/inscriptions",
        targetSelector: '[data-testid="filter-contact"]',
        description:
          "Filtrez les inscriptions par payé/non payé (dont CPF Validé/en attente), traité/non traité, clôturée/active, par formation, par origine (site internet / sur place / import Excel) et par statut de contact — pratique pour retrouver rapidement un profil d'inscription. Pagination automatique par 25.",
      },
      {
        title: "Dossiers (Kanban)",
        question: "Comment suivre l'avancement d'un dossier candidat ?",
        icon: Folders,
        route: "/admin/dossiers",
        targetSelector: '[data-testid="kanban-board"]',
        description:
          "Chaque inscription génère automatiquement un dossier avec sa liste de documents requis et une carte Trello. Faites glisser les dossiers d'une colonne à l'autre selon l'avancement (nouveau → en cours → validé...) ; vérifiez et validez/rejetez les documents déposés par l'élève. Une barre de recherche par nom d'apprenant est disponible en haut, et chaque colonne se charge par 5 avec « Afficher plus ».",
      },
      {
        title: "Apprenants",
        question: "Comment suivre un apprenant et communiquer avec lui ?",
        icon: Student,
        route: "/admin/apprenants",
        targetSelector: '[data-testid="students-page"]',
        description:
          "Vue unifiée de chaque apprenant : résultats d'examen CMA (VTC/Taxi, permis B), rendez-vous, documents manquants. Depuis cette page vous pouvez ouvrir le dossier, envoyer un email avec le template de la marque (dont un modèle « Convocation à un examen »), et — pour les stages de récupération de points terminés — déclencher la notification de disponibilité de l'attestation de stage à signer.",
      },
      {
        title: "Dossier ANTS en un clic",
        question: "Comment préparer l'envoi d'un dossier à l'ANTS ?",
        icon: FilePdf,
        route: "/admin/apprenants",
        targetSelector: '[data-testid="students-page"]',
        description:
          "Pour un dossier « Récupération de points » validé, session terminée et attestation signée par toutes les parties : ouvrez le dossier de l'apprenant, un bouton « Télécharger le dossier ANTS » apparaît — un zip nommé à son nom avec l'attestation signée et toutes ses pièces, prêt à envoyer. Idem au niveau d'une session entière depuis la page Sessions de stage (feuilles d'émargement signées de tous les participants).",
      },
      {
        title: "Sessions de stage",
        question: "Comment planifier une session de stage ?",
        icon: CalendarCheck,
        route: "/admin/stages",
        targetSelector: '[data-testid="new-stage-btn"]',
        description:
          "Calendrier des sessions (stage récupération de points, formations groupées...), sous-groupé par mois avec un badge JOUR/☀️ ou SOIR/🌙. Ce bouton crée une session : fixez ses dates, son centre et un ou plusieurs formateurs. Cliquez sur le compteur « X/25 » d'une session pour voir la liste des candidats inscrits.",
      },
      {
        title: "Formateurs",
        question: "Comment ajouter et suivre le dossier d'un formateur ?",
        icon: PenNib,
        route: "/admin/formateurs",
        targetSelector: '[data-testid="add-formateur-btn"]',
        description:
          "Répertoire des formateurs, animateurs et psychologues (créez un compte psychologue comme un formateur classique, avec l'intitulé « Psychologue »). Pour chacun : intitulé affiché sur les attestations, checklist des 10 pièces justificatives (identité, BAFM/PSY, GTA, KBIS...), et statut de la convention de collaboration. Le formateur a 24h après la création de son compte pour tout compléter depuis son espace (« Mon dossier ») — vous êtes notifié dès qu'il signe.",
      },
      {
        title: "Bibliothèque PDF",
        question: "Comment générer une attestation, une convention ou une facture ?",
        icon: FilePdf,
        route: "/admin/documents-library",
        targetSelector: '[data-testid="gen-doc-btn"]',
        description:
          "Ce bouton génère un document officiel (attestation, convention, contrat, facture...) depuis un modèle : choisissez le modèle, remplissez le formulaire (plus besoin de taper du JSON), prévisualisez avant de générer, puis signez électroniquement si besoin. Un peu plus haut, un autre bouton permet de créer et envoyer un lien de test de positionnement à un candidat.",
      },
      {
        title: "Documents entreprise",
        question: "Où retrouver les documents internes de l'organisme ?",
        icon: Archive,
        route: "/admin/company-documents",
        targetSelector: '[data-testid="upload-doc-btn"]',
        description:
          "Coffre-fort des documents internes de l'organisme (habilitations, certificats Qualiopi, conventions cadres...). Ce bouton permet d'en ajouter un nouveau.",
      },
    ],
  },
  {
    key: "commercial",
    label: "Commercial / Responsable commercial",
    roles: ["commercial", "responsable_commercial"],
    icon: UsersThree,
    description: "Leads, relances, KAMI STREET et suivi des commandes.",
    steps: [
      {
        title: "Leads",
        question: "Comment relancer les leads efficacement ?",
        icon: UsersThree,
        route: "/admin/leads",
        targetSelector: '[data-testid="broadcast-btn"]',
        description:
          "Tous les contacts collectés (site, chatbot, formulaires) atterrissent ici — et aussi dans les demandes de rappel sur la page Inscriptions, les deux sont synchronisées. Filtrez par intérêt/date, marquez un lead « contacté »/« intéressé », et utilisez ce bouton pour lancer une campagne de relance groupée par email.",
      },
      {
        title: "Demandes de rappel",
        question: "Comment traiter les demandes de rappel qui me sont assignées ?",
        icon: IdentificationCard,
        route: "/admin/inscriptions",
        targetSelector: '[data-testid="callback-requests-card"]',
        description:
          "Les demandes de rappel qui vous sont assignées (selon votre catégorie de formation) apparaissent ici avec notification email/push. Traitez-les rapidement : un lead qui attend trop longtemps reçoit une relance automatique après 1h.",
      },
      {
        title: "KAMI STREET",
        question: "Comment consulter le catalogue KAMI STREET ?",
        icon: ShoppingCart,
        route: "/admin/kami-street",
        targetSelector: '[data-testid="add-product-btn"]',
        description:
          "Catalogue des produits de mobilité électrique (vélos, trottinettes...) vendus par KAMI STREET. Consultez le catalogue et les fiches produit pour répondre aux questions clients.",
      },
      {
        title: "Commandes",
        question: "Comment suivre une commande KAMI STREET ?",
        icon: Storefront,
        route: "/admin/orders",
        targetSelector: '[data-testid="orders-page"]',
        description:
          "Suivi des commandes KAMI STREET : statut de paiement, livraison, et détails client. Mettez à jour le statut au fur et à mesure du traitement.",
      },
    ],
  },
  {
    key: "employe",
    label: "Employé (polyvalent)",
    roles: ["employe"],
    icon: House,
    description: "Formations, inscriptions, dossiers, leads et blog.",
    steps: [
      {
        title: "Tableau de bord",
        question: "Par où commencer ma journée sur le dashboard ?",
        icon: House,
        route: "/admin",
        targetSelector: '[data-testid="kpi-grid"]',
        description: "Vue d'ensemble : chiffres clés, inscriptions récentes, demandes de rappel en attente. Point de départ de votre journée.",
      },
      {
        title: "Formations",
        question: "Comment créer ou modifier une formation du catalogue ?",
        icon: GraduationCap,
        route: "/admin/formations",
        targetSelector: '[data-testid="add-formation-btn"]',
        description:
          "Catalogue des formations proposées (CACES, permis, auto-école, SSIAP, VTC/Taxi...). Ce bouton crée/modifie une fiche formation : prix, catégorie, documents requis, éligibilité CPF.",
      },
      {
        title: "Dossiers (Kanban)",
        question: "Comment suivre un dossier candidat au quotidien ?",
        icon: Folders,
        route: "/admin/dossiers",
        targetSelector: '[data-testid="kanban-board"]',
        description:
          "Une fois l'inscription créée (page Inscriptions), suivez le dossier du candidat ici : glissez-le d'une colonne à l'autre selon l'avancement, vérifiez les documents déposés.",
      },
      {
        title: "Leads",
        question: "Comment recontacter un lead ?",
        icon: UsersThree,
        route: "/admin/leads",
        targetSelector: '[data-testid="broadcast-btn"]',
        description: "Contacts à recontacter — les mêmes règles que pour l'équipe commerciale : filtrez, marquez, relancez (ce bouton lance une campagne groupée).",
      },
      {
        title: "Blog",
        question: "Comment publier un article de blog ?",
        icon: Article,
        route: "/admin/blog",
        targetSelector: '[data-testid="ai-generate-btn"]',
        description:
          "Rédigez un article vous-même ou laissez l'IA en générer un brouillon à partir d'un sujet et de mots-clés avec ce bouton (relisez toujours avant de publier).",
      },
      {
        title: "Synchro auto WordPress",
        question: "Comment récupérer automatiquement les articles WordPress ?",
        icon: ArrowsClockwise,
        route: "/admin/blog",
        targetSelector: '[data-testid="wp-autosync-toggle"]',
        description:
          "Activez ce bouton pour importer automatiquement, toutes les 15 min, les nouveaux articles publiés sur WordPress (en brouillon, à relire avant publication). Désactivez-le si vous préférez importer manuellement via « Importer depuis WordPress ».",
      },
    ],
  },
  {
    key: "animateur",
    label: "Animateur / Formateur",
    roles: ["animateur"],
    icon: PenNib,
    description: "Vos sessions, feuilles d'émargement et signature de présence.",
    steps: [
      {
        title: "Espace animateur",
        question: "Où retrouver mes sessions de formation ?",
        icon: House,
        route: "/espace-animateur",
        targetSelector: '[data-testid="animateur-page"]',
        description:
          "Votre espace dédié : votre dossier formateur (habilitations, coordonnées) et la liste de vos sessions de formation à venir ou en cours.",
      },
      {
        title: "Feuille d'émargement",
        question: "Comment faire signer la présence de mes stagiaires ?",
        icon: CalendarCheck,
        route: "/espace-animateur",
        targetSelector: '[data-testid="generate-emargement-pdf"]',
        description:
          "Pour chaque session, ouvrez la liste des stagiaires : marquez chacun présent/absent et faites-le signer directement à l'écran (signature tactile). Une fois tous les stagiaires traités, ce bouton génère la feuille d'émargement PDF officielle.",
      },
      {
        title: "Ma signature",
        question: "Comment enregistrer ma signature et mon agrément BAFM ?",
        icon: Signature,
        route: "/espace-animateur",
        targetSelector: '[data-testid="tab-signature"]',
        description:
          "Déposez votre signature manuscrite et votre numéro d'agrément BAFM une seule fois : ils sont ensuite utilisés automatiquement pour signer les attestations de stage de récupération de points de vos stagiaires.",
      },
      {
        title: "Mon dossier",
        question: "Comment compléter mon dossier formateur et signer ma convention ?",
        icon: Student,
        route: "/espace-animateur",
        targetSelector: '[data-testid="tab-dossier"]',
        description:
          "À compléter dans les 24h suivant la création de votre compte : chargez vos 10 pièces justificatives (identité, diplôme BAFM/PSY, GTA, KBIS...) puis signez la convention de collaboration directement à l'écran (signature tactile). L'agent qui vous a créé est notifié dès que c'est fait.",
      },
    ],
  },
  {
    key: "admin",
    label: "Administrateur",
    roles: ["admin"],
    icon: Gear,
    description: "Pilotage complet : équipe, paramètres, modèles PDF, activité.",
    steps: [
      {
        title: "Tableau de bord",
        question: "Comment avoir une vue d'ensemble de l'activité ?",
        icon: TrendUp,
        route: "/admin",
        targetSelector: '[data-testid="kpi-grid"]',
        description: "Vue globale de l'activité : chiffres clés, inscriptions récentes, demandes de rappel en attente.",
      },
      {
        title: "Activité de l'équipe",
        question: "Comment mesurer la productivité de l'équipe ?",
        icon: TrendUp,
        route: "/admin/activite",
        targetSelector: '[data-testid="activity-page"]',
        description:
          "Mesure la productivité par employé (leads traités, demandes de rappel gérées, charge en attente) — utile pour répartir le travail et détecter une surcharge.",
      },
      {
        title: "Employés",
        question: "Comment créer un compte pour un membre de l'équipe ?",
        icon: Users,
        route: "/admin/employees",
        targetSelector: '[data-testid="add-employee-btn"]',
        description:
          "Ce bouton crée un compte pour un membre de votre équipe : attribuez son rôle (agent admin, commercial, animateur...) et ses catégories/centres assignés — c'est ce qui détermine quels leads et demandes de rappel chaque personne reçoit.",
      },
      {
        title: "Modèles PDF",
        question: "Comment créer un nouveau modèle de document ?",
        icon: FileText,
        route: "/admin/doc-templates",
        targetSelector: '[data-testid="new-tpl-btn"]',
        description:
          "Bibliothèque des modèles utilisés par la Bibliothèque PDF (attestations, contrats, conventions...). Réservé aux administrateurs : ce bouton crée un nouveau modèle pour toute l'équipe.",
      },
      {
        title: "Paramètres",
        question: "Où configurer email, paiement et intégrations techniques ?",
        icon: Gear,
        route: "/admin/settings",
        targetSelector: '[data-testid="email-provider"]',
        description:
          "Configuration technique du site : email (SMTP/Brevo/Resend, visible ici), paiement Stripe, Trello, n8n, Analytics (Google Analytics, Meta Pixel), Limova. À ne modifier qu'en connaissance de cause.",
      },
      {
        title: "Marketing",
        question: "Comment suivre le trafic et les conversions du site ?",
        icon: ChartBar,
        route: "/admin/marketing",
        targetSelector: '[data-testid="marketing-page"]',
        description:
          "Statistiques de trafic et de conversion du site public, campagnes email, automatisations de relance des leads.",
      },
      {
        title: "Demandes de backlinks",
        question: "Comment lancer une campagne de demandes de backlinks ?",
        icon: LinkSimple,
        route: "/admin/marketing",
        targetSelector: '[data-testid="tab-backlinks"]',
        description:
          "Onglet Marketing → Backlinks : importez votre liste de sites (fichier Excel), puis pour chacun proposez un prix et des mots-clés et envoyez la demande par email directement depuis le dashboard — le statut (à contacter, demande envoyée, accepté...) est suivi automatiquement.",
      },
    ],
  },
];

export function categoriesForRole(role) {
  const own = HELP_CATEGORIES.filter((c) => c.roles.includes(role));
  const others = HELP_CATEGORIES.filter((c) => !c.roles.includes(role));
  return [...own, ...others];
}
