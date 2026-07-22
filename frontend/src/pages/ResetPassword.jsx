import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, ArrowLeft, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("6 caractères minimum");
    if (password !== confirm) return toast.error("Les mots de passe ne correspondent pas");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      toast.success("Mot de passe mis à jour, vous pouvez vous connecter");
      navigate("/login");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Lien invalide ou expiré");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" data-testid="reset-password-page">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-md p-8 shadow-sm">
        <Link to="/" className="flex items-center gap-2 mb-8">
          <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
          <span className="font-display font-bold text-lg">TDL Formation</span>
        </Link>

        {!token ? (
          <div className="text-center py-4">
            <Warning size={32} className="mx-auto text-amber-500 mb-3" />
            <p className="text-sm text-gray-600 mb-6">Lien de réinitialisation invalide ou incomplet.</p>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">Redemander un lien</Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Nouveau mot de passe</h1>
            <p className="text-sm text-gray-500 mb-6">Choisissez un nouveau mot de passe pour votre compte.</p>
            <form onSubmit={onSubmit} className="space-y-4" data-testid="reset-password-form">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nouveau mot de passe</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-9" data-testid="reset-password-new" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Confirmer le mot de passe</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="pl-9" data-testid="reset-password-confirm" />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="reset-password-submit">
                {loading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
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
