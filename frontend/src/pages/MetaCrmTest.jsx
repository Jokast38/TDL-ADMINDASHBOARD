import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PaperPlaneTilt, CheckCircle, XCircle } from "@phosphor-icons/react";
import { formatDateTimeFR } from "@/lib/dateFormat";

// Page de test, admin uniquement (temporaire, non listée dans la sidebar) —
// vérifie l'intégration Meta "Prospects qualifiés" (API Conversions, dataset
// CRM) avant de la brancher sur les vrais changements de qualification des
// prospects. Voir backend/services/meta_crm_events.py.
export default function MetaCrmTest() {
  const [configured, setConfigured] = useState(null);
  const [eventName, setEventName] = useState("Lead");
  const [metaLeadId, setMetaLeadId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);

  useEffect(() => {
    api.get("/meta-crm-test/status").then((r) => setConfigured(r.data.configured)).catch(() => setConfigured(false));
    loadLog();
  }, []);

  const loadLog = () => {
    api.get("/meta-crm-test/log").then((r) => setLog(r.data)).catch(() => {});
  };

  const send = async () => {
    if (!email.trim() && !phone.trim() && !metaLeadId.trim()) {
      return toast.error("Renseignez au moins un identifiant (lead_id, email ou téléphone)");
    }
    setSending(true);
    setResult(null);
    try {
      const { data } = await api.post("/meta-crm-test/send", {
        event_name: eventName.trim() || "Lead",
        meta_lead_id: metaLeadId.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      setResult(data);
      if (data.status === "sent") toast.success(`Envoyé — events_received: ${data.events_received}`);
      else toast.error(`Échec (${data.status})`);
      loadLog();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="meta-crm-test-page">
      <div>
        <p className="overline">Test — intégration Meta</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Prospects qualifiés (CRM)</h1>
        <p className="text-gray-500 mt-2">
          Envoie un évènement de test au dataset Meta "Prospects qualifiés" (API Conversions) pour vérifier que
          l'intégration fonctionne avant de la brancher sur les vrais changements de qualification.
        </p>
      </div>

      {configured === false && (
        <Card className="p-4 border border-red-200 bg-red-50 rounded-md shadow-none text-sm text-red-700">
          META_LEAD_LINK_ACCESS_TOKEN non configuré côté serveur.
        </Card>
      )}

      <Card className="p-6 border border-gray-200 rounded-md shadow-none max-w-xl space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Nom de l'évènement</label>
          <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Lead" data-testid="meta-crm-event-name" />
          <p className="text-xs text-gray-400 mt-1">Ex: "Lead" (étape initiale), ou un nom d'étape de votre funnel.</p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">ID du prospect Meta (meta_lead_id, facultatif)</label>
          <Input value={metaLeadId} onChange={(e) => setMetaLeadId(e.target.value)} placeholder="15 à 17 chiffres" data-testid="meta-crm-lead-id" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="meta-crm-email" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Téléphone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="meta-crm-phone" />
          </div>
        </div>
        <Button onClick={send} disabled={sending} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white w-full" data-testid="meta-crm-send">
          <PaperPlaneTilt size={14} className="mr-1.5" /> {sending ? "Envoi..." : "Envoyer un évènement de test"}
        </Button>

        {result && (
          <div className={`rounded-md border p-3 text-xs font-mono whitespace-pre-wrap ${result.status === "sent" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            {JSON.stringify(result, null, 2)}
          </div>
        )}
      </Card>

      <Card className="border border-gray-200 rounded-md shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-3"><p className="font-display text-lg font-bold">Historique des envois</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-y border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Évènement</th>
                <th className="py-2.5 px-4 overline">Contact</th>
                <th className="py-2.5 px-4 overline">Statut</th>
                <th className="py-2.5 px-4 overline">Détail</th>
                <th className="py-2.5 px-4 overline">Envoyé le</th>
              </tr>
            </thead>
            <tbody>
              {!log.length && <tr><td colSpan="5" className="py-10 text-center text-gray-400">Aucun envoi pour le moment.</td></tr>}
              {log.map((l) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="py-2.5 px-4">{l.event_name}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-600">{l.email || l.phone || l.meta_lead_id || "—"}</td>
                  <td className="py-2.5 px-4">
                    <Badge className={l.status === "sent" ? "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10" : "bg-red-100 text-red-700 hover:bg-red-100"}>
                      {l.status === "sent" ? <CheckCircle size={12} className="mr-1" weight="fill" /> : <XCircle size={12} className="mr-1" weight="fill" />}
                      {l.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-400 max-w-[260px] truncate">{l.detail}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {l.created_at ? formatDateTimeFR(l.created_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
