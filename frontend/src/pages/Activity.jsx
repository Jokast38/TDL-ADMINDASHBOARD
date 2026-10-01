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

function formatSeconds(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0
    ? `${h}h${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`
    : `${m}m${String(s).padStart(2, "0")}s`;
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
  const [now, setNow] = useState(() => Date.now());

  const load = () => api.get("/employees/activity").then((r) => setItems(r.data)).catch(() => setItems([]));
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
  }, []);

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

  const topEmployees = useMemo(() =>
    [...(items || [])].sort((a, b) => (b.total_dossiers_traites || 0) - (a.total_dossiers_traites || 0)).slice(0, 8),
    [items]);

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Performance des employés */}
        <Card className="lg:col-span-2 p-0 border border-gray-200 rounded-md shadow-none overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <p className="font-display text-lg font-bold flex items-center gap-2"><Users size={16} className="text-[#d4af37]" /> Performance des employés</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-y border-gray-100 text-gray-400">
                <tr>
                  <th className="py-2 px-5 overline font-normal">Employé</th>
                  <th className="py-2 px-4 overline font-normal">Temps passé</th>
                  <th className="py-2 px-4 overline font-normal">Dossiers traités</th>
                  <th className="py-2 px-4 overline font-normal">Leads contactés</th>
                  <th className="py-2 px-4 overline font-normal">Appels (total)</th>
                  <th className="py-2 px-4 overline font-normal">Activité</th>
                  <th className="py-2 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {topEmployees.map((i) => {
                  const online = i.last_seen && (now - new Date(i.last_seen).getTime()) < ONLINE_THRESHOLD_MS;
                  // Pour un employé en ligne, on affiche le temps écoulé depuis
                  // first_seen recalculé à la seconde (temps réel) plutôt que
                  // le total figé reçu au dernier chargement.
                  const liveSeconds = online && i.first_seen
                    ? Math.max(0, Math.round((now - new Date(i.first_seen).getTime()) / 1000))
                    : null;
                  return (
                    <tr key={i.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i.active === false ? "opacity-50" : ""}`} data-testid={`activity-row-${i.id}`}>
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
                        {liveSeconds !== null ? (
                          <span className="text-[#0B7238] flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#0B7238] animate-pulse" />
                            {formatSeconds(liveSeconds)}
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
                  <tr><td colSpan="7" className="py-10 text-center text-gray-400">Aucun employé.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
                      {e.meta?.outcome || e.meta?.status || e.meta?.contact_status || ""}
                    </td>
                    <td className="py-2.5 px-4 text-right pr-5 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {new Date(e.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
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
