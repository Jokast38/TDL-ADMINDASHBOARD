import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, MapPin, Plus, Users } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = {
  formation_id: "", date_debut: "", date_fin: "",
  lieu_adresse: "", lieu_ville: "", capacite_max: 20,
  animateur_id: "", notes: ""
};

export default function Stages() {
  const [items, setItems] = useState([]);
  const [formations, setFormations] = useState([]);
  const [animateurs, setAnimateurs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => api.get("/stages").then((r) => setItems(r.data));
  useEffect(() => {
    load();
    api.get("/formations").then((r) => setFormations(r.data));
    api.get("/employees").then((r) => setAnimateurs(r.data.filter((u) => u.role === "animateur" || u.role === "admin"))).catch(() => {});
  }, []);

  const save = async () => {
    try {
      const payload = { ...form, capacite_max: +form.capacite_max };
      if (!payload.animateur_id) delete payload.animateur_id;
      await api.post("/stages", payload);
      toast.success("Session planifiée");
      setOpen(false); setForm(empty);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <div className="space-y-6" data-testid="stages-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Planification</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Sessions de stage</h1>
          <p className="text-gray-500 mt-2">{items.length} session(s) planifiée(s).</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="new-stage-btn">
              <Plus size={16} className="mr-1" /> Planifier une session
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Nouvelle session de stage</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Formation</label>
                <Select value={form.formation_id} onValueChange={(v) => setForm({ ...form, formation_id: v })}>
                  <SelectTrigger data-testid="stage-formation"><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
                  <SelectContent>{formations.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Date début</label>
                <Input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} data-testid="stage-debut" />
              </div>
              <div>
                <label className="text-sm font-medium">Date fin</label>
                <Input type="date" value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} data-testid="stage-fin" />
              </div>
              <div>
                <label className="text-sm font-medium">Adresse</label>
                <Input value={form.lieu_adresse} onChange={(e) => setForm({ ...form, lieu_adresse: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Ville</label>
                <Input value={form.lieu_ville} onChange={(e) => setForm({ ...form, lieu_ville: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Capacité max</label>
                <Input type="number" value={form.capacite_max} onChange={(e) => setForm({ ...form, capacite_max: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Animateur</label>
                <Select value={form.animateur_id} onValueChange={(v) => setForm({ ...form, animateur_id: v })}>
                  <SelectTrigger data-testid="stage-animateur"><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>{animateurs.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.role})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={save} className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="stage-save">Planifier</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((s) => (
          <Card key={s.id} className="p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all" data-testid={`stage-card-${s.id}`}>
            <div className="flex items-start justify-between mb-2">
              <Badge variant="outline">{s.statut}</Badge>
              <p className="text-xs text-gray-500"><Users size={12} className="inline mr-1" />{s.nb_inscrits || 0}/{s.capacite_max}</p>
            </div>
            <h3 className="font-display font-bold leading-tight">{s.formation_titre}</h3>
            <div className="text-xs text-gray-500 mt-3 space-y-1">
              <p className="flex items-center gap-1"><Calendar size={12} /> {s.date_debut} → {s.date_fin}</p>
              <p className="flex items-center gap-1"><MapPin size={12} /> {s.lieu_ville}</p>
              {s.animateur_id && <p className="text-[10px]">Animateur : {animateurs.find((a) => a.id === s.animateur_id)?.name || "—"}</p>}
            </div>
          </Card>
        ))}
        {!items.length && <Card className="p-12 text-center border-dashed col-span-full"><p className="text-gray-500">Aucune session.</p></Card>}
      </div>
    </div>
  );
}
