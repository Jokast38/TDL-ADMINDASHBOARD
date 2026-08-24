import { useEffect, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import Kit, { TopBar } from "@/components/StageLandingPage";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight, GraduationCap, Lightning, Trophy, CaretDown, CaretRight,
  IdentificationCard, Truck, FireSimple, Car, Phone, EnvelopeSimple, MapPin,
  List, X, DownloadSimple, ArrowUp,
  Certificate, UsersThree, ClipboardText, Target, CalendarBlank, DoorOpen,
  Clock, PiggyBank, NotePencil, Wheelchair, Storefront,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { trackLead, newEventId, getFbCookies } from "@/lib/metaPixel";
import HeroSlideshow from "@/components/HeroSlideshow";
import SiteFooter from "@/components/SiteFooter";
import FormationCard from "@/components/FormationCard";
import { HOME_HERO_SLIDES, heroForCategory } from "@/constants/formationAssets";
import { useReveal } from "@/hooks/useReveal";
import PrivacyConsentCheckbox from "@/components/PrivacyConsentCheckbox";
import { setPageMeta } from "@/lib/seo";

// Sections sous la ligne de flottaison + widget de chat : chargées à la
// demande plutôt que dans le bundle initial, pour ne pas ralentir le premier
// affichage (LCP) avec du JS qui ne sert qu'après le scroll.
const GoogleReviewsCarousel = lazy(() => import("@/components/GoogleReviewsCarousel"));
const FranceMapSection = lazy(() => import("@/components/FranceMapSection"));
const ChatWidget = lazy(() => import("@/components/ChatWidget"));
const ContactBubble = lazy(() => import("@/components/ContactBubble"));

const HOME_FAQ = [
  {
    q: "Où se trouve votre centre de formation près d'Épinay-sur-Seine ?",
    a: "Notre centre principal est situé au 59 avenue Joffre, 93800 Épinay-sur-Seine, à quelques minutes du RER C. Il est facilement accessible depuis Paris, Saint-Denis, Argenteuil, Villetaneuse et l'ensemble du nord de l'Île-de-France.",
  },
  {
    q: "Proposez-vous des formations à Creil, dans l'Oise ?",
    a: "Oui, nous avons un second centre à Creil (60), qui accueille les mêmes formations qu'à Épinay-sur-Seine : CACES, permis, auto-école, SSIAP et VTC/Taxi. Vous pouvez choisir le centre le plus proche de chez vous lors de votre inscription.",
  },
  {
    q: "Vos formations sont-elles accessibles depuis Paris ?",
    a: "Tout à fait. Notre centre d'Épinay-sur-Seine est à moins de 20 minutes du centre de Paris en RER C, ce qui en fait une option pratique pour les habitants de Paris et de la petite couronne (92, 93, 95).",
  },
  {
    q: "Quelles formations proposez-vous à Épinay-sur-Seine et à Creil ?",
    a: "Le stage de récupération de points, l'auto-école (permis B accompagné ANTS), la formation SSIAP, ainsi que les formations VTC et Taxi (initiale, continue et passerelles) sont proposés sur nos deux centres. Le CACES (toutes catégories) est proposé uniquement à Épinay-sur-Seine.",
  },
  {
    q: "Le centre est-il accessible en transport en commun depuis la région parisienne ?",
    a: "Oui, le centre d'Épinay-sur-Seine est desservi par le RER C (gare d'Épinay-sur-Seine) et les bus 154 et 239, avec un stationnement sur place pour les personnes venant en voiture depuis le 92, le 93 ou le 95.",
  },
];

const CATEGORIES = [
  { key: "CACES", label: "CACES", icon: Truck, desc: "Toutes catégories - chariots, nacelles, grues" },
  { key: "PERMIS", label: "Récup. Permis", icon: IdentificationCard, desc: "Stages agréés 2 jours" },
  { key: "AUTO_ECOLE", label: "Auto-école", icon: Car, desc: "Permis B accompagné ANTS" },
  { key: "SSIAP", label: "SSIAP 1/2/3", icon: FireSimple, desc: "Sécurité incendie" },
  { key: "VTC_TAXI", label: "VTC / Taxi", icon: Car, desc: "Examen + carte pro" },
  { key: "ECSR", label: "ECSR", icon: GraduationCap, desc: "Enseignant de la conduite" },
  { key: "VENTE", label: "Conseiller de Vente", icon: Storefront, desc: "Titre pro RNCP37098 en alternance" },
];

const CATEGORY_LABELS_HOME = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

// Menus déroulants navbar : chaque entrée est reliée par son titre exact en
// base (voir /api/formations) à l'inscription pré-remplie correspondante.
const NAV_VTC = ["Formation VTC 93 & 60", "Formation VTC en Ligne", "Formation Continue VTC", "Formation Passerelle Taxi → VTC"];
const NAV_TAXI = ["Formation Taxi 93 & 60", "Formation Continue Taxi", "Formation Passerelle VTC vers Taxi", "Formation Mobilité Taxi Banlieue (60-93)", "Passerelle Taxi Banlieue vers Parisien"];

// Entrées de menu qui pointent vers une landing page dédiée plutôt que vers
// une fiche formation en base (pas toujours présentes/à jour côté base).
const NAV_ROUTE_OVERRIDES = {
  "Formation VTC 93 & 60": "/formation-vtc",
  "Formation Taxi 93 & 60": "/formation-taxi",
  "Formation Mobilité Taxi Banlieue (60-93)": "/mobilite-taxi",
  "Passerelle Taxi Banlieue vers Parisien": "/passerelle-taxi-banlieue-parisien",
};

const PARTENAIRES = ["Uber", "Bolt", "FreeNow", "Heetch", "Marcel", "LeCab"];

const WHY_US = [
  {
    title: "Centre agréé Qualiopi",
    desc: "Des programmes de formation complets conçus par des experts du transport de personnes, avec un taux de réussite supérieur à 95%.",
  },
  {
    title: "Méthodes modernes",
    desc: "Un suivi personnalisé et un accompagnement administratif pour lancer votre activité professionnelle en toute confiance.",
  },
  {
    title: "Formateurs certifiés",
    desc: "Des formateurs qualifiés, agréés par la Préfecture, avec une véritable expérience de terrain dans le transport de personnes.",
  },
  {
    title: "Accompagnement ANTS",
    desc: "Un suivi de votre dossier ANTS de A à Z, jusqu'à l'obtention de votre carte professionnelle VTC ou Taxi.",
  },
];

// Triple chevron ">>>" — signature visuelle des cartes "Pourquoi nous choisir".
const TripleChevron = () => (
  <div className="flex -space-x-3 shrink-0" aria-hidden="true">
    <CaretRight size={22} weight="bold" className="text-[#d4af37]" />
    <CaretRight size={22} weight="bold" className="text-[#d4af37]" />
    <CaretRight size={22} weight="bold" className="text-[#d4af37]" />
  </div>
);

const WHY_CARD_CLIP = { clipPath: "polygon(0 0, calc(100% - 28px) 0, 100% 50%, calc(100% - 28px) 100%, 0 100%)" };

const INFO_NAVY = "#12224a";
const INFO_ORANGE = "#f5a623";

const INFOS_PRATIQUES = [
  {
    icon: Certificate,
    title: "Intitulé",
    text: "Titre professionnel Conseiller de vente — RNCP37098 - Niveau 4, délivré par le Ministère chargé de l'emploi.",
  },
  {
    icon: UsersThree,
    title: "Public visé",
    text: "Jeunes souhaitant se former en apprentissage, demandeurs d'emploi, salariés, personnes en reconversion ou toute personne souhaitant exercer dans la vente, le commerce et la relation client.",
  },
  {
    icon: ClipboardText,
    title: "Prérequis",
    text: "Maîtrise de base du français écrit et oral, intérêt pour la relation client, capacité à travailler en équipe, projet professionnel validé par entretien et test de positionnement.",
  },
  {
    icon: Target,
    title: "Objectifs",
    text: "Accueillir, conseiller et vendre en environnement omnicanal ; contribuer à la tenue et à l'animation de l'unité marchande ; améliorer l'expérience client ; préparer et valider le titre professionnel Conseiller de vente.",
  },
  {
    icon: CalendarBlank,
    title: "Durée et rythme",
    text: "Parcours indicatif : 6 mois en alternance, avec 1 jour par semaine en centre et 4 jours en entreprise. La durée peut être adaptée selon le positionnement initial.",
  },
  {
    icon: DoorOpen,
    title: "Modalités d'accès",
    text: "Dossier de candidature, entretien individuel, test de positionnement, vérification du projet professionnel et recherche/validation d'une entreprise d'accueil.",
  },
  {
    icon: Clock,
    title: "Délais d'accès",
    text: "Inscription possible selon calendrier des sessions, sous réserve d'un dossier complet, de la signature du contrat d'apprentissage et des places disponibles.",
  },
  {
    icon: PiggyBank,
    title: "Tarifs / Financement",
    text: "Formation finançable dans le cadre du contrat d'apprentissage par l'OPCO de l'entreprise selon les règles en vigueur. Autres financements possibles selon le statut du candidat.",
  },
  {
    icon: GraduationCap,
    title: "Méthodes mobilisées",
    text: "Cours en présentiel, supports pédagogiques, mises en situation, cas pratiques, jeux de rôle, exercices professionnels, accompagnement dossier professionnel et suivi en entreprise.",
  },
  {
    icon: NotePencil,
    title: "Évaluation",
    text: "Évaluations formatives, mises en situation, examens blancs, suivi des compétences, dossier professionnel, entretien technique et session d'examen conformément au référentiel du titre.",
  },
  {
    icon: Wheelchair,
    title: "Accessibilité",
    text: "Formation accessible aux personnes en situation de handicap après étude des besoins. Contact référent handicap disponible sur simple demande.",
  },
  {
    icon: Phone,
    title: "Contact",
    text: "TDL Formation\n01 80 90 72 49\ncontact@tdl-formation.fr\n59 Av. Joffre, 93800 Épinay-sur-Seine",
  },
];

const InfoCard = ({ item, colDelay }) => {
  const Icon = item.icon;
  return (
    <div
      data-reveal
      className={`reveal-left reveal-delay-${colDelay} group bg-white rounded-xl border border-gray-100 shadow-sm p-6 transition-all hover:-translate-y-1 hover:shadow-xl`}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
        style={{ backgroundColor: `${INFO_ORANGE}1a` }}
      >
        <Icon size={26} weight="bold" style={{ color: INFO_NAVY }} />
      </div>
      <h3
        className="font-display font-extrabold text-base tracking-tight uppercase mb-2 transition-colors group-hover:text-[#f5a623]"
        style={{ color: INFO_NAVY }}
      >
        {item.title}
      </h3>
      <span
        className="block h-[3px] w-8 rounded-full mb-3 transition-all duration-300 group-hover:w-14"
        style={{ backgroundColor: INFO_ORANGE }}
      />
      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{item.text}</p>
    </div>
  );
};

const WhyCard = ({ item, delay }) => (
  <div
    data-reveal
    className={`reveal reveal-delay-${delay} bg-white text-black p-6 pr-10 hover:-translate-y-1 transition-transform`}
    style={WHY_CARD_CLIP}
  >
    <div className="flex items-start gap-4">
      <TripleChevron />
      <div>
        <h3 className="font-display font-bold text-lg mb-1">{item.title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
      </div>
    </div>
  </div>
);

// Validation basique du formulaire de contact : téléphone français (avec ou
// sans +33, espaces/points/tirets tolérés) et email — pour éviter les
// demandes avec un numéro incomplet (chiffre oublié) impossibles à rappeler.
const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function Landing() {
  const [formations, setFormations] = useState([]);
  const [catalogueFilter, setCatalogueFilter] = useState(null);

  const [contactForm, setContactForm] = useState({ prenom: "", nom: "", email: "", telephone: "", message: "" });
  const [contactPrivacyConsent, setContactPrivacyConsent] = useState(false);
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState(null); // "vtc" | "taxi" | null
  const revealRef = useReveal();

  useEffect(() => {
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data));
    setPageMeta({
      title: "TDL Formation — CACES, Permis, Auto-école, SSIAP, VTC/Taxi",
      description: "Centre agréé Qualiopi à Épinay-sur-Seine (93) et Creil (60) : CACES, récupération de points, auto-école, SSIAP, VTC/Taxi.",
      path: "/",
    });
  }, []);

  const byTitle = (title) => formations.find((f) => f.title === title);
  // Auto-école retiré de la navbar pour l'instant (à réactiver plus tard) :
  // const autoEcole = byTitle("Permis B - Forfait complet");
  const conseillerVente = byTitle("Titre Professionnel Conseiller de Vente");

  const submitContact = async (e) => {
    e.preventDefault();
    if (!contactPrivacyConsent) {
      return toast.error("Merci d'accepter l'utilisation de vos données pour continuer");
    }
    if (!contactForm.prenom.trim() || !contactForm.nom.trim() || !contactForm.telephone.trim()) {
      return toast.error("Merci de remplir au moins nom, prénom et téléphone");
    }
    if (!isValidPhone(contactForm.telephone)) {
      return toast.error("Merci de vérifier votre numéro de téléphone (10 chiffres, ex : 06 12 34 56 78)");
    }
    if (contactForm.email.trim() && !EMAIL_RE.test(contactForm.email.trim())) {
      return toast.error("Merci de vérifier le format de votre email");
    }
    setContactSending(true);
    try {
      const eventId = newEventId();
      await api.post("/callback-requests", { ...contactForm, source: "contact_form", page_url: window.location.href, event_id: eventId, ...getFbCookies() });
      setContactSent(true);
      trackLead({ content_name: "contact_form" }, eventId);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setContactSending(false);
    }
  };

  const NavDropdown = ({ label, titles }) => (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 hover:text-[#d4af37] outline-none">
        {label} <CaretDown size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {titles.map((title) => {
          const override = NAV_ROUTE_OVERRIDES[title];
          const f = byTitle(title);
          return (
            <DropdownMenuItem key={title} asChild>
              <Link to={override || (f ? `/formations/${f.id}` : "#formations")} className="text-sm">
                {title}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page" ref={revealRef}>
      {/* Header */}
      <TopBar />
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0" onClick={() => setMobileOpen(false)}>
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <nav className="hidden xl:flex items-center gap-5 text-sm shrink min-w-0 whitespace-nowrap overflow-x-auto">
            <NavDropdown label="Formations VTC" titles={NAV_VTC} />
            <NavDropdown label="Formations Taxi" titles={NAV_TAXI} />
            <Link to="/formation-caces" className="hover:text-[#d4af37]">CACES 93</Link>
            <Link to="/formations?category=ECSR" className="hover:text-[#d4af37]">ECSR</Link>
            <Link to={conseillerVente ? `/formations/${conseillerVente.id}` : "#formations"} className="hover:text-[#d4af37]">Conseiller de Vente</Link>
            <Link to="/formations" className="hover:text-[#d4af37]">Nos formations</Link>
            <Link to="/blog" className="hover:text-[#d4af37]">Blog</Link>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/login" className="hidden xl:block">
              <Button variant="outline" size="sm" data-testid="login-link">Connexion</Button>
            </Link>
            <Link to="/inscription" className="hidden xl:block">
              <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="inscription-cta">
                S'inscrire <ArrowRight size={14} className="ml-1" />
              </Button>
            </Link>
            <button
              className="xl:hidden p-2 text-gray-700"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
              data-testid="mobile-menu-toggle"
            >
              {mobileOpen ? <X size={22} /> : <List size={22} />}
            </button>
          </div>
        </div>

        {/* Panneau mobile */}
        {mobileOpen && (
          <div className="xl:hidden border-t border-gray-200 bg-white max-h-[calc(100vh-4rem)] overflow-y-auto" data-testid="mobile-menu-panel">
            <nav className="px-6 py-4 flex flex-col text-sm">
              <MobileSubMenu
                label="Formations VTC" titles={NAV_VTC} byTitle={byTitle}
                open={mobileSubOpen === "vtc"} onToggle={() => setMobileSubOpen((v) => (v === "vtc" ? null : "vtc"))}
                onNavigate={() => setMobileOpen(false)}
              />
              <MobileSubMenu
                label="Formations Taxi" titles={NAV_TAXI} byTitle={byTitle}
                open={mobileSubOpen === "taxi"} onToggle={() => setMobileSubOpen((v) => (v === "taxi" ? null : "taxi"))}
                onNavigate={() => setMobileOpen(false)}
              />
              <Link to="/formation-caces" className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>
                CACES 93
              </Link>
              <Link to="/formations?category=ECSR" className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>
                ECSR
              </Link>
              <Link to={conseillerVente ? `/formations/${conseillerVente.id}` : "#formations"} className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>
                Conseiller de Vente
              </Link>
              <Link to="/formations" className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>Nos formations</Link>
              <Link to="/blog" className="py-3 border-b border-gray-100" onClick={() => setMobileOpen(false)}>Blog</Link>
              <div className="flex gap-2 pt-4">
                <Link to="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">Connexion</Button>
                </Link>
                <Link to="/inscription" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button size="sm" className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">S'inscrire</Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-start">
          <div className="animate-fade-in-up">
            <p className="overline mb-4">Organisme certifié Qualiopi · Épinay-sur-Seine (93) & Creil (60)</p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
              Formez-vous.<br /><span className="text-[#d4af37]">Lancez-vous.</span>
            </h1>
            <p className="font-display text-xl sm:text-2xl font-bold mt-5 leading-snug">Professionnel, en toute confiance.</p>
            <span className="block h-1 w-16 mt-5 mb-5 bg-[#0a0a0a]" />
            <p className="text-gray-500 max-w-md">
              Formation initiale, continue, passerelle VTC ↔ Taxi, SSIAP, ECSR — inscription en ligne, dossier ANTS
              suivi, paiement sécurisé.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/inscription">
                <Button size="lg" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="hero-cta">
                  Démarrer mon inscription <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
              <a href="#formations">
                <Button size="lg" variant="outline" data-testid="hero-formations">
                  Voir les formations
                </Button>
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-10 max-w-md animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
              <Stat label="Réussite examen VTC" value="97%" accent="#0B7238" />
              <Stat label="Réussite examen Taxi" value="95%" accent="#0B7238" />
              <Stat label="Examens réussis" value="5000+" accent="#d4af37" />
              <Stat label="Formateurs qualifiés" value="15" accent="#d4af37" />
              <Stat label="Inscrits par mois" value="30-40" accent="#0B7238" />
              <Stat label="Taux de satisfaction" value="90%" accent="#0B7238" />
            </div>
          </div>

          <div className="relative">
            <div
              className="relative aspect-[4/3] overflow-hidden bg-black"
              style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%, 0 32%)" }}
            >
              <HeroSlideshow slides={HOME_HERO_SLIDES} />
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 lg:py-24" id="formations">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="overline">Domaines</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-2">Nos spécialités</h2>
          <p className="text-gray-600 max-w-2xl mb-10">
            6 domaines de formation professionnelle agréés, plus la mobilité électrique KAMI STREET.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {CATEGORIES.map((c, idx) => (
              <a
                key={c.key}
                href="#catalogue"
                className="block"
                data-testid={`cat-${c.key}`}
                onClick={() => setCatalogueFilter(c.key)}
              >
                <Card data-reveal className={`reveal reveal-delay-${(idx % 4) + 1} p-4 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg hover:border-[#0a0a0a] transition-all min-w-0 cursor-pointer h-full`}>
                  <c.icon size={24} className="text-[#0a0a0a]" weight="duotone" />
                  <h3 className="font-display font-bold text-sm mt-3 break-words">{c.label}</h3>
                  <p className="text-xs text-gray-500 mt-1 break-words">{c.desc}</p>
                </Card>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Formations grid */}
      <section id="catalogue" className="py-16 lg:py-24 bg-gray-50 border-y border-gray-200 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="overline">Catalogue</p>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-10">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2">
              {catalogueFilter
                ? `Formations ${CATEGORY_LABELS_HOME[catalogueFilter] || catalogueFilter}`
                : "Formations disponibles"}
            </h2>
            {catalogueFilter && (
              <button
                onClick={() => setCatalogueFilter(null)}
                className="text-sm font-medium text-[#d4af37] hover:text-[#b8962f] transition-colors"
                data-testid="clear-catalogue-filter"
              >
                Voir toutes les formations ✕
              </button>
            )}
          </div>
          {(() => {
            const visibleFormations = catalogueFilter
              ? formations.filter((f) => f.category === catalogueFilter)
              : formations;
            if (catalogueFilter && visibleFormations.length === 0) {
              return (
                <p className="text-gray-500 text-sm">
                  Aucune formation {CATEGORY_LABELS_HOME[catalogueFilter] || catalogueFilter} disponible pour le moment —{" "}
                  <Link to="/formations" className="underline hover:text-[#d4af37]">voir tout le catalogue</Link>.
                </p>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleFormations.slice(0, 6).map((f, idx) => (
                  <FormationCard key={f.id} formation={f} revealDelay={(idx % 4) + 1} />
                ))}
              </div>
            );
          })()}
          {formations.length > 6 && (
            <div className="flex justify-center mt-10">
              <Link to={catalogueFilter ? `/formations?category=${catalogueFilter}` : "/formations"}>
                <Button size="lg" variant="outline" data-testid="see-all-formations-btn">
                  Voir toutes nos formations <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Certifications & Partenaires */}
      <section className="py-14 border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10 mb-10">
            <div className="flex items-center bg-white border border-gray-200 rounded-md px-5 py-3 shrink-0">
              <img
                src="/Logo-Qualiopi-150dpi-Avec-Marianne-1.jpg.jpeg"
                alt="Certifié Qualiopi - Processus certifié"
                loading="lazy"
                className="h-20 w-auto"
              />
            </div>
            <p className="text-sm text-gray-500 max-w-xl">
              TDL Formation est certifié Qualiopi au titre des actions de formation, garantissant la qualité de notre
              processus pédagogique. Nos formations VTC/Taxi préparent nos stagiaires à exercer sur toutes les
              plateformes de mobilité.
            </p>
          </div>

          <p className="overline text-center mb-5">Nos stagiaires exercent sur ces plateformes</p>
          <div className="partner-marquee-wrap">
            <style>{`
              .partner-marquee-wrap { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, black 10%, black 90%, transparent); mask-image: linear-gradient(90deg, transparent, black 10%, black 90%, transparent); }
              .partner-marquee { display: flex; width: max-content; animation: partner-scroll 22s linear infinite; }
              .partner-marquee:hover { animation-play-state: paused; }
              @keyframes partner-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
            `}</style>
            <div className="partner-marquee">
              {[...PARTENAIRES, ...PARTENAIRES].map((p, i) => (
                <div
                  key={`${p}-${i}`}
                  className="flex items-center justify-center mx-3 px-8 py-4 bg-white border border-gray-200 rounded-md min-w-[160px]"
                >
                  <span className="font-display font-bold text-lg text-gray-400">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Brochure */}
      <section className="py-16 border-t border-gray-200 bg-[#0a0a0a] text-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="overline" style={{ color: "#d4af37" }}>Restez informé</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-2 mb-3">
              Recevez nos prochaines sessions et le calendrier des examens 2026.
            </h2>
            <p className="text-gray-300 max-w-lg">
              Téléchargez notre brochure avec les dates d'examens VTC et Taxi à venir, pour planifier votre inscription.
            </p>
          </div>
          <div className="flex md:justify-end">
            <a href="/doc/calendrier_examens_2026.pdf" download>
              <Button size="lg" className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="brochure-download">
                <DownloadSimple size={18} className="mr-2" /> Télécharger la brochure
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Pourquoi choisir TDL Formation */}
      <section className="relative bg-[#0a0a0a] text-white overflow-hidden" id="pourquoi">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">
          <div>
            <p className="overline text-[#d4af37] mb-4">Expérimenté & fiable</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] mb-6">
              Pourquoi choisir <span className="text-[#d4af37]">TDL Formation</span> ?
            </h2>
            <p className="text-gray-300 text-lg max-w-xl mb-10 leading-relaxed">
              TDL Formation est le centre de référence pour les formations VTC et Taxi en Île-de-France. Notre
              approche pédagogique personnalisée et nos formateurs expérimentés garantissent votre réussite.
            </p>
            <div className="space-y-4">
              <WhyCard item={WHY_US[0]} delay={1} />
              <div className="grid sm:grid-cols-2 gap-4">
                <WhyCard item={WHY_US[1]} delay={2} />
                <WhyCard item={WHY_US[2]} delay={3} />
              </div>
              <WhyCard item={WHY_US[3]} delay={4} />
            </div>
          </div>

          <div className="relative hidden lg:block" data-reveal>
            <div className="absolute -top-6 left-6 flex gap-2 z-10">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="w-8 h-2 bg-[#d4af37]/60 -skew-x-[20deg]" />
              ))}
            </div>
            <div
              className="aspect-[4/5] w-full overflow-hidden"
              style={{ clipPath: "polygon(12% 0, 100% 0, 100% 100%, 0% 100%)" }}
            >
              <img
                src="/tdl-image/formation-conduite-taxi-vtc-tdl-Grande.jpeg"
                alt="Chauffeur VTC formé par TDL Formation"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        <a
          href="#top"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 flex-col items-center gap-2 text-[#d4af37] text-xs tracking-widest z-10"
        >
          <ArrowUp size={14} />
          <span className="[writing-mode:vertical-rl]">Haut de page</span>
        </a>
      </section>
      {/* France Map */}
      <section className="py-16 lg:py-24 bg-[#f8f9fb] border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="overline">Nos centres</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-10">Où nous trouver</h2>
          <div className="w-full">
            <Suspense fallback={null}>
              <FranceMapSection className="!bg-transparent !shadow-none !border-none" />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Informations pratiques */}
      <section className="py-16 lg:py-24 bg-[#f8f9fb] border-t border-gray-200" id="infos-pratiques">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight uppercase" style={{ color: INFO_NAVY }}>
              Informations pratiques
            </h2>
            <span className="inline-block h-[3px] w-16 rounded-full mt-3 mb-4" style={{ backgroundColor: INFO_ORANGE }} />
            <p className="text-gray-500">Tous les éléments essentiels sur la formation Conseiller de Vente</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {INFOS_PRATIQUES.map((item, idx) => (
              <InfoCard key={item.title} item={item} colDelay={(idx % 3) + 1} />
            ))}
          </div>
          {conseillerVente && (
            <div className="flex justify-center mt-12">
              <Link to={`/formations/${conseillerVente.id}`}>
                <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                  Voir la fiche formation <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Avis Google */}
      <Suspense fallback={null}>
        <GoogleReviewsCarousel />
      </Suspense>

      {/* FAQ locale — Épinay-sur-Seine, région parisienne, Creil */}
      <Kit.FaqGrid items={HOME_FAQ} />
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HOME_FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        })}
      </script>

      {/* Contact */}
      <section className="py-16 lg:py-24 border-t border-gray-200" id="contact">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
          <div>
            <p className="overline">Contact</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-4">Une question ? Écrivez-nous.</h2>
            <p className="text-gray-600 mb-8 max-w-md">
              Notre équipe vous répond sous 24h ouvrées pour vous accompagner dans le choix de votre formation.
            </p>
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <MapPin size={18} className="text-[#d4af37]" /> 59 avenue Joffre, 93800 Épinay-sur-Seine
              </div>
              <div className="flex items-center gap-3">
                <Phone size={18} className="text-[#d4af37]" />
                <a href="tel:+33180907249" className="hover:text-[#d4af37]">01 80 90 72 49</a>
              </div>
              <div className="flex items-center gap-3">
                <EnvelopeSimple size={18} className="text-[#d4af37]" />
                <a href="mailto:contact@tdl-formation.fr" className="hover:text-[#d4af37]">contact@tdl-formation.fr</a>
              </div>
              <p className="text-gray-500 pt-2">Lundi au vendredi 9h-18h · Samedi 10h-17h</p>
            </div>
          </div>

          <Card className="p-6 sm:p-8 border border-gray-200 rounded-md shadow-none">
            {contactSent ? (
              <div className="bg-[#0B7238]/10 border border-[#0B7238] text-[#0B7238] rounded-md px-4 py-3 text-sm">
                Merci, votre message a bien été envoyé. Notre équipe vous recontacte sous 24h ouvrées.
              </div>
            ) : (
              <form onSubmit={submitContact} className="space-y-4" data-testid="contact-form">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Prénom</label>
                    <Input value={contactForm.prenom} onChange={(e) => setContactForm({ ...contactForm, prenom: e.target.value })} required />
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Nom</label>
                    <Input value={contactForm.nom} onChange={(e) => setContactForm({ ...contactForm, nom: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Téléphone</label>
                    <Input type="tel" value={contactForm.telephone} onChange={(e) => setContactForm({ ...contactForm, telephone: e.target.value })} required />
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Email</label>
                    <Input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-1.5 block">Message</label>
                  <Textarea rows={4} value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} placeholder="Votre projet, la formation qui vous intéresse..." />
                </div>
                <PrivacyConsentCheckbox checked={contactPrivacyConsent} onChange={setContactPrivacyConsent} testId="contact-privacy-consent" />
                <Button type="submit" disabled={contactSending || !contactPrivacyConsent} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                  {contactSending ? "Envoi..." : "Envoyer le message"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </section>

      {/* KAMI STREET */}
      <section className="py-16 lg:py-24 bg-black text-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="overline" style={{ color: "#d4af37" }}>
              <Lightning size={12} className="inline mr-1" weight="fill" /> KAMI STREET
            </p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-2 mb-4">
              Mobilité électrique<br />nouvelle génération.
            </h2>
            <p className="text-gray-300 mb-6 max-w-md">
              Vélos & scooters électriques sélectionnés pour la ville. Livraison rapide, SAV inclus.
            </p>
            <a href="https://kamistreet.fr/" target="_blank" rel="noreferrer">
              <Button size="lg" className="bg-[#d4af37] text-black hover:bg-[#b8941f] hover:text-black" data-testid="kami-cta">
                Découvrir la gamme sur kamistreet.fr <ArrowRight size={16} className="ml-2" />
              </Button>
            </a>
          </div>
          <div className="aspect-square bg-[#d4af37]/10 rounded-md flex items-center justify-center border border-white/10">
            <img
              src="https://images.unsplash.com/photo-1597260491619-bab87197869f?w=800"
              alt="KAMI STREET"
              loading="lazy"
              className="w-full h-full object-cover rounded-md"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <SiteFooter />
      <Suspense fallback={null}>
        <ChatWidget />
        <ContactBubble />
      </Suspense>
    </div>
  );
}

function MobileSubMenu({ label, titles, byTitle, open, onToggle, onNavigate }) {
  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        {label}
        <CaretDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pb-2 pl-3 flex flex-col">
          {titles.map((title) => {
            const override = NAV_ROUTE_OVERRIDES[title];
            const f = byTitle(title);
            return (
              <Link
                key={title}
                to={override || (f ? `/formations/${f.id}` : "#formations")}
                className="py-2 text-gray-600 text-sm"
                onClick={onNavigate}
              >
                {title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <Card className="p-5 border border-gray-200 rounded-md shadow-none">
      <div className="w-1 h-6 mb-2 rounded-sm" style={{ background: accent }} />
      <p className="overline">{label}</p>
      <p className="font-display font-bold text-3xl tracking-tight mt-1">{value}</p>
    </Card>
  );
}
