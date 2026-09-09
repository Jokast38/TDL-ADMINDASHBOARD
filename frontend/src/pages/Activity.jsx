import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendUp, PhoneCall, CheckCircle, XCircle, ChatCircleText, Tag, IdentificationCard, Trophy, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATEGORY_LABELS = {
  CACES: "CACES", PERMIS: "Récupération de points", AUTO_ECOLE: "Auto-école",
  SSIAP: "SSIAP", VTC_TAXI: "VTC / Taxi", ECSR: "ECSR", VENTE: "Conseiller de Vente",
};

const ROLE_LABELS = {
  admin: "Administrateur", employe: "Employé", animateur: "Animateur",
  responsable_admission: "Responsable admission", agent_admin: "Agent administratif",
  commercial: "Commercial", responsable_commercial: "Responsable commercial",
};

export default function Activity() {
  const [items, setItems] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/employees/activity").then((r) => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

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

  if (items === null) {
    return <p className="text-sm text-gray-400 py-12 text-center">Chargement...</p>;
  }

  const totals = items.reduce((acc, i) => ({
    contacted: acc.contacted + i.leads_contacted,
    interesse: acc.interesse + i.leads_interesse,
    callbacks: acc.callbacks + i.callbacks_handled,
    inscriptions: acc.inscriptions + (i.inscriptions_traitees || 0),
  }), { contacted: 0, interesse: 0, callbacks: 0, inscriptions: 0 });

  return (
    <div className="space-y-6" data-testid="activity-page">
      <div>
        <p className="overline flex items-center gap-2"><TrendUp size={12} /> Productivité de l'équipe</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Activité</h1>
        <p className="text-gray-500 mt-2">
          Nombre de leads, inscriptions et demandes de rappel traités par employé, et résultats obtenus. Ne compte que
          ce qui a été fait depuis la mise en place de ce suivi (relances, mises à jour de statut, tags prospects).
          Une notification (email + félicitations au CEO) est envoyée automatiquement tous les 50 dossiers traités.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatTile icon={PhoneCall} label="Leads traités (total équipe)" value={totals.contacted} color="#0052CC" />
        <StatTile icon={IdentificationCard} label="Inscriptions traitées" value={totals.inscriptions} color="#6b21a8" />
        <StatTile icon={CheckCircle} label="Marqués intéressés" value={totals.interesse} color="#0B7238" />
        <StatTile icon={ChatCircleText} label="Rappels traités" value={totals.callbacks} color="#d4af37" />
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 overline">Employé</th>
                <th className="py-3 px-4 overline">Rôle</th>
                <th className="py-3 px-4 overline">Formations assignées</th>
                <th className="py-3 px-4 overline text-right">Leads traités</th>
                <th className="py-3 px-4 overline text-right">Intéressés</th>
                <th className="py-3 px-4 overline text-right">Pas intéressés</th>
                <th className="py-3 px-4 overline text-right">Inscriptions traitées</th>
                <th className="py-3 px-4 overline text-right">Rappels traités</th>
                <th className="py-3 px-4 overline text-right">Total dossiers</th>
                <th className="py-3 px-4 overline text-right">Leads en attente (charge)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={`border-b border-gray-100 hover:bg-gray-50 ${i.active === false ? "opacity-50" : ""}`} data-testid={`activity-row-${i.id}`}>
                  <td className="py-3 px-4">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-gray-500">{i.email}</p>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className="text-xs">{ROLE_LABELS[i.role] || i.role}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    {(i.assigned_categories || []).length ? (
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {i.assigned_categories.map((c) => (
                          <Badge key={c} className="text-[10px] bg-gray-100 text-gray-700 hover:bg-gray-100">
                            <Tag size={9} className="mr-1" /> {CATEGORY_LABELS[c] || c}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Toutes</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold">{i.leads_contacted}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#0B7238]">{i.leads_interesse}</td>
                  <td className="py-3 px-4 text-right font-mono text-red-600">{i.leads_pas_interesse}</td>
                  <td className="py-3 px-4 text-right font-mono">{i.inscriptions_traitees || 0}</td>
                  <td className="py-3 px-4 text-right font-mono">{i.callbacks_handled}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-mono font-semibold">{i.total_dossiers_traites || 0}</span>
                    {(i.total_dossiers_traites || 0) >= 50 && (
                      <Trophy size={14} weight="fill" className="inline ml-1.5 text-[#d4af37]" title="A dépassé 50 dossiers traités" />
                    )}
                    <button
                      onClick={() => openAdjust(i)}
                      className="ml-1.5 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 align-middle"
                      title="Ajuster (créditer un travail antérieur non tracé)"
                      data-testid={`adjust-${i.id}`}
                    >
                      <PencilSimple size={12} />
                    </button>
                    {!!i.manual_dossier_adjustment && (
                      <p className="text-[10px] text-gray-400 mt-0.5">dont {i.manual_dossier_adjustment > 0 ? "+" : ""}{i.manual_dossier_adjustment} ajusté</p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {i.pending_workload === null ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <Badge className={i.pending_workload > 0 ? "bg-amber-100 text-amber-700 hover:bg-amber-100" : "bg-gray-100 text-gray-500 hover:bg-gray-100"}>
                        {i.pending_workload}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan="10" className="py-12 text-center text-gray-400">Aucun employé.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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

function StatTile({ icon: Icon, label, value, color }) {
  return (
    <Card className="p-5 border border-gray-200 rounded-md shadow-none">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon size={16} style={{ color }} />
        <p className="overline">{label}</p>
      </div>
      <p className="font-display text-3xl font-bold mt-2">{value}</p>
    </Card>
  );
}
