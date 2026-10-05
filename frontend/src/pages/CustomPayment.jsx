import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, PaperPlaneTilt, LinkSimple } from "@phosphor-icons/react";

// Page dédiée (pas un onglet) : envoi d'un lien de paiement Stripe à prix
// libre — distincte du tunnel d'inscription standard, toujours au tarif
// catalogue d'une formation (voir routers/custom_payments.py).
export default function CustomPayment() {
  const [formations, setFormations] = useState([]);
  const [titleMode, setTitleMode] = useState("formation"); // "formation" | "libre"
  const [formationId, setFormationId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [price, setPrice] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data)).catch(() => {});
    loadHistory();
  }, []);

  const loadHistory = () => {
    setLoadingHistory(true);
    api.get("/custom-payments").then((r) => setHistory(r.data)).catch(() => {}).finally(() => setLoadingHistory(false));
  };

  const title = titleMode === "formation"
    ? formations.find((f) => f.id === formationId)?.title || ""
    : customTitle.trim();

  const send = async () => {
    if (!title) return toast.error("Choisissez ou saisissez un intitulé");
    if (!price || Number(price) <= 0) return toast.error("Le prix doit être supérieur à 0");
    if (!recipientEmail.trim()) return toast.error("Email du destinataire requis");
    setSending(true);
    try {
      await api.post("/custom-payments", {
        title, price: Number(price), recipient_name: recipientName.trim() || null, recipient_email: recipientEmail.trim(),
      });
      toast.success("Lien de paiement envoyé par email");
      setPrice(""); setRecipientName(""); setRecipientEmail(""); setCustomTitle(""); setFormationId("");
      loadHistory();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="custom-payment-page">
      <div>
        <p className="overline flex items-center gap-2"><CreditCard size={12} /> Paiement par lien Stripe</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Paiement personnalisé</h1>
        <p className="text-gray-500 mt-2">Envoyez un lien de paiement Stripe à prix libre — solde, frais additionnels, ou tout autre paiement hors tunnel d'inscription standard.</p>
      </div>

      <Card className="p-6 border border-gray-200 rounded-md shadow-none max-w-xl space-y-4">
        <div>
          <label className="text-sm font-medium block mb-1">Intitulé</label>
          <div className="flex border border-gray-200 rounded-md overflow-hidden mb-2 w-fit">
            <button
              className={`px-3 py-1.5 text-xs ${titleMode === "formation" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600"}`}
              onClick={() => setTitleMode("formation")}
            >Formation existante</button>
            <button
              className={`px-3 py-1.5 text-xs ${titleMode === "libre" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600"}`}
              onClick={() => setTitleMode("libre")}
            >Texte libre</button>
          </div>
          {titleMode === "formation" ? (
            <Select value={formationId} onValueChange={setFormationId}>
              <SelectTrigger data-testid="custom-payment-formation"><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
              <SelectContent>
                {formations.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Ex: Solde CMA, Frais additionnels..." data-testid="custom-payment-title" />
          )}
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Prix (€)</label>
          <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex: 150" data-testid="custom-payment-price" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Nom du destinataire</label>
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} data-testid="custom-payment-name" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Email du destinataire</label>
            <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} data-testid="custom-payment-email" />
          </div>
        </div>

        <Button onClick={send} disabled={sending} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white w-full" data-testid="custom-payment-send">
          <PaperPlaneTilt size={14} className="mr-1.5" /> {sending ? "Envoi..." : "Envoyer le lien de paiement"}
        </Button>
      </Card>

      <Card className="border border-gray-200 rounded-md shadow-none overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <p className="font-display text-lg font-bold">Historique</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-y border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Intitulé</th>
                <th className="py-2.5 px-4 overline">Destinataire</th>
                <th className="py-2.5 px-4 overline text-right">Prix</th>
                <th className="py-2.5 px-4 overline">Statut</th>
                <th className="py-2.5 px-4 overline">Envoyé le</th>
                <th className="py-2.5 px-4 overline text-right">Lien</th>
              </tr>
            </thead>
            <tbody>
              {!loadingHistory && !history.length && (
                <tr><td colSpan="6" className="py-10 text-center text-gray-400">Aucun paiement personnalisé envoyé.</td></tr>
              )}
              {history.map((h) => (
                <tr key={h.id} className="border-b border-gray-100">
                  <td className="py-2.5 px-4">{h.title}</td>
                  <td className="py-2.5 px-4">
                    <p>{h.recipient_name || "—"}</p>
                    <p className="text-xs text-gray-400">{h.recipient_email}</p>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">{Number(h.price).toFixed(2)} €</td>
                  <td className="py-2.5 px-4">
                    <Badge className={h.status === "paid" ? "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10" : "bg-[#F5A623]/10 text-[#F5A623] hover:bg-[#F5A623]/10"}>
                      {h.status === "paid" ? "Payé" : "En attente"}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {h.created_at ? new Date(h.created_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <a href={h.stripe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#0a0a0a] hover:underline">
                      <LinkSimple size={12} /> Ouvrir
                    </a>
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
