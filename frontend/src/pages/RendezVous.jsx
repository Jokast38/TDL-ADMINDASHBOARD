import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, UserMinus, XCircle, Phone, MapPin } from "@phosphor-icons/react";
import { formatDateFR } from "@/lib/dateFormat";
import { toast } from "sonner";

// Onglet « Rendez-vous » du CRM (cahier des charges du 2026-11-10) : mes RDV
// du jour et vue d'équipe, statut de chaque RDV et saisie du résultat par la
// personne assignée. Backend : routers/call_center.py (/call-center/rendez-vous),
// règles : core/rdv_suivi.py. Les RDV se prennent depuis l'onglet Leads
// (bouton « Prendre un rendez-vous »).

const STATUT_STYLE = {
  planifie: "bg-blue-100 text-blue-700",
  retour_a_renseigner: "bg-amber-100 text-amber-800",
  effectue: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  annule: "bg-gray-100 text-gray-500",
  traite: "bg-gray-100 text-gray-600",
  fait: "bg-green-100 text-green-700",
};
const MANAGERS = ["admin", "responsable_admission", "responsable_commercial"];
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export default function RendezVous() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const highlight = params.get("rdv");
  const [vue, setVue] = useState(params.get("vue") === "equipe" ? "equipe" : "moi");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [assignee, setAssignee] = useState("all");
  const [assignees, setAssignees] = useState([]);
  const [data, setData] = useState({ items: [], statuts: {} });
  const [busy, setBusy] = useState(null);

  // Lien « Renseigner le rendez-vous » de la notification : on ouvre la
  // bonne journée et la bonne vue pour que la ligne soit visible.
  useEffect(() => {
    if (!highlight) return;
    api.get("/call-center/appointments").then((r) => {
      const a = (r.data.items || []).find((x) => x.id === highlight);
      if (!a) return;
      const d = new Date(a.scheduled_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
      setDateFrom(d); setDateTo(d);
      if (a.commercial_id !== user?.id) setVue("equipe");
    }).catch(() => {});
  }, [highlight, user?.id]);

  useEffect(() => {
    api.get("/call-center/assignees").then((r) => setAssignees(r.data || [])).catch(() => {});
  }, []);

  const load = () => {
    const p = vue === "moi" ? { vue, date_from: dateFrom, date_to: dateFrom } : { vue, date_from: dateFrom, date_to: dateTo };
    if (vue === "equipe" && assignee !== "all") p.commercial_id = assignee;
    api.get("/call-center/rendez-vous", { params: p }).then((r) => setData(r.data)).catch(() => toast.error("Rendez-vous non chargés"));
  };
  useEffect(load, [vue, dateFrom, dateTo, assignee]); // eslint-disable-line react-hooks/exhaustive-deps

  const setResult = async (a, resultat) => {
    setBusy(a.id);
    try {
      await api.post(`/call-center/appointments/${a.id}/resultat`, { resultat });
      toast.success(resultat === "effectue" ? "Rendez-vous effectué" : "Lead absent enregistré");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (a) => {
    if (!window.confirm(`Annuler le rendez-vous avec ${a.lead_name} ? Le prospect sera prévenu.`)) return;
    setBusy(a.id);
    try {
      await api.patch(`/call-center/appointments/${a.id}`, { status: "annule" });
      toast.success("Rendez-vous annulé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const items = data.items || [];
  const aRenseigner = items.filter((a) => a.statut_suivi === "retour_a_renseigner").length;

  return (
    <div className="space-y-6" data-testid="rendez-vous-page">
      <div>
        <p className="overline">CRM</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Rendez-vous</h1>
        <p className="text-gray-500 mt-2">Les rendez-vous se prennent depuis l'onglet Leads (« Prendre un rendez-vous »).</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={vue} onValueChange={(v) => { setVue(v); if (v === "moi") { setDateFrom(today()); setDateTo(today()); } }}>
          <TabsList>
            <TabsTrigger value="moi" data-testid="rdv-vue-moi">Mes rendez-vous</TabsTrigger>
            <TabsTrigger value="equipe" data-testid="rdv-vue-equipe">Équipe</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="text-xs text-gray-600">
          {vue === "moi" ? "Jour" : "Du"}
          <Input type="date" className="w-40 h-9" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value); }} />
        </label>
        {vue === "equipe" && (
          <>
            <label className="text-xs text-gray-600">
              Au
              <Input type="date" className="w-40 h-9" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute l'équipe</SelectItem>
                {assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        {dateFrom !== today() && <Button variant="ghost" size="sm" onClick={() => { setDateFrom(today()); setDateTo(today()); }}>Aujourd'hui</Button>}
      </div>

      {aRenseigner > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          {aRenseigner} rendez-vous terminé{aRenseigner > 1 ? "s" : ""} sans retour : indiquez s'il a eu lieu ou si le lead était absent.
        </p>
      )}

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="rdv-table">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Lead</th>
                <th className="py-2.5 px-4 overline">Date</th>
                <th className="py-2.5 px-4 overline">Heure</th>
                <th className="py-2.5 px-4 overline">Assigné à</th>
                <th className="py-2.5 px-4 overline">Statut</th>
                <th className="py-2.5 px-4 overline text-right">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {!items.length && (
                <tr><td colSpan="6" className="py-10 text-center text-gray-400">
                  {vue === "moi" ? "Aucun rendez-vous ce jour-là." : "Aucun rendez-vous sur cette période."}
                </td></tr>
              )}
              {items.map((a) => {
                const ouvert = ["planifie", "retour_a_renseigner"].includes(a.statut_suivi);
                const peutSaisir = ouvert && (a.commercial_id === user?.id || MANAGERS.includes(user?.role));
                return (
                  <tr key={a.id} className={`border-b border-gray-100 align-top ${a.id === highlight ? "bg-[#fff8dc]" : ""}`} data-testid={`rdv-row-${a.id}`}>
                    <td className="py-2.5 px-4">
                      <p className="font-medium">{a.lead_name || "—"}</p>
                      {a.lead_phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={11} /> {a.lead_phone}</p>}
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        {a.kind === "physique" ? <><MapPin size={11} /> {a.location || "Physique"}</> : "Appel"}
                        {a.formation_titre ? ` · ${a.formation_titre}` : ""}
                      </p>
                      {a.notes && <p className="text-xs text-gray-500 mt-1 italic">« {a.notes} »</p>}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">{formatDateFR(a.date_paris)}</td>
                    <td className="py-2.5 px-4 font-mono">{a.heure_paris}</td>
                    <td className="py-2.5 px-4 text-gray-700">{a.commercial_name || "—"}</td>
                    <td className="py-2.5 px-4">
                      <Badge className={`${STATUT_STYLE[a.statut_suivi] || "bg-gray-100"} hover:${STATUT_STYLE[a.statut_suivi] || ""}`}>
                        {data.statuts?.[a.statut_suivi] || a.statut_suivi}
                      </Badge>
                      {a.resultat_by_name && <p className="text-[11px] text-gray-400 mt-1">par {a.resultat_by_name}</p>}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {peutSaisir ? (
                        <div className="flex justify-end flex-wrap gap-1">
                          <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => setResult(a, "effectue")} className="text-green-700" data-testid={`rdv-effectue-${a.id}`}>
                            <CheckCircle size={14} className="mr-1" /> Effectué
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => setResult(a, "absent")} className="text-red-700" data-testid={`rdv-absent-${a.id}`}>
                            <UserMinus size={14} className="mr-1" /> Lead absent
                          </Button>
                          {a.statut_suivi === "planifie" && (
                            <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => cancel(a)} title="Annuler le rendez-vous">
                              <XCircle size={14} />
                            </Button>
                          )}
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
