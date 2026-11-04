import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CaretLeft, CaretRight, MapPin, Calendar } from "@phosphor-icons/react";
import { formatDateFR } from "@/lib/dateFormat";
import { toast } from "sonner";

const PLACE_LABELS = { BAFM: "BAFM", PSY: "Psychologue", FORMATEUR: "Formateur", TESTEUR: "Testeur" };
const JOURS_COURT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Même formatage local que pages/Agenda.jsx : toISOString() décalerait
// la date d'un jour selon le fuseau.
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthGrid(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // lundi
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const placesLibres = (s) => Object.values(s.places).filter((holders) => !holders.length).length;

// Agenda des placements pour les agents : qui est placé sur quelle session,
// et les sessions où il manque encore un formateur (voir
// services/formateur_placement.agenda).
export default function FormateursAgenda({ formateurs }) {
  const [anchor, setAnchor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("tous");
  const [selected, setSelected] = useState(null);

  const days = useMemo(() => monthGrid(anchor), [anchor]);

  useEffect(() => {
    setLoading(true);
    api.get("/formateurs/agenda", { params: { start: toISO(days[0]), end: toISO(days[days.length - 1]) } })
      .then((r) => setSessions(r.data))
      .catch(() => toast.error("Erreur de chargement de l'agenda"))
      .finally(() => setLoading(false));
  }, [days]);

  const visibles = useMemo(() => sessions.filter((s) => {
    if (filtre === "tous") return true;
    if (filtre === "a_pourvoir") return placesLibres(s) > 0;
    return Object.values(s.places).some((holders) => holders.some((h) => h.id === filtre));
  }), [sessions, filtre]);

  const byDay = useMemo(() => {
    const map = new Map();
    days.forEach((d) => {
      const iso = toISO(d);
      map.set(iso, visibles.filter((s) => s.date_debut <= iso && iso <= s.date_fin));
    });
    return map;
  }, [days, visibles]);

  const aPourvoir = sessions.filter((s) => placesLibres(s) > 0 && s.date_debut.slice(0, 7) === toISO(anchor).slice(0, 7)).length;
  const todayIso = toISO(new Date());
  const shift = (n) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));

  return (
    <div className="space-y-4" data-testid="formateurs-agenda">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Mois précédent"><CaretLeft size={16} /></Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Mois suivant"><CaretRight size={16} /></Button>
          <h2 className="font-display text-xl font-bold capitalize ml-2">
            {anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); setAnchor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Aujourd'hui</Button>
        </div>
        <Select value={filtre} onValueChange={setFiltre}>
          <SelectTrigger className="w-60" data-testid="agenda-filtre"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Toutes les sessions</SelectItem>
            <SelectItem value="a_pourvoir">Sessions à pourvoir</SelectItem>
            {formateurs.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#0B7238]/15 border-l-2 border-[#0B7238]" /> Toutes les places pourvues</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#F5A623]/15 border-l-2 border-[#F5A623]" /> Place(s) libre(s)</span>
        {!loading && <span>{aPourvoir} session(s) à pourvoir ce mois-ci</span>}
      </div>

      <div className="border border-gray-200 rounded-md overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {JOURS_COURT.map((j) => <div key={j} className="px-2 py-2 text-[11px] font-semibold text-gray-500 text-center">{j}</div>)}
          </div>
          <div className={`grid grid-cols-7 ${loading ? "opacity-50" : ""}`}>
            {days.map((d) => {
              const iso = toISO(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              return (
                <div key={iso} className={`border-b border-r border-gray-100 p-1.5 min-h-[110px] flex flex-col gap-1 ${inMonth ? "bg-white" : "bg-gray-50/60"}`} data-testid={`formateurs-agenda-day-${iso}`}>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${iso === todayIso ? "bg-[#d4af37] text-black" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                    {d.getDate()}
                  </span>
                  {(byDay.get(iso) || []).map((s) => {
                    const libres = placesLibres(s);
                    const noms = Object.values(s.places).flat().map((h) => h.name.split(" ")[0]);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelected(s)}
                        className={`text-left text-[10px] leading-tight px-1.5 py-0.5 rounded border-l-2 ${libres ? "bg-[#F5A623]/15 border-[#F5A623] text-[#8a5a00]" : "bg-[#0B7238]/15 border-[#0B7238] text-[#0B7238]"}`}
                        title={`${s.formation_titre}${s.lieu_ville ? ` · ${s.lieu_ville}` : ""}`}
                        data-testid={`formateurs-agenda-session-${s.id}`}
                      >
                        <span className="block truncate font-medium">{s.formation_titre}</span>
                        <span className="block truncate">{noms.length ? noms.join(", ") : "Aucun formateur"}{libres ? ` · ${libres} libre(s)` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent data-testid="formateurs-agenda-dialog">
          {selected && (
            <>
              <DialogHeader><DialogTitle>{selected.formation_titre}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-gray-500 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1"><Calendar size={14} /> {formatDateFR(selected.date_debut)} → {formatDateFR(selected.date_fin)}
                    {selected.heure_debut ? ` · ${selected.heure_debut}-${selected.heure_fin}` : ""}</span>
                  {selected.lieu_ville && <span className="flex items-center gap-1"><MapPin size={14} /> {selected.lieu_ville}</span>}
                </p>
                <div className="space-y-1">
                  {Object.entries(selected.places).map(([place, holders]) => (
                    <div key={place} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                      <span className="font-medium">{PLACE_LABELS[place] || place}</span>
                      {holders.length
                        ? <span>{holders.map((h) => h.name).join(", ")}</span>
                        : <span className="text-[#F5A623] font-medium">Libre</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  Pour placer ou retirer un formateur, passez par la page Sessions de formation.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
