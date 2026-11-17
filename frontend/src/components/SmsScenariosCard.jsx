// Réponses automatiques aux SMS de campagne (Paramètres → SMS) : interrupteur
// général + scénarios de questions créés par l'équipe. Voir
// backend/services/sms_qualification.py.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "aucune", label: "Aucune" },
  { value: "VTC_TAXI", label: "VTC / Taxi" },
  { value: "CACES", label: "CACES" },
  { value: "PERMIS", label: "Stage points / Permis" },
  { value: "SSIAP", label: "SSIAP" },
  { value: "AUTO_ECOLE", label: "Auto-école" },
];

const newStep = () => ({ question: "", options: [{ code: "1", label: "", fin: false }, { code: "2", label: "", fin: false }] });
const newScenario = (n) => ({
  key: `scenario_${Date.now().toString(36)}`, label: `Nouveau scénario ${n}`, category: null, actif: true,
  steps: [newStep(), { question: "Etes-vous toujours intéressé(e) ? Répondez OUI ou NON.",
    options: [{ code: "oui", label: "Toujours intéressé", fin: false }, { code: "non", label: "Plus intéressé", fin: true }] }],
  final: "Parfait, un conseiller vous rappelle très vite. Vous pouvez aussi nous joindre au 01 80 90 72 49 ou sur WhatsApp : wa.me/33698595591",
  refus: "Merci pour votre réponse, nous ne vous relancerons plus pour cette formation. Bonne journée !",
});

export default function SmsScenariosCard() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/sms-campaigns/scenarios/config").then(({ data }) => setCfg(data))
      .catch(() => toast.error("Impossible de charger les réponses automatiques"));
  }, []);

  const setScenario = (i, patch) => setCfg((c) => ({ ...c, scenarios: c.scenarios.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const setStep = (i, k, patch) => setScenario(i, { steps: cfg.scenarios[i].steps.map((st, j) => (j === k ? { ...st, ...patch } : st)) });
  const setOption = (i, k, o, patch) => setStep(i, k, { options: cfg.scenarios[i].steps[k].options.map((op, j) => (j === o ? { ...op, ...patch } : op)) });

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/sms-campaigns/scenarios/config", cfg);
      setCfg(data);
      toast.success("Réponses automatiques enregistrées");
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Vérifiez les champs (textes trop courts ou réponses manquantes)");
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return null;
  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none mt-6" data-testid="sms-scenarios">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-bold mb-1">Réponses automatiques (qualification par SMS)</h3>
          <p className="text-sm text-gray-500 max-w-2xl">
            Le prospect répond au SMS de campagne (1, 2, OUI…) ; le serveur SMS personnel envoie la question suivante,
            puis notre numéro et notre WhatsApp. Le prospect intéressé est qualifié dans le CRM, une demande de rappel
            est créée et l'équipe reçoit une alerte push « à rappeler ». Désactivé : aucune réponse automatique ne part,
            les réponses reçues sont seulement transmises à l'équipe.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium shrink-0">
          <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} data-testid="sms-scenarios-enabled" />
          {cfg.enabled ? "Activées" : "Désactivées"}
        </label>
      </div>

      <div className="space-y-6 mt-6">
        {cfg.scenarios.map((sc, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-medium">Nom du scénario</label>
                <Input value={sc.label} onChange={(e) => setScenario(i, { label: e.target.value })} />
              </div>
              <div className="w-48">
                <label className="text-xs font-medium">Formation (équipe alertée)</label>
                <Select value={sc.category || "aucune"} onValueChange={(v) => setScenario(i, { category: v === "aucune" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm pb-2">
                <Switch checked={sc.actif} onCheckedChange={(v) => setScenario(i, { actif: v })} /> {sc.actif ? "Actif" : "Inactif"}
              </label>
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => setCfg({ ...cfg, scenarios: cfg.scenarios.filter((_, j) => j !== i) })}>
                <Trash size={14} />
              </Button>
            </div>

            {sc.steps.map((st, k) => (
              <div key={k} className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">SMS {k + 1}{k === 0 ? " (message de la campagne — {prenom} = prénom)" : " (envoyé après la réponse précédente)"}</p>
                  {sc.steps.length > 1 && (
                    <button type="button" className="text-xs text-red-600" onClick={() => setScenario(i, { steps: sc.steps.filter((_, j) => j !== k) })}>Retirer</button>
                  )}
                </div>
                <Textarea rows={3} value={st.question} onChange={(e) => setStep(i, k, { question: e.target.value })}
                  placeholder="Ex. Répondez 1 si vous avez un compte CPF, 2 sinon." />
                {st.options.map((op, o) => (
                  <div key={o} className="flex items-center gap-2">
                    <Input className="w-20" value={op.code} onChange={(e) => setOption(i, k, o, { code: e.target.value })} placeholder="1 / OUI" />
                    <Input className="flex-1" value={op.label} onChange={(e) => setOption(i, k, o, { label: e.target.value })} placeholder="Ce que la réponse signifie (visible dans le CRM)" />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <Checkbox checked={op.fin} onCheckedChange={(v) => setOption(i, k, o, { fin: !!v })} /> = plus intéressé
                    </label>
                    {st.options.length > 2 && (
                      <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => setStep(i, k, { options: st.options.filter((_, j) => j !== o) })}><Trash size={14} /></button>
                    )}
                  </div>
                ))}
                <button type="button" className="text-xs underline" onClick={() => setStep(i, k, { options: [...st.options, { code: String(st.options.length + 1), label: "", fin: false }] })}>
                  + Ajouter une réponse
                </button>
              </div>
            ))}
            {sc.steps.length < 5 && (
              <button type="button" className="text-xs underline" onClick={() => setScenario(i, { steps: [...sc.steps, newStep()] })}>+ Ajouter une question</button>
            )}

            <div>
              <label className="text-xs font-medium">Dernier SMS si toujours intéressé (numéro + WhatsApp)</label>
              <Textarea rows={2} value={sc.final} onChange={(e) => setScenario(i, { final: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium">SMS si plus intéressé</label>
              <Textarea rows={2} value={sc.refus} onChange={(e) => setScenario(i, { refus: e.target.value })} />
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCfg({ ...cfg, scenarios: [...cfg.scenarios, newScenario(cfg.scenarios.length + 1)] })}>
            <Plus size={14} className="mr-1" /> Nouveau scénario
          </Button>
          <Button onClick={save} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="sms-scenarios-save">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Chaque question doit citer ses réponses (ex. « répondez 1, 2 ou 3 »). OUI et NON acceptent aussi « ok », « ouais », « non merci »…
          Une réponse incomprise deux fois est transmise à l'équipe pour rappel. Évitez ê, ç, ô : ils font passer le SMS à 70 caractères.
        </p>
      </div>
    </Card>
  );
}
