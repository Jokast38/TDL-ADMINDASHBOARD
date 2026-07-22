import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, CaretRight, MagnifyingGlass, GraduationCap } from "@phosphor-icons/react";
import { CATEGORY_LABELS } from "@/constants/formationAssets";
import FormationCard from "@/components/FormationCard";
import SiteFooter from "@/components/SiteFooter";
import ChatWidget from "@/components/ChatWidget";
import { useReveal } from "@/hooks/useReveal";

const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normalize = (s) => stripAccents((s || "").toLowerCase());

export default function PublicFormations() {
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const revealRef = useReveal();

  useEffect(() => {
    document.title = "Toutes nos formations — TDL Formation";
    window.scrollTo(0, 0);
    api.get("/formations", { params: { active_only: true } })
      .then(({ data }) => setFormations(data))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(formations.map((f) => f.category));
    return Array.from(set);
  }, [formations]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return formations.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      return normalize(f.title).includes(q) || normalize(f.description).includes(q) || normalize(f.category).includes(q);
    });
  }, [formations, query, category]);

  return (
    <div className="min-h-screen bg-white" data-testid="public-formations-page" ref={revealRef}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm">
            <Link to="/formations" className="hover:text-[#d4af37] font-semibold">Formations</Link>
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
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-gray-500">
          <Link to="/" className="hover:text-[#d4af37]">Accueil</Link>
          <CaretRight size={10} />
          <span className="text-gray-700">Formations</span>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-gray-200 grid-bg-noise">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
          <p className="overline mb-3">Catalogue complet</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter leading-[0.95] mb-6">
            Toutes nos <span className="text-[#d4af37]">formations</span>
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mb-8">
            CACES, permis, auto-école, SSIAP, VTC/Taxi, ECSR, Conseiller de Vente — retrouvez l'ensemble de notre
            catalogue et recherchez la formation qui correspond à votre projet.
          </p>
          <div className="relative max-w-md">
            <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une formation (ex : CACES, VTC, permis...)"
              className="pl-10"
              data-testid="formations-search"
            />
          </div>
        </div>
      </section>

      {/* Category filters */}
      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              category === "all" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-700 border border-gray-200 hover:border-[#d4af37]"
            }`}
            data-testid="cat-filter-all"
          >
            Toutes
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-700 border border-gray-200 hover:border-[#d4af37]"
              }`}
              data-testid={`cat-filter-${c}`}
            >
              {CATEGORY_LABELS[c] || c}
            </button>
          ))}
        </div>
      </section>

      {/* Grid */}
      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {loading ? (
            <p className="text-center text-gray-400 py-16">Chargement...</p>
          ) : filtered.length ? (
            <>
              <p className="text-sm text-gray-500 mb-6">{filtered.length} formation(s)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((f, idx) => (
                  <FormationCard key={f.id} formation={f} revealDelay={(idx % 4) + 1} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <GraduationCap size={32} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Aucune formation ne correspond à votre recherche.</p>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
      <ChatWidget />
    </div>
  );
}
