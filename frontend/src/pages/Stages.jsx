import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar, MapPin, Plus, Users, PencilSimple, Trash, CaretDown, CaretRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const empty = {
  formation_id: "", date_debut: "", date_fin: "",
  lieu_adresse: "", lieu_ville: "", capacite_max: 20,
  animateur_id: "", statut: "planifie", notes: ""
};

const STATUTS = ["planifie", "en_cours", "termine", "annule"];

export default function Stages() {
  const [items, setItems] = useState([]);
  const [formations, setFormations] = useState([]);
  const [animateurs, setAnimateurs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const toggleCollapsed = (formationId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(formationId)) next.delete(formationId); else next.add(formationId);
      return next;
    });
  };

  const load = () => api.get("/stages").then((r) => setItems(r.data));
  useEffect(() => {
    load();
    api.get("/formations").then((r) => setFormations(r.data));
    api.get("/employees").then((r) => setAnimateurs(r.data.filter((u) => u.role === "animateur" || u.role === "admin"))).catch(() => {});
  }, []);

  const openCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      formation_id: s.formation_id || "", date_debut: s.date_debut || "", date_fin: s.date_fin || "",
      lieu_adresse: s.lieu_adresse || "", lieu_ville: s.lieu_ville || "", capacite_max: s.capacite_max ?? 20,
      animateur_id: s.animateur_id || "", statut: s.statut || "planifie", notes: s.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    try {
      const payload = { ...form, capacite_max: +form.capacite_max };
      if (!payload.animateur_id) delete payload.animateur_id;
      if (editingId) {
        await api.put(`/stages/${editingId}`, payload);
        toast.success("Session mise à jour");
      } else {
        delete payload.statut;
        await api.post("/stages", payload);
        toast.success("Session planifiée");
      }
      setOpen(false); setForm(empty); setEditingId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const groupedByFormation = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const groups = new Map();
    for (const s of items) {
      const key = s.formation_id || "sans-formation";
      if (!groups.has(key)) groups.set(key, { formation_id: key, formation_titre: s.formation_titre || "Autre", sessions: [] });
      groups.get(key).sessions.push(s);
    }
    const result = Array.from(groups.values()).map((g) => {
      const upcoming = g.sessions
        .filter((s) => (s.date_fin || s.date_debut) >= today)
        .sort((a, b) => (a.date_debut || "").localeCompare(b.date_debut || ""));
      const past = g.sessions
        .filter((s) => (s.date_fin || s.date_debut) < today)
        .sort((a, b) => (b.date_debut || "").localeCompare(a.date_debut || ""));
      return { ...g, upcoming, past };
    });
    // Groupes avec des sessions à venir en premier (triés par la plus proche
    // échéance) ; groupes uniquement passés ensuite (triés par la session la
    // plus récente) — pour remonter les formations actives en priorité.
    result.sort((a, b) => {
      if (a.upcoming.length && b.upcoming.length) {
        return a.upcoming[0].date_debut.localeCompare(b.upcoming[0].date_debut);
      }
      if (a.upcoming.length !== b.upcoming.length) return b.upcoming.length - a.upcoming.length;
      const aDate = a.past[0]?.date_debut || "";
      const bDate = b.past[0]?.date_debut || "";
      return bDate.localeCompare(aDate);
    });
    return result;
  }, [items]);

  const remove = async (id) => {
    try {
      await api.delete(`/stages/${id}`);
      toast.success("Session supprimée");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6" data-testid="stages-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Planification</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Sessions de stage</h1>
          <p className="text-gray-500 mt-2">{items.length} session(s) planifiée(s).</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(empty); } }}>
          <DialogTrigger asChild>
            <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="new-stage-btn" onClick={openCreate}>
              <Plus size={16} className="mr-1" /> Planifier une session
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingId ? "Modifier la session" : "Nouvelle session de stage"}</DialogTitle></DialogHeader>
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
                <AddressAutocomplete
                  value={form.lieu_adresse}
                  onChange={(v) => setForm((f) => ({ ...f, lieu_adresse: v }))}
                  onSelect={(ville) => setForm((f) => ({ ...f, lieu_ville: ville || f.lieu_ville }))}
                  placeholder="Numéro, rue..."
                  testId="stage-adresse"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Ville</label>
                <Input value={form.lieu_ville} onChange={(e) => setForm({ ...form, lieu_ville: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Capacité max</label>
                <Input type="number" value={form.capacite_max} onChange={(e) => setForm({ ...form, capacite_max: e.target.value })} />
              </div>
              {editingId && (
                <div>
                  <label className="text-sm font-medium">Statut</label>
                  <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                    <SelectTrigger data-testid="stage-statut"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
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
              <Button onClick={save} className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="stage-save">
                {editingId ? "Enregistrer" : "Planifier"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!items.length && <Card className="p-12 text-center border-dashed"><p className="text-gray-500">Aucune session.</p></Card>}

      {items.length > 0 && (
        <div className="flex justify-end gap-3 -mb-4">
          <button className="text-xs text-gray-500 hover:text-[#d4af37]" onClick={() => setCollapsed(new Set(groupedByFormation.map((g) => g.formation_id)))}>
            Tout replier
          </button>
          <button className="text-xs text-gray-500 hover:text-[#d4af37]" onClick={() => setCollapsed(new Set())}>
            Tout déplier
          </button>
        </div>
      )}

      <div className="space-y-10">
        {groupedByFormation.map((g) => {
          const isCollapsed = collapsed.has(g.formation_id);
          return (
          <div key={g.formation_id}>
            <button
              type="button"
              onClick={() => toggleCollapsed(g.formation_id)}
              className="flex items-center gap-2 w-full text-left mb-3 pb-2 border-b border-gray-200"
              data-testid={`stage-group-toggle-${g.formation_id}`}
            >
              {isCollapsed ? <CaretRight size={16} className="text-gray-400" /> : <CaretDown size={16} className="text-gray-400" />}
              <h2 className="font-display text-xl font-bold">{g.formation_titre}</h2>
              <span className="text-xs text-gray-400">{g.sessions.length} session(s)</span>
            </button>

            {!isCollapsed && (
            <>
            {g.upcoming.length > 0 && (
              <div className="mb-6">
                <p className="overline text-[#0B7238] mb-2">À venir</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.upcoming.map((s) => (
                    <StageCard key={s.id} s={s} animateurs={animateurs} onEdit={openEdit} deletingId={deletingId} setDeletingId={setDeletingId} onDelete={remove} />
                  ))}
                </div>
              </div>
            )}

            {g.past.length > 0 && (
              <div>
                <p className="overline text-gray-400 mb-2">Sessions passées</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.past.map((s) => (
                    <StageCard key={s.id} s={s} animateurs={animateurs} onEdit={openEdit} deletingId={deletingId} setDeletingId={setDeletingId} onDelete={remove} muted />
                  ))}
                </div>
              </div>
            )}
            </>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function StageCard({ s, animateurs, onEdit, deletingId, setDeletingId, onDelete, muted }) {
  return (
    <Card
      className={`p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all cursor-pointer relative group ${muted ? "opacity-70" : ""}`}
      data-testid={`stage-card-${s.id}`}
      onClick={() => onEdit(s)}
    >
      <div className="flex items-start justify-between mb-2">
        <Badge variant="outline">{s.statut}</Badge>
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-500"><Users size={12} className="inline mr-1" />{s.nb_inscrits || 0}/{s.capacite_max}</p>
          <PencilSimple size={14} className="text-gray-300 group-hover:text-[#d4af37] transition-colors" />
          <AlertDialog open={deletingId === s.id} onOpenChange={(v) => !v && setDeletingId(null)}>
            <AlertDialogTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); setDeletingId(s.id); }}
                className="text-gray-300 hover:text-red-600 transition-colors"
                data-testid={`stage-delete-${s.id}`}
              >
                <Trash size={14} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible et supprimera aussi les émargements liés à cette session.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeletingId(null)}>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(s.id)} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <h3 className="font-display font-bold leading-tight">{s.formation_titre}</h3>
      <div className="text-xs text-gray-500 mt-3 space-y-1">
        <p className="flex items-center gap-1"><Calendar size={12} /> {s.date_debut} → {s.date_fin}</p>
        <p className="flex items-center gap-1"><MapPin size={12} /> {s.lieu_ville}</p>
        {s.animateur_id && <p className="text-[10px]">Animateur : {animateurs.find((a) => a.id === s.animateur_id)?.name || "—"}</p>}
      </div>
    </Card>
  );
}
