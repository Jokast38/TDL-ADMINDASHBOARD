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
import { Calendar, MapPin, Plus, Users, PencilSimple, Trash, CaretDown, CaretRight, UploadSimple, Sun, Moon } from "@phosphor-icons/react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function monthLabel(dateStr) {
  if (!dateStr) return "Sans date";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Sans date";
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

// Le créneau JOUR/SOIR n'a pas son propre champ sur le stage — il est
// encodé dans les notes à la création (voir vtc_import.py et Stages.jsx
// "Créneau : JOUR"/"Créneau : SOIR"). Extrait ici pour l'affichage.
function extractCreneau(notes) {
  const m = /Créneau\s*:\s*(JOUR|SOIR)/i.exec(notes || "");
  return m ? m[1].toUpperCase() : null;
}

function monthKey(dateStr) {
  if (!dateStr) return "0000-00";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "0000-00";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Sous-groupe une liste de sessions (déjà triées) par mois calendaire de
// date_debut, en conservant l'ordre chronologique passé en entrée.
function groupByMonth(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    const key = monthKey(s.date_debut);
    if (!groups.has(key)) groups.set(key, { key, label: monthLabel(s.date_debut), sessions: [] });
    groups.get(key).sessions.push(s);
  }
  return Array.from(groups.values());
}

const empty = {
  formation_id: "", date_debut: "", date_fin: "",
  lieu_adresse: "", lieu_ville: "", capacite_max: 20,
  animateur_ids: [], statut: "planifie", notes: ""
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
  const [importing, setImporting] = useState(false);
  const [rosterTarget, setRosterTarget] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const openRoster = async (s) => {
    setRosterTarget(s);
    setLoadingRoster(true);
    try {
      const { data } = await api.get(`/stages/${s.id}/roster`);
      setRoster(data);
    } catch {
      toast.error("Erreur de chargement des inscrits");
      setRoster([]);
    } finally {
      setLoadingRoster(false);
    }
  };

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
    const ids = s.animateur_ids?.length ? s.animateur_ids : (s.animateur_id ? [s.animateur_id] : []);
    setForm({
      formation_id: s.formation_id || "", date_debut: s.date_debut || "", date_fin: s.date_fin || "",
      lieu_adresse: s.lieu_adresse || "", lieu_ville: s.lieu_ville || "", capacite_max: s.capacite_max ?? 20,
      animateur_ids: ids, statut: s.statut || "planifie", notes: s.notes || "",
    });
    setOpen(true);
  };

  const toggleAnimateur = (id) => {
    setForm((f) => ({
      ...f,
      animateur_ids: f.animateur_ids.includes(id) ? f.animateur_ids.filter((a) => a !== id) : [...f.animateur_ids, id],
    }));
  };

  const save = async () => {
    try {
      const payload = { ...form, capacite_max: +form.capacite_max };
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

  const importExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setImporting(true);
    try {
      const { data } = await api.post("/vtc-import/vtc-taxi-sessions", fd, {
        headers: { "Content-Type": "multipart/form-data" }, timeout: 120000,
      });
      const warn = Object.keys(data.unmatched_metiers || {}).length
        ? ` · ${Object.keys(data.unmatched_metiers).length} métier(s) non reconnu(s), voir console`
        : "";
      if (warn) console.warn("Métiers non reconnus lors de l'import :", data.unmatched_metiers);
      toast.success(
        `${data.sessions_created} session(s) créée(s), ${data.inscriptions_created} inscription(s) importée(s)${warn}`
      );
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'import du fichier Excel");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

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
        <div className="flex gap-2">
          <label className="inline-block">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} data-testid="stages-import-excel" />
            <Button variant="outline" disabled={importing} className="cursor-pointer" title="Importe les sessions VTC/Taxi/Passerelle depuis un fichier Excel (1 onglet par mois)">
              <UploadSimple size={16} className="mr-1" /> {importing ? "Import..." : "Importer Excel VTC/Taxi"}
            </Button>
          </label>
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
                <Select
                  value={form.formation_id}
                  onValueChange={(v) => {
                    // Capacité par défaut à 25 pour les formations VTC/Taxi —
                    // seulement à la création, et seulement si l'utilisateur
                    // n'a pas déjà modifié la capacité par défaut (20).
                    const formation = formations.find((f) => f.id === v);
                    const bump = !editingId && form.capacite_max === 20 && formation?.category === "VTC_TAXI";
                    setForm({ ...form, formation_id: v, ...(bump ? { capacite_max: 25 } : {}) });
                  }}
                >
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
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Formateurs / animateurs assignés</label>
                <p className="text-xs text-gray-400 mb-1">Plusieurs formateurs peuvent être assignés à la même session — chacun apparaîtra avec sa propre signature sur l'attestation générée.</p>
                <div className="flex flex-wrap gap-2 border border-gray-200 rounded-md p-2" data-testid="stage-animateurs">
                  {animateurs.map((a) => {
                    const checked = form.animateur_ids.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border cursor-pointer ${checked ? "border-[#d4af37] bg-[#d4af37]/10" : "border-gray-200"}`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleAnimateur(a.id)} className="hidden" />
                        {a.name} ({a.role})
                      </label>
                    );
                  })}
                  {!animateurs.length && <span className="text-xs text-gray-400">Aucun formateur — créez-en un depuis la page Formateurs.</span>}
                </div>
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
              <div className="mb-6 space-y-4">
                <p className="overline text-[#0B7238]">À venir</p>
                {groupByMonth(g.upcoming).map((mg) => (
                  <div key={mg.key}>
                    <p className="text-xs font-semibold text-gray-500 capitalize mb-2">{mg.label}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {mg.sessions.map((s) => (
                        <StageCard key={s.id} s={s} animateurs={animateurs} onEdit={openEdit} deletingId={deletingId} setDeletingId={setDeletingId} onDelete={remove} onViewRoster={openRoster} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {g.past.length > 0 && (
              <div className="space-y-4">
                <p className="overline text-gray-400">Sessions passées</p>
                {groupByMonth(g.past).map((mg) => (
                  <div key={mg.key}>
                    <p className="text-xs font-semibold text-gray-400 capitalize mb-2">{mg.label}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {mg.sessions.map((s) => (
                        <StageCard key={s.id} s={s} animateurs={animateurs} onEdit={openEdit} deletingId={deletingId} setDeletingId={setDeletingId} onDelete={remove} onViewRoster={openRoster} muted />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>
            )}
          </div>
          );
        })}
      </div>

      <Dialog open={!!rosterTarget} onOpenChange={(v) => !v && setRosterTarget(null)}>
        <DialogContent data-testid="stage-roster-dialog">
          <DialogHeader>
            <DialogTitle>
              Inscrits — {rosterTarget?.formation_titre}
              {rosterTarget && (
                <span className="block text-xs font-normal text-gray-400 mt-1">
                  {rosterTarget.date_debut} → {rosterTarget.date_fin}
                  {extractCreneau(rosterTarget.notes) ? ` · ${extractCreneau(rosterTarget.notes)}` : ""}
                  {" · "}{rosterTarget.nb_inscrits || 0}/{rosterTarget.capacite_max} places
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-1 mt-2">
            {loadingRoster ? (
              <p className="text-sm text-gray-400 text-center py-8">Chargement...</p>
            ) : roster.length ? (
              roster.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.student_name}</p>
                    <p className="text-xs text-gray-500 truncate">{r.student_email}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 ml-2">{r.payment_status}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Aucun candidat affecté à cette session pour l'instant.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StageCard({ s, animateurs, onEdit, deletingId, setDeletingId, onDelete, onViewRoster, muted }) {
  const creneau = extractCreneau(s.notes);
  const full = (s.nb_inscrits || 0) >= s.capacite_max;
  return (
    <Card
      className={`p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all cursor-pointer relative group ${muted ? "opacity-70" : ""}`}
      data-testid={`stage-card-${s.id}`}
      onClick={() => onEdit(s)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{s.statut}</Badge>
          {creneau && (
            <Badge variant="outline" className="text-[10px] gap-1">
              {creneau === "JOUR" ? <Sun size={10} /> : <Moon size={10} />} {creneau}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onViewRoster(s); }}
            className={`text-xs flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 ${full ? "text-red-600 font-semibold" : "text-gray-500"}`}
            title="Voir les inscrits de cette session"
            data-testid={`stage-roster-${s.id}`}
          >
            <Users size={12} />{s.nb_inscrits || 0}/{s.capacite_max}
          </button>
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
        {(() => {
          const ids = s.animateur_ids?.length ? s.animateur_ids : (s.animateur_id ? [s.animateur_id] : []);
          const names = ids.map((id) => animateurs.find((a) => a.id === id)?.name).filter(Boolean);
          return names.length ? <p className="text-[10px]">Formateur(s) : {names.join(", ")}</p> : null;
        })()}
      </div>
    </Card>
  );
}
