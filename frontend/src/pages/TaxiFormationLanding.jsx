import { useEffect, useRef } from "react";
import { setPageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import GoogleReviewsCarousel from "@/components/GoogleReviewsCarousel";
import SiteFooter from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";
import { trackViewContent } from "@/lib/metaPixel";
import Kit from "@/components/StageLandingPage";
import FormationBookingWidget from "@/components/FormationBookingWidget";
import {
  CaretRight, ShieldCheck, CalendarBlank, Certificate, Taxi,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, FeatureStrip, StepsSection, TrustBar, FaqGrid, GOLD } = Kit;

const FEATURES = [
  { icon: ShieldCheck, label: "Accompagnement administratif" },
  { icon: CalendarBlank, label: "Théorie & pratique" },
  { icon: Taxi, label: "Centre à taille humaine" },
  { icon: Certificate, label: "Ancrage local — Épinay-sur-Seine" },
];

const MODULES = [
  { n: "01", title: "Réglementation T3P", desc: "Cadre du transport public particulier de personnes, obligations et responsabilités professionnelles." },
  { n: "02", title: "Gestion & commerce", desc: "Gestion de l'activité, développement commercial, fidélisation et facturation." },
  { n: "03", title: "Sécurité routière", desc: "Prévention des risques, conduite responsable et sécurité du passager." },
  { n: "04", title: "Réglementation Taxi", desc: "Cadre national et local, équipements obligatoires et connaissance du territoire." },
  { n: "05", title: "Français & anglais", desc: "Communication professionnelle appliquée à l'accueil et à la prise en charge." },
  { n: "06", title: "Préparation pratique", desc: "Conduite, parcours, relation client, équipements, facturation et examen blanc." },
];

const STEPS = [
  { title: "Constituer le dossier", desc: "Vérification des prérequis et accompagnement à l'inscription." },
  { title: "Préparer la théorie", desc: "Réglementation, gestion, sécurité, français et anglais." },
  { title: "Réussir l'admissibilité", desc: "Entraînements réguliers et examens blancs." },
  { title: "Préparer la pratique", desc: "Conduite, parcours, accueil client et facturation." },
  { title: "Carte professionnelle Taxi", desc: "Après la réussite, notre équipe suit votre demande de carte professionnelle (dossier préfectoral) jusqu'à l'obtention." },
];

const FAQ = [
  { q: "Comment devenir chauffeur de taxi ?", a: "Vous devez remplir les conditions réglementaires, réussir l'examen organisé par la CMA puis demander votre carte professionnelle. TDL Formation vous prépare aux épreuves théoriques et pratiques." },
  { q: "La formation Taxi est-elle finançable ?", a: "Plusieurs solutions peuvent être envisagées selon votre situation : CPF, France Travail, employeur ou financement personnel. La prise en charge dépend de votre éligibilité." },
  { q: "Comment se déroule l'examen Taxi ?", a: "L'examen comprend une épreuve théorique d'admissibilité, puis une épreuve pratique d'admission évaluant notamment la conduite, la sécurité, le parcours et la relation client." },
  { q: "Le véhicule est-il fourni pour l'épreuve pratique ?", a: "Les modalités de mise à disposition du véhicule sont précisées avec votre conseiller lors de votre inscription à la préparation pratique." },
  { q: "Où se déroule la formation Taxi dans le 93 et le 60 ?", a: "Nous formons sur deux centres : à Épinay-sur-Seine en Seine-Saint-Denis (93), facilement accessible depuis Paris et le nord francilien, et à Creil dans l'Oise (60)." },
  { q: "La formation est-elle accessible en situation de handicap ?", a: "Oui. Contactez notre référent handicap afin d'étudier vos besoins et les adaptations possibles avant l'entrée en formation." },
];


export default function TaxiFormationLanding() {
  const formRef = useRef(null);
  const revealRef = useReveal();

  useEffect(() => {
    setPageMeta({
      title: "Formation Taxi 93 et 60 — Épinay-sur-Seine & Creil | TDL Formation",
      description: "Formation Taxi initiale et continue dans le 93 (Épinay-sur-Seine) et le 60 (Creil) : préparation examen T3P, accompagnement administratif, financement. Qualiopi.",
      path: "/formation-taxi",
    });
  }, []);

  const scrollToForm = () => {
    trackViewContent({ content_name: "formation_taxi" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-white" data-testid="taxi-landing-page" ref={revealRef}>
      <TopBar />
      <StageNav ctaLabel="Demander un devis" ctaHref="#contact" />

      {/* Hero */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Formation initiale · Seine-Saint-Denis (93) & Oise (60)
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
              Formation <span style={{ color: GOLD }}>Taxi</span><br />dans le 93 et le 60
            </h1>
            <p className="text-gray-500 max-w-md mt-5">
              Préparez votre examen Taxi avec un accompagnement complet, de la théorie à la pratique, à Épinay-sur-Seine (93) ou à Creil (60).
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Button onClick={scrollToForm} style={{ backgroundColor: GOLD }} className="text-black font-bold uppercase text-xs tracking-wide">
                Recevoir le programme <CaretRight size={12} className="ml-1" weight="bold" />
              </Button>
              <a href="#programme">
                <Button variant="outline" className="font-bold uppercase text-xs tracking-wide">Voir le programme</Button>
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden bg-black" style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%, 0 32%)" }}>
              <img src="/tdl-image/formation-taxi-paris-circulation-tdl-Grande.jpeg" alt="Formation Taxi" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
            </div>
          </div>
        </div>
      </section>

      <FeatureStrip items={FEATURES} />

      {/* Programme */}
      <section id="programme" className="py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD }}>Contenu pédagogique</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-10 max-w-xl">
            Un programme pensé pour l'examen et le métier.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {MODULES.map((m) => (
              <div key={m.n} className="bg-white border border-gray-200 rounded-md p-6" data-reveal>
                <span className="font-display text-3xl font-extrabold text-gray-300">{m.n}</span>
                <h3 className="font-bold text-sm mt-2 mb-1">{m.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <StepsSection title="De l'inscription à la carte professionnelle." steps={STEPS} />

      <GoogleReviewsCarousel />

      {/* Contact / devis */}
      <div id="contact" ref={formRef} className="scroll-mt-20">
        <FormationBookingWidget defaultTabKey="TAXI" source="meta_formation_taxi" className="bg-white" />
      </div>

      <TrustBar rating={4.9} totalReviews={705} />
      <FaqGrid items={FAQ} />

      <SiteFooter />
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
