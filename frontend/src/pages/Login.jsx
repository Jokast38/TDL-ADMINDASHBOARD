import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Lock, Envelope, User as UserIcon, Phone } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("admin@tdlformation.fr");
  const [loginPwd, setLoginPwd] = useState("admin123");
  const [regEmail, setRegEmail] = useState("");
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPwd, setRegPwd] = useState("");

  const onLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(loginEmail, loginPwd);
      toast.success(`Bienvenue ${u.name}`);
      if (u.role === "etudiant") navigate("/espace-eleve");
      else if (u.role === "animateur") navigate("/espace-animateur");
      else navigate("/admin");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register({ email: regEmail, password: regPwd, name: regName, phone: regPhone, role: "etudiant" });
      toast.success(`Compte créé. Bienvenue ${u.name}`);
      navigate("/espace-eleve");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left visual */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#0a0a0a] text-white p-12 relative overflow-hidden">
        <div>
          <Link to="/" className="flex items-center gap-3" data-testid="login-logo">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-12 h-12 rounded object-contain bg-black border border-[#d4af37]/40" />
            <span className="font-display font-bold text-xl">TDL Formation</span>
          </Link>
        </div>
        <div className="space-y-6 max-w-md">
          <p className="overline text-white/70">Plateforme interne · 2026</p>
          <h1 className="font-display text-5xl font-bold tracking-tight leading-tight">
            Pilotez vos formations, dossiers et ventes depuis un seul tableau de bord.
          </h1>
          <p className="text-white/80 text-lg leading-relaxed">
            CACES, Permis, Auto-école, SSIAP, VTC/Taxi, KAMI STREET — tout est centralisé.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="border-l-2 border-white/30 pl-3">
            <p className="overline text-white/60">Workflow</p>
            <p className="font-semibold mt-1">Inscription → ANTS</p>
          </div>
          <div className="border-l-2 border-white/30 pl-3">
            <p className="overline text-white/60">Suivi</p>
            <p className="font-semibold mt-1">Trello Kanban</p>
          </div>
          <div className="border-l-2 border-white/30 pl-3">
            <p className="overline text-white/60">Agent IA</p>
            <p className="font-semibold mt-1">Claude Sonnet 4.5</p>
          </div>
        </div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#d4af37]/20 rounded-full blur-3xl" />
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#d4af37]/20 rounded-full blur-3xl" />
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2" data-testid="login-logo-mobile">
              <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
              <span className="font-display font-bold text-lg">TDL Formation</span>
            </Link>
          </div>
          <p className="overline mb-2">Espace sécurisé</p>
          <h2 className="font-display text-3xl font-bold tracking-tight mb-1">Connexion</h2>
          <p className="text-gray-500 mb-8 text-sm">Accédez à votre tableau de bord.</p>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-6" data-testid="login-tabs">
              <TabsTrigger value="login" data-testid="tab-login">Se connecter</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Créer un compte</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-4" data-testid="login-form">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <div className="relative">
                    <Envelope size={16} className="absolute left-3 top-3 text-gray-400" />
                    <Input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="pl-9"
                      data-testid="login-email"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Mot de passe</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
                    <Input
                      type="password"
                      value={loginPwd}
                      onChange={(e) => setLoginPwd(e.target.value)}
                      required
                      className="pl-9"
                      data-testid="login-password"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
                  data-testid="login-submit"
                >
                  {loading ? "Connexion..." : "Se connecter"}
                </Button>
                <Card className="bg-gray-50 p-3 text-xs text-gray-600 border-dashed">
                  <p className="font-semibold mb-0.5">Compte admin de démo :</p>
                  <p className="font-mono">admin@tdlformation.fr / admin123</p>
                </Card>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={onRegister} className="space-y-4" data-testid="register-form">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nom complet</label>
                  <div className="relative">
                    <UserIcon size={16} className="absolute left-3 top-3 text-gray-400" />
                    <Input value={regName} onChange={(e) => setRegName(e.target.value)} required className="pl-9" data-testid="register-name" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <div className="relative">
                    <Envelope size={16} className="absolute left-3 top-3 text-gray-400" />
                    <Input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required className="pl-9" data-testid="register-email" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Téléphone</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-3 text-gray-400" />
                    <Input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className="pl-9" data-testid="register-phone" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Mot de passe</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-3 text-gray-400" />
                    <Input type="password" value={regPwd} onChange={(e) => setRegPwd(e.target.value)} required className="pl-9" data-testid="register-password" />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
                  data-testid="register-submit"
                >
                  {loading ? "Création..." : "Créer mon compte"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-8 text-center text-xs text-gray-500">
            <Link to="/" className="hover:text-[#0a0a0a]" data-testid="back-home">← Retour au site public</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
