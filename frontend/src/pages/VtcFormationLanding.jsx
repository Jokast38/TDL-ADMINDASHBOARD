import { useEffect, useRef, useState } from "react";
import { setPageMeta } from "@/lib/seo";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import SiteFooter from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";
import { trackLead, trackViewContent, newEventId, getFbCookies } from "@/lib/metaPixel";
import Kit from "@/components/StageLandingPage";
import GoogleCentersMap from "@/components/GoogleCentersMap";
import SideRail from "@/components/SideRail";
import UpcomingSessionsSection, { useUpcomingSessions, sessionLabel } from "@/components/UpcomingSessions";
import PricingTable from "@/components/PricingTable";
import FormationBookingWidget from "@/components/FormationBookingWidget";
import { galleryForCategory } from "@/constants/formationAssets";
import {
  CaretRight, ShieldCheck, CalendarBlank, Certificate, Car, ChatCircleText,
  Clock, CurrencyEur, UsersThree, CheckCircle,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, FeatureStrip, StepsSection, TrustBar, FaqGrid, ModulesAccordion, AccessConditions, StickyToc, StickyPriceCard, GOLD } = Kit;

const ACCESS_CONDITIONS = [
  "Permis B depuis plus de 3 ans (2 ans en cas de conduite accompagnée)",
  "Casier judiciaire compatible avec l'exercice de la profession",
  "Bonne compréhension du français écrit et oral",
  "Aptitude physique à la conduite professionnelle",
];

const ACCESS_DOCUMENTS = [
  "Pièce d'identité ou titre de séjour en cours de validité",
  "Justificatif de domicile de moins de 3 mois",
  "Copie recto-verso du permis de conduire",
  "Photo d'identité récente",
  "Relevé d'information intégral (preuve du permis B depuis 3 ans)",
];

const TOC_SECTIONS = [
  { id: "conditions", label: "Conditions d'accès" },
  { id: "tarifs", label: "Les prix" },
  { id: "dates", label: "Dates et centres" },
  { id: "centres", label: "Nos centres" },
  { id: "galerie", label: "Projetez-vous" },
  { id: "contact", label: "Votre projet" },
  { id: "programme", label: "Programme" },
];

const GALLERY = galleryForCategory("VTC_TAXI");

const FEATURES = [
  { icon: ShieldCheck, label: "Accompagnement administratif" },
  { icon: CalendarBlank, label: "Théorie & pratique" },
  { icon: Car, label: "Centre à taille humaine" },
  { icon: Certificate, label: "Épinay-sur-Seine (93) & Creil (60)" },
];

const FACTS = [
  { icon: Clock, label: "Durée", value: "50 heures" },
  { icon: CurrencyEur, label: "Tarif", value: "1 490 € TTC" },
  { icon: CalendarBlank, label: "Sessions", value: "2 par mois" },
  { icon: UsersThree, label: "Format", value: "Présentiel" },
  { icon: CheckCircle, label: "Centres", value: "93 & 60" },
];

const NEXT_SESSION_LABEL = "Prochaine session à Épinay-sur-Seine (93)";

const MODULES = [
  { n: "01", title: "Réglementation T3P", desc: "Cadre du transport public particulier de personnes, statut du chauffeur VTC, obligations et responsabilités." },
  { n: "02", title: "Gestion & développement", desc: "Gestion de l'activité, relation avec les plateformes, développement commercial et facturation." },
  { n: "03", title: "Sécurité routière", desc: "Prévention des risques, conduite responsable et sécurité du passager." },
  { n: "04", title: "Anglais professionnel", desc: "Communication appliquée à l'accueil et à la prise en charge d'une clientèle internationale." },
  { n: "05", title: "Français & relation client", desc: "Expression écrite et orale, posture professionnelle et gestion des situations délicates." },
  { n: "06", title: "Préparation pratique", desc: "Conduite, parcours, prise en charge client, équipements du véhicule et examen blanc." },
];

const STEPS = [
  { title: "Constituer le dossier", desc: "Vérification des prérequis et accompagnement à l'inscription." },
  { title: "Préparer la théorie", desc: "Réglementation, gestion, sécurité, français et anglais." },
  { title: "Réussir l'admissibilité", desc: "Entraînements réguliers et examens blancs jusqu'à l'examen officiel." },
  { title: "Préparer la pratique", desc: "Conduite, parcours, accueil client et facturation." },
  { title: "Carte VTC", desc: "Après la réussite, notre équipe suit votre demande de carte professionnelle VTC (dossier ANTS) jusqu'à l'obtention." },
];

const FAQ = [
  { q: "Comment devenir chauffeur VTC ?", a: "Vous devez remplir les conditions réglementaires (permis B, casier judiciaire vierge, visite médicale...), réussir l'examen VTC organisé par un organisme agréé, puis obtenir votre carte professionnelle VTC. TDL Formation vous prépare aux épreuves théoriques et pratiques." },
  { q: "La formation VTC est-elle finançable ?", a: "Plusieurs solutions peuvent être envisagées selon votre situation : CPF, France Travail, employeur ou financement personnel. La prise en charge dépend de votre éligibilité." },
  { q: "Combien de temps dure la formation VTC ?", a: "La durée varie selon votre profil et le format choisi (initiale ou passerelle Taxi vers VTC) — le calendrier détaillé vous est communiqué avec le programme de la session." },
  { q: "Quelle différence entre VTC et Taxi ?", a: "Le VTC réserve via une plateforme ou une réservation préalable, sans maraude ni station. TDL Formation propose aussi la formation Taxi et les passerelles entre les deux statuts." },
  { q: "Où se déroule la formation VTC dans le 93 et le 60 ?", a: "Nous formons sur deux centres : à Épinay-sur-Seine en Seine-Saint-Denis (93), facilement accessible depuis Paris et le nord francilien, et à Creil dans l'Oise (60)." },
  { q: "La formation est-elle accessible en situation de handicap ?", a: "Oui. Contactez notre référent handicap afin d'étudier vos besoins et les adaptations possibles avant l'entrée en formation." },
];

const FORMATIONS = ["Formation VTC initiale", "Formation continue VTC", "Passerelle Taxi vers VTC", "Formation VTC en ligne"];

const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function VtcFormationLanding() {
  const [heroForm, setHeroForm] = useState({ prenom: "", telephone: "" });
  const [heroSending, setHeroSending] = useState(false);
  const [heroSent, setHeroSent] = useState(false);
  const [formationId, setFormationId] = useState(null);
  const [formation, setFormation] = useState(null);
  const [siblingFormations, setSiblingFormations] = useState([]);
  const formRef = useRef(null);
  const revealRef = useReveal();
  const { sessions } = useUpcomingSessions(formationId);
  const nextSession = sessions[0];
  const priceLabel = formation?.price ? `${formation.price.toLocaleString("fr-FR")} €` : "1 490 €";
  const facts = FACTS.map((f) => (f.label === "Tarif" ? { ...f, value: `${priceLabel} TTC` } : f));

  useEffect(() => {
    api.get("/formations", { params: { active_only: true } }).then(({ data }) => {
      const vtcTaxi = (data || []).filter((f) => f.category === "VTC_TAXI");
      const found = vtcTaxi.find((f) => /vtc/i.test(f.title) && !/taxi/i.test(f.title)) || vtcTaxi[0];
      if (found) {
        setFormationId(found.id);
        setFormation(found);
        setSiblingFormations(vtcTaxi);
      }
    }).catch(() => {});
  }, []);

  const submitHero = async (e) => {
    e.preventDefault();
    if (!heroForm.prenom.trim() || !isValidPhone(heroForm.telephone)) {
      return toast.error("Indiquez votre nom et un numéro de téléphone valide.");
    }
    setHeroSending(true);
    try {
      const eventId = newEventId();
      await api.post("/callback-requests", {
        prenom: heroForm.prenom, nom: "", telephone: heroForm.telephone,
        session: FORMATIONS[0], center: "Épinay-sur-Seine (93)", source: "meta_formation_vtc",
        page_url: window.location.href, event_id: eventId, ...getFbCookies(),
      });
      setHeroSent(true);
      trackLead({ content_name: "formation_vtc_hero" }, eventId);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setHeroSending(false);
    }
  };

  useEffect(() => {
    setPageMeta({
      title: "Formation VTC 93 et 60 — Épinay-sur-Seine & Creil | TDL Formation",
      description: "Formation VTC initiale et continue dans le 93 (Épinay-sur-Seine) et le 60 (Creil) : préparation à l'examen, accompagnement administratif, financement. Qualiopi.",
      path: "/formation-vtc",
    });
    // Couverture complète du funnel pour la campagne Meta Ads : la vue de
    // page (content_name dédié, distinct du PageView générique auto-déclenché
    // par AnalyticsLoader) permet à Meta de constituer une audience "vue de la
    // landing VTC" pour le reciblage, en plus du Lead déjà suivi au submit.
    trackViewContent({ content_name: "formation_vtc", content_category: "landing_page" });
  }, []);

  const scrollToForm = () => {
    trackViewContent({ content_name: "formation_vtc" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-white" data-testid="vtc-landing-page" ref={revealRef}>
      <TopBar />
      <StageNav ctaLabel="Demander un devis" ctaHref="#contact" />
      <SideRail centresHref="#centres" brochureHref="/doc/calendrier_examens_2026.pdf" contactHref="#contact" />

      {/* Hero */}
      <section className="relative bg-black text-white overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <img
            src="/tdl-image/formation-conduite-taxi-vtc-tdl-Grande.jpeg"
            alt=""
            className="w-full h-full object-cover opacity-40 scale-105"
            loading="eager"
            fetchpriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/35" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24 flex flex-wrap gap-10 items-center">
          <div className="flex-1 min-w-[320px]">
            <span className="inline-block rounded-md px-3 py-1 font-display font-extrabold text-xs uppercase" style={{ backgroundColor: GOLD, color: "#0a0a0a" }}>
              VTC
            </span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.98] uppercase mt-4">
              Formation VTC
            </h1>
            <p className="font-display text-xl sm:text-2xl font-extrabold mt-1" style={{ color: GOLD }}>
              à Épinay-sur-Seine et Creil
            </p>
            <p className="text-gray-300 max-w-md mt-5">
              Formation intensive pour devenir chauffeur VTC professionnel et obtenir votre carte VTC : suivi pédagogique personnalisé, examens blancs et mises en situation réelles, jusqu'à la carte professionnelle.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              {facts.map((f) => (
                <div key={f.label} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-white/15 bg-white/5 backdrop-blur-sm">
                  <f.icon size={18} weight="bold" style={{ color: GOLD }} />
                  <div className="leading-tight">
                    <small className="block text-[10px] uppercase tracking-wide text-gray-400">{f.label}</small>
                    <b className="text-sm">{f.value}</b>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-8">
              <Button onClick={scrollToForm} style={{ backgroundColor: GOLD }} className="text-black font-bold uppercase text-xs tracking-wide">
                Je m'inscris <CaretRight size={12} className="ml-1" weight="bold" />
              </Button>
              <a href="#programme">
                <Button variant="outline" className="font-bold uppercase text-xs tracking-wide border-white text-white hover:bg-white hover:text-black">
                  Voir le programme
                </Button>
              </a>
            </div>
          </div>

          <div className="w-full sm:w-[340px] bg-white text-black rounded-xl p-6 shadow-2xl border-t-4" style={{ borderTopColor: GOLD }} data-testid="vtc-hero-callback">
            {heroSent ? (
              <div className="text-center py-6">
                <ChatCircleText size={28} className="mx-auto mb-2" style={{ color: GOLD }} weight="fill" />
                <p className="font-bold">C'est noté !</p>
                <p className="text-sm text-gray-500 mt-1">Un conseiller vous rappelle sous 24h ouvrées.</p>
              </div>
            ) : (
              <form onSubmit={submitHero} className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#8A6400" }}>Prochaine session</p>
                <p className="font-display font-extrabold text-lg leading-snug">
                  {nextSession ? `${sessionLabel(nextSession)} — ${nextSession.lieu_ville}` : NEXT_SESSION_LABEL}
                </p>
                <p className="text-xs text-gray-500 -mt-1">
                  <a href="#dates" className="underline font-bold text-black">Voir toutes les dates et centres</a>
                </p>
                <div>
                  <label htmlFor="hero-prenom" className="text-sm font-bold">Nom et prénom</label>
                  <input
                    id="hero-prenom" type="text" autoComplete="name"
                    value={heroForm.prenom} onChange={(e) => setHeroForm((f) => ({ ...f, prenom: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm mt-1"
                  />
                </div>
                <div>
                  <label htmlFor="hero-tel" className="text-sm font-bold">Téléphone</label>
                  <input
                    id="hero-tel" type="tel" autoComplete="tel"
                    value={heroForm.telephone} onChange={(e) => setHeroForm((f) => ({ ...f, telephone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm mt-1"
                  />
                </div>
                <Button type="submit" disabled={heroSending} style={{ backgroundColor: GOLD }} className="w-full text-black font-bold uppercase text-xs tracking-wide py-5 mt-1">
                  {heroSending ? "Envoi..." : "Être rappelé gratuitement"}
                </Button>
                <p className="text-center text-xs text-gray-500">
                  Sans engagement · ou au <a href="tel:+33180907244" className="font-bold text-black">01 80 90 72 44</a>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      <FeatureStrip items={FEATURES} />

      <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-8 lg:items-start">
        <div className="min-w-0">
          <StepsSection title="De l'inscription à la carte professionnelle." steps={STEPS} />

          <AccessConditions conditions={ACCESS_CONDITIONS} documents={ACCESS_DOCUMENTS} />

          {/* Tarifs réels (backend) */}
          {formation && (
            <section id="tarifs" className="py-16 lg:py-20 bg-white scroll-mt-20">
              <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <PricingTable formation={formation} others={siblingFormations} ctaHref="#contact" />
              </div>
            </section>
          )}

          {/* Dates réelles */}
          {formationId && (
            <section id="dates" className="py-16 lg:py-20 bg-white scroll-mt-20">
              <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <UpcomingSessionsSection formationId={formationId} />
              </div>
            </section>
          )}

          {/* Centres */}
          <section id="centres" className="py-16 lg:py-20 bg-gray-50 scroll-mt-20">
            <div className="max-w-7xl mx-auto px-6 lg:px-8">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Où se former</p>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-8 max-w-xl">
                2 centres agréés, au nord de Paris.
              </h2>
              <GoogleCentersMap centreIds={["epinay", "creil"]} />
            </div>
          </section>

          {/* Galerie */}
          {GALLERY.length > 0 && (
            <section id="galerie" className="py-16 lg:py-20 bg-white scroll-mt-20">
              <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>En immersion</p>
                <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-8 max-w-xl">Projetez-vous.</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {GALLERY.map((src, i) => (
                    <div key={src} data-reveal className={`reveal reveal-delay-${(i % 4) + 1} aspect-square bg-gray-100 rounded-md overflow-hidden`}>
                      <img
                        src={src}
                        alt={`Formation VTC — illustration ${i + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="hidden lg:flex lg:flex-col lg:gap-5 lg:sticky lg:top-24 lg:pr-4">
          <StickyPriceCard
            price={`${priceLabel} TTC`}
            priceNote="CPF, France Travail, OPCO, paiement en plusieurs fois"
            facts={facts.slice(0, 4)}
            nextSessionLabel={nextSession ? `${sessionLabel(nextSession)} — ${nextSession.lieu_ville}` : NEXT_SESSION_LABEL}
          />
          <StickyToc sections={TOC_SECTIONS} />
        </div>
      </div>

      <GoogleReviewsCarousel />

      {/* Contact / devis */}
      <div id="contact" ref={formRef} className="scroll-mt-20">
        <FormationBookingWidget formationId={formationId} source="meta_formation_vtc" className="bg-white" />
      </div>

      <ModulesAccordion title="Un programme pensé pour l'examen et le métier." modules={MODULES} />

      <TrustBar rating={4.9} totalReviews={705} />
      <FaqGrid items={FAQ} />

      <SiteFooter />
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
