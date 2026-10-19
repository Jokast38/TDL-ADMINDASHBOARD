import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash, UploadSimple, Books, MagnifyingGlass, SquaresFour, ListBullets, FunnelSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { normalizeLocation } from "@/lib/normalizeLocation";
import { colorForFormation } from "@/constants/formationColors";
import FormationTabs from "@/components/stages/FormationTabs";
import LocationFilter from "@/components/stages/LocationFilter";
import MonthNavigator from "@/components/stages/MonthNavigator";
import SessionCard from "@/components/stages/SessionCard";
import SessionDrawer from "@/components/stages/SessionDrawer";
import CalendarView from "@/components/stages/CalendarView";
import {
  monthKey, monthLabelShort, monthLabelLong, todayIso, extractCreneau, fillRatio,
} from "@/components/stages/stageHelpers";

async function downloadStageAntsBundle(s) {
  try {
    const res = await api.get(`/stages/${s.id}/ants-bundle`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = `Dossier_ANTS_session_${s.formation_titre}_${s.date_debut}.zip`; a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast.error(e.response?.data?.detail || "Aucune feuille d'émargement disponible pour cette session");
  }
}

const empty = {
  formation_id: "", date_debut: "", date_fin: "",
  lieu_adresse: "", lieu_ville: "", capacite_max: 20,
  animateur_ids: [], statut: "planifie", notes: "", creneau: "",
  heure_debut: "09:00", heure_fin: "17:00", external_reserved: 0,
};

const STATUTS = ["planifie", "en_cours", "complet", "termine", "annule"];
const STATUT_LABELS = {
  planifie: "Planifié", en_cours: "En cours", complet: "Complet (verrouillé)",
  termine: "Terminé", annule: "Annulé",
};
const CRENEAU_HOURS = { JOUR: { heure_debut: "09:00", heure_fin: "17:00" }, SOIR: { heure_debut: "18:00", heure_fin: "21:30" } };

function addDaysIso(dateStr, days) {
  if (!dateStr) return dateStr;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Stages() {
  const [items, setItems] = useState([]);
  const [formations, setFormations] = useState([]);
  const [animateurs, setAnimateurs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [stageModules, setStageModules] = useState([]);
  const [sessionTemplates, setSessionTemplates] = useState([]);
  const [moduleLib, setModuleLib] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [drawerStage, setDrawerStage] = useState(null);
  const [search, setSearch] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const searchRef = useRef(null);

  const [params, setParams] = useSearchParams();
  const activeFormation = params.get("formation") || "all";
  const selectedLocations = useMemo(() => (params.get("lieu") ? params.get("lieu").split(",").filter(Boolean) : []), [params]);
  const period = params.get("periode") || "upcoming";
  const rythme = params.get("rythme") || "all";
  const view = params.get("vue") || "list";
  const activeMonthParam = params.get("mois");

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (!value || value === "all" || (Array.isArray(value) && !value.length)) next.delete(key);
    else next.set(key, Array.isArray(value) ? value.join(",") : value);
    setParams(next, { replace: true });
  };

  const load = () => api.get("/stages").then((r) => setItems(r.data));
  useEffect(() => {
    load();
    api.get("/formations").then((r) => setFormations(r.data));
    api.get("/employees").then((r) => setAnimateurs(r.data.filter((u) => u.role === "animateur" || u.role === "admin"))).catch(() => {});
  }, []);

  // Redirection depuis l'Agenda général ("Voir la session") — ?stage=<id>
  // dans l'URL ouvre directement le panneau de détail dès que les stages
  // sont chargés, sans que l'utilisateur ait à la rechercher.
  useEffect(() => {
    if (!items.length) return;
    const stageId = params.get("stage");
    if (!stageId) return;
    const target = items.find((s) => s.id === stageId);
    if (target) {
      setDrawerStage(target);
      const next = new URLSearchParams(params);
      next.delete("stage");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const openCreate = (prefill = {}) => {
    setEditingId(null);
    setForm({ ...empty, ...prefill });
    setStageModules([]);
    setSelectedTemplateId("");
    setOpen(true);
  };
  const openEdit = (s) => {
    setEditingId(s.id);
    const ids = s.animateur_ids?.length ? s.animateur_ids : (s.animateur_id ? [s.animateur_id] : []);
    setForm({
      formation_id: s.formation_id || "", date_debut: s.date_debut || "", date_fin: s.date_fin || "",
      lieu_adresse: s.lieu_adresse || "", lieu_ville: s.lieu_ville || "", capacite_max: s.capacite_max ?? 20,
      animateur_ids: ids, statut: s.statut || "planifie", notes: s.notes || "", creneau: s.creneau || "",
      heure_debut: s.heure_debut || "09:00", heure_fin: s.heure_fin || "17:00",
      external_reserved: s.external_reserved ?? 0,
    });
    setStageModules(s.modules || []);
    setSelectedTemplateId("");
    const category = formations.find((f) => f.id === s.formation_id)?.category;
    if (category) {
      api.get("/session-templates", { params: { category } }).then((r) => setSessionTemplates(r.data)).catch(() => setSessionTemplates([]));
      api.get("/formation-modules", { params: { category } }).then((r) => setModuleLib(r.data)).catch(() => setModuleLib([]));
    } else {
      setSessionTemplates([]); setModuleLib([]);
    }
    setDrawerStage(null);
    setOpen(true);
  };

  // Dupliquer : pré-remplit le formulaire de création avec les mêmes
  // paramètres que la session d'origine, dates décalées d'une semaine.
  const duplicateStage = (s) => {
    openCreate({
      formation_id: s.formation_id || "", date_debut: addDaysIso(s.date_debut, 7), date_fin: addDaysIso(s.date_fin, 7),
      lieu_adresse: s.lieu_adresse || "", lieu_ville: s.lieu_ville || "", capacite_max: s.capacite_max ?? 20,
      animateur_ids: s.animateur_ids?.length ? s.animateur_ids : (s.animateur_id ? [s.animateur_id] : []),
      creneau: s.creneau || extractCreneau(s.notes) || "", notes: "",
      heure_debut: s.heure_debut || "09:00", heure_fin: s.heure_fin || "17:00", external_reserved: 0,
    });
  };

  const applyTemplate = async () => {
    if (!selectedTemplateId || !editingId) return;
    try {
      const { data } = await api.post(`/stages/${editingId}/apply-template`, { template_id: selectedTemplateId, replace: true });
      setStageModules(data.modules || []);
      toast.success("Modèle appliqué au calendrier de la session");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'application du modèle");
    }
  };

  const addModuleRow = () => {
    setStageModules((prev) => [...prev, {
      module_id: moduleLib[0]?.id || null, module_nom: moduleLib[0]?.nom || "Module",
      date: form.date_debut || "", heure_debut: "09:00", heure_fin: "17:00", animateur_id: null,
    }]);
  };
  const updateModuleRow = (idx, patch) => setStageModules((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  const removeModuleRow = (idx) => setStageModules((prev) => prev.filter((_, i) => i !== idx));

  const saveModules = async () => {
    try {
      await api.put(`/stages/${editingId}/modules`, { modules: stageModules });
      toast.success("Calendrier pédagogique enregistré");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'enregistrement du calendrier");
    }
  };

  const toggleAnimateur = (id) => {
    setForm((f) => ({ ...f, animateur_ids: f.animateur_ids.includes(id) ? f.animateur_ids.filter((a) => a !== id) : [...f.animateur_ids, id] }));
  };

  const save = async () => {
    try {
      const payload = { ...form, capacite_max: +form.capacite_max, external_reserved: +form.external_reserved || 0, creneau: form.creneau || null };
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

  const toggleLock = async (s) => {
    const next = s.statut === "complet" ? "planifie" : "complet";
    try {
      await api.put(`/stages/${s.id}`, { statut: next });
      toast.success(next === "complet" ? "Session verrouillée (complet)" : "Session déverrouillée");
      load();
      setDrawerStage((d) => (d && d.id === s.id ? { ...d, statut: next } : d));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/stages/${id}`);
      toast.success("Session supprimée");
      setDrawerStage(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    }
  };

  const importFileRef = useRef(null);
  const importExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setImporting(true);
    try {
      const { data } = await api.post("/vtc-import/vtc-taxi-sessions", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 });
      const warn = Object.keys(data.unmatched_metiers || {}).length ? ` · ${Object.keys(data.unmatched_metiers).length} métier(s) non reconnu(s), voir console` : "";
      if (warn) console.warn("Métiers non reconnus lors de l'import :", data.unmatched_metiers);
      toast.success(`${data.sessions_created} session(s) créée(s), ${data.inscriptions_created} inscription(s) importée(s)${warn}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'import du fichier Excel");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  // ── Onglets par formation ────────────────────────────────────────────────
  const formationTabs = useMemo(() => {
    const today = todayIso();
    const byId = new Map();
    for (const s of items) {
      const id = s.formation_id || "sans-formation";
      if (!byId.has(id)) byId.set(id, { id, label: s.formation_titre || "Autre", upcomingCount: 0, category: null });
      if ((s.date_fin || s.date_debut) >= today && s.statut !== "annule") byId.get(id).upcomingCount++;
    }
    for (const g of byId.values()) {
      g.category = formations.find((f) => f.id === g.id)?.category;
      g.color = colorForFormation(g.category, g.label);
    }
    return Array.from(byId.values()).sort((a, b) => b.upcomingCount - a.upcomingCount);
  }, [items, formations]);

  const activeColor = activeFormation === "all" ? null : formationTabs.find((t) => t.id === activeFormation)?.color;

  // Suggestions de ville (datalist du formulaire) — évite de semer de
  // nouvelles variantes d'orthographe en plus de celles déjà en base.
  const knownLocations = useMemo(() => {
    const set = new Set(["Épinay-sur-Seine", "Creil"]);
    for (const s of items) set.add(normalizeLocation(s.lieu_ville));
    set.delete("Sans lieu");
    return Array.from(set).sort();
  }, [items]);

  // ── Pipeline de filtrage (tab -> lieu -> rythme -> recherche) ───────────
  const baseFiltered = useMemo(() => {
    let list = items;
    if (activeFormation !== "all") list = list.filter((s) => s.formation_id === activeFormation);
    if (selectedLocations.length) list = list.filter((s) => selectedLocations.includes(normalizeLocation(s.lieu_ville)));
    if (rythme !== "all") list = list.filter((s) => (s.creneau || extractCreneau(s.notes)) === rythme);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => {
        const animNames = (s.animateur_ids?.length ? s.animateur_ids : (s.animateur_id ? [s.animateur_id] : []))
          .map((id) => animateurs.find((a) => a.id === id)?.name || "").join(" ");
        return (s.lieu_ville || "").toLowerCase().includes(q)
          || (s.date_debut || "").includes(q)
          || animNames.toLowerCase().includes(q)
          || (s.formation_titre || "").toLowerCase().includes(q);
      });
    }
    return list;
  }, [items, activeFormation, selectedLocations, rythme, search, animateurs]);

  const hasSoirInTab = useMemo(
    () => baseFiltered.some((s) => (s.creneau || extractCreneau(s.notes)) === "SOIR"),
    [baseFiltered]
  );

  const locationOptions = useMemo(() => {
    const counts = new Map();
    for (const s of baseFiltered) {
      const loc = normalizeLocation(s.lieu_ville);
      counts.set(loc, (counts.get(loc) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [baseFiltered]);

  const today = todayIso();
  const upcomingSet = useMemo(() => baseFiltered.filter((s) => (s.date_fin || s.date_debut) >= today && s.statut !== "annule"), [baseFiltered, today]);
  const pastSet = useMemo(() => baseFiltered.filter((s) => (s.date_fin || s.date_debut) < today), [baseFiltered, today]);

  const periodList = useMemo(() => {
    if (period === "upcoming") return [...upcomingSet].sort((a, b) => (a.date_debut || "").localeCompare(b.date_debut || ""));
    if (period === "past") return [...pastSet].sort((a, b) => (b.date_debut || "").localeCompare(a.date_debut || ""));
    return [...baseFiltered].sort((a, b) => (a.date_debut || "").localeCompare(b.date_debut || ""));
  }, [period, upcomingSet, pastSet, baseFiltered]);

  const monthGroups = useMemo(() => {
    const groups = new Map();
    for (const s of periodList) {
      const key = monthKey(s.date_debut);
      if (!groups.has(key)) groups.set(key, { key, sessions: [] });
      groups.get(key).sessions.push(s);
    }
    const arr = Array.from(groups.values()).map((g) => {
      const totalCap = g.sessions.reduce((n, s) => n + (s.capacite_max || 0), 0);
      const totalTaken = g.sessions.reduce((n, s) => n + (s.nb_inscrits || 0) + (s.external_reserved || 0), 0);
      return { ...g, label: monthLabelShort(g.key), labelLong: monthLabelLong(g.key), count: g.sessions.length, fillPct: totalCap ? Math.round((totalTaken / totalCap) * 100) : 0 };
    });
    arr.sort((a, b) => period === "past" ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
    return arr;
  }, [periodList, period]);

  const currentMonthKey = monthKey(new Date().toISOString().slice(0, 10));
  const activeMonth = activeMonthParam && monthGroups.some((m) => m.key === activeMonthParam)
    ? activeMonthParam
    : (monthGroups.find((m) => m.key === currentMonthKey)?.key || monthGroups[0]?.key);

  const scrollToMonth = (key) => {
    setParam("mois", key);
    const el = document.getElementById(`stage-month-${key}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Indicateurs d'en-tête (sur la sélection tab/lieu/rythme, hors période) ─
  const indicators = useMemo(() => {
    const vendues = upcomingSet.reduce((n, s) => n + (s.nb_inscrits || 0), 0);
    const restantes = upcomingSet.reduce((n, s) => n + Math.max(0, (s.capacite_max || 0) - (s.nb_inscrits || 0) - (s.external_reserved || 0)), 0);
    const avgFill = upcomingSet.length ? Math.round((upcomingSet.reduce((n, s) => n + fillRatio(s), 0) / upcomingSet.length) * 100) : 0;
    return { upcoming: upcomingSet.length, vendues, restantes, avgFill };
  }, [upcomingSet]);

  const hasActiveFilters = activeFormation !== "all" || selectedLocations.length > 0 || rythme !== "all" || period !== "upcoming";
  const resetFilters = () => setParams(new URLSearchParams(), { replace: true });

  // ── Raccourcis clavier ───────────────────────────────────────────────────
  const shiftMonth = useCallback((dir) => {
    const idx = monthGroups.findIndex((m) => m.key === activeMonth);
    const next = monthGroups[idx + dir];
    if (next) scrollToMonth(next.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthGroups, activeMonth]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || open) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); openCreate(); }
      else if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "ArrowLeft") shiftMonth(-1);
      else if (e.key === "ArrowRight") shiftMonth(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, shiftMonth]);

  return (
    <div className="space-y-5" data-testid="stages-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Planification</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Sessions de formation</h1>
          <p className="text-gray-500 mt-2">{items.length} session(s) planifiée(s).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} data-testid="stages-import-excel" />
          <Button type="button" variant="outline" disabled={importing} onClick={() => importFileRef.current?.click()} title="Importe les sessions VTC/Taxi/Passerelle depuis un fichier Excel (1 onglet par mois)">
            <UploadSimple size={16} className="mr-1" /> {importing ? "Import..." : "Importer Excel VTC/Taxi"}
          </Button>
          <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="new-stage-btn" onClick={() => openCreate()}>
            <Plus size={16} className="mr-1" /> Planifier une session <span className="hidden sm:inline text-[10px] opacity-60 ml-1 border border-white/30 rounded px-1">N</span>
          </Button>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Sessions à venir", value: indicators.upcoming },
          { label: "Places vendues", value: indicators.vendues },
          { label: "Places restantes", value: indicators.restantes },
          { label: "Remplissage moyen", value: `${indicators.avgFill}%` },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-3.5 border border-gray-200 rounded-md shadow-none">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">{kpi.label}</p>
            <p className="font-display text-2xl font-extrabold mt-0.5">{kpi.value}</p>
          </Card>
        ))}
      </div>

      <FormationTabs tabs={formationTabs} active={activeFormation} onChange={(v) => setParam("formation", v === "all" ? null : v)} />

      {/* Filtres */}
      <div className="hidden sm:flex items-center flex-wrap gap-3">
        <LocationFilter options={locationOptions} selected={selectedLocations} onChange={(v) => setParam("lieu", v)} />
        <div className="flex border border-gray-200 rounded-md overflow-hidden shrink-0">
          {[["upcoming", "À venir"], ["past", "Passées"], ["all", "Tout"]].map(([k, label]) => (
            <button key={k} className={`px-2.5 py-1.5 text-xs font-medium ${period === k ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`} onClick={() => setParam("periode", k === "upcoming" ? null : k)}>
              {label}
            </button>
          ))}
        </div>
        {hasSoirInTab && (
          <Select value={rythme} onValueChange={(v) => setParam("rythme", v === "all" ? null : v)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Jour & Soir</SelectItem>
              <SelectItem value="JOUR">Jour</SelectItem>
              <SelectItem value="SOIR">Soir</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (ville, date, formateur)... [/]" className="pl-8 h-8 text-xs w-64" />
        </div>
        <div className="flex border border-gray-200 rounded-md overflow-hidden shrink-0 ml-auto">
          <button className={`p-1.5 ${view === "list" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-500"}`} onClick={() => setParam("vue", null)} title="Vue liste"><ListBullets size={15} /></button>
          <button className={`p-1.5 ${view === "calendar" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-500"}`} onClick={() => setParam("vue", "calendar")} title="Vue calendrier"><SquaresFour size={15} /></button>
        </div>
        {hasActiveFilters && (
          <button className="text-xs text-gray-400 hover:text-red-600 underline shrink-0" onClick={resetFilters}>Réinitialiser</button>
        )}
      </div>

      {/* Filtres mobile */}
      <div className="sm:hidden">
        <button className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 rounded-md px-3 py-1.5" onClick={() => setMobileFiltersOpen((v) => !v)}>
          <FunnelSimple size={14} /> Filtres {hasActiveFilters ? `(${[activeFormation !== "all", !!selectedLocations.length, rythme !== "all", period !== "upcoming"].filter(Boolean).length})` : ""}
        </button>
        {mobileFiltersOpen && (
          <div className="mt-2 space-y-2">
            <LocationFilter options={locationOptions} selected={selectedLocations} onChange={(v) => setParam("lieu", v)} />
            <div className="flex border border-gray-200 rounded-md overflow-hidden w-fit">
              {[["upcoming", "À venir"], ["past", "Passées"], ["all", "Tout"]].map(([k, label]) => (
                <button key={k} className={`px-2.5 py-1.5 text-xs font-medium ${period === k ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600"}`} onClick={() => setParam("periode", k === "upcoming" ? null : k)}>
                  {label}
                </button>
              ))}
            </div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="h-8 text-xs" />
          </div>
        )}
      </div>

      {!periodList.length && (
        <Card className="p-12 text-center border-dashed">
          <p className="text-gray-500 mb-3">
            Aucune session{activeFormation !== "all" ? "" : ""}{selectedLocations.length ? ` à ${selectedLocations.join(", ")}` : ""}.
          </p>
          <Button variant="outline" onClick={() => openCreate({
            formation_id: activeFormation !== "all" ? activeFormation : "",
            lieu_ville: selectedLocations[0] || "",
          })}>
            <Plus size={14} className="mr-1" /> Planifier ici
          </Button>
        </Card>
      )}

      {periodList.length > 0 && view === "calendar" && activeMonth && (
        <CalendarView
          sessions={periodList.filter((s) => monthKey(s.date_debut) === activeMonth)}
          monthKey={activeMonth}
          colorFor={(s) => activeColor || colorForFormation(formations.find((f) => f.id === s.formation_id)?.category, s.formation_titre)}
          onOpen={setDrawerStage}
        />
      )}

      {periodList.length > 0 && view === "list" && (
        <>
          <MonthNavigator months={monthGroups} active={activeMonth} onSelect={scrollToMonth} />
          <div className="space-y-8">
            {monthGroups.map((mg) => (
              <div key={mg.key} id={`stage-month-${mg.key}`} className="scroll-mt-16">
                <p className="text-sm font-bold capitalize mb-3">
                  {mg.labelLong} — {mg.count} session{mg.count > 1 ? "s" : ""} · {mg.fillPct}% rempli
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mg.sessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      s={s}
                      color={colorForFormation(formations.find((f) => f.id === s.formation_id)?.category, s.formation_titre)}
                      showFormation={activeFormation === "all"}
                      animateurs={animateurs}
                      onOpen={setDrawerStage}
                      muted={(s.date_fin || s.date_debut) < today}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SessionDrawer
        stage={drawerStage}
        onClose={() => setDrawerStage(null)}
        animateurs={animateurs}
        onEdit={openEdit}
        onToggleLock={toggleLock}
        onDelete={remove}
        onDuplicate={duplicateStage}
        onDownloadAnts={downloadStageAntsBundle}
      />

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(empty); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Modifier la session" : "Nouvelle session de stage"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">Formation</label>
              <Select
                value={form.formation_id}
                onValueChange={(v) => {
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
              <Input value={form.lieu_ville} onChange={(e) => setForm({ ...form, lieu_ville: e.target.value })} list="stage-ville-suggestions" />
              <datalist id="stage-ville-suggestions">
                {knownLocations.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <label className="text-sm font-medium">Capacité max</label>
              <Input type="number" value={form.capacite_max} onChange={(e) => setForm({ ...form, capacite_max: e.target.value })} data-testid="stage-capacite-max" />
            </div>
            <div>
              <label className="text-sm font-medium" title="Places déjà prises par une plateforme externe (Groupon...) qui ne passe pas par nos inscriptions — vient en déduction des places restantes affichées et proposées à la réservation.">
                Places réservées ailleurs (Groupon...)
              </label>
              <Input type="number" min="0" value={form.external_reserved} onChange={(e) => setForm({ ...form, external_reserved: e.target.value })} data-testid="stage-external-reserved" />
              {editingId && (
                <p className="text-xs text-gray-500 mt-1">
                  Places restantes réelles : {Math.max(0, (+form.capacite_max || 0) - (items.find((i) => i.id === editingId)?.nb_inscrits || 0) - (+form.external_reserved || 0))}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Rythme</label>
              <Select
                value={form.creneau || "aucun"}
                onValueChange={(v) => {
                  const creneau = v === "aucun" ? "" : v;
                  setForm((f) => ({ ...f, creneau, ...(CRENEAU_HOURS[creneau] || {}) }));
                }}
              >
                <SelectTrigger data-testid="stage-creneau"><SelectValue placeholder="Aucun rythme précis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aucun">Aucun rythme précis</SelectItem>
                  <SelectItem value="JOUR">Jour</SelectItem>
                  <SelectItem value="SOIR">Soir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Heure de début</label>
              <Input type="time" value={form.heure_debut} onChange={(e) => setForm({ ...form, heure_debut: e.target.value })} data-testid="stage-heure-debut" />
            </div>
            <div>
              <label className="text-sm font-medium">Heure de fin</label>
              <Input type="time" value={form.heure_fin} onChange={(e) => setForm({ ...form, heure_fin: e.target.value })} data-testid="stage-heure-fin" />
            </div>
            {editingId && (
              <div>
                <label className="text-sm font-medium">Statut</label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                  <SelectTrigger data-testid="stage-statut"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUTS.map((s) => <SelectItem key={s} value={s}>{STATUT_LABELS[s] || s}</SelectItem>)}</SelectContent>
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
                    <label key={a.id} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border cursor-pointer ${checked ? "border-[#d4af37] bg-[#d4af37]/10" : "border-gray-200"}`}>
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

            {editingId && (
              <div className="sm:col-span-2 border-t border-gray-200 pt-4 mt-1">
                <label className="text-sm font-medium flex items-center gap-1.5"><Books size={14} /> Calendrier pédagogique</label>
                <p className="text-xs text-gray-400 mb-2">Modules étudiés par jour pour cette session — appliquez un modèle pré-enregistré ou éditez manuellement.</p>
                <div className="flex gap-2 mb-3">
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Choisir un modèle de session..." /></SelectTrigger>
                    <SelectContent>{sessionTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.nom}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" disabled={!selectedTemplateId} onClick={applyTemplate}>Appliquer</Button>
                </div>
                {!sessionTemplates.length && <p className="text-xs text-gray-400 mb-2">Aucun modèle pour cette catégorie de formation — gérez-les depuis la page Modules.</p>}
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {stageModules.map((m, idx) => (
                    <div key={m.id || idx} className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-md p-2">
                      <Input type="date" className="w-36" value={m.date || ""} onChange={(e) => updateModuleRow(idx, { date: e.target.value })} />
                      <Input type="time" className="w-24" value={m.heure_debut || ""} onChange={(e) => updateModuleRow(idx, { heure_debut: e.target.value })} />
                      <span className="text-xs text-gray-400">-</span>
                      <Input type="time" className="w-24" value={m.heure_fin || ""} onChange={(e) => updateModuleRow(idx, { heure_fin: e.target.value })} />
                      <Input className="flex-1 min-w-[140px]" value={m.module_nom || ""} onChange={(e) => updateModuleRow(idx, { module_nom: e.target.value })} placeholder="Nom du module" />
                      <Select value={m.animateur_id || "none"} onValueChange={(v) => updateModuleRow(idx, { animateur_id: v === "none" ? null : v })}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Formateur" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sans formateur</SelectItem>
                          {animateurs.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <button type="button" onClick={() => removeModuleRow(idx)} className="text-gray-300 hover:text-red-600"><Trash size={14} /></button>
                    </div>
                  ))}
                  {!stageModules.length && <p className="text-xs text-gray-400 text-center py-3">Aucun module planifié pour cette session.</p>}
                </div>
                <div className="flex justify-between mt-2">
                  <Button type="button" variant="outline" size="sm" onClick={addModuleRow}><Plus size={14} className="mr-1" /> Ajouter un module</Button>
                  <Button type="button" size="sm" onClick={saveModules} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Enregistrer le calendrier</Button>
                </div>
              </div>
            )}
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
  );
}
