import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CaretLeft, Clock, ListChecks, PhoneCall, FolderOpen, CaretDown, CaretRight } from "@phosphor-icons/react";
import { formatDateLongFR } from "@/lib/dateFormat";

// Même vocabulaire que Activity.jsx — gardé synchronisé manuellement (petit
// fichier, pas encore partagé en composant commun).
const ROLE_LABELS = {
  admin: "Administrateur", employe: "Employé", animateur: "Animateur",
  responsable_admission: "Responsable admission", agent_admin: "Agent administratif",
  commercial: "Commercial", responsable_commercial: "Responsable commercial",
};

const ACTION_META = {
  lead_contacte: { label: "Lead contacté", icon: PhoneCall, color: "#0052CC" },
  appel: { label: "Appel", icon: PhoneCall, color: "#0052CC" },
  dossier_traite: { label: "Dossier traité", icon: FolderOpen, color: "#0B7238" },
  rappel_traite: { label: "Rappel traité", icon: ListChecks, color: "#d4af37" },
  lead_qualifie: { label: "Qualification", icon: ListChecks, color: "#6b21a8" },
  rdv_appel_cree: { label: "Rendez-vous créé", icon: Clock, color: "#c2410c" },
  appel_attribue: { label: "Appel attribué", icon: PhoneCall, color: "#0e7490" },
};

function actionMeta(action) {
  return ACTION_META[action] || { label: action, icon: ListChecks, color: "#6b7280" };
}

const AVATAR_COLORS = ["#0052CC", "#d4af37", "#0B7238", "#6b21a8", "#c2410c", "#be123c", "#0e7490"];
function avatarColorFor(id) {
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

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Construit la ligne de détail "notes au moment de l'action" à partir du
// contenu libre de `meta` — chaque type d'action a ses propres champs (voir
// services/activity.py::log_action, appelé depuis plusieurs routers avec des
// meta différents), donc pas de clé unique à afficher.
function describeEntry(e) {
  const m = e.meta || {};
  const who = m.lead_name || m.student_name || m.name || null;
  const parts = [];
  if (m.outcome) parts.push(`Résultat : ${m.outcome}`);
  if (m.qualification) parts.push(`Qualification : ${m.qualification}`);
  if (m.contact_status) parts.push(`Tag : ${m.contact_status}`);
  if (m.status) parts.push(`Statut : ${m.status}`);
  if (m.objection_reason) parts.push(`Objection : ${m.objection_reason}`);
  if (m.note) parts.push(`Note : « ${m.note} »`);
  return { who, detail: parts.join(" · ") };
}

const RANGE_OPTIONS = [
  { days: 1, label: "Aujourd'hui" },
  { days: 7, label: "7 jours" },
  { days: 31, label: "31 jours" },
  { days: 90, label: "90 jours" },
];

export default function EmployeeAudit() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const presetName = location.state?.name;
  const presetRole = location.state?.role;

  const [rangeDays, setRangeDays] = useState(7);
  const [employee, setEmployee] = useState(presetName ? { name: presetName, role: presetRole } : null);
  const [dailyMinutes, setDailyMinutes] = useState([]);
  const [logItems, setLogItems] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [collapsedDays, setCollapsedDays] = useState(() => new Set());
  const PAGE_SIZE = 100;

  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (rangeDays - 1));
    return toISO(d);
  }, [rangeDays]);
  const dateTo = toISO(new Date());

  useEffect(() => {
    if (!employee) {
      api.get("/employees/activity").then((r) => {
        const found = r.data.find((e) => e.id === employeeId);
        if (found) setEmployee({ name: found.name, role: found.role });
      }).catch(() => {});
    }
  }, [employeeId, employee]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    Promise.all([
      api.get("/employees/activity-by-day", { params: { days: rangeDays } }),
      api.get("/employees/activity-log", { params: { user_id: employeeId, date_from: dateFrom, date_to: dateTo, page: 1, page_size: PAGE_SIZE } }),
    ]).then(([daily, log]) => {
      const emp = daily.data.employees.find((e) => e.id === employeeId);
      setDailyMinutes(emp ? emp.days : []);
      setLogItems(log.data.items);
      setLogTotal(log.data.total);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [employeeId, rangeDays, dateFrom, dateTo]);

  const loadMore = () => {
    const nextPage = page + 1;
    api.get("/employees/activity-log", { params: { user_id: employeeId, date_from: dateFrom, date_to: dateTo, page: nextPage, page_size: PAGE_SIZE } })
      .then((r) => { setLogItems((prev) => [...prev, ...r.data.items]); setPage(nextPage); })
      .catch(() => {});
  };

  // Regroupement par jour ("bilan de fin de journée") — le plus récent en
  // premier, avec le temps actif de la journée (depuis activity-by-day) en
  // en-tête de chaque groupe.
  const groupedByDay = useMemo(() => {
    const map = new Map();
    for (const e of logItems) {
      const day = (e.at || "").slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(e);
    }
    const minutesByDay = new Map(dailyMinutes.map((d) => [d.date, d.minutes]));
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, entries]) => ({ day, entries, minutes: minutesByDay.get(day) || 0 }));
  }, [logItems, dailyMinutes]);

  const toggleDay = (day) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  };

  const totalMinutesInRange = dailyMinutes.reduce((sum, d) => sum + d.minutes, 0);
  const actionCounts = useMemo(() => {
    const counts = new Map();
    for (const e of logItems) counts.set(e.action, (counts.get(e.action) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [logItems]);

  return (
    <div className="space-y-6" data-testid="employee-audit-page">
      <div>
        <button
          onClick={() => navigate("/admin/activite")}
          className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 mb-3"
        >
          <CaretLeft size={14} /> Retour à Activité
        </button>
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback style={{ backgroundColor: avatarColorFor(employeeId), color: "#fff" }} className="font-semibold">
              {initials(employee?.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{employee?.name || "Employé"}</h1>
            <p className="text-gray-500 text-sm">{ROLE_LABELS[employee?.role] || employee?.role} — Bilan d'activité détaillé</p>
          </div>
        </div>
      </div>

      <div className="flex border border-gray-200 rounded-md overflow-hidden w-fit">
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.days}
            className={`px-3 py-1.5 text-xs font-medium ${rangeDays === o.days ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            onClick={() => setRangeDays(o.days)}
            data-testid={`employee-audit-range-${o.days}`}
          >{o.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4 border border-gray-200 rounded-md shadow-none flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[#0B7238]/10 flex items-center justify-center shrink-0">
            <Clock size={18} className="text-[#0B7238]" />
          </div>
          <div>
            <p className="text-xl font-bold leading-tight">{formatMinutes(totalMinutesInRange)}</p>
            <p className="text-xs text-gray-400">Temps actif sur la période</p>
          </div>
        </Card>
        <Card className="p-4 border border-gray-200 rounded-md shadow-none flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[#0052CC]/10 flex items-center justify-center shrink-0">
            <ListChecks size={18} className="text-[#0052CC]" />
          </div>
          <div>
            <p className="text-xl font-bold leading-tight">{logTotal}</p>
            <p className="text-xs text-gray-400">Action(s) enregistrée(s)</p>
          </div>
        </Card>
        <Card className="p-4 border border-gray-200 rounded-md shadow-none col-span-2 md:col-span-1">
          <p className="text-xs text-gray-400 mb-1.5">Répartition par type</p>
          <div className="flex flex-wrap gap-1.5">
            {actionCounts.length ? actionCounts.map(([action, count]) => (
              <Badge key={action} variant="outline" className="text-[10px]">
                {actionMeta(action).label} · {count}
              </Badge>
            )) : <span className="text-xs text-gray-300">—</span>}
          </div>
        </Card>
      </div>

      {loading ? (
        <Card className="p-12 text-center border-dashed"><p className="text-gray-500">Chargement...</p></Card>
      ) : groupedByDay.length === 0 ? (
        <Card className="p-12 text-center border-dashed"><p className="text-gray-500">Aucune action enregistrée sur cette période.</p></Card>
      ) : (
        <div className="space-y-3">
          {groupedByDay.map(({ day, entries, minutes }) => {
            const collapsed = collapsedDays.has(day);
            return (
              <Card key={day} className="border border-gray-200 rounded-md shadow-none overflow-hidden" data-testid={`audit-day-${day}`}>
                <button
                  onClick={() => toggleDay(day)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-display font-bold flex items-center gap-2">
                    {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
                    <span className="capitalize">{formatDateLongFR(day)}</span>
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-3">
                    <span>{entries.length} action(s)</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {formatMinutes(minutes)}</span>
                  </span>
                </button>
                {!collapsed && (
                  <div className="divide-y divide-gray-50">
                    {entries.map((e) => {
                      const { icon: Icon, color, label } = actionMeta(e.action);
                      const { who, detail } = describeEntry(e);
                      const time = (e.at || "").slice(11, 16);
                      return (
                        <div key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                          <span className="font-mono text-xs text-gray-400 w-12 shrink-0 pt-0.5">{time}</span>
                          <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A` }}>
                            <Icon size={13} style={{ color }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {label}{who ? <span className="font-normal text-gray-500"> — {who}</span> : null}
                            </p>
                            {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
          {logItems.length < logTotal && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMore} data-testid="audit-load-more">
                Charger plus ({logItems.length} / {logTotal})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
