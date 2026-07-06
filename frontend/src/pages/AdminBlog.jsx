import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PencilSimple, Trash, Sparkle, Eye, ArrowSquareOut, MagicWand } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATEGORIES = ["actualites", "conseils", "formations", "kami", "seo"];
const empty = {
  title: "", slug: "", excerpt: "", content: "", category: "actualites",
  cover_image: "", tags: [], seo_title: "", seo_description: "", status: "draft"
};

export default function AdminBlog() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCategory, setAiCategory] = useState("conseils");
  const [aiKeywords, setAiKeywords] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [tagsInput, setTagsInput] = useState("");

  const load = () => api.get("/blog/admin/posts").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const openEdit = async (id) => {
    const { data } = await api.get(`/blog/admin/posts/${id}`);
    setForm({ ...empty, ...data });
    setTagsInput((data.tags || []).join(", "));
    setEditId(id);
    setOpen(true);
  };

  const save = async () => {
    try {
      const payload = { ...form, tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean) };
      if (editId) {
        await api.put(`/blog/posts/${editId}`, payload);
        toast.success("Article enregistré");
      } else {
        await api.post("/blog/posts", payload);
        toast.success("Article créé");
      }
      setOpen(false); setForm(empty); setEditId(null); setTagsInput("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Supprimer cet article ?")) return;
    await api.delete(`/blog/posts/${id}`);
    toast.success("Supprimé");
    load();
  };

  const generate = async () => {
    if (!aiTopic) return toast.error("Sujet requis");
    setAiLoading(true);
    try {
      const { data } = await api.post("/blog/generate", {
        topic: aiTopic, category: aiCategory, keywords: aiKeywords
      });
      setForm({ ...empty, ...data });
      setTagsInput((data.tags || []).join(", "));
      setEditId(null);
      setAiOpen(false);
      setOpen(true);
      toast.success("Brouillon IA généré ! Relisez puis publiez.");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur génération");
    } finally {
      setAiLoading(false);
    }
  };

  const seedArticles = async () => {
    if (!window.confirm("Générer 8 articles SEO via Claude (≈ 5 min) ? Les articles déjà existants seront ignorés.")) return;
    setSeeding(true);
    toast.info("Génération en cours... Cela peut prendre quelques minutes.");
    try {
      const { data } = await api.post("/blog/seed", null, { timeout: 600000 });
      const created = data.results.filter((r) => r.status === "created").length;
      const skipped = data.results.filter((r) => r.status === "skipped").length;
      const errors = data.results.filter((r) => r.status === "error").length;
      toast.success(`${created} créés · ${skipped} ignorés · ${errors} erreurs`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur seed");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-blog-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Contenu & SEO</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Blog</h1>
          <p className="text-gray-500 mt-2">{items.length} article(s). Attirez du trafic organique grâce au contenu.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={seedArticles} disabled={seeding} className="border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37]/10 hover:text-[#d4af37]" data-testid="seed-btn">
            <MagicWand size={16} className="mr-1" weight="fill" /> {seeding ? "Génération..." : "Seed 8 articles SEO"}
          </Button>
          <Dialog open={aiOpen} onOpenChange={setAiOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37]/10 hover:text-[#d4af37]" data-testid="ai-generate-btn">
                <Sparkle size={16} className="mr-1" weight="fill" /> Générer avec l'IA
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="ai-dialog">
              <DialogHeader><DialogTitle>Générer un article avec Claude</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium">Sujet / titre proposé *</label>
                  <Input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="Ex: Tout savoir sur le CACES R489 en 2026" data-testid="ai-topic" />
                </div>
                <div>
                  <label className="text-sm font-medium">Catégorie</label>
                  <Select value={aiCategory} onValueChange={setAiCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Mots-clés SEO (virgule)</label>
                  <Input value={aiKeywords} onChange={(e) => setAiKeywords(e.target.value)} placeholder="formation CACES Paris, R489 cat 3, prix CACES" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setAiOpen(false)}>Annuler</Button>
                <Button onClick={generate} disabled={aiLoading} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="ai-generate-go">
                  {aiLoading ? "Génération..." : "Générer (≈10s)"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(empty); setEditId(null); setTagsInput(""); } }}>
            <DialogTrigger asChild>
              <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="new-post-btn">
                <Plus size={16} className="mr-1" /> Nouvel article
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? "Modifier l'article" : "Nouvel article"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Titre *</label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="post-title" />
                </div>
                <div>
                  <label className="text-sm font-medium">Slug (auto si vide)</label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="caces-r489-2026" data-testid="post-slug" />
                </div>
                <div>
                  <label className="text-sm font-medium">Catégorie</label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Résumé (excerpt)</label>
                  <Textarea rows={2} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} data-testid="post-excerpt" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Image de couverture (URL)</label>
                  <Input value={form.cover_image || ""} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Contenu (Markdown) *</label>
                  <Textarea rows={14} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="font-mono text-sm" data-testid="post-content" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Tags (virgule)</label>
                  <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="CACES, formation, R489" />
                </div>
                <div>
                  <label className="text-sm font-medium">SEO title (max 60)</label>
                  <Input value={form.seo_title || ""} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} maxLength={60} />
                </div>
                <div>
                  <label className="text-sm font-medium">SEO description (max 160)</label>
                  <Input value={form.seo_description || ""} onChange={(e) => setForm({ ...form, seo_description: e.target.value })} maxLength={160} />
                </div>
                <div>
                  <label className="text-sm font-medium">Statut</label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger data-testid="post-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Brouillon</SelectItem>
                      <SelectItem value="published">Publié</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4 sticky bottom-0 bg-white pt-2 border-t">
                <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button onClick={save} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="post-save">
                  {editId ? "Enregistrer" : "Créer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 overline">Titre</th>
                <th className="py-3 px-4 overline">Catégorie</th>
                <th className="py-3 px-4 overline">Statut</th>
                <th className="py-3 px-4 overline">Vues</th>
                <th className="py-3 px-4 overline">Date</th>
                <th className="py-3 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`row-${p.id}`}>
                  <td className="py-3 px-4">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-gray-500 font-mono">/blog/{p.slug}</p>
                  </td>
                  <td className="py-3 px-4"><Badge variant="outline">{p.category}</Badge></td>
                  <td className="py-3 px-4">
                    <Badge className={p.status === "published"
                      ? "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-100"}>
                      {p.status === "published" ? "Publié" : "Brouillon"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 font-mono">{p.views || 0}</td>
                  <td className="py-3 px-4 text-xs text-gray-500 font-mono">
                    {new Date(p.updated_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex gap-1">
                      {p.status === "published" && (
                        <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-gray-100 rounded" title="Voir">
                          <ArrowSquareOut size={14} />
                        </a>
                      )}
                      <button onClick={() => openEdit(p.id)} className="p-1.5 hover:bg-gray-100 rounded" data-testid={`edit-${p.id}`}>
                        <PencilSimple size={14} />
                      </button>
                      <button onClick={() => remove(p.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded" data-testid={`del-${p.id}`}>
                        <Trash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan="6" className="py-12 text-center text-gray-400">Aucun article. Commencez par "Générer avec l'IA" pour démarrer.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
