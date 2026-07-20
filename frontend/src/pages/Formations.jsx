import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, PencilSimple, Trash, GraduationCap } from "@phosphor-icons/react";
import { toast } from "sonner";

const categories = ["CACES", "PERMIS", "AUTO_ECOLE", "SSIAP", "VTC_TAXI", "ECSR", "VENTE"];

const empty = {
  title: "", category: "CACES", description: "", duration_hours: 0,
  price: 0, sessions_per_month: 0, active: true, image_url: ""
};

export default function Formations() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/formations").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...form, duration_hours: +form.duration_hours, price: +form.price, sessions_per_month: +form.sessions_per_month };
      if (editId) {
        await api.put(`/formations/${editId}`, payload);
        toast.success("Formation mise à jour");
      } else {
        await api.post("/formations", payload);
        toast.success("Formation créée");
      }
      setOpen(false); setForm(empty); setEditId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const edit = (f) => {
    setForm({ ...f }); setEditId(f.id); setOpen(true);
  };

  const remove = async (id) => {
    if (!window.confirm("Supprimer cette formation ?")) return;
    try {
      await api.delete(`/formations/${id}`);
      toast.success("Supprimée");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <div className="space-y-6" data-testid="formations-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="overline">Catalogue</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Formations</h1>
          <p className="text-gray-500 mt-2">Gérez votre catalogue multi-domaines.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(empty); setEditId(null); } }}>
          <DialogTrigger asChild>
            <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="add-formation-btn">
              <Plus size={16} className="mr-2" /> Nouvelle formation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="formation-dialog">
            <DialogHeader>
              <DialogTitle>{editId ? "Modifier la formation" : "Nouvelle formation"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Intitulé</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="form-title" />
              </div>
              <div>
                <label className="text-sm font-medium">Catégorie</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="form-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Prix (€)</label>
                <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="form-price" />
              </div>
              <div>
                <label className="text-sm font-medium">Durée (heures)</label>
                <Input type="number" value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} data-testid="form-duration" />
              </div>
              <div>
                <label className="text-sm font-medium">Sessions / mois</label>
                <Input type="number" value={form.sessions_per_month} onChange={(e) => setForm({ ...form, sessions_per_month: e.target.value })} data-testid="form-sessions" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Image (URL)</label>
                <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} data-testid="form-image" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="form-description" rows={3} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="form-active" />
                <label className="text-sm">Active (visible publiquement)</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={save} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="form-save">
                {editId ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="formations-grid">
        {items.map((f) => (
          <Card key={f.id} className="p-6 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg hover:border-gray-300 transition-all" data-testid={`formation-card-${f.id}`}>
            <div className="flex items-start justify-between mb-3">
              <Badge variant="outline" className="text-xs">{f.category}</Badge>
              <div className="flex gap-1">
                <button onClick={() => edit(f)} className="p-1.5 rounded hover:bg-gray-100" data-testid={`edit-formation-${f.id}`}>
                  <PencilSimple size={14} />
                </button>
                <button onClick={() => remove(f.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600" data-testid={`delete-formation-${f.id}`}>
                  <Trash size={14} />
                </button>
              </div>
            </div>
            <h3 className="font-display text-xl font-bold leading-tight mb-2">{f.title}</h3>
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{f.description}</p>
            <div className="flex items-end justify-between border-t border-gray-100 pt-4">
              <div>
                <p className="overline text-[10px]">Prix</p>
                <p className="font-display font-bold text-2xl">{f.price}€</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{f.duration_hours}h</p>
                <p className="text-xs text-gray-500">{f.sessions_per_month}/mois</p>
              </div>
            </div>
            {!f.active && <Badge className="mt-3 bg-gray-200 text-gray-700 hover:bg-gray-200">Inactif</Badge>}
          </Card>
        ))}
        {!items.length && (
          <Card className="col-span-full p-12 text-center border-dashed">
            <GraduationCap size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-500">Aucune formation. Cliquez sur "Nouvelle formation" pour en créer une.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
