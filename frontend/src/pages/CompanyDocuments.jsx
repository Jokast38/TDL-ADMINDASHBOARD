import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Archive, DownloadSimple, MagnifyingGlass, Plus, FileText, Trash, PencilSimple, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATEGORIES = ["contrat", "programme", "convocation", "certificat", "attestation", "emargement", "calendrier", "autre"];
const CATEGORY_LABELS = {
  contrat: "Contrat", programme: "Programme", convocation: "Convocation",
  certificat: "Certificat", attestation: "Attestation", emargement: "Émargement",
  calendrier: "Calendrier", autre: "Autre",
};

const emptyUpload = { nom: "", description: "", category: "autre", file: null };

export default function CompanyDocuments() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(emptyUpload);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    const params = categoryFilter === "all" ? {} : { params: { category: categoryFilter } };
    api.get("/company-documents", params).then((r) => setItems(r.data)).catch(() => toast.error("Erreur de chargement"));
  };
  useEffect(() => { load(); }, [categoryFilter]);

  const filtered = items.filter((d) => (d.nom + (d.description || "") + (d.original_filename || "")).toLowerCase().includes(q.toLowerCase()));

  const upload = async () => {
    if (!form.file) return toast.error("Choisissez un fichier");
    if (!form.nom.trim()) return toast.error("Donnez un nom au document");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", form.file);
      fd.append("nom", form.nom.trim());
      fd.append("description", form.description || "");
      fd.append("category", form.category);
      await api.post("/company-documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document ajouté");
      setOpen(false);
      setForm(emptyUpload);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setUploading(false);
    }
  };

  const download = async (d) => {
    try {
      const res = await api.get(`/company-documents/${d.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = d.original_filename || d.nom; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erreur téléchargement");
    }
  };

  const view = (d) => {
    const token = localStorage.getItem("tdl_token");
    fetch(`${API}/company-documents/${d.id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((blob) => window.open(URL.createObjectURL(blob), "_blank"));
  };

  const openEdit = (d) => {
    setEditingId(d.id);
    setEditForm({ nom: d.nom, description: d.description || "", category: d.category || "autre" });
  };

  const saveEdit = async () => {
    try {
      await api.put(`/company-documents/${editingId}`, editForm);
      toast.success("Document mis à jour");
      setEditingId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/company-documents/${id}`);
      toast.success("Document supprimé");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    }
    setDeletingId(null);
    load();
  };

  return (
    <div className="space-y-6" data-testid="company-documents-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Bibliothèque</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Documents entreprise</h1>
          <p className="text-gray-500 mt-2">{items.length} document(s) — contrats vierges, programmes, calendriers, modèles de référence.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyUpload); }}>
          <DialogTrigger asChild>
            <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="upload-doc-btn">
              <Plus size={16} className="mr-1" /> Ajouter un document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajouter un document</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-sm font-medium">Fichier</label>
                <Input
                  type="file"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                  data-testid="upload-file-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Nom du document</label>
                <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Contrat de formation professionnelle (vierge)" data-testid="upload-nom" />
              </div>
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="upload-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Description (facultatif)</label>
                <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={upload} disabled={uploading} className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="upload-submit">
                {uploading ? <>Envoi...</> : <><UploadSimple size={16} className="mr-1" /> Ajouter</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-56" data-testid="category-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input placeholder="Rechercher..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="search" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((d) => (
          <Card key={d.id} className="p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all" data-testid={`company-doc-${d.id}`}>
            <div className="flex items-start justify-between mb-2">
              <Badge variant="outline">{CATEGORY_LABELS[d.category] || d.category}</Badge>
              <div className="flex items-center gap-2 text-gray-300">
                <button onClick={() => openEdit(d)} className="hover:text-[#d4af37] transition-colors" data-testid={`edit-doc-${d.id}`}>
                  <PencilSimple size={14} />
                </button>
                <AlertDialog open={deletingId === d.id} onOpenChange={(v) => !v && setDeletingId(null)}>
                  <AlertDialogTrigger asChild>
                    <button onClick={() => setDeletingId(d.id)} className="hover:text-red-600 transition-colors" data-testid={`delete-doc-${d.id}`}>
                      <Trash size={14} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
                      <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(d.id)} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <h3 className="font-display font-bold leading-tight flex items-start gap-2">
              <FileText size={18} className="mt-0.5 shrink-0 text-gray-400" /> {d.nom}
            </h3>
            {d.description && <p className="text-xs text-gray-500 mt-2">{d.description}</p>}
            <p className="text-[10px] text-gray-400 mt-2">{d.original_filename} · {((d.size || 0) / 1024).toFixed(0)} KB</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => view(d)} className="flex-1">Voir</Button>
              <Button size="sm" variant="outline" onClick={() => download(d)} className="flex-1">
                <DownloadSimple size={14} className="mr-1" /> Télécharger
              </Button>
            </div>
          </Card>
        ))}
        {!filtered.length && (
          <Card className="p-12 text-center border-dashed col-span-full">
            <Archive size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-gray-500">Aucun document.</p>
          </Card>
        )}
      </div>

      <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le document</DialogTitle></DialogHeader>
          {editForm && (
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-sm font-medium">Nom</label>
                <Input value={editForm.nom} onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditingId(null)}>Annuler</Button>
            <Button onClick={saveEdit} className="bg-[#d4af37] text-black hover:bg-[#b8941f]">Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
