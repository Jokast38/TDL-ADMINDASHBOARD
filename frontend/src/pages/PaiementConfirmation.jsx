import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Hourglass, FilePdf, ListBullets, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

// Page de retour après paiement Stripe pour une inscription sur place saisie
// par un agent (voir Inscriptions.jsx "Inscrire sur place" + POST
// /payments/checkout avec source="admin_walkin"). Le webhook Stripe qui
// marque l'inscription payée peut arriver après la redirection navigateur —
// on relit donc le statut à intervalle court le temps qu'il arrive.
export default function PaiementConfirmation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inscriptionId = params.get("inscription");
  const cancelled = params.get("paiement") === "annule";
  const [inscription, setInscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!inscriptionId) return;
    try {
      const { data } = await api.get(`/inscriptions/${inscriptionId}`);
      setInscription(data);
    } catch {
      toast.error("Impossible de récupérer cette inscription");
    } finally {
      setLoading(false);
    }
  }, [inscriptionId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!inscription || inscription.payment_status === "paid" || cancelled) return;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [inscription, cancelled, load]);

  const downloadReceipt = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get(`/payments/${inscriptionId}/receipt`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch (e) {
      toast.error("Erreur lors du téléchargement du reçu");
    } finally {
      setDownloading(false);
    }
  };

  const backToList = () => navigate("/admin/inscriptions");

  return (
    <div className="max-w-lg mx-auto py-16" data-testid="paiement-confirmation-page">
      <Card className="p-8 border border-gray-200 rounded-md shadow-none text-center">
        {loading ? (
          <p className="text-gray-400">Chargement...</p>
        ) : cancelled ? (
          <>
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <XCircle size={32} className="text-red-600" />
            </div>
            <h1 className="font-display text-2xl font-bold mb-2">Paiement annulé</h1>
            <p className="text-gray-500 text-sm mb-6">L'inscription a été créée mais reste en attente de paiement. Vous pouvez encaisser plus tard depuis la liste.</p>
            <Button onClick={backToList} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              <ListBullets size={16} className="mr-2" /> Retour à la liste des inscriptions
            </Button>
          </>
        ) : !inscription ? (
          <p className="text-red-500">Inscription introuvable.</p>
        ) : inscription.payment_status === "paid" ? (
          <>
            <div className="mx-auto w-16 h-16 bg-[#0B7238]/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-[#0B7238]" weight="fill" />
            </div>
            <h1 className="font-display text-2xl font-bold mb-2">Paiement confirmé</h1>
            <p className="text-gray-500 text-sm mb-1">{inscription.student_name} — {inscription.formation_title}</p>
            <p className="text-gray-400 text-xs mb-6">{(inscription.amount_paid ?? inscription.price)?.toFixed(2)} € réglés</p>
            <div className="flex flex-col gap-2">
              <Button onClick={downloadReceipt} disabled={downloading} variant="outline" data-testid="download-receipt-btn">
                <FilePdf size={16} className="mr-2" /> {downloading ? "Génération..." : "Télécharger le reçu"}
              </Button>
              <Button onClick={backToList} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="back-to-list-btn">
                <ListBullets size={16} className="mr-2" /> Retour à la liste des inscriptions
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto w-16 h-16 bg-[#F5A623]/10 rounded-full flex items-center justify-center mb-4">
              <Hourglass size={32} className="text-[#F5A623]" />
            </div>
            <h1 className="font-display text-2xl font-bold mb-2">Paiement en cours de confirmation...</h1>
            <p className="text-gray-500 text-sm mb-6">Ça ne devrait prendre que quelques secondes.</p>
            <Button variant="outline" onClick={backToList}>
              <ListBullets size={16} className="mr-2" /> Retour à la liste des inscriptions
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
