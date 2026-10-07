import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, FolderOpen, Clock, CurrencyEur, PencilSimple, Trophy, ShoppingCart,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatDateTimeFR } from "@/lib/dateFormat";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const CATEGORY_LABELS = {
  CACES: "CACES", PERMIS: "Récupération de points", AUTO_ECOLE: "Auto-école",
  SSIAP: "SSIAP", VTC_TAXI: "VTC / Taxi", ECSR: "ECSR", VENTE: "Conseiller de Vente",
};

const ROLE_LABELS = {
  admin: "Administrateur", employe: "Employé", animateur: "Animateur",
  responsable_admission: "Responsable admission", agent_admin: "Agent administratif",
  commercial: "Commercial", responsable_commercial: "Responsable commercial",
};

const ACTIVITY_ACTION_LABELS = {
  lead_contacte: "Lead contacté", appel: "Appel", dossier_traite: "Dossier", rappel_traite: "Rappel",
  lead_qualifie: "Qualification",
};

const AVATAR_COLORS = ["#0052CC", "#d4af37", "#0B7238", "#6b21a8", "#c2410c", "#be123c", "#0e7490"];

function colorFor(id) {
  let hash = 0;
  for (let i = 0; i < (id || "").length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function formatMinutes(min) {
  if (!min) return "0 min";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000;

function fmtMoney(v) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);
}

// Reprend les 5 statuts réels du pipeline dossier (nouveau -> en_verification
// -> complet -> soumis_ants -> termine, voir services/trello.py) tels quels,
// plutôt que de les regrouper en 3 seaux génériques — on veut explicitement
// voir "complet" et "soumis_ants" séparément (état d'avancement ANTS).
const DOSSIER_STATUS_META = {
  nouveau: { label: "Nouveau", color: "#9ca3af" },
  en_verification: { label: "En vérification", color: "#F5A623" },
  complet: { label: "Complet", color: "#0052CC" },
  soumis_ants: { label: "Soumis ANTS", color: "#6b21a8" },
  termine: { label: "Terminé", color: "#0B7238" },
};
const DOSSIER_STATUS_ORDER = ["nouveau", "en_verification", "complet", "soumis_ants", "termine"];

function bucketDossierStatus(byStatus) {
  const counts = Object.fromEntries(DOSSIER_STATUS_ORDER.map((k) => [k, 0]));
  let total = 0;
  for (const s of byStatus || []) {
    if (counts[s.status] !== undefined) counts[s.status] += s.count;
    total += s.count;
  }
  return { counts, total };
}

export default function Activity() {
  const [items, setItems] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [commercialStats, setCommercialStats] = useState(null);
  const [callStats, setCallStats] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [revenueTimeseries, setRevenueTimeseries] = useState([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [employeesPage, setEmployeesPage] = useState(1);
  const EMPLOYEES_PAGE_SIZE = 5;

  const [dailyStats, setDailyStats] = useState(null);
  const [dailyDays, setDailyDays] = useState(14);

  const load = () => api.get("/employees/activity").then((r) => setItems(r.data)).catch(() => setItems([]));
  const loadDaily = () => api.get("/employees/activity-by-day", { params: { days: dailyDays } })
    .then((r) => setDailyStats(r.data)).catch(() => setDailyStats(null));
  const loadLog = () => api.get("/employees/activity-log", { params: { page_size: 8 } })
    .then((r) => setLog(r.data.items)).catch(() => setLog([]));

  useEffect(() => {
    load();
    loadLog();
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/dashboard/commercial-stats").then((r) => setCommercialStats(r.data)).catch(() => {});
    api.get("/call-center/stats", { params: { period: "month" } }).then((r) => setCallStats(r.data)).catch(() => {});
    api.get("/employees/activity-timeseries", { params: { days: 7 } }).then((r) => setTimeseries(r.data)).catch(() => {});
    api.get("/dashboard/revenue-timeseries", { params: { months: 6 } }).then((r) => setRevenueTimeseries(r.data)).catch(() => {});
    api.get("/dashboard/revenue-breakdown", { params: { months: 6 } }).then((r) => setRevenueBreakdown(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadDaily(); }, [dailyDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Horloge pour le temps de connexion en temps réel des employés en ligne
  // (voir colonne "Temps passé" du tableau) — recalculée chaque seconde sans
  // refaire d'appel réseau, à partir de first_seen déjà chargé.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Rafraîchit la liste des employés toutes les 60s pour que le statut
  // "Actif/Hors ligne" et first_seen restent à jour sans recharger la page.
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const openAdjust = (i) => {
    setAdjustTarget(i);
    setAdjustValue(i.manual_dossier_adjustment || 0);
    setAdjustNote(i.manual_dossier_adjustment_note || "");
  };

  const saveAdjust = async () => {
    setSaving(true);
    try {
      await api.put(`/employees/${adjustTarget.id}/dossier-adjustment`, {
        manual_dossier_adjustment: +adjustValue, note: adjustNote,
      });
      toast.success("Ajustement enregistré");
      setAdjustTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(() => (items || []).reduce((acc, i) => ({
    contacted: acc.contacted + i.leads_contacted,
    interesse: acc.interesse + i.leads_interesse,
    callbacks: acc.callbacks + i.callbacks_handled,
    inscriptions: acc.inscriptions + (i.inscriptions_traitees || 0),
    dossiersTraites: acc.dossiersTraites + (i.total_dossiers_traites || 0),
  }), { contacted: 0, interesse: 0, callbacks: 0, inscriptions: 0, dossiersTraites: 0 }), [items]);

  const weekMinutes = useMemo(() => timeseries.reduce((s, d) => s + d.minutes, 0), [timeseries]);
  const dossierBuckets = useMemo(() => bucketDossierStatus(stats?.by_status), [stats]);

  // "Actif" ici = connecté en ce moment (même calcul que le badge
  // Actif/Hors ligne de la ligne : dernier ping < ONLINE_THRESHOLD_MS), pas
  // le statut de compte activé/désactivé. On exclut aussi les comptes
  // désactivés (account_status suspendu/archivé, ou active === false en
  // base) qui ne devraient de toute façon jamais apparaître "en ligne".
  // Recalculé à chaque tick de `now` pour qu'un employé qui se déconnecte
  // disparaisse de la liste sans attendre un rechargement de page.
  const topEmployees = useMemo(() =>
    [...(items || [])]
      .filter((i) => i.active !== false && i.account_status !== "suspendu" && i.account_status !== "archive")
      .filter((i) => i.last_seen && (now - new Date(i.last_seen).getTime()) < ONLINE_THRESHOLD_MS)
      .sort((a, b) => (b.total_dossiers_traites || 0) - (a.total_dossiers_traites || 0)),
    [items, now]);

  const employeesTotalPages = Math.max(1, Math.ceil(topEmployees.length / EMPLOYEES_PAGE_SIZE));
  const pagedEmployees = useMemo(
    () => topEmployees.slice((employeesPage - 1) * EMPLOYEES_PAGE_SIZE, employeesPage * EMPLOYEES_PAGE_SIZE),
    [topEmployees, employeesPage]
  );
  useEffect(() => {
    if (employeesPage > employeesTotalPages) setEmployeesPage(1);
  }, [employeesTotalPages, employeesPage]);

  if (items === null) {
    return <p className="text-sm text-gray-400 py-12 text-center">Chargement...</p>;
  }

  const lineData = {
    labels: timeseries.map((d) => new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short" })),
    datasets: [{
      label: "Temps passé (h)",
      data: timeseries.map((d) => +(d.minutes / 60).toFixed(1)),
      borderColor: "#0052CC", backgroundColor: "rgba(0,82,204,0.08)",
      tension: 0.35, fill: true, pointRadius: 3, pointBackgroundColor: "#0052CC",
    }],
  };

  const barData = {
    labels: revenueTimeseries.map((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      return new Date(y, mo - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
    }),
    datasets: [
      { label: "TDL réalisé", data: revenueTimeseries.map((m) => m.tdl_realise), backgroundColor: "#0052CC", borderRadius: 4, maxBarThickness: 20 },
      { label: "TDL prévisionnel", data: revenueTimeseries.map((m) => m.tdl_previsionnel), backgroundColor: "#93c5fd", borderRadius: 4, maxBarThickness: 20 },
      { label: "KAMI STREET", data: revenueTimeseries.map((m) => m.kami), backgroundColor: "#d4af37", borderRadius: 4, maxBarThickness: 20 },
    ],
  };

  const donutData = {
    labels: DOSSIER_STATUS_ORDER.map((k) => DOSSIER_STATUS_META[k].label),
    datasets: [{
      data: DOSSIER_STATUS_ORDER.map((k) => dossierBuckets.counts[k]),
      backgroundColor: DOSSIER_STATUS_ORDER.map((k) => DOSSIER_STATUS_META[k].color),
      borderWidth: 0,
    }],
  };

  const pct = (n) => dossierBuckets.total ? Math.round((n / dossierBuckets.total) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="activity-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="overline">Suivi d'équipe</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Activité</h1>
          <p className="text-gray-500 mt-2">Aperçu de l'activité de l'équipe — connexion, dossiers traités et performance commerciale.</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Personnes inscrites" value={stats?.total_inscriptions ?? "—"} bg="#EFF6FF" color="#0052CC" />
        <KpiCard icon={FolderOpen} label="Dossiers traités" value={totals.dossiersTraites} bg="#F5F0FF" color="#6b21a8" />
        <KpiCard icon={Clock} label="Temps passé (7j, équipe)" value={formatMinutes(weekMinutes)} bg="#ECFDF5" color="#0B7238" />
        <KpiCard icon={CurrencyEur} label="CA TDL réalisé (payé)" value={fmtMoney(stats?.revenue_tdl_paid)} bg="#FFF7ED" color="#c2410c" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={CurrencyEur} label="CA TDL en cours (non payé)" value={fmtMoney(stats?.revenue_tdl_pending)} bg="#FEF9F0" color="#b45309" />
        <KpiCard icon={CurrencyEur} label="CA prévisionnel (nb inscrits)" value={fmtMoney(stats?.forecast_revenue_by_enrollment)} bg="#FEF2F2" color="#dc2626" />
        <KpiCard icon={ShoppingCart} label="CA KAMI STREET (commandes)" value={fmtMoney(stats?.revenue_kami)} bg="#FFFBEB" color="#b8860b" />
        <KpiCard icon={FolderOpen} label="Dossiers en vérification" value={stats?.en_verification ?? "—"} bg="#F0F9FF" color="#0ea5e9" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 p-5 border border-gray-200 rounded-md shadow-none">
          <p className="font-display text-lg font-bold">Activité de l'équipe</p>
          <p className="text-xs text-gray-500 mb-4">Temps passé (en heures) sur les 7 derniers jours</p>
          <div style={{ height: 200 }}>
            <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
          </div>
        </Card>

        <Card className="lg:col-span-1 p-5 border border-gray-200 rounded-md shadow-none">
          <p className="font-display text-lg font-bold">Chiffre d'affaires</p>
          <p className="text-xs text-gray-500 mb-4">TDL Formation (réalisé/prévisionnel) vs KAMI STREET — 6 derniers mois</p>
          <div style={{ height: 200 }}>
            <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { beginAtZero: true } } }} />
          </div>
        </Card>

        <Card className="lg:col-span-1 p-5 border border-gray-200 rounded-md shadow-none">
          <p className="font-display text-lg font-bold mb-4">Répartition des dossiers</p>
          <div className="flex items-center gap-4">
            <div style={{ width: 130, height: 130 }} className="relative shrink-0">
              <Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { display: false } } }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-display text-xl font-bold">{dossierBuckets.total}</p>
                <p className="text-[10px] text-gray-400">dossiers</p>
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              {DOSSIER_STATUS_ORDER.map((k) => (
                <LegendDot key={k} color={DOSSIER_STATUS_META[k].color} label={DOSSIER_STATUS_META[k].label}
                  value={`${dossierBuckets.counts[k]} (${pct(dossierBuckets.counts[k])}%)`} />
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* CA par formation / par origine du lead — pas que le total global,
          sur la même fenêtre de 6 mois que le graphique ci-dessus. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 border border-gray-200 rounded-md shadow-none">
          <p className="font-display text-lg font-bold mb-1">CA par formation</p>
          <p className="text-xs text-gray-500 mb-4">Réalisé (payé) — 6 derniers mois</p>
          {!revenueBreakdown ? (
            <p className="text-sm text-gray-400">Chargement...</p>
          ) : !revenueBreakdown.by_formation.length ? (
            <p className="text-sm text-gray-400">Aucune donnée.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {revenueBreakdown.by_formation.slice(0, 10).map((f, idx) => (
                <div key={f.formation} className="flex items-center justify-between text-sm gap-3">
                  <span className="truncate flex-1" title={f.formation}>{f.formation}</span>
                  <span className="text-xs text-gray-400 shrink-0">{f.count} insc.</span>
                  <span className="font-mono font-semibold text-[#0B7238] shrink-0 w-20 text-right">{fmtMoney(f.realise)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 border border-gray-200 rounded-md shadow-none">
          <p className="font-display text-lg font-bold mb-1">CA par origine du lead</p>
          <p className="text-xs text-gray-500 mb-4">Réalisé (payé) — 6 derniers mois</p>
          {!revenueBreakdown ? (
            <p className="text-sm text-gray-400">Chargement...</p>
          ) : !revenueBreakdown.by_origin.length ? (
            <p className="text-sm text-gray-400">Aucune donnée.</p>
          ) : (
            <div className="space-y-3">
              {revenueBreakdown.by_origin.map((o) => {
                const maxRealise = Math.max(...revenueBreakdown.by_origin.map((x) => x.realise), 1);
                const pctWidth = Math.round((o.realise / maxRealise) * 100);
                return (
                  <div key={o.origin}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{o.label}</span>
                      <span className="font-mono font-semibold">{fmtMoney(o.realise)} <span className="text-gray-400 font-normal">({o.count})</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#0052CC]" style={{ width: `${pctWidth}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Performance des employés */}
        <Card className="lg:col-span-2 p-0 border border-gray-200 rounded-md shadow-none overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <p className="font-display text-lg font-bold flex items-center gap-2"><Users size={16} className="text-[#d4af37]" /> Employés en ligne</p>
            <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10">
              <span className="h-1.5 w-1.5 rounded-full mr-1.5 bg-[#0B7238]" /> {topEmployees.length} connecté(s)
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-y border-gray-100 text-gray-400">
                <tr>
                  <th className="py-2 px-5 overline font-normal">Employé</th>
                  <th className="py-2 px-4 overline font-normal">Temps passé</th>
                  <th className="py-2 px-4 overline font-normal" title="Inscriptions traitées + rappels traités + ajustement manuel — les dossiers/inscriptions qui changent réellement d'état">Dossiers traités</th>
                  <th className="py-2 px-4 overline font-normal" title="Nombre de leads distincts contactés au moins une fois (Prospects/Cosmosia/Meta)">Leads contactés</th>
                  <th className="py-2 px-4 overline font-normal" title="Nombre total d'appels passés (peut compter plusieurs appels pour un même lead)">Appels (total)</th>
                  <th className="py-2 px-4 overline font-normal">Activité</th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {pagedEmployees.map((i) => {
                  const online = i.last_seen && (now - new Date(i.last_seen).getTime()) < ONLINE_THRESHOLD_MS;
                  // connection_minutes_today vient du temps d'interaction réel
                  // (clics/frappe), pas du temps de connexion brut — on ne peut
                  // donc plus l'extrapoler en direct comme avant (ça supposait
                  // une activité continue depuis first_seen) : on affiche la
                  // valeur reçue, rafraîchie à chaque rechargement de la page.
                  return (
                    <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50" data-testid={`activity-row-${i.id}`}>
                      <td className="py-2.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback style={{ backgroundColor: colorFor(i.id), color: "#fff" }} className="text-xs font-semibold">
                              {initials(i.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium leading-tight">{i.name}</p>
                            <p className="text-[11px] text-gray-400">{ROLE_LABELS[i.role] || i.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">
                        {online ? (
                          <span className="text-[#0B7238] flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0B7238] animate-pulse" />
                            {formatMinutes(i.connection_minutes_today)}
                          </span>
                        ) : formatMinutes(i.connection_minutes_today)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-semibold">{i.total_dossiers_traites || 0}</span>
                        {(i.total_dossiers_traites || 0) >= 50 && (
                          <Trophy size={13} weight="fill" className="inline ml-1 text-[#d4af37]" title="A dépassé 50 dossiers traités" />
                        )}
                        <button onClick={() => openAdjust(i)} className="ml-1.5 p-0.5 hover:bg-gray-100 rounded text-gray-300 hover:text-gray-600 align-middle" title="Ajuster" data-testid={`adjust-${i.id}`}>
                          <PencilSimple size={11} />
                        </button>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">{i.leads_contacted}</td>
                      <td className="py-2.5 px-4 font-mono text-xs">
                        {i.calls_total || 0}
                        {!!i.calls_today && <span className="ml-1 text-[#0B7238]">(+{i.calls_today} auj.)</span>}
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge className={online ? "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10" : "bg-gray-100 text-gray-400 hover:bg-gray-100"}>
                          <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${online ? "bg-[#0B7238]" : "bg-gray-300"}`} />
                          {online ? "Actif" : "Hors ligne"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-right pr-5">
                        {i.pending_workload !== null && i.pending_workload > 0 && (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">{i.pending_workload} en attente</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!topEmployees.length && (
                  <tr><td colSpan="7" className="py-10 text-center text-gray-400">Aucun employé en ligne actuellement.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {topEmployees.length > EMPLOYEES_PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-gray-500 px-5 py-3 border-t border-gray-100">
              <p className="text-xs">
                {(employeesPage - 1) * EMPLOYEES_PAGE_SIZE + 1}–{Math.min(employeesPage * EMPLOYEES_PAGE_SIZE, topEmployees.length)} sur {topEmployees.length}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={employeesPage <= 1} onClick={() => setEmployeesPage((p) => Math.max(1, p - 1))} data-testid="employees-prev-page">
                  Précédent
                </Button>
                <span className="text-xs">Page {employeesPage} / {employeesTotalPages}</span>
                <Button variant="outline" size="sm" disabled={employeesPage >= employeesTotalPages} onClick={() => setEmployeesPage((p) => Math.min(employeesTotalPages, p + 1))} data-testid="employees-next-page">
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Dossiers panel — état d'avancement ANTS détaillé */}
        <Card className="p-5 border border-gray-200 rounded-md shadow-none">
          <p className="font-display text-lg font-bold flex items-center gap-2 mb-4"><FolderOpen size={16} className="text-[#d4af37]" /> Dossiers</p>
          <div className="space-y-4">
            {DOSSIER_STATUS_ORDER.map((k) => (
              <ProgressRow key={k} color={DOSSIER_STATUS_META[k].color} label={DOSSIER_STATUS_META[k].label}
                value={dossierBuckets.counts[k]} pct={pct(dossierBuckets.counts[k])} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Derniers dossiers traités (journal chronologique) */}
        <Card className="lg:col-span-2 p-0 border border-gray-200 rounded-md shadow-none overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <p className="font-display text-lg font-bold">Dernières actions traitées</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-y border-gray-100 text-gray-400">
                <tr>
                  <th className="py-2 px-5 overline font-normal">Type</th>
                  <th className="py-2 px-4 overline font-normal">Personne</th>
                  <th className="py-2 px-4 overline font-normal">Employé</th>
                  <th className="py-2 px-4 overline font-normal">Détail</th>
                  <th className="py-2 px-4 overline font-normal text-right pr-5">Date</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="py-2.5 px-5">
                      <Badge variant="outline" className="text-[10px]">{ACTIVITY_ACTION_LABELS[e.action] || e.action}</Badge>
                    </td>
                    <td className="py-2.5 px-4">{e.meta?.lead_name || e.meta?.student_name || e.meta?.name || "—"}</td>
                    <td className="py-2.5 px-4 text-gray-600">{e.user_name}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-400">
                      {e.meta?.outcome || e.meta?.status || e.meta?.contact_status || e.meta?.qualification || ""}
                    </td>
                    <td className="py-2.5 px-4 text-right pr-5 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {formatDateTimeFR(e.at)}
                    </td>
                  </tr>
                ))}
                {!log.length && (
                  <tr><td colSpan="5" className="py-10 text-center text-gray-400">Aucune action récente.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Prévisionnel CA */}
        <Card className="p-5 border border-gray-200 rounded-md shadow-none">
          <p className="font-display text-lg font-bold flex items-center gap-2 mb-4"><CurrencyEur size={16} className="text-[#d4af37]" /> Prévisionnel CA</p>
          <div className="space-y-3 text-sm">
            <p className="overline text-gray-400">TDL Formation</p>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Réalisé (payé)</span>
              <span className="font-bold font-mono text-[#0B7238]">{fmtMoney(stats?.revenue_tdl_paid)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">En cours (non payé)</span>
              <span className="font-semibold font-mono text-amber-700">{fmtMoney(stats?.revenue_tdl_pending)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Prévisionnel (nb inscrits × prix catalogue)</span>
              <span className="font-semibold font-mono text-[#c2410c]">{fmtMoney(stats?.forecast_revenue_by_enrollment)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-700 font-medium">KAMI STREET (commandes)</span>
              <span className="font-bold font-mono text-[#b8860b]">{fmtMoney(stats?.revenue_kami)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-500">Pipeline commercial (appels)</span>
              <span className="font-semibold font-mono">{fmtMoney(callStats?.totals?.forecast_revenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Taux de conversion</span>
              <span className="font-bold font-mono text-[#0B7238]">{commercialStats?.conversion_rate ?? 0}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700 font-medium">Appels ce mois</span>
              <span className="font-bold font-mono">{callStats?.totals?.calls ?? 0}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Statistiques par jour, par employé — section globale distincte du
          total agrégé du tableau principal plus haut : on voit ici, jour par
          jour, qui a été actif et combien de temps, sur la période choisie. */}
      <Card className="p-5 border border-gray-200 rounded-md shadow-none" data-testid="daily-stats-section">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <p className="font-display text-lg font-bold flex items-center gap-2">
            <Clock size={16} className="text-[#d4af37]" /> Statistiques par jour — temps de travail par employé
          </p>
          <div className="flex border border-gray-200 rounded-md overflow-hidden">
            {[7, 14, 31].map((d) => (
              <button
                key={d}
                className={`px-3 py-1 text-xs font-medium ${dailyDays === d ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                onClick={() => setDailyDays(d)}
                data-testid={`daily-stats-range-${d}`}
              >{d} jours</button>
            ))}
          </div>
        </div>
        {!dailyStats ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-y border-gray-100 text-gray-400">
                <tr>
                  <th className="py-2 px-3 overline font-normal sticky left-0 bg-white">Employé</th>
                  {dailyStats.date_keys.map((d) => (
                    <th key={d} className="py-2 px-2 overline font-normal text-center whitespace-nowrap">
                      {d.slice(8, 10)}/{d.slice(5, 7)}
                    </th>
                  ))}
                  <th className="py-2 px-3 overline font-normal text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.employees.map((emp) => (
                  <tr key={emp.id} className="border-b border-gray-50">
                    <td className="py-2 px-3 font-medium whitespace-nowrap sticky left-0 bg-white">{emp.name}</td>
                    {emp.days.map((d) => (
                      <td key={d.date} className="py-2 px-2 text-center font-mono text-xs">
                        {d.minutes > 0 ? (
                          <span className={d.minutes >= 240 ? "text-[#0B7238] font-semibold" : "text-gray-600"}>
                            {d.minutes >= 60 ? `${Math.floor(d.minutes / 60)}h${String(d.minutes % 60).padStart(2, "0")}` : `${d.minutes}m`}
                          </span>
                        ) : <span className="text-gray-200">—</span>}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right font-semibold font-mono">{formatMinutes(emp.total_minutes)}</td>
                  </tr>
                ))}
                {!dailyStats.employees.length && (
                  <tr><td colSpan={dailyStats.date_keys.length + 2} className="py-10 text-center text-gray-400">Aucune donnée.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!adjustTarget} onOpenChange={(v) => !v && setAdjustTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuster le total de dossiers traités</DialogTitle></DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 mt-2">
              <p className="text-sm text-gray-500">
                Employé : <b>{adjustTarget.name}</b><br />
                Décompte automatique actuel : {(adjustTarget.total_dossiers_traites || 0) - (adjustTarget.manual_dossier_adjustment || 0)} dossier(s)
              </p>
              <div>
                <label className="text-sm font-medium">Ajustement (à ajouter au décompte automatique)</label>
                <Input type="number" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} data-testid="adjust-value" />
                <p className="text-xs text-gray-500 mt-1">
                  Ex : +30 pour créditer un travail effectué avant la mise en place du suivi automatique. Peut être négatif pour corriger.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Note (optionnel)</label>
                <Textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Ex : travail effectué avant le déploiement du suivi (estimation)" />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setAdjustTarget(null)}>Annuler</Button>
                <Button onClick={saveAdjust} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, bg, color }) {
  return (
    <Card className="p-5 border border-gray-200 rounded-md shadow-none" style={{ backgroundColor: bg }}>
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-md flex items-center justify-center" style={{ backgroundColor: `${color}1A` }}>
          <Icon size={18} style={{ color }} weight="duotone" />
        </div>
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
      <p className="font-display text-2xl font-bold mt-3">{value}</p>
    </Card>
  );
}

function LegendDot({ color, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold ml-auto">{value}</span>
    </div>
  );
}

function ProgressRow({ color, label, value, pct }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>
        <span className="font-semibold">{value} <span className="text-gray-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
