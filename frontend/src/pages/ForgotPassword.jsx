import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Envelope, ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      // Toujours un succès générique côté UI — le backend ne révèle jamais
      // si l'email existe ou non, pour ne pas permettre l'énumération de comptes.
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" data-testid="forgot-password-page">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-md p-8 shadow-sm">
        <Link to="/" className="flex items-center gap-2 mb-8">
          <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
          <span className="font-display font-bold text-lg">TDL Formation</span>
        </Link>

        {sent ? (
          <div className="text-center py-4" data-testid="forgot-password-sent">
            <CheckCircle size={40} className="mx-auto text-[#0B7238] mb-4" weight="fill" />
            <h1 className="font-display text-xl font-bold mb-2">Email envoyé</h1>
            <p className="text-sm text-gray-500 mb-6">
              Si un compte existe avec l'adresse <b>{email}</b>, un lien de réinitialisation vient de lui être envoyé.
              Pensez à vérifier vos spams.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                <ArrowLeft size={14} className="mr-2" /> Retour à la connexion
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Mot de passe oublié</h1>
            <p className="text-sm text-gray-500 mb-6">
              Indiquez votre email professionnel, nous vous enverrons un lien pour choisir un nouveau mot de passe.
            </p>
            <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-password-form">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <div className="relative">
                  <Envelope size={16} className="absolute left-3 top-3 text-gray-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9"
                    data-testid="forgot-password-email"
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="forgot-password-submit">
                {loading ? "Envoi..." : "Envoyer le lien de réinitialisation"}
              </Button>
              <p className="text-center">
                <Link to="/login" className="text-xs text-gray-500 hover:text-[#d4af37] inline-flex items-center gap-1">
                  <ArrowLeft size={12} /> Retour à la connexion
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
