import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ChangePassword() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const forced = !!user?.must_change_password;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("6 caractères minimum");
    if (password !== confirm) return toast.error("Les mots de passe ne correspondent pas");
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: password });
      toast.success("Mot de passe mis à jour");
      await refresh();
      if (forced) {
        const fallback =
          user.role === "etudiant" ? "/espace-eleve" :
          user.role === "animateur" ? "/espace-animateur" :
          user.role === "commercial" ? "/admin/leads" :
          "/admin";
        navigate(fallback);
      } else {
        navigate(-1);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors du changement de mot de passe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" data-testid="change-password-page">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-md p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-8">
          <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
          <span className="font-display font-bold text-lg">TDL Formation</span>
        </div>

        {forced && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900 mb-6 flex items-start gap-2" data-testid="forced-change-notice">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            Pour votre sécurité, vous devez choisir un nouveau mot de passe avant de continuer.
          </div>
        )}

        <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Changer mon mot de passe</h1>
        <p className="text-sm text-gray-500 mb-6">
          {forced ? "Ceci remplace le mot de passe temporaire reçu par email." : "Mettez à jour votre mot de passe."}
        </p>

        <form onSubmit={onSubmit} className="space-y-4" data-testid="change-password-form">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Mot de passe actuel</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="pl-9" data-testid="change-password-current" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nouveau mot de passe</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-9" data-testid="change-password-new" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirmer le nouveau mot de passe</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="pl-9" data-testid="change-password-confirm" />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="change-password-submit">
            {loading ? "Mise à jour..." : "Mettre à jour le mot de passe"}
          </Button>
          {!forced && (
            <Button type="button" variant="outline" className="w-full" onClick={() => navigate(-1)}>
              Annuler
            </Button>
          )}
          {forced && (
            <button type="button" onClick={logout} className="w-full text-xs text-gray-400 hover:text-gray-600">
              Se déconnecter
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
