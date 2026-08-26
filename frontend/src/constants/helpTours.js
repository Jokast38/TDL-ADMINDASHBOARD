import {
  House, GraduationCap, Folders, IdentificationCard, UsersThree, FilePdf, FileText,
  Archive, ShoppingCart, Storefront, Robot, Article, Users, Gear, ChartBar,
  CalendarCheck, PenNib, TrendUp, LinkSimple,
} from "@phosphor-icons/react";

// Contenu du Centre d'aide (visites guidées) — une catégorie par profil
// d'employé, chacune listant les fonctionnalités importantes de ce profil
// sous forme d'étapes (voir components/GuidedTour.jsx). Pensé pour former
// rapidement un nouvel employé sans avoir à repasser derrière lui pour
// chaque fonctionnalité.
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
        icon: IdentificationCard,
        route: "/admin/inscriptions",
        targetSelector: '[data-testid="callback-requests-card"]',
        description:
          "Liste de toutes les inscriptions (en ligne ou saisies par vous) et, encadré ici, les demandes de rappel non traitées — pensez à les marquer « traité » une fois le candidat rappelé.",
      },
      {
        title: "Dossiers (Kanban)",
        icon: Folders,
        route: "/admin/dossiers",
        targetSelector: '[data-testid="kanban-board"]',
        description:
          "Chaque inscription génère automatiquement un dossier avec sa liste de documents requis et une carte Trello. Faites glisser les dossiers d'une colonne à l'autre selon l'avancement (nouveau → en cours → validé...) ; vérifiez et validez/rejetez les documents déposés par l'élève.",
      },
      {
        title: "Sessions de stage",
        icon: CalendarCheck,
        route: "/admin/stages",
        targetSelector: '[data-testid="new-stage-btn"]',
        description:
          "Calendrier des sessions (stage récupération de points, formations groupées...). Ce bouton crée une session : fixez ses dates et son centre (Épinay-sur-Seine ou Creil), et suivez les inscrits qui y sont rattachés.",
      },
      {
        title: "Bibliothèque PDF",
        icon: FilePdf,
        route: "/admin/documents-library",
        targetSelector: '[data-testid="gen-doc-btn"]',
        description:
          "Ce bouton génère un document officiel (attestation, convention, contrat, facture...) depuis un modèle : choisissez le modèle, remplissez le formulaire (plus besoin de taper du JSON), prévisualisez avant de générer, puis signez électroniquement si besoin. Un peu plus haut, un autre bouton permet de créer et envoyer un lien de test de positionnement à un candidat.",
      },
      {
        title: "Documents entreprise",
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
        icon: UsersThree,
        route: "/admin/leads",
        targetSelector: '[data-testid="broadcast-btn"]',
        description:
          "Tous les contacts collectés (site, chatbot, formulaires) atterrissent ici — et aussi dans les demandes de rappel sur la page Inscriptions, les deux sont synchronisées. Filtrez par intérêt/date, marquez un lead « contacté »/« intéressé », et utilisez ce bouton pour lancer une campagne de relance groupée par email.",
      },
      {
        title: "Demandes de rappel",
        icon: IdentificationCard,
        route: "/admin/inscriptions",
        targetSelector: '[data-testid="callback-requests-card"]',
        description:
          "Les demandes de rappel qui vous sont assignées (selon votre catégorie de formation) apparaissent ici avec notification email/push. Traitez-les rapidement : un lead qui attend trop longtemps reçoit une relance automatique après 1h.",
      },
      {
        title: "KAMI STREET",
        icon: ShoppingCart,
        route: "/admin/kami-street",
        targetSelector: '[data-testid="add-product-btn"]',
        description:
          "Catalogue des produits de mobilité électrique (vélos, trottinettes...) vendus par KAMI STREET. Consultez le catalogue et les fiches produit pour répondre aux questions clients.",
      },
      {
        title: "Commandes",
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
        icon: House,
        route: "/admin",
        targetSelector: '[data-testid="kpi-grid"]',
        description: "Vue d'ensemble : chiffres clés, inscriptions récentes, demandes de rappel en attente. Point de départ de votre journée.",
      },
      {
        title: "Formations",
        icon: GraduationCap,
        route: "/admin/formations",
        targetSelector: '[data-testid="add-formation-btn"]',
        description:
          "Catalogue des formations proposées (CACES, permis, auto-école, SSIAP, VTC/Taxi...). Ce bouton crée/modifie une fiche formation : prix, catégorie, documents requis, éligibilité CPF.",
      },
      {
        title: "Dossiers (Kanban)",
        icon: Folders,
        route: "/admin/dossiers",
        targetSelector: '[data-testid="kanban-board"]',
        description:
          "Une fois l'inscription créée (page Inscriptions), suivez le dossier du candidat ici : glissez-le d'une colonne à l'autre selon l'avancement, vérifiez les documents déposés.",
      },
      {
        title: "Leads",
        icon: UsersThree,
        route: "/admin/leads",
        targetSelector: '[data-testid="broadcast-btn"]',
        description: "Contacts à recontacter — les mêmes règles que pour l'équipe commerciale : filtrez, marquez, relancez (ce bouton lance une campagne groupée).",
      },
      {
        title: "Blog",
        icon: Article,
        route: "/admin/blog",
        targetSelector: '[data-testid="ai-generate-btn"]',
        description:
          "Rédigez un article vous-même ou laissez l'IA en générer un brouillon à partir d'un sujet et de mots-clés avec ce bouton (relisez toujours avant de publier).",
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
        icon: House,
        route: "/espace-animateur",
        targetSelector: '[data-testid="animateur-page"]',
        description:
          "Votre espace dédié : votre dossier formateur (habilitations, coordonnées) et la liste de vos sessions de formation à venir ou en cours.",
      },
      {
        title: "Feuille d'émargement",
        icon: CalendarCheck,
        route: "/espace-animateur",
        targetSelector: '[data-testid="generate-emargement-pdf"]',
        description:
          "Pour chaque session, ouvrez la liste des stagiaires : marquez chacun présent/absent et faites-le signer directement à l'écran (signature tactile). Une fois tous les stagiaires traités, ce bouton génère la feuille d'émargement PDF officielle.",
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
        icon: TrendUp,
        route: "/admin",
        targetSelector: '[data-testid="kpi-grid"]',
        description: "Vue globale de l'activité : chiffres clés, inscriptions récentes, demandes de rappel en attente.",
      },
      {
        title: "Activité de l'équipe",
        icon: TrendUp,
        route: "/admin/activite",
        targetSelector: '[data-testid="activity-page"]',
        description:
          "Mesure la productivité par employé (leads traités, demandes de rappel gérées, charge en attente) — utile pour répartir le travail et détecter une surcharge.",
      },
      {
        title: "Employés",
        icon: Users,
        route: "/admin/employees",
        targetSelector: '[data-testid="add-employee-btn"]',
        description:
          "Ce bouton crée un compte pour un membre de votre équipe : attribuez son rôle (agent admin, commercial, animateur...) et ses catégories/centres assignés — c'est ce qui détermine quels leads et demandes de rappel chaque personne reçoit.",
      },
      {
        title: "Modèles PDF",
        icon: FileText,
        route: "/admin/doc-templates",
        targetSelector: '[data-testid="new-tpl-btn"]',
        description:
          "Bibliothèque des modèles utilisés par la Bibliothèque PDF (attestations, contrats, conventions...). Réservé aux administrateurs : ce bouton crée un nouveau modèle pour toute l'équipe.",
      },
      {
        title: "Paramètres",
        icon: Gear,
        route: "/admin/settings",
        targetSelector: '[data-testid="email-provider"]',
        description:
          "Configuration technique du site : email (SMTP/Brevo/Resend, visible ici), paiement Stripe, Trello, n8n, Analytics (Google Analytics, Meta Pixel), Limova. À ne modifier qu'en connaissance de cause.",
      },
      {
        title: "Marketing",
        icon: ChartBar,
        route: "/admin/marketing",
        targetSelector: '[data-testid="marketing-page"]',
        description:
          "Statistiques de trafic et de conversion du site public, campagnes email, automatisations de relance des leads.",
      },
      {
        title: "Demandes de backlinks",
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
