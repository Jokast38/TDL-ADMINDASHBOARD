import { useEffect, useRef } from "react";
import { setPageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import SiteFooter from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";
import { trackViewContent } from "@/lib/metaPixel";
import Kit from "@/components/StageLandingPage";
import FormationBookingWidget from "@/components/FormationBookingWidget";
import SideRail from "@/components/SideRail";
import {
  CaretRight, ShieldCheck, CalendarBlank, Certificate, Fire,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, FeatureStrip, StepsSection, TrustBar, FaqGrid, GOLD } = Kit;

const FEATURES = [
  { icon: ShieldCheck, label: "Centre agréé Préfecture" },
  { icon: CalendarBlank, label: "Journée ou soirée" },
  { icon: Fire, label: "Théorie & pratique" },
  { icon: Certificate, label: "Certifié Qualiopi" },
];

const LEVELS = [
  { level: "01", name: "SSIAP 1", role: "Agent de sécurité incendie", desc: "Pour débuter dans la prévention incendie, la surveillance des installations et l'assistance aux personnes.", hours: "67 h + examen" },
  { level: "02", name: "SSIAP 2", role: "Chef d'équipe", desc: "Pour encadrer une équipe, organiser les interventions et gérer le poste de sécurité.", hours: "70 h + examen" },
  { level: "03", name: "SSIAP 3", role: "Chef de service", desc: "Pour piloter un service, assurer le suivi réglementaire et conseiller la direction.", hours: "216 h + examen" },
];

const STEPS = [
  { title: "Prérequis vérifiés", desc: "Secourisme à jour, aptitude médicale, diplôme et expérience selon le niveau visé." },
  { title: "Formation", desc: "Cours structurés, manipulation des équipements et mises en situation professionnelles." },
  { title: "Évaluation", desc: "Entraînements intermédiaires pour se préparer aux épreuves réglementaires." },
  { title: "Examen SSIAP", desc: "Épreuve écrite (QCM) et épreuve pratique (ronde avec anomalies et sinistre)." },
];

const FAQ = [
  { q: "Que signifie SSIAP ?", a: "SSIAP signifie Service de sécurité incendie et d'assistance à personnes. Il existe trois niveaux correspondant aux fonctions d'agent, de chef d'équipe et de chef de service." },
  { q: "Quels sont les prérequis du SSIAP 1 ?", a: "Une attestation de secourisme conforme et à jour, une aptitude médicale de moins de trois mois et les conditions réglementaires de compréhension et de retranscription." },
  { q: "Combien de temps dure la formation SSIAP 1 ?", a: "La durée réglementaire minimale est de 67 heures, hors temps d'examen. Le calendrier détaillé est communiqué avec le programme de la session." },
  { q: "Comment se déroule l'examen SSIAP 1 ?", a: "L'examen comprend une épreuve écrite sous forme de QCM et une épreuve pratique. Le diplôme est délivré sous réserve de réussite aux épreuves." },
  { q: "Quelle différence entre recyclage et remise à niveau ?", a: "Le recyclage maintient une qualification encore conforme aux conditions réglementaires. La remise à niveau concerne les personnes ayant dépassé l'échéance." },
  { q: "Comment financer ma formation SSIAP ?", a: "Selon votre situation, un financement peut être étudié avec votre employeur, un OPCO, France Travail ou à titre personnel, selon votre éligibilité." },
  { q: "Où se déroule la formation SSIAP dans le 93 et le 60 ?", a: "Nous formons sur deux centres : à Épinay-sur-Seine en Seine-Saint-Denis (93), et à Creil dans l'Oise (60). Choisissez le centre le plus proche de chez vous lors de votre inscription." },
];


export default function SsiapLanding() {
  const formRef = useRef(null);
  const revealRef = useReveal();

  useEffect(() => {
    setPageMeta({
      title: "Formation SSIAP 93 et 60 — Épinay-sur-Seine & Creil | TDL Formation",
      description: "Formations SSIAP 1, 2 et 3 dans le 93 (Épinay-sur-Seine) et le 60 (Creil) : prérequis, programme, examen, financement. Centre agréé Qualiopi.",
      path: "/formation-ssiap",
    });
  }, []);

  const scrollToForm = () => {
    trackViewContent({ content_name: "formation_ssiap" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-white" data-testid="ssiap-landing-page" ref={revealRef}>
      <TopBar />
      <SideRail centresHref="#programme" brochureHref="/doc/calendrier_examens_2026.pdf" contactHref="#contact" />
      <StageNav ctaLabel="Demander un devis" ctaHref="#contact" />

      {/* Hero */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Sécurité incendie · Seine-Saint-Denis (93) & Oise (60)
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
              Formation <span style={{ color: GOLD }}>SSIAP</span><br />dans le 93 et le 60
            </h1>
            <p className="text-gray-500 max-w-md mt-5">
              Préparez votre diplôme SSIAP 1, 2 ou 3 avec une formation concrète, encadrée et orientée vers l'emploi, à Épinay-sur-Seine (93) ou à Creil (60).
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Button onClick={scrollToForm} style={{ backgroundColor: GOLD }} className="text-black font-bold uppercase text-xs tracking-wide">
                Demander un devis <CaretRight size={12} className="ml-1" weight="bold" />
              </Button>
              <a href="#programme">
                <Button variant="outline" className="font-bold uppercase text-xs tracking-wide">Voir le programme</Button>
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden bg-black" style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%, 0 32%)" }}>
              <img src="/tdl-image/banniere-formation-ssiap-inspection-equipement-incendie-Moyenne.jpeg" alt="Formation SSIAP" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
            </div>
          </div>
        </div>
      </section>

      <FeatureStrip items={FEATURES} />

      {/* Niveaux */}
      <section id="programme" className="py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Trouvez votre parcours</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-10 max-w-xl">
            SSIAP 1, 2 ou 3 : quelle formation choisir ?
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {LEVELS.map((l) => (
              <div key={l.name} className="bg-white border border-gray-200 rounded-md p-6" data-reveal>
                <span className="font-display text-3xl font-extrabold text-gray-300">{l.level}</span>
                <h3 className="font-display text-xl font-bold mt-2">{l.name}</h3>
                <p className="text-sm font-semibold text-gray-600">{l.role}</p>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">{l.desc}</p>
                <p className="text-xs font-bold uppercase tracking-wide mt-4" style={{ color: GOLD }}>{l.hours}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <StepsSection title="Comment se déroule l'examen SSIAP ?" steps={STEPS} />

      <GoogleReviewsCarousel />

      {/* Contact / devis */}
      <div id="contact" ref={formRef} className="scroll-mt-20">
        <FormationBookingWidget defaultTabKey="SSIAP" source="meta_formation_ssiap" className="bg-white" />
      </div>

      <TrustBar rating={4.9} totalReviews={705} />
      <FaqGrid items={FAQ} />

      <SiteFooter />
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
