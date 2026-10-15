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
  CaretRight, CalendarBlank, Certificate, Taxi, MapPin,
} from "@phosphor-icons/react";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";

const { TopBar, StageNav, FeatureStrip, StepsSection, TrustBar, FaqGrid, GOLD } = Kit;

const FEATURES = [
  { icon: MapPin, label: "Banlieue → Paris" },
  { icon: CalendarBlank, label: "8 jours · 50h" },
  { icon: Taxi, label: "Formateurs ex-taxis parisiens" },
  { icon: Certificate, label: "Éligible CPF" },
];

const MODULES = [
  { n: "01", title: "Paris par arrondissement", desc: "Étude systématique des 20 arrondissements : rues, monuments, équipements publics, hôpitaux, gares et sites touristiques." },
  { n: "02", title: "Axes & circulation", desc: "Maîtrise des grands axes parisiens, sens de circulation, zones à trafic limité (ZTL) et zones piétonnes." },
  { n: "03", title: "Réglementation parisienne", desc: "Stations officielles, tarification, procédures aéroports, règles de la Préfecture de Police." },
  { n: "04", title: "Préparation à l'examen", desc: "QCM chronométrés, exercices d'itinéraires, mises en situation et examens blancs." },
];

const STEPS = [
  { title: "Vérifier votre éligibilité", desc: "Carte professionnelle taxi de banlieue parisienne en cours de validité." },
  { title: "Suivre la formation", desc: "8 jours intensifs (50h) : géographie, axes, réglementation, examens blancs." },
  { title: "Réussir l'examen", desc: "Épreuve de connaissance de Paris organisée par la Préfecture de Police." },
  { title: "Recevoir votre carte parisienne", desc: "Délivrance sous 2 à 6 semaines après réussite à l'examen." },
];

const FAQ = [
  { q: "Qu'est-ce que la passerelle Taxi Banlieue vers Parisien ?", a: "C'est un dispositif permettant à un chauffeur de taxi de banlieue parisienne de devenir chauffeur de taxi parisien, en passant un examen spécifique de connaissance de Paris." },
  { q: "Quelles sont les épreuves à passer ?", a: "L'examen porte sur la géographie des arrondissements, les grands axes, les monuments et la réglementation spécifique aux taxis parisiens." },
  { q: "Puis-je conserver ma carte de banlieue en parallèle ?", a: "Non. Le passage au statut parisien implique un transfert d'autorisation ; votre conseiller vous accompagne dans cette démarche administrative." },
  { q: "La formation est-elle finançable par le CPF ?", a: "Oui, la formation est éligible au CPF. Un accompagnement administratif est proposé pour constituer votre dossier." },
  { q: "Quel est le délai de délivrance de la carte parisienne ?", a: "Comptez généralement entre 2 et 6 semaines après réussite à l'examen, le temps du traitement par la Préfecture de Police." },
  { q: "Pourquoi passer parisien plutôt que rester en banlieue ?", a: "Le statut parisien offre généralement un potentiel de revenus plus élevé, ce qui permet un retour sur investissement rapide de la formation." },
];


export default function PasserelleTaxiBanlieueLanding() {
  const formRef = useRef(null);
  const revealRef = useReveal();

  useEffect(() => {
    setPageMeta({
      title: "Passerelle Taxi Banlieue vers Parisien — 750 € | TDL Formation",
      description: "Devenez chauffeur de taxi parisien grâce à la passerelle Taxi Banlieue vers Parisien : 8 jours de formation intensive, éligible CPF, centre agréé Qualiopi.",
      path: "/passerelle-taxi-banlieue-parisien",
    });
  }, []);

  const scrollToForm = () => {
    trackViewContent({ content_name: "passerelle_taxi_banlieue_parisien" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-white" data-testid="passerelle-taxi-banlieue-landing-page" ref={revealRef}>
      <TopBar />
      <StageNav ctaLabel="Recevoir le programme" ctaHref="#contact" />

      {/* Hero */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: GOLD }}>
              Passerelle · Banlieue → Paris
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[0.95] uppercase">
              Passerelle <span style={{ color: GOLD }}>Taxi Banlieue</span><br />vers Parisien
            </h1>
            <p className="text-gray-500 max-w-md mt-5">
              Vous êtes chauffeur de taxi de banlieue parisienne et souhaitez devenir taxi parisien ? Notre formation intensive de 8 jours vous prépare à l'examen de connaissance de Paris.
            </p>
            <p className="font-display text-3xl font-extrabold mt-5">750 € <span className="text-sm font-normal text-gray-400">TTC · éligible CPF</span></p>
            <div className="flex flex-wrap gap-3 mt-6">
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
              <img src="https://sandybrown-badger-274857.hostingersite.com/wp-content/uploads/2026/06/Passerelle-Taxi-Banlieue-Parisienne-–-Accompagnemen-Grande.jpeg" alt="Passerelle Taxi Banlieue vers Parisien" className="w-full h-full object-cover" />
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
            4 modules pour maîtriser Paris.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
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

      <section className="py-4">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="relative aspect-[21/9] overflow-hidden rounded-md bg-black">
            <img src="https://sandybrown-badger-274857.hostingersite.com/wp-content/uploads/2026/06/Passerelle-Taxi-Banlieue-Parisienne-Conduite-pratique-Grande.jpeg" alt="Conduite pratique - Passerelle Taxi Banlieue vers Parisien" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      <StepsSection title="De la banlieue à Paris, étape par étape." steps={STEPS} />

      <GoogleReviewsCarousel />

      {/* Contact / devis */}
      <div id="contact" ref={formRef} className="scroll-mt-20">
        <FormationBookingWidget defaultTabKey="TAXI" source="meta_passerelle_taxi_banlieue" className="bg-white" />
      </div>

      <TrustBar rating={4.9} totalReviews={705} />
      <FaqGrid items={FAQ} />

      <SiteFooter />
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
