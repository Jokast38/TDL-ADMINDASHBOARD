import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MapPin } from "@phosphor-icons/react";
import { formatDateFR } from "@/lib/dateFormat";
import { toast } from "sonner";

const PLACE_LABELS = { BAFM: "BAFM", PSY: "Psychologue", FORMATEUR: "Formateur", TESTEUR: "Testeur" };

// Centre de la session (2026-11-12) : Creil et Épinay ont chacun leurs
// dates, le formateur filtre et repère le centre d'un coup d'œil.
const CENTRES = [
  { key: "tous", label: "Tous les centres" },
  { key: "epinay", label: "Épinay-sur-Seine", style: "border-[#0052CC] text-[#0052CC] bg-[#0052CC]/5" },
  { key: "creil", label: "Creil", style: "border-[#B45309] text-[#B45309] bg-[#B45309]/5" },
];
const centreOf = (s) => {
  const v = (s.lieu_ville || "").toLowerCase();
  if (v.includes("creil")) return "creil";
  if (v.includes("pinay")) return "epinay";
  return "autre";
};

const monthLabel = (key) => new Date(`${key}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

// Choix des dates de l'année par le formateur : il voit si chaque place est
// libre, jamais qui l'occupe (voir services/formateur_placement.py).
export default function FormateurPlanningTab() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear + 1);
  const [planning, setPlanning] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [centre, setCentre] = useState("tous");

  const load = useCallback(() => api.get("/me/planning", { params: { year } }).then((r) => setPlanning(r.data)), [year]);
  useEffect(() => { setPlanning(null); load().catch(() => toast.error("Erreur de chargement du planning")); }, [load]);

  const months = useMemo(() => {
    const byMonth = {};
    (planning?.sessions || []).filter((s) => centre === "tous" || centreOf(s) === centre).forEach((s) => {
      const key = s.date_debut.slice(0, 7);
      (byMonth[key] = byMonth[key] || []).push(s);
    });
    return Object.entries(byMonth);
  }, [planning, centre]);
  const counts = useMemo(() => {
    const c = { tous: (planning?.sessions || []).length, epinay: 0, creil: 0 };
    (planning?.sessions || []).forEach((s) => { const k = centreOf(s); if (k in c) c[k] += 1; });
    return c;
  }, [planning]);

  const toggle = async (session) => {
    setBusyId(session.id);
    try {
      if (session.mine) {
        await api.delete(`/me/planning/${session.id}`);
        toast.success("Date retirée");
      } else {
        await api.post(`/me/planning/${session.id}`);
        toast.success("Vous êtes placé sur cette session");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
    await load().catch(() => {});
    setBusyId(null);
  };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="planning-tab">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline mb-1">Mes dates</p>
          <h2 className="font-display text-xl font-bold">Choisir mes dates {year}</h2>
          {planning && (
            <p className="text-sm text-gray-500 mt-1">
              {planning.jours_places} jour(s) choisi(s)
              {planning.quota_jours_annuel != null ? ` sur ${planning.quota_jours_annuel} autorisé(s)` : ""}
              {year > currentYear ? ` — à choisir avant le ${formatDateFR(planning.date_limite)}` : ""}.
            </p>
          )}
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28" data-testid="planning-year"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear, currentYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {planning && (counts.creil > 0 || counts.epinay > 0) && (
        <div className="flex gap-2 flex-wrap" data-testid="planning-centres">
          {CENTRES.map((c) => (
            <button key={c.key} type="button" onClick={() => setCentre(c.key)} data-testid={`planning-centre-${c.key}`}
              className={`text-xs px-3 py-1.5 rounded-full border ${centre === c.key ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              {c.label} ({counts[c.key] || 0})
            </button>
          ))}
        </div>
      )}

      {planning && !months.length && (
        <Card className="p-12 text-center border-dashed">
          <p className="text-gray-500">Aucune session ouverte pour {year} pour le moment.</p>
        </Card>
      )}

      {months.map(([key, sessions]) => (
        <div key={key}>
          <h3 className="text-sm font-semibold capitalize mb-2">{monthLabel(key)}</h3>
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card key={s.id} className="p-4 border border-gray-200 rounded-md shadow-none flex items-center justify-between gap-4 flex-wrap" data-testid={`planning-session-${s.id}`}>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{s.formation_titre}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {formatDateFR(s.date_debut)} → {formatDateFR(s.date_fin)}</span>
                    {s.lieu_ville && (
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border font-semibold ${CENTRES.find((c) => c.key === centreOf(s))?.style || "border-gray-200"}`}>
                        <MapPin size={12} /> {s.lieu_ville}
                      </span>
                    )}
                  </p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {Object.entries(s.places).map(([place, libre]) => (
                      <Badge key={place} variant="outline" className={`text-[10px] ${libre ? "border-[#0B7238] text-[#0B7238]" : "text-gray-400"}`}>
                        {PLACE_LABELS[place] || place} : {libre ? "libre" : "pris"}
                      </Badge>
                    ))}
                  </div>
                </div>
                {s.mine ? (
                  s.peut_retirer
                    ? <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => toggle(s)} data-testid={`planning-remove-${s.id}`}>Me retirer</Button>
                    : <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10">Vous êtes placé</Badge>
                ) : s.peut_choisir ? (
                  <Button size="sm" disabled={busyId === s.id} onClick={() => toggle(s)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`planning-choose-${s.id}`}>Me placer</Button>
                ) : (
                  <span className="text-xs text-gray-400">{s.conflit ? "Déjà placé à ces dates" : "Indisponible"}</span>
                )}
              </Card>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-400">
        Plus de place ou quota atteint ? Contactez un agent : lui seul peut vous placer sur des dates supplémentaires.
      </p>
    </div>
  );
}
