import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, MapPin, GraduationCap, PenNib, CaretLeft, CaretRight, Funnel } from "@phosphor-icons/react";

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const JOURS_COURT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Palette stable par module (couleur dérivée du nom du module, cohérente
// entre vue mois/semaine — deux occurrences du même module partagent
// toujours la même couleur, façon Google Calendar où chaque "agenda" a la
// sienne, ce qui permet de repérer un module d'un coup d'œil sur plusieurs
// sessions/jours.
const PALETTE = [
  { bg: "#e8f0fe", border: "#4285f4", text: "#1a4bab" },
  { bg: "#fce8e6", border: "#ea4335", text: "#a52714" },
  { bg: "#e6f4ea", border: "#34a853", text: "#1a7a35" },
  { bg: "#fef7e0", border: "#fbbc04", text: "#8a6d00" },
  { bg: "#f3e8fd", border: "#a142f4", text: "#6b21a8" },
  { bg: "#e4f7f9", border: "#00acc1", text: "#00697a" },
  { bg: "#fde7f3", border: "#e91e8c", text: "#a30f61" },
];
function colorFor(key) {
  let h = 0;
  for (let i = 0; i < (key || "").length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function toISO(d) { return d.toISOString().slice(0, 10); }
function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lundi comme premier jour
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
const HOUR_HEIGHT = 48; // px par heure, vue semaine

function minutesFromMidnight(hhmm) {
  if (!hhmm) return HOUR_START * 60;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export default function Agenda() {
  const [view, setView] = useState("month"); // "month" | "week"
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayDialog, setDayDialog] = useState(null); // { iso, events }
  const [filterStage, setFilterStage] = useState("all");
  const [filterAnimateur, setFilterAnimateur] = useState("all");
  const [filterModule, setFilterModule] = useState("all");

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const monthGridStart = useMemo(() => startOfMonthGrid(anchor), [anchor]);

  const rangeDays = useMemo(() => {
    if (view === "week") {
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
    }
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(monthGridStart); d.setDate(d.getDate() + i); return d; });
  }, [view, weekStart, monthGridStart]);

  useEffect(() => {
    setLoading(true);
    const dateFrom = toISO(rangeDays[0]);
    const dateTo = toISO(rangeDays[rangeDays.length - 1]);
    api.get("/agenda", { params: { date_from: dateFrom, date_to: dateTo } })
      .then((r) => setEvents(r.data.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [rangeDays]);

  const stageOptions = useMemo(() => {
    const byId = new Map();
    for (const ev of events) {
      if (!ev.stage_id || byId.has(ev.stage_id)) continue;
      byId.set(ev.stage_id, `${ev.formation_titre || "Session"} — ${ev.stage_id.slice(0, 8)}`);
    }
    return Array.from(byId.entries()).map(([id, label]) => ({ id, label }));
  }, [events]);
  const animateurOptions = useMemo(() => {
    const byId = new Map();
    for (const ev of events) {
      if (!ev.animateur_id || byId.has(ev.animateur_id)) continue;
      byId.set(ev.animateur_id, ev.animateur_nom || ev.animateur_id);
    }
    return Array.from(byId.entries()).map(([id, label]) => ({ id, label }));
  }, [events]);
  const moduleOptions = useMemo(() => {
    return Array.from(new Set(events.map((ev) => ev.module_nom).filter(Boolean))).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) =>
      (filterStage === "all" || ev.stage_id === filterStage) &&
      (filterAnimateur === "all" || ev.animateur_id === filterAnimateur) &&
      (filterModule === "all" || ev.module_nom === filterModule)
    );
  }, [events, filterStage, filterAnimateur, filterModule]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of filteredEvents) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    }
    for (const list of map.values()) list.sort((a, b) => (a.heure_debut || "").localeCompare(b.heure_debut || ""));
    return map;
  }, [filteredEvents]);

  const shiftBy = (dir) => {
    setAnchor((d) => {
      const n = new Date(d);
      if (view === "week") n.setDate(n.getDate() + dir * 7);
      else n.setMonth(n.getMonth() + dir);
      return n;
    });
  };

  const headerLabel = view === "week"
    ? `${rangeDays[0].getDate()} ${MOIS_FR[rangeDays[0].getMonth()]} — ${rangeDays[6].getDate()} ${MOIS_FR[rangeDays[6].getMonth()]} ${rangeDays[6].getFullYear()}`
    : `${MOIS_FR[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const todayIso = toISO(new Date());
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  return (
    <div className="space-y-6" data-testid="agenda-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Calendrier pédagogique</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Agenda</h1>
          <p className="text-gray-500 mt-2">Modules planifiés par jour, toutes sessions confondues.</p>
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
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-52 h-8 text-xs"><SelectValue placeholder="Session" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sessions</SelectItem>
            {stageOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAnimateur} onValueChange={setFilterAnimateur}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Formateur" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les formateurs</SelectItem>
            {animateurOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modules</SelectItem>
            {moduleOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterStage !== "all" || filterAnimateur !== "all" || filterModule !== "all") && (
          <button
            className="text-xs text-gray-400 hover:text-red-600 underline"
            onClick={() => { setFilterStage("all"); setFilterAnimateur("all"); setFilterModule("all"); }}
          >Réinitialiser</button>
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
              const dayEvents = eventsByDay.get(iso) || [];
              const isToday = iso === todayIso;
              const inMonth = d.getMonth() === anchor.getMonth();
              const visible = dayEvents.slice(0, 3);
              const extra = dayEvents.length - visible.length;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => dayEvents.length && setDayDialog({ iso, events: dayEvents })}
                  className={`text-left border-b border-r border-gray-100 p-1.5 min-h-[110px] flex flex-col gap-1 ${inMonth ? "bg-white" : "bg-gray-50/60"} hover:bg-gray-50 transition-colors`}
                  data-testid={`agenda-day-${iso}`}
                >
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${isToday ? "bg-[#d4af37] text-black" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                    {d.getDate()}
                  </span>
                  <div className="space-y-1">
                    {visible.map((ev) => {
                      const c = colorFor(ev.module_nom || "");
                      return (
                        <div
                          key={ev.id}
                          className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate border-l-2"
                          style={{ background: c.bg, borderColor: c.border, color: c.text }}
                          title={`${ev.heure_debut}-${ev.heure_fin} · ${ev.module_nom} · ${ev.formation_titre}`}
                        >
                          {ev.heure_debut} {ev.module_nom}
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
              const dayEvents = eventsByDay.get(iso) || [];
              return (
                <div key={iso} className="relative border-l border-gray-100">
                  {hours.map((h) => (
                    <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-gray-100" />
                  ))}
                  {dayEvents.map((ev) => {
                    const startMin = minutesFromMidnight(ev.heure_debut);
                    const endMin = Math.max(startMin + 30, minutesFromMidnight(ev.heure_fin));
                    const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
                    const c = colorFor(ev.module_nom || "");
                    return (
                      <div
                        key={ev.id}
                        className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 overflow-hidden border-l-2 shadow-sm cursor-pointer"
                        style={{ top, height: Math.max(height, 22), background: c.bg, borderColor: c.border, color: c.text }}
                        onClick={() => setDayDialog({ iso, events: [ev] })}
                        title={`${ev.heure_debut}-${ev.heure_fin} · ${ev.module_nom}`}
                        data-testid={`agenda-event-${ev.id}`}
                      >
                        <p className="text-[10px] font-semibold leading-tight truncate">{ev.module_nom}</p>
                        <p className="text-[9px] leading-tight truncate">{ev.heure_debut}–{ev.heure_fin} · {ev.formation_titre}</p>
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
        <DialogContent data-testid="agenda-day-dialog">
          <DialogHeader>
            <DialogTitle>
              {dayDialog && new Date(dayDialog.iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {dayDialog?.events.map((ev) => {
              const c = colorFor(ev.module_nom || "");
              return (
                <div key={ev.id} className="rounded-md border-l-4 p-3 text-sm" style={{ background: c.bg, borderColor: c.border }}>
                  <p className="font-semibold" style={{ color: c.text }}>{ev.module_nom}</p>
                  <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                    <p className="flex items-center gap-1.5"><Clock size={12} /> {ev.heure_debut} – {ev.heure_fin}</p>
                    <p className="flex items-center gap-1.5"><GraduationCap size={12} /> {ev.formation_titre}</p>
                    {ev.animateur_nom && <p className="flex items-center gap-1.5"><PenNib size={12} /> {ev.animateur_nom}</p>}
                    {ev.lieu_ville && <p className="flex items-center gap-1.5"><MapPin size={12} /> {ev.lieu_ville}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
