import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Kit from "@/components/StageLandingPage";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowRight, CaretRight, Clock, Users, CheckCircle, DownloadSimple,
  CurrencyEur, CalendarBlank, UsersThree,
} from "@phosphor-icons/react";
import { heroForCategory, galleryForCategory, CATEGORY_LABELS } from "@/constants/formationAssets";
import { faqsForCategory } from "@/constants/formationFaqs";
import { careerOutlookForCategory, videoForCategory } from "@/constants/careerOutlook";
import FAQSection from "@/components/FAQSection";
import CareerOutlookSection from "@/components/CareerOutlookSection";
import VideoPreview from "@/components/VideoPreview";
import SiteFooter from "@/components/SiteFooter";
import ChatWidget from "@/components/ChatWidget";
import ContactBubble from "@/components/ContactBubble";
import { useReveal } from "@/hooks/useReveal";
import { setPageMeta } from "@/lib/seo";
import UpcomingSessionsSection from "@/components/UpcomingSessions";
import GoogleCentersMap from "@/components/GoogleCentersMap";
import PricingTable from "@/components/PricingTable";
import SideRail from "@/components/SideRail";

const { TopBar, StageNav, GOLD } = Kit;

const CATEGORY_PROGRAM_PDF = {
  VENTE: "/doc/programme_externe_TP_conseiller_de_vente_TDL_Qualiopi_CFA-2.pdf",
};

export default function FormationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formation, setFormation] = useState(null);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);
  const revealRef = useReveal();

  useEffect(() => {
    setLoading(true);
    api.get("/formations", { params: { active_only: true } }).then(({ data }) => {
      // Accepte aussi bien le slug lisible (/formations/caces-r489) que
      // l'ancien identifiant UUID — les liens déjà partagés/indexés avec
      // l'UUID continuent de fonctionner, mais sont redirigés vers l'URL
      // canonique en slug dès qu'on connaît sa formation.
      const found = data.find((f) => f.slug === id) || data.find((f) => f.id === id);
      setFormation(found || null);
      if (found) {
        if (found.slug && found.slug !== id) {
          navigate(`/formations/${found.slug}`, { replace: true });
          return;
        }
        setOthers(data.filter((f) => f.category === found.category && f.id !== found.id).slice(0, 3));
        setPageMeta({
          title: `${found.title} — TDL Formation`,
          description: (found.description || "").slice(0, 155) || `${found.title} — formation professionnelle chez TDL Formation, Épinay-sur-Seine (93) et Creil (60).`,
          path: `/formations/${found.slug || found.id}`,
        });
      }
      setLoading(false);
    });
    window.scrollTo(0, 0);
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (!formation) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Formation introuvable.</p>
        <Link to="/"><Button variant="outline">Retour à l'accueil</Button></Link>
      </div>
    );
  }

  const f = formation;
  const gallery = galleryForCategory(f.category);
  const facts = [
    f.duration_hours > 0 && { icon: Clock, label: "Durée", value: `${f.duration_hours} heures` },
    { icon: CurrencyEur, label: "Tarif", value: f.price > 0 ? `${f.price.toLocaleString("fr-FR")} € TTC` : "Sur devis" },
    f.sessions_per_month > 0 && { icon: CalendarBlank, label: "Sessions", value: `${f.sessions_per_month} par mois` },
    { icon: UsersThree, label: "Format", value: "Présentiel" },
    { icon: CheckCircle, label: "Centres", value: "93 & 60" },
  ].filter(Boolean);
  const courseJsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: f.title,
    description: f.description || f.title,
    provider: { "@type": "EducationalOrganization", name: "TDL Formation", sameAs: "https://www.tdl-formation.fr" },
    ...(f.price > 0 && {
      offers: { "@type": "Offer", price: f.price, priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    }),
  };

  return (
    <div className="min-h-screen bg-white" data-testid="formation-detail-page" ref={revealRef}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }} />
      {/* Header */}
      <TopBar />
      <StageNav ctaLabel="S'inscrire" ctaHref="#inscription" />
      <SideRail centresHref="#centres-formation" contactHref="#inscription" />

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-gray-500">
          <Link to="/" className="hover:text-[#d4af37]">Accueil</Link>
          <CaretRight size={10} />
          <Link to="/formations" className="hover:text-[#d4af37]">Formations</Link>
          <CaretRight size={10} />
          <span className="text-gray-700">{f.title}</span>
        </div>
      </div>

      {/* Hero banner — même traitement que la landing VTC : fond noir avec
          l'image de la formation en arrière-plan plein format, dynamique par
          catégorie (f.image_url en priorité, sinon l'image par défaut de la
          catégorie), avec les infos clés de la formation en pastilles. */}
      <section className="relative bg-black text-white overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <img
            src={f.image_url || heroForCategory(f.category)}
            alt=""
            className="w-full h-full object-cover opacity-40 scale-105"
            loading="eager"
            fetchpriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/35" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
          <span className="inline-block rounded-md px-3 py-1 font-display font-extrabold text-xs uppercase" style={{ backgroundColor: GOLD, color: "#0a0a0a" }}>
            {CATEGORY_LABELS[f.category] || f.category}
          </span>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.02] mt-4 max-w-3xl">
            {f.title}
          </h1>
          {f.description && (
            <p className="text-gray-300 max-w-2xl mt-5 line-clamp-3">{f.description}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-8">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-white/15 bg-white/5 backdrop-blur-sm">
                <fact.icon size={18} weight="bold" style={{ color: GOLD }} />
                <div className="leading-tight">
                  <small className="block text-[10px] uppercase tracking-wide text-gray-400">{fact.label}</small>
                  <b className="text-sm">{fact.value}</b>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-8">
            <a href="#inscription">
              <Button style={{ backgroundColor: GOLD }} className="text-black font-bold uppercase text-xs tracking-wide">
                Je m'inscris <CaretRight size={12} className="ml-1" weight="bold" />
              </Button>
            </a>
            <a href="#tarifs-formation">
              <Button variant="outline" className="font-bold uppercase text-xs tracking-wide border-white text-white hover:bg-white hover:text-black">
                Voir les tarifs
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Article */}
      <article className="max-w-5xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <div className="prose-formation">
              <p className="text-gray-700 text-lg leading-relaxed whitespace-pre-line">{f.description || "Description à venir."}</p>
            </div>

            {videoForCategory(f.category) && (
              <div className="mt-8">
                <VideoPreview {...videoForCategory(f.category)} />
              </div>
            )}

            <div className="mt-10 pt-8 border-t border-gray-200">
              <h2 className="font-display text-xl font-bold mb-4">Financement</h2>
              <p className="text-gray-600 text-sm leading-relaxed">
                {f.cpf_eligible
                  ? "Cette formation est éligible au CPF, ainsi qu'aux financements France Travail et OPCO selon votre situation. Des facilités de paiement sont proposées. Contactez notre équipe pour étudier votre éligibilité et le montage de votre dossier de financement."
                  : "Cette formation n'est pas éligible au CPF. Elle reste finançable via France Travail, votre employeur/OPCO ou à titre personnel selon votre situation. Des facilités de paiement sont proposées. Contactez notre équipe pour étudier votre éligibilité et le montage de votre dossier de financement."}
              </p>
            </div>

            <div className="mt-10 pt-8 border-t border-gray-200">
              <h2 className="font-display text-xl font-bold mb-4">Modalités</h2>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2"><CheckCircle size={16} className="text-[#0B7238] mt-0.5 shrink-0" weight="fill" /> Centres d'Épinay-sur-Seine (93) et Creil (60)</li>
                <li className="flex items-start gap-2"><CheckCircle size={16} className="text-[#0B7238] mt-0.5 shrink-0" weight="fill" /> Formateurs qualifiés et agréés par la Préfecture</li>
                <li className="flex items-start gap-2"><CheckCircle size={16} className="text-[#0B7238] mt-0.5 shrink-0" weight="fill" /> Accompagnement jusqu'à l'obtention de la carte professionnelle</li>
                <li className="flex items-start gap-2"><CheckCircle size={16} className="text-[#0B7238] mt-0.5 shrink-0" weight="fill" /> Dossier ANTS suivi par notre équipe</li>
              </ul>
            </div>

            <div className="mt-10 pt-8 border-t border-gray-200" id="tarifs-formation">
              <PricingTable formation={f} others={others} ctaHref="#inscription" />
            </div>

            <div className="mt-10 pt-8 border-t border-gray-200" id="dates-formation" data-reveal>
              <UpcomingSessionsSection formationId={f.id} />
            </div>

            <div className="mt-10 pt-8 border-t border-gray-200" id="centres-formation" data-reveal>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#8A6400" }}>Où se former</p>
              <h2 className="font-display text-xl font-bold mb-4">Nos centres</h2>
              <GoogleCentersMap centreIds={["epinay", "creil"]} />
            </div>

            {gallery.length > 0 && (
              <div className="mt-10 pt-8 border-t border-gray-200">
                <h2 className="font-display text-xl font-bold mb-4">Projetez-vous</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {gallery.map((src, i) => (
                    <div
                      key={src}
                      data-reveal
                      className={`reveal reveal-delay-${(i % 4) + 1} aspect-square bg-gray-100 rounded-md overflow-hidden`}
                    >
                      <img
                        src={src}
                        alt={`${f.title} — illustration ${i + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <CareerOutlookSection outlook={careerOutlookForCategory(f.category)} />

            <FAQSection faqs={faqsForCategory(f.category)} title="Questions fréquentes sur cette formation" />
          </div>

          {/* Sidebar */}
          <div>
            <Card id="inscription" className="p-6 border border-gray-200 rounded-md shadow-none sticky top-24">
              <p className="font-display text-3xl font-bold mb-1">
                {f.price > 0 ? `${f.price.toLocaleString("fr-FR")}€` : "Sur devis"}
              </p>
              <p className="text-xs text-gray-400 mb-5">
                {f.price > 0 ? "TTC, financements possibles" : "Contactez-nous pour un devis personnalisé"}
              </p>

              {f.duration_hours > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                  <Clock size={16} className="text-[#d4af37]" /> {f.duration_hours} heures de formation
                </div>
              )}
              {f.sessions_per_month > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-5">
                  <Users size={16} className="text-[#d4af37]" /> {f.sessions_per_month} session(s) / mois
                </div>
              )}

              <Link to={`/inscription?formation=${f.id}`} className="block">
                <Button className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="detail-inscription-cta">
                  Je m'inscris <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
              <a href="tel:+33180907249" className="block mt-2">
                <Button variant="outline" className="w-full">01 80 90 72 49</Button>
              </a>
              {CATEGORY_PROGRAM_PDF[f.category] && (
                <a
                  href={CATEGORY_PROGRAM_PDF[f.category]}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="block mt-2"
                  data-testid="download-program-btn"
                >
                  <Button variant="outline" className="w-full border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37]/10 hover:text-[#d4af37]">
                    <DownloadSimple size={16} className="mr-2" /> Télécharger le programme
                  </Button>
                </a>
              )}
            </Card>

            {others.length > 0 && (
              <div className="mt-8">
                <p className="overline mb-3">Voir aussi</p>
                <div className="space-y-2">
                  {others.map((o) => (
                    <Link
                      key={o.id}
                      to={`/formations/${o.slug || o.id}`}
                      className="block p-3 border border-gray-200 rounded-md hover:border-[#d4af37] text-sm"
                    >
                      {o.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </article>

      <SiteFooter />
      <ChatWidget />
      <ContactBubble />
    </div>
  );
}
