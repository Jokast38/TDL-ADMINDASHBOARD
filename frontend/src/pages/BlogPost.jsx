import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Eye, ShareNetwork, Tag } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);

  useEffect(() => {
    api.get(`/blog/posts/${slug}`).then((r) => {
      setPost(r.data);
      const seoTitle = r.data.seo_title || r.data.title;
      document.title = `${seoTitle} — TDL Formation`;
      // Update meta description
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
      meta.setAttribute("content", r.data.seo_description || r.data.excerpt || "");
    }).catch(() => navigate("/blog"));
  }, [slug, navigate]);

  const share = () => {
    if (navigator.share) {
      navigator.share({ title: post.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Lien copié !");
    }
  };

  if (!post) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement…</div>;

  return (
    <div className="min-h-screen bg-white" data-testid="blog-post-page">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg hidden sm:inline">TDL Formation</span>
          </Link>
          <Link to="/blog" className="text-sm text-gray-600 hover:text-[#d4af37] inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Tous les articles
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-10 lg:py-16">
        <Badge variant="outline" className="mb-4">{post.category}</Badge>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter leading-[1.05] mb-6">
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="text-xl text-gray-600 leading-relaxed mb-6">{post.excerpt}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-gray-500 border-y border-gray-200 py-4 mb-8">
          <span className="inline-flex items-center gap-1"><Calendar size={14} /> {new Date(post.published_at || post.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
          <span className="inline-flex items-center gap-1"><Eye size={14} /> {post.views || 0} vues</span>
          <button onClick={share} className="ml-auto inline-flex items-center gap-1 hover:text-[#d4af37]" data-testid="share-btn">
            <ShareNetwork size={14} /> Partager
          </button>
        </div>

        {post.cover_image && (
          <div className="aspect-video bg-gray-100 rounded-md overflow-hidden mb-10">
            <img src={post.cover_image} alt={post.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="prose prose-lg max-w-none
          prose-headings:font-display prose-headings:font-bold prose-headings:tracking-tight
          prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-4
          prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
          prose-p:text-gray-700 prose-p:leading-relaxed
          prose-a:text-[#d4af37] prose-a:font-medium prose-a:no-underline hover:prose-a:underline
          prose-strong:text-gray-900
          prose-ul:my-4 prose-li:my-1
          prose-blockquote:border-l-[#d4af37] prose-blockquote:bg-gray-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:not-italic
          prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
        " data-testid="post-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>

        {post.tags?.length > 0 && (
          <div className="mt-12 pt-6 border-t border-gray-200">
            <p className="overline mb-3">Tags</p>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-xs"><Tag size={10} className="mr-1" /> {t}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-16 p-8 bg-black text-white rounded-md" data-testid="cta-block">
          <p className="overline mb-2" style={{ color: "#d4af37" }}>Passer à l'action</p>
          <h3 className="font-display text-2xl font-bold mb-3">Prêt à vous former chez TDL ?</h3>
          <p className="text-gray-300 mb-5">Inscription en ligne, dossier ANTS suivi, accompagnement personnalisé.</p>
          <Link to="/inscription">
            <Button className="bg-[#d4af37] text-black hover:bg-[#b8941f] hover:text-black">
              Voir les formations
            </Button>
          </Link>
        </div>
      </article>
    </div>
  );
}
