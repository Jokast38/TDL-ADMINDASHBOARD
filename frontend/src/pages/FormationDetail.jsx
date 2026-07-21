import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CaretRight, Clock, Users, CheckCircle, DownloadSimple } from "@phosphor-icons/react";
import { heroForCategory, galleryForCategory } from "@/constants/formationAssets";
import { faqsForCategory } from "@/constants/formationFaqs";
import { careerOutlookForCategory, videoForCategory } from "@/constants/careerOutlook";
import FAQSection from "@/components/FAQSection";
import CareerOutlookSection from "@/components/CareerOutlookSection";
import VideoPreview from "@/components/VideoPreview";
import { useReveal } from "@/hooks/useReveal";

const CATEGORY_LABELS = {
  CACES: "CACES",
  PERMIS: "Récupération de points",
  AUTO_ECOLE: "Auto-école",
  SSIAP: "SSIAP",
  VTC_TAXI: "VTC / Taxi",
  ECSR: "ECSR",
  VENTE: "Conseiller de Vente",
};

const CATEGORY_PROGRAM_PDF = {
  VENTE: "/doc/programme_externe_TP_conseiller_de_vente_TDL_Qualiopi_CFA-2.pdf",
};

export default function FormationDetail() {
  const { id } = useParams();
  const [formation, setFormation] = useState(null);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);
  const revealRef = useReveal();

  useEffect(() => {
    setLoading(true);
    api.get("/formations", { params: { active_only: true } }).then(({ data }) => {
      const found = data.find((f) => f.id === id);
      setFormation(found || null);
      if (found) {
        setOthers(data.filter((f) => f.category === found.category && f.id !== found.id).slice(0, 3));
      }
      setLoading(false);
    });
    window.scrollTo(0, 0);
  }, [id]);

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

  return (
    <div className="min-h-screen bg-white" data-testid="formation-detail-page" ref={revealRef}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="outline" size="sm">Connexion</Button></Link>
            <Link to={`/inscription?formation=${f.id}`}>
              <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                S'inscrire <ArrowRight size={14} className="ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-gray-500">
          <Link to="/" className="hover:text-[#d4af37]">Accueil</Link>
          <CaretRight size={10} />
          <Link to="/#formations" className="hover:text-[#d4af37]">Formations</Link>
          <CaretRight size={10} />
          <span className="text-gray-700">{f.title}</span>
        </div>
      </div>

      {/* Hero banner */}
      <section className="relative border-b border-gray-200 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={f.image_url || heroForCategory(f.category)}
            alt={f.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 lg:px-8 py-16 lg:py-24 animate-fade-in-up">
          <Badge className="mb-4 bg-[#d4af37] text-black hover:bg-[#d4af37]">{CATEGORY_LABELS[f.category] || f.category}</Badge>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-white max-w-3xl">
            {f.title}
          </h1>
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
                Cette formation est éligible au CPF, ainsi qu'aux financements France Travail et OPCO selon votre
                situation. Des facilités de paiement sont proposées. Contactez notre équipe pour étudier votre
                éligibilité et le montage de votre dossier de financement.
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
            <Card className="p-6 border border-gray-200 rounded-md shadow-none sticky top-24">
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
                      to={`/formations/${o.id}`}
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

      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-4 items-center justify-between">
          <p className="text-sm text-gray-500">© 2026 TDL Formation · Tous droits réservés.</p>
          <div className="flex items-center gap-4">
            <Link to="/mentions-legales" className="text-xs text-gray-400 hover:text-[#d4af37]">Mentions légales</Link>
            <p className="text-xs text-gray-400 font-mono">contact@tdl-formation.fr</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
