import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowRight, CaretRight, MagnifyingGlass, Question } from "@phosphor-icons/react";
import { CATEGORY_FAQS } from "@/constants/formationFaqs";
import { CATEGORY_LABELS } from "@/constants/formationAssets";
import { useReveal } from "@/hooks/useReveal";
import SiteFooter from "@/components/SiteFooter";
import ChatWidget from "@/components/ChatWidget";

const CATEGORY_ORDER = ["VTC_TAXI", "CACES", "PERMIS", "AUTO_ECOLE", "SSIAP", "ECSR", "VENTE"];

export default function FAQ() {
  const [query, setQuery] = useState("");
  const revealRef = useReveal();

  useEffect(() => {
    document.title = "Questions fréquentes — TDL Formation";
    window.scrollTo(0, 0);
  }, []);

  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => {
      const faqs = (CATEGORY_FAQS[cat] || []).filter(
        (f) => !q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
      );
      return { cat, label: CATEGORY_LABELS[cat] || cat, faqs };
    }).filter((g) => g.faqs.length > 0);
  }, [q]);

  const allFaqsFlat = useMemo(
    () => CATEGORY_ORDER.flatMap((cat) => CATEGORY_FAQS[cat] || []),
    []
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allFaqsFlat.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="min-h-screen bg-white" data-testid="faq-page" ref={revealRef}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <Link to="/formations" className="hover:text-[#d4af37]">Formations</Link>
            <Link to="/blog" className="hover:text-[#d4af37]">Blog</Link>
            <a href="/#contact" className="hover:text-[#d4af37]">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:block">
              <Button variant="outline" size="sm">Connexion</Button>
            </Link>
            <Link to="/inscription">
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
          <span className="text-gray-700">FAQ</span>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-gray-200 grid-bg-noise">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
          <p className="overline mb-3">Aide & réponses</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter leading-[0.95] mb-6">
            Questions <span className="text-[#d4af37]">fréquentes</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mb-8">
            Financement, durée, prérequis, examens... Retrouvez toutes les réponses aux questions les plus posées sur
            nos formations CACES, permis, auto-école, SSIAP, VTC/Taxi, ECSR et Conseiller de Vente.
          </p>
          <div className="relative max-w-md">
            <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une question (ex : CPF, durée, prérequis...)"
              className="pl-10"
              data-testid="faq-search"
            />
          </div>
        </div>
      </section>

      {/* Quick category links */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-4 flex flex-wrap gap-2">
          {CATEGORY_ORDER.map((cat) => (
            <a
              key={cat}
              href={`#${cat}`}
              className="px-4 py-1.5 rounded-full text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:border-[#d4af37] hover:text-[#d4af37] transition-colors"
            >
              {CATEGORY_LABELS[cat] || cat}
            </a>
          ))}
        </div>
      </section>

      {/* Groups */}
      <section className="py-12 lg:py-16">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          {!groups.length && (
            <div className="text-center py-16">
              <Question size={32} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Aucune question ne correspond à votre recherche.</p>
            </div>
          )}

          <div className="space-y-14">
            {groups.map((g) => (
              <div key={g.cat} id={g.cat} data-reveal className="reveal scroll-mt-24">
                <h2 className="font-display text-2xl font-bold tracking-tight mb-1">{g.label}</h2>
                <div className="h-1 w-12 bg-[#d4af37] rounded-full mb-6" />
                <Accordion type="single" collapsible className="w-full">
                  {g.faqs.map((f, i) => (
                    <AccordionItem key={i} value={`${g.cat}-${i}`} data-testid={`faq-${g.cat}-${i}`}>
                      <AccordionTrigger className="text-left font-semibold">{f.q}</AccordionTrigger>
                      <AccordionContent className="text-gray-600 leading-relaxed">{f.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 border-t border-gray-200 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            Vous n'avez pas trouvé votre réponse ?
          </h2>
          <p className="text-gray-600 mb-6">Notre équipe vous répond sous 24h ouvrées.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="/#contact">
              <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Nous contacter</Button>
            </a>
            <a href="tel:+33180907249">
              <Button variant="outline">01 80 90 72 49</Button>
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
      <ChatWidget />
    </div>
  );
}
