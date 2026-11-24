import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, PhoneCall, CalendarPlus, Plus, Warning } from "@phosphor-icons/react";
import { formatDateTimeFR } from "@/lib/dateFormat";
import ScheduleCallbackDialog from "@/components/ScheduleCallbackDialog";
import BookAppointmentDialog from "@/components/BookAppointmentDialog";

// Page « Rappels » (demande du 2026-11-24) : tout ce qui est à rappeler au
// même endroit — demandes de rappel du site, réponses SMS, rappels planifiés
// depuis le CRM — avec le suivi de chaque tentative (qui, quand, résultat).
// Backend : routers/call_center.py (/call-center/rappels).

const STATUT_STYLE = {
  a_rappeler: "bg-blue-100 text-blue-700",
  en_cours: "bg-amber-100 text-amber-800",
  traite: "bg-green-100 text-green-700",
  rdv_pris: "bg-indigo-100 text-indigo-700",
  clos: "bg-gray-100 text-gray-500",
};
const MANAGERS = ["admin", "responsable_admission", "responsable_commercial"];
const PAGE_SIZE = 25;

export default function Rappels() {
  const { user } = useAuth();
  const [etat, setEtat] = useState("ouverts");
  const [assigne, setAssigne] = useState(MANAGERS.includes(user?.role) ? "all" : "moi");
  const [assignees, setAssignees] = useState([]);
  const [data, setData] = useState({ items: [], compte: {}, statuts: {}, resultats: {} });
  const [loading, setLoading] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [tentativeFor, setTentativeFor] = useState(null);
  const [rdvFor, setRdvFor] = useState(null);
  // Onglets par formation, comme Prospects et Rendez-vous (« Non précisée »
  // = demandes sans formation), et pagination de 25 lignes (2026-11-24).
  const [categorie, setCategorie] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get("/call-center/assignees").then((r) => setAssignees(r.data || [])).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const params = { etat };
    if (assigne !== "all") params.assigne = assigne;
    if (categorie !== "all") params.categorie = categorie;
    api.get("/call-center/rappels", { params })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Rappels non chargés"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [etat, assigne, categorie]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [etat, assigne, categorie]);

  const reassign = async (r, uid) => {
    try {
      await api.patch(`/call-center/rappels/${r.id}`, { assigned_to: uid });
      toast.success("Rappel réattribué");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const allItems = data.items || [];
  const pages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const pageCourante = Math.min(page, pages);
  const items = allItems.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);
  const cats = data.categories || {};
  const ongletsFormation = [
    ["all", "Toutes formations", Object.values(cats).reduce((s, n) => s + n, 0)],
    ...Object.entries(cats).filter(([k]) => k !== "AUTRE").sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, data.categorie_labels?.[k] || k, n]),
    ...(cats.AUTRE ? [["AUTRE", "Non précisée", cats.AUTRE]] : []),
    ...(categorie !== "all" && !cats[categorie] ? [[categorie, categorie === "AUTRE" ? "Non précisée" : data.categorie_labels?.[categorie] || categorie, 0]] : []),
  ];
  return (
    <div className="space-y-6" data-testid="rappels-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline">CRM</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Rappels</h1>
          <p className="text-gray-500 mt-2">Demandes de rappel (site, SMS) et rappels planifiés, avec le suivi de chaque tentative.</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="rappel-nouveau">
          <Plus size={16} className="mr-1" /> Planifier un rappel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={etat} onValueChange={setEtat}>
          <TabsList>
            <TabsTrigger value="ouverts">À traiter ({data.compte?.ouverts ?? "…"})</TabsTrigger>
            <TabsTrigger value="fermes">Traités ({data.compte?.fermes ?? "…"})</TabsTrigger>
            <TabsTrigger value="tous">Tous</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={assigne} onValueChange={setAssigne}>
          <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute l'équipe</SelectItem>
            <SelectItem value="moi">Mes rappels</SelectItem>
            {assignees.filter((u) => u.id !== user?.id).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {data.compte?.en_retard > 0 && (
          <span className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 flex items-center gap-1">
            <Warning size={14} /> {data.compte.en_retard} rappel{data.compte.en_retard > 1 ? "s" : ""} en retard
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" data-testid="rappels-categories">
        {ongletsFormation.map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setCategorie(k)} data-testid={`rappels-cat-${k}`}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${categorie === k ? "bg-[#0a0a0a] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {label} <span className="opacity-60">({n})</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="rappels-table">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Personne</th>
                <th className="py-2.5 px-4 overline">Formation</th>
                <th className="py-2.5 px-4 overline">À rappeler le</th>
                <th className="py-2.5 px-4 overline">Qui rappelle</th>
                <th className="py-2.5 px-4 overline">Tentatives</th>
                <th className="py-2.5 px-4 overline">Statut</th>
                <th className="py-2.5 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !allItems.length && <tr><td colSpan="7" className="py-10 text-center text-gray-400">Chargement...</td></tr>}
              {!loading && !allItems.length && <tr><td colSpan="7" className="py-10 text-center text-gray-400">Aucun rappel.</td></tr>}
              {items.map((r) => {
                const der = r.derniere_tentative;
                return (
                  <tr key={r.id} className={`border-b border-gray-100 align-top ${r.en_retard ? "bg-red-50/40" : ""}`} data-testid={`rappel-row-${r.id}`}>
                    <td className="py-2.5 px-4">
                      <p className="font-medium">{r.nom_complet}</p>
                      {r.telephone && (
                        <a href={`tel:${r.telephone}`} className="text-xs text-[#0052CC] flex items-center gap-1 hover:underline"><Phone size={11} /> {r.telephone}</a>
                      )}
                      <p className="text-[11px] text-gray-400">{r.origine} · reçu le {formatDateTimeFR(r.created_at)}{r.created_by_name ? ` par ${r.created_by_name}` : ""}</p>
                      {r.message && <p className="text-xs text-gray-500 italic mt-1 max-w-[280px]">« {r.message} »</p>}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-gray-600 max-w-[160px]">
                      {r.session || <span className="text-gray-300">Non précisée</span>}
                      {r.categorie !== "AUTRE" && <p className="text-[11px] text-gray-400">{data.categorie_labels?.[r.categorie]}</p>}
                    </td>
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                      {r.scheduled_at ? (
                        <span className={r.en_retard ? "text-red-700 font-semibold" : "text-gray-700"}>
                          {formatDateTimeFR(r.scheduled_at)}{r.en_retard ? " · en retard" : ""}
                        </span>
                      ) : <span className="text-gray-400">Dès que possible</span>}
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <Select value={r.assigned_to || "__none__"} onValueChange={(v) => v !== "__none__" && reassign(r, v)}>
                        <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" disabled>Non attribué</SelectItem>
                          {assignees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <button type="button" className="text-left hover:underline" onClick={() => setTentativeFor(r)}>
                        <span className="font-medium">{r.nb_tentatives}</span> tentative{r.nb_tentatives > 1 ? "s" : ""}
                        {der && <p className="text-[11px] text-gray-500">{der.label} · {der.by_name}, {formatDateTimeFR(der.at)}</p>}
                      </button>
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge className={`${STATUT_STYLE[r.statut] || "bg-gray-100"} hover:${STATUT_STYLE[r.statut] || ""}`}>{data.statuts?.[r.statut] || r.statut}</Badge>
                      {r.handled_by_name && <p className="text-[11px] text-gray-400 mt-1">par {r.handled_by_name}</p>}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setTentativeFor(r)} data-testid={`rappel-resultat-${r.id}`}>
                          <PhoneCall size={14} className="mr-1" /> Résultat
                        </Button>
                        {r.lead_id && (
                          <Button size="sm" variant="ghost" title="Prendre un rendez-vous"
                            onClick={() => setRdvFor({ id: r.lead_id, name: r.nom_complet, phone: r.telephone, email: r.email })}>
                            <CalendarPlus size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {allItems.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-500" data-testid="rappels-pagination">
            <p>{(pageCourante - 1) * PAGE_SIZE + 1}–{Math.min(pageCourante * PAGE_SIZE, allItems.length)} sur {allItems.length}</p>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={pageCourante <= 1} onClick={() => setPage(pageCourante - 1)}>Précédent</Button>
                <span className="text-xs">Page {pageCourante} / {pages}</span>
                <Button variant="outline" size="sm" disabled={pageCourante >= pages} onClick={() => setPage(pageCourante + 1)}>Suivant</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <ScheduleCallbackDialog open={newOpen} onOpenChange={setNewOpen} onCreated={load} />
      <BookAppointmentDialog open={!!rdvFor} onOpenChange={(v) => !v && setRdvFor(null)} lead={rdvFor} onCreated={load} />
      {tentativeFor && (
        <TentativeDialog rappel={tentativeFor} resultats={data.resultats || {}} onClose={() => setTentativeFor(null)}
          onSaved={(r) => { setTentativeFor(null); load(); if (r.statut === "rdv_pris" && r.lead_id) setRdvFor({ id: r.lead_id, name: r.nom_complet, phone: r.telephone, email: r.email }); }} />
      )}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, "0");

function TentativeDialog({ rappel, resultats, onClose, onSaved }) {
  const [resultat, setResultat] = useState("");
  const [note, setNote] = useState("");
  const [prochain, setProchain] = useState("");
  const [saving, setSaving] = useState(false);
  const besoinDate = ["a_rappeler", "messagerie", "injoignable"].includes(resultat);

  useEffect(() => {
    if (!besoinDate || prochain) return;
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
    setProchain(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`);
  }, [besoinDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!resultat) return toast.error("Choisissez le résultat de l'appel");
    setSaving(true);
    try {
      const { data } = await api.post(`/call-center/rappels/${rappel.id}/tentatives`, {
        resultat, note: note.trim() || undefined,
        prochain_rappel: besoinDate && prochain ? new Date(prochain).toISOString() : undefined,
      });
      toast.success("Tentative enregistrée");
      onSaved(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Non enregistré");
    } finally {
      setSaving(false);
    }
  };

  const tentatives = rappel.tentatives || [];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="rappel-tentative-dialog">
        <DialogHeader><DialogTitle className="font-display">Rappel — {rappel.nom_complet}</DialogTitle></DialogHeader>
        {rappel.telephone && (
          <a href={`tel:${rappel.telephone}`} className="text-sm text-[#0052CC] flex items-center gap-1"><Phone size={14} /> {rappel.telephone}</a>
        )}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">Historique ({tentatives.length} tentative{tentatives.length > 1 ? "s" : ""})</p>
          {!tentatives.length && <p className="text-sm text-gray-400">Aucune tentative pour l'instant.</p>}
          {[...tentatives].reverse().map((t, i) => (
            <div key={`${t.at}-${i}`} className="border-l-2 border-[#d4af37] pl-3">
              <p className="text-sm"><span className="font-medium">{tentatives.length - i}. {t.label}</span>{t.note ? ` — ${t.note}` : ""}</p>
              <p className="text-[11px] text-gray-400">
                {t.by_name} · {formatDateTimeFR(t.at)}{t.prochain_rappel ? ` · à rappeler le ${formatDateTimeFR(t.prochain_rappel)}` : ""}
              </p>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="text-sm font-medium">Résultat de cet appel</label>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(resultats).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setResultat(k)} data-testid={`rappel-res-${k}`}
                className={`text-xs py-2 px-2 rounded border text-left ${resultat === k ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "border-gray-200 hover:bg-gray-50"}`}>
                {label}
              </button>
            ))}
          </div>
          {besoinDate && (
            <label className="text-xs text-gray-600 block">Prochain rappel
              <Input type="datetime-local" value={prochain} onChange={(e) => setProchain(e.target.value)} className="h-9" />
            </label>
          )}
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (ajoutée aussi à l'historique du prospect)" />
          {resultat === "rdv_pris" && <p className="text-[11px] text-gray-500">La prise de rendez-vous s'ouvre juste après.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button onClick={save} disabled={saving || !resultat} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="rappel-tentative-save">
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
