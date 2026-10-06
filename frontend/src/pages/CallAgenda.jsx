import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, EnvelopeSimple, User, CaretLeft, CaretRight, Funnel, CheckCircle, HandPointing } from "@phosphor-icons/react";
import { formatDateFR, formatDateTimeFR } from "@/lib/dateFormat";

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const JOURS_COURT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Code couleur par type de formation (lead_interest), pas par statut — même
// palette/logique de hash que l'Agenda pédagogique (Agenda.jsx), pour repérer
// d'un coup d'œil quelle formation concerne chaque créneau. Le statut
// (disponible/traité/annulé...) reste visible via le label/badge et le
// barré appliqué séparément sur les créneaux "traité".
const PALETTE = [
  { bg: "#e8f0fe", border: "#4285f4", text: "#1a4bab" },
  { bg: "#fce8e6", border: "#ea4335", text: "#a52714" },
  { bg: "#e6f4ea", border: "#34a853", text: "#1a7a35" },
  { bg: "#fef7e0", border: "#fbbc04", text: "#8a6d00" },
  { bg: "#f3e8fd", border: "#a142f4", text: "#6b21a8" },
  { bg: "#e4f7f9", border: "#00acc1", text: "#00697a" },
  { bg: "#fde7f3", border: "#e91e8c", text: "#a30f61" },
];
const NO_INTEREST_COLOR = { bg: "#f1f1f1", border: "#9aa0a6", text: "#5f6368" };

function colorFor(interest) {
  if (!interest) return NO_INTEREST_COLOR;
  let h = 0;
  for (let i = 0; i < interest.length; i++) h = (h * 31 + interest.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonthGrid(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}

const HOUR_START = 7;
const HOUR_END = 20;
const HOUR_HEIGHT = 48;

function timeOf(iso) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return "--:--"; }
}
function minutesFromIso(iso) {
  try {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  } catch { return HOUR_START * 60; }
}
function dateKeyOf(iso) {
  try { return toISO(new Date(iso)); } catch { return ""; }
}

export default function CallAgenda() {
  const { user } = useAuth();
  const [view, setView] = useState("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayDialog, setDayDialog] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [claimingId, setClaimingId] = useState(null);

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const monthGridStart = useMemo(() => startOfMonthGrid(anchor), [anchor]);

  const rangeDays = useMemo(() => {
    if (view === "week") {
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
    }
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(monthGridStart); d.setDate(d.getDate() + i); return d; });
  }, [view, weekStart, monthGridStart]);

  const load = () => {
    setLoading(true);
    const dateFrom = toISO(rangeDays[0]);
    const dateTo = toISO(rangeDays[rangeDays.length - 1]);
    api.get("/call-center/appointments", { params: { date_from: dateFrom, date_to: dateTo } })
      .then((r) => setAppointments(r.data.items || []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [rangeDays]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => filterStatus === "all" || a.status === filterStatus);
  }, [appointments, filterStatus]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const a of filteredAppointments) {
      const key = dateKeyOf(a.scheduled_at);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    for (const list of map.values()) list.sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""));
    return map;
  }, [filteredAppointments]);

  const shiftBy = (dir) => {
    setAnchor((d) => {
      const n = new Date(d);
      if (view === "week") n.setDate(n.getDate() + dir * 7);
      else n.setMonth(n.getMonth() + dir);
      return n;
    });
  };

  const handleClaim = async (appt) => {
    setClaimingId(appt.id);
    try {
      const r = await api.post(`/call-center/appointments/${appt.id}/claim`);
      toast.success("Appel attribué — créneau marqué comme traité.");
      setAppointments((prev) => prev.map((a) => (a.id === appt.id ? r.data : a)));
      setDayDialog((d) => d ? { ...d, events: d.events.map((e) => (e.id === appt.id ? r.data : e)) } : d);
    } catch (e) {
      if (e?.response?.status === 409) {
        toast.error("Ce créneau vient d'être pris par un autre agent.");
        load();
      } else {
        toast.error("Impossible d'attribuer ce créneau.");
      }
    } finally {
      setClaimingId(null);
    }
  };

  const headerLabel = view === "week"
    ? `${rangeDays[0].getDate()} ${MOIS_FR[rangeDays[0].getMonth()]} — ${rangeDays[6].getDate()} ${MOIS_FR[rangeDays[6].getMonth()]} ${rangeDays[6].getFullYear()}`
    : `${MOIS_FR[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const todayIso = toISO(new Date());
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  return (
    <div className="space-y-6" data-testid="call-agenda-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Espace commercial</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Agenda d'appel</h1>
          <p className="text-gray-500 mt-2">Créneaux à appeler, issus des imports Cosmosia et des rendez-vous planifiés.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex border border-gray-200 rounded-md overflow-hidden">
            <button
              className={`px-3 py-1.5 text-xs font-medium ${view === "month" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              onClick={() => setView("month")}
            >Mois</button>
            <button
              className={`px-3 py-1.5 text-xs font-medium ${view === "week" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              onClick={() => setView("week")}
            >Semaine</button>
          </div>
          <Button variant="outline" size="icon" onClick={() => shiftBy(-1)}><CaretLeft size={16} /></Button>
          <span className="text-sm font-medium capitalize min-w-[200px] text-center">{headerLabel}</span>
          <Button variant="outline" size="icon" onClick={() => shiftBy(1)}><CaretRight size={16} /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Aujourd'hui</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 flex items-center gap-1"><Funnel size={13} /> Filtrer :</span>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="disponible">Disponible</SelectItem>
            <SelectItem value="planifie">Planifié</SelectItem>
            <SelectItem value="traite">Traité</SelectItem>
            <SelectItem value="annule">Annulé</SelectItem>
          </SelectContent>
        </Select>
        {filterStatus !== "all" && (
          <button className="text-xs text-gray-400 hover:text-red-600 underline" onClick={() => setFilterStatus("all")}>
            Réinitialiser
          </button>
        )}
      </div>

      {loading ? (
        <Card className="p-12 text-center border-dashed"><p className="text-gray-500">Chargement...</p></Card>
      ) : view === "month" ? (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {JOURS_COURT.map((j) => (
              <div key={j} className="px-2 py-2 text-[11px] font-semibold text-gray-500 text-center">{j}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {rangeDays.map((d) => {
              const iso = toISO(d);
              const dayAppointments = byDay.get(iso) || [];
              const isToday = iso === todayIso;
              const inMonth = d.getMonth() === anchor.getMonth();
              const visible = dayAppointments.slice(0, 3);
              const extra = dayAppointments.length - visible.length;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => dayAppointments.length && setDayDialog({ iso, events: dayAppointments })}
                  className={`text-left border-b border-r border-gray-100 p-1.5 min-h-[110px] flex flex-col gap-1 ${inMonth ? "bg-white" : "bg-gray-50/60"} hover:bg-gray-50 transition-colors`}
                  data-testid={`call-agenda-day-${iso}`}
                >
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${isToday ? "bg-[#d4af37] text-black" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                    {d.getDate()}
                  </span>
                  <div className="space-y-1">
                    {visible.map((a) => {
                      const c = colorFor(a.lead_interest);
                      return (
                        <div
                          key={a.id}
                          className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate border-l-2 ${a.status === "traite" ? "line-through" : ""}`}
                          style={{ background: c.bg, borderColor: c.border, color: c.text }}
                          title={`${timeOf(a.scheduled_at)} · ${a.lead_name || ""}`}
                        >
                          {timeOf(a.scheduled_at)} {a.lead_name}
                        </div>
                      );
                    })}
                    {extra > 0 && <div className="text-[10px] text-gray-400 pl-1.5">+{extra} de plus</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div className="border-b border-gray-200 bg-gray-50" />
            {rangeDays.map((d) => {
              const iso = toISO(d);
              const isToday = iso === todayIso;
              return (
                <div key={iso} className={`border-b border-l border-gray-200 px-2 py-2 text-center ${isToday ? "bg-[#d4af37]/10" : "bg-gray-50"}`}>
                  <p className="text-[11px] font-semibold text-gray-500">{JOURS_FR[d.getDay()].slice(0, 3)}</p>
                  <p className={`text-sm font-bold ${isToday ? "text-[#b8941f]" : ""}`}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>
          <div className="grid relative" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div>
              {hours.map((h) => (
                <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-gray-100 text-right pr-1.5">
                  <span className="text-[10px] text-gray-400 relative -top-2">{h}h</span>
                </div>
              ))}
            </div>
            {rangeDays.map((d) => {
              const iso = toISO(d);
              const dayAppointments = byDay.get(iso) || [];
              return (
                <div key={iso} className="relative border-l border-gray-100">
                  {hours.map((h) => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-gray-100" />
                  ))}
                  {dayAppointments.map((a) => {
                    const startMin = minutesFromIso(a.scheduled_at);
                    const endMin = startMin + 30;
                    const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                    const c = colorFor(a.lead_interest);
                    return (
                      <div
                        key={a.id}
                        className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 overflow-hidden border-l-2 shadow-sm cursor-pointer ${a.status === "traite" ? "line-through" : ""}`}
                        style={{ top, height: Math.max(height, 22), background: c.bg, borderColor: c.border, color: c.text }}
                        onClick={() => setDayDialog({ iso, events: [a] })}
                        title={`${timeOf(a.scheduled_at)} · ${a.lead_name || ""}`}
                        data-testid={`call-agenda-event-${a.id}`}
                      >
                        <p className="text-[10px] font-semibold leading-tight truncate">{a.lead_name}</p>
                        <p className="text-[9px] leading-tight truncate">{timeOf(a.scheduled_at)} · {APPOINTMENT_STATUS_LABEL(a.status)}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!dayDialog} onOpenChange={(v) => !v && setDayDialog(null)}>
        <DialogContent data-testid="call-agenda-day-dialog">
          <DialogHeader>
            <DialogTitle>
              {dayDialog && formatDateFR(dayDialog.iso)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {dayDialog?.events.map((a) => {
              const c = colorFor(a.lead_interest);
              const isDisponible = a.status === "disponible";
              const isMine = a.commercial_id === user?.id;
              return (
                <div key={a.id} className="rounded-md border-l-4 p-3 text-sm" style={{ background: c.bg, borderColor: c.border }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`font-semibold ${a.status === "traite" ? "line-through" : ""}`} style={{ color: c.text }}>
                      {a.lead_name || "Lead"}
                    </p>
                    <Badge variant="outline" style={{ borderColor: c.border, color: c.text }}>{APPOINTMENT_STATUS_LABEL(a.status)}</Badge>
                  </div>
                  <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                    <p className="flex items-center gap-1.5"><User size={12} /> {timeOf(a.scheduled_at)}</p>
                    {a.lead_phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {a.lead_phone}</p>}
                    {a.lead_email && <p className="flex items-center gap-1.5"><EnvelopeSimple size={12} /> {a.lead_email}</p>}
                    {a.lead_interest && <p className="text-gray-500">Intérêt : {a.lead_interest}</p>}
                    {a.notes && <p className="text-gray-500 italic">{a.notes}</p>}
                  </div>

                  {a.status === "traite" && (
                    <p className="text-xs mt-2 flex items-center gap-1.5 text-green-700">
                      <CheckCircle size={14} weight="fill" /> Appel traité par {a.commercial_name || "un agent"}
                      {a.claimed_at ? ` le ${formatDateTimeFR(a.claimed_at)}` : ""}
                    </p>
                  )}
                  {a.status === "planifie" && !isDisponible && (
                    <p className="text-xs mt-2 text-gray-500">Planifié pour {a.commercial_name || "un agent"}</p>
                  )}
                  {isDisponible && (
                    <Button
                      size="sm"
                      className="mt-2 gap-1.5"
                      disabled={claimingId === a.id}
                      onClick={() => handleClaim(a)}
                      data-testid={`claim-appointment-${a.id}`}
                    >
                      <HandPointing size={14} /> {claimingId === a.id ? "Attribution..." : "Je m'attribue cet appel"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function APPOINTMENT_STATUS_LABEL(status) {
  return { disponible: "Disponible", planifie: "Planifié", traite: "Traité", annule: "Annulé" }[status] || status;
}
