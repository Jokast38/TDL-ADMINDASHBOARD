import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Bouton "Envoyer un lien de paiement" réutilisable depuis n'importe quelle
 * liste de prospects (Leads.jsx, Marketing.jsx) — récupère nom/email du lead
 * passé en prop, laisse choisir une formation (prix catalogue prérempli,
 * modifiable) ou un intitulé libre, puis réutilise directement
 * POST /custom-payments (même mécanisme que la page Paiement personnalisé :
 * email avec lien Stripe envoyé, suivi dans l'historique, statut mis à jour
 * en temps réel par le webhook Stripe).
 */
export default function SendPaymentLinkDialog({ open, onOpenChange, lead }) {
  const [formations, setFormations] = useState([]);
  const [titleMode, setTitleMode] = useState("formation");
  const [formationId, setFormationId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [price, setPrice] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitleMode("formation"); setFormationId(""); setCustomTitle(""); setPrice("");
    api.get("/formations", { params: { active_only: true } }).then((r) => setFormations(r.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (titleMode === "formation" && formationId) {
      const f = formations.find((x) => x.id === formationId);
      if (f) setPrice(String(f.price || ""));
    }
  }, [formationId, titleMode, formations]);

  const title = titleMode === "formation"
    ? formations.find((f) => f.id === formationId)?.title || ""
    : customTitle.trim();

  const send = async () => {
    if (!lead?.email) return toast.error("Ce prospect n'a pas d'email");
    if (!title) return toast.error("Choisissez ou saisissez un intitulé");
    if (!price || Number(price) <= 0) return toast.error("Le prix doit être supérieur à 0");
    setSending(true);
    try {
      await api.post("/custom-payments", {
        title, price: Number(price),
        recipient_name: lead.name || lead.full_name || null,
        recipient_email: lead.email,
        lead_id: lead.id,
      });
      toast.success("Lien de paiement envoyé par email");
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="send-payment-link-dialog">
        <DialogHeader><DialogTitle>Envoyer un lien de paiement</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50">
            <p className="font-medium">{lead?.name || lead?.full_name || "—"}</p>
            <p className="text-xs text-gray-500">{lead?.email || "Aucun email — envoi impossible"}</p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Intitulé</label>
            <div className="flex border border-gray-200 rounded-md overflow-hidden mb-2 w-fit">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs ${titleMode === "formation" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600"}`}
                onClick={() => setTitleMode("formation")}
              >Formation existante</button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs ${titleMode === "libre" ? "bg-[#0a0a0a] text-white" : "bg-white text-gray-600"}`}
                onClick={() => setTitleMode("libre")}
              >Texte libre</button>
            </div>
            {titleMode === "formation" ? (
              <Select value={formationId} onValueChange={setFormationId}>
                <SelectTrigger data-testid="send-payment-formation"><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
                <SelectContent>
                  {formations.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Ex: Solde CMA, Frais additionnels..." />
            )}
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Prix (€)</label>
            <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="send-payment-price" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Annuler</Button>
          <Button onClick={send} disabled={sending || !lead?.email} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="send-payment-submit">
            {sending ? "..." : "Envoyer le lien"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
