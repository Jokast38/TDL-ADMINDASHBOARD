// components/StripeCheckout.jsx
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard, LockKey, Check } from "@phosphor-icons/react";

export default function StripeCheckout({ 
  inscriptionId,
  session, 
  center, 
  amount = 240, 
  customerName, 
  customerPhone, 
  customerEmail,
  onSuccess,
  onError,
  allowKlarna = false
}) {
  const [loading, setLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const handlePayment = async () => {
    if (!inscriptionId) {
      toast.error("Veuillez d'abord créer votre inscription");
      return;
    }

    setLoading(true);
    
    try {
      // Appeler votre endpoint /payments/checkout
      const response = await api.post("/payments/checkout", {
        inscription_id: inscriptionId,
        allow_klarna: allowKlarna
      });

      const { url } = response.data;
      
      if (url) {
        // Rediriger vers Stripe Checkout
        window.location.href = url;
      } else {
        toast.error("Erreur lors de la redirection vers le paiement");
      }
      
    } catch (error) {
      console.error("Erreur de paiement:", error);
      const errorMessage = error.response?.data?.detail || "Erreur lors de l'initiation du paiement";
      toast.error(errorMessage);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  // Vérifier le statut du paiement après redirection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("paiement");
    const inscriptionIdParam = params.get("inscription");
    
    if (paymentStatus === "succes" && inscriptionIdParam) {
      setPaymentSuccess(true);
      toast.success("Paiement réussi ! Votre place est réservée.");
      onSuccess?.({ inscription_id: inscriptionIdParam });
      // Nettoyer l'URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (paymentStatus === "annule") {
      toast.info("Paiement annulé. Vous pouvez réessayer quand vous voulez.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [onSuccess]);

  if (paymentSuccess) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check size={32} className="text-green-600" />
        </div>
        <h3 className="font-bold text-xl mb-2">✅ Paiement réussi !</h3>
        <p className="text-gray-600 text-sm">
          Votre place est réservée pour la session du <strong>{session}</strong>.
          <br />Vous recevrez un email de confirmation.
        </p>
        <Button
          onClick={() => window.location.href = "/"}
          className="mt-4"
          style={{ backgroundColor: "#d4af37", color: "#000" }}
        >
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">Session</span>
          <span className="font-semibold">{session || "Non sélectionnée"}</span>
        </div>
        <div className="flex justify-between items-center text-sm mt-2">
          <span className="text-gray-600">Centre</span>
          <span className="font-semibold">{center || "À définir"}</span>
        </div>
        <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-gray-200">
          <span className="text-gray-600">Total</span>
          <span className="font-bold text-lg">{amount} €</span>
        </div>
      </div>

      <Button
        onClick={handlePayment}
        disabled={loading || !inscriptionId}
        className="w-full py-6 font-bold text-sm uppercase tracking-wide"
        style={{ backgroundColor: "#d4af37", color: "#000" }}
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Préparation du paiement...
          </>
        ) : (
          <>
            <CreditCard size={18} className="mr-2" />
            Payer {amount} €
          </>
        )}
      </Button>

      <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
        <LockKey size={14} />
        <span>Paiement sécurisé par Stripe</span>
        <span className="mx-1">•</span>
        <span>CB, Visa, Mastercard</span>
        {allowKlarna && (
          <>
            <span className="mx-1">•</span>
            <span>Klarna (paiement en plusieurs fois)</span>
          </>
        )}
      </div>
    </div>
  );
}