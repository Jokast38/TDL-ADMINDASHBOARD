import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Calendar, Tag, Eye } from "@phosphor-icons/react";

const CATEGORIES = [
  { key: "all", label: "Tous" },
  { key: "actualites", label: "Actualités" },
  { key: "conseils", label: "Conseils" },
  { key: "formations", label: "Formations" },
  { key: "kami", label: "KAMI STREET" },
  { key: "seo", label: "Guides" },
];

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    document.title = "Blog — TDL Formation";
    const q = category === "all" ? {} : { params: { category } };
    api.get("/blog/posts", q).then((r) => setPosts(r.data));
  }, [category]);

  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="min-h-screen bg-white" data-testid="blog-list-page">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg hidden sm:inline">TDL Formation</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <Link to="/" className="hover:text-[#d4af37]">Accueil</Link>
            <Link to="/blog" className="hover:text-[#d4af37] font-semibold">Blog</Link>
            <a href="https://kamistreet.fr/" target="_blank" rel="noreferrer" className="hover:text-[#d4af37]">KAMI STREET ↗</a>
          </nav>
          <Link to="/inscription">
            <Button size="sm" className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">S'inscrire</Button>
          </Link>
        </div>
      </header>

      <section className="border-b border-gray-200 grid-bg-noise">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
          <p className="overline mb-3">Le journal TDL</p>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.95]">
            Actualités, <span className="text-[#d4af37]">conseils</span>, guides<br />formation & mobilité.
          </h1>
          <p className="text-gray-600 text-lg mt-6 max-w-2xl">
            Tout ce qu'il faut savoir sur les formations professionnelles, la récupération de points, l'auto-école et la mobilité électrique.
          </p>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c.key
                  ? "bg-[#0a0a0a] text-white"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-[#d4af37]"
              }`}
              data-testid={`cat-filter-${c.key}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {!posts.length && (
            <Card className="p-16 text-center border-dashed">
              <p className="text-gray-500">Aucun article publié pour le moment.</p>
            </Card>
          )}

          {featured && (
            <Link to={`/blog/${featured.slug}`} className="block mb-12" data-testid={`featured-${featured.slug}`}>
              <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all grid md:grid-cols-2 gap-0">
                <div className="aspect-video md:aspect-auto bg-gray-100 overflow-hidden">
                  {featured.cover_image ? (
                    <img src={featured.cover_image} alt={featured.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-black to-[#d4af37]" />
                  )}
                </div>
                <div className="p-8 flex flex-col justify-center">
                  <Badge variant="outline" className="w-fit mb-3">{featured.category}</Badge>
                  <h2 className="font-display text-3xl font-bold tracking-tight mb-3 leading-tight">{featured.title}</h2>
                  <p className="text-gray-600 mb-4">{featured.excerpt}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><Calendar size={12} /> {new Date(featured.published_at || featured.created_at).toLocaleDateString("fr-FR")}</span>
                    <span className="inline-flex items-center gap-1"><Eye size={12} /> {featured.views || 0}</span>
                  </div>
                  <span className="mt-6 text-sm font-semibold text-[#d4af37] inline-flex items-center gap-1">
                    Lire l'article <ArrowRight size={14} />
                  </span>
                </div>
              </Card>
            </Link>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map((p) => (
              <Link key={p.id} to={`/blog/${p.slug}`} data-testid={`post-${p.slug}`}>
                <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all h-full">
                  <div className="aspect-video bg-gray-100 overflow-hidden">
                    {p.cover_image ? (
                      <img src={p.cover_image} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-black to-[#d4af37]" />
                    )}
                  </div>
                  <div className="p-5">
                    <Badge variant="outline" className="text-xs mb-2">{p.category}</Badge>
                    <h3 className="font-display font-bold text-lg leading-tight mb-2">{p.title}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2">{p.excerpt}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                      <span className="inline-flex items-center gap-1"><Calendar size={11} /> {new Date(p.published_at || p.created_at).toLocaleDateString("fr-FR")}</span>
                      <span className="inline-flex items-center gap-1"><Eye size={11} /> {p.views || 0}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-wrap gap-4 items-center justify-between">
          <p className="text-sm text-gray-500">© 2026 TDL Formation</p>
          <Link to="/" className="text-sm text-gray-500 hover:text-[#d4af37] inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Retour au site
          </Link>
        </div>
      </footer>
    </div>
  );
}
