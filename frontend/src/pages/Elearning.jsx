import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeFR } from "@/lib/dateFormat";
import { GraduationCap, MagnifyingGlass, CheckCircle, Lock, LockOpen } from "@phosphor-icons/react";
import { toast } from "sonner";

// Page E-learning (26/11/2026) : gère les comptes e-learning VTC via l'API publique TDL
// Brain (proxy backend /elearning/apprenants, voir routers/elearning.py et
// services/tdl_brain.py). Trois niveaux : premium (suivi humain + cours proposés),
// standard (autonome, Brain limité et sans proposition de tuteur), uber (accès complet,
// partenaire Uber - jamais à créer/modifier manuellement ici).

const TIER_LABEL = { premium: "Premium", standard: "Standard", uber: "Uber (partenaire)" };
const TIER_BADGE = {
  premium: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  standard: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  uber: "bg-zinc-200 text-zinc-700 hover:bg-zinc-200",
};

const emptyForm = { email: "", first_name: "", last_name: "", elearning_tier: "standard" };

export default function Elearning() {
  const [tab, setTab] = useState("pending"); // pending | all
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setConfigError(null);
    try {
      const params = { limit: 100 };
      if (tab === "pending") params.pending = true;
      if (search.trim()) params.email = search.trim();
      const { data } = await api.get("/elearning/apprenants", { params });
      setItems(data.apprenants || []);
      setTotal(data.total || 0);
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 400) setConfigError(detail || "Intégration TDL Brain non configurée");
      else toast.error(detail || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!form.email.trim()) return toast.error("Email requis");
    setSaving(true);
    try {
      const { data } = await api.post("/elearning/apprenants", form);
      toast.success(data.matched ? "Apprenant déjà existant - fiche retrouvée" : "Apprenant inscrit");
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'inscription");
    } finally {
      setSaving(false);
    }
  };

  const activate = async (apprenant, tier) => {
    try {
      await api.patch(`/elearning/apprenants/${apprenant.id}`, { elearning_tier: tier, active: true });
      toast.success(`${apprenant.email} activé (${TIER_LABEL[tier]})`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const changeTier = async (apprenant, tier) => {
    try {
      await api.patch(`/elearning/apprenants/${apprenant.id}`, { elearning_tier: tier });
      toast.success(`Niveau changé en ${TIER_LABEL[tier]}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const toggleAccess = async (apprenant) => {
    const closing = !apprenant.suivi?.accessClosedAt;
    if (closing && !window.confirm(`Fermer l'accès e-learning de ${apprenant.email} ?`)) return;
    try {
      await api.patch(`/elearning/apprenants/${apprenant.id}`, { active: !closing });
      toast.success(closing ? "Accès fermé" : "Accès réouvert");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap size={28} className="text-amber-600" />
          <h1 className="text-xl font-semibold">E-learning VTC/Taxi</h1>
          <Badge variant="outline">{total} compte(s)</Badge>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Inscrire manuellement</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Inscrire un apprenant e-learning</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <div className="flex gap-2">
                <Input placeholder="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                <Input placeholder="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
              <Select value={form.elearning_tier} onValueChange={(v) => setForm({ ...form, elearning_tier: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard (autonome, Brain limité)</SelectItem>
                  <SelectItem value="premium">Premium (suivi humain)</SelectItem>
                </SelectContent>
              </Select>
              <Button className="w-full" disabled={saving} onClick={register}>
                {saving ? "Inscription..." : "Inscrire et activer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">En attente d'activation</TabsTrigger>
          <TabsTrigger value="all">Tous les comptes</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-sm">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
        <Input className="pl-9" placeholder="Rechercher par email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {configError && (
        <Card className="p-4 bg-red-50 text-red-700 text-sm">
          {configError} — vérifiez TDL_BRAIN_API_URL / TDL_BRAIN_API_KEY dans le backend.
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Apprenant</th>
              <th className="text-left p-3">Origine</th>
              <th className="text-left p-3">Inscrit le</th>
              <th className="text-left p-3">Niveau</th>
              <th className="text-left p-3">Accès</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-6 text-center text-zinc-400">Chargement...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-zinc-400">Aucun compte à afficher</td></tr>
            )}
            {items.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{[a.firstName, a.lastName].filter(Boolean).join(" ") || "—"}</div>
                  <div className="text-zinc-500 text-xs">{a.email}</div>
                </td>
                <td className="p-3 text-zinc-500">{a.partnerCode || a.entrySource}</td>
                <td className="p-3 text-zinc-500">{a.createdAt ? formatDateTimeFR(a.createdAt) : "—"}</td>
                <td className="p-3">
                  {a.elearningTier ? (
                    <Badge className={TIER_BADGE[a.elearningTier]}>{TIER_LABEL[a.elearningTier]}</Badge>
                  ) : (
                    <Badge variant="outline">En attente</Badge>
                  )}
                </td>
                <td className="p-3">
                  {a.suivi?.accessClosedAt ? (
                    <span className="flex items-center gap-1 text-red-600 text-xs"><Lock size={14} /> Fermé</span>
                  ) : (
                    <span className="flex items-center gap-1 text-green-600 text-xs"><LockOpen size={14} /> Ouvert</span>
                  )}
                </td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  {a.pendingActivation ? (
                    <>
                      <Button size="sm" onClick={() => activate(a, "standard")}>
                        <CheckCircle size={14} className="mr-1" /> Activer Standard
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => activate(a, "premium")}>
                        Activer Premium
                      </Button>
                    </>
                  ) : a.elearningTier !== "uber" ? (
                    <>
                      <Select value={a.elearningTier || undefined} onValueChange={(v) => changeTier(a, v)}>
                        <SelectTrigger className="h-8 w-[130px] inline-flex"><SelectValue placeholder="Niveau" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => toggleAccess(a)}>
                        {a.suivi?.accessClosedAt ? "Réactiver" : "Désactiver"}
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-400">Géré via le partenariat Uber</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
