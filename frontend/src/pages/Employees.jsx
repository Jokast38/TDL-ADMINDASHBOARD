import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Plus, Trash, Pause, Play, Archive, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = { email: "", name: "", role: "employe", phone: "", department: "", password: "" };

const STATUS_BADGE = {
  actif: "bg-green-100 text-green-700 hover:bg-green-100",
  suspendu: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  archive: "bg-gray-200 text-gray-600 hover:bg-gray-200",
};
const STATUS_LABEL = { actif: "Actif", suspendu: "Suspendu", archive: "Archivé" };

export default function Employees() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [statusTarget, setStatusTarget] = useState(null); // { user, newStatus }

  const load = () => api.get("/employees").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/employees", form);
      toast.success("Employé créé");
      setOpen(false); setForm(empty);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Supprimer cet employé ?")) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success("Supprimé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const applyStatusChange = async () => {
    if (!statusTarget) return;
    try {
      await api.put(`/employees/${statusTarget.user.id}/status`, { account_status: statusTarget.newStatus });
      toast.success(`Compte ${STATUS_LABEL[statusTarget.newStatus].toLowerCase()}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
    setStatusTarget(null);
  };

  const accountStatus = (u) => u.account_status || (u.active === false ? "suspendu" : "actif");

  return (
    <div className="space-y-6" data-testid="employees-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Équipe interne</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Employés</h1>
          <p className="text-gray-500 mt-2">{items.length} membre(s).</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="add-employee-btn">
              <Plus size={16} className="mr-2" /> Nouvel employé
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouvel employé</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Nom complet</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="emp-name" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="emp-email" />
              </div>
              <div>
                <label className="text-sm font-medium">Téléphone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Rôle</label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employe">Employé</SelectItem>
                    <SelectItem value="animateur">Animateur / Formateur</SelectItem>
                    <SelectItem value="responsable_admission">Responsable admission</SelectItem>
                    <SelectItem value="agent_admin">Agent administratif</SelectItem>
                    <SelectItem value="admin">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Département</label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Mot de passe initial</label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="emp-password" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={save} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="emp-save">Créer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 overline">Nom</th>
                <th className="py-3 px-4 overline">Email</th>
                <th className="py-3 px-4 overline">Rôle</th>
                <th className="py-3 px-4 overline">Département</th>
                <th className="py-3 px-4 overline">Statut</th>
                <th className="py-3 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const status = accountStatus(u);
                return (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`emp-row-${u.id}`}>
                    <td className="py-3 px-4 font-medium">{u.name}</td>
                    <td className="py-3 px-4 font-mono text-xs">{u.email}</td>
                    <td className="py-3 px-4">
                      <Badge className={u.role === "admin" ? "bg-[#0a0a0a] text-white hover:bg-[#0a0a0a]" : ""} variant={u.role === "admin" ? "default" : "outline"}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{u.department || "—"}</td>
                    <td className="py-3 px-4">
                      <Badge className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex gap-1">
                        {status === "actif" && (
                          <button
                            onClick={() => setStatusTarget({ user: u, newStatus: "suspendu" })}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Suspendre"
                            data-testid={`suspend-${u.id}`}
                          >
                            <Pause size={14} />
                          </button>
                        )}
                        {status === "suspendu" && (
                          <button
                            onClick={() => setStatusTarget({ user: u, newStatus: "actif" })}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Réactiver"
                            data-testid={`reactivate-${u.id}`}
                          >
                            <Play size={14} />
                          </button>
                        )}
                        {status !== "archive" && (
                          <button
                            onClick={() => setStatusTarget({ user: u, newStatus: "archive" })}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Archiver"
                            data-testid={`archive-${u.id}`}
                          >
                            <Archive size={14} />
                          </button>
                        )}
                        {status === "archive" && (
                          <button
                            onClick={() => setStatusTarget({ user: u, newStatus: "actif" })}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Réactiver"
                            data-testid={`unarchive-${u.id}`}
                          >
                            <Play size={14} />
                          </button>
                        )}
                        <button onClick={() => remove(u.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Supprimer définitivement">
                          <Trash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!statusTarget} onOpenChange={(v) => !v && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Warning size={20} className="text-amber-500" weight="fill" />
              {statusTarget && `${STATUS_LABEL[statusTarget.newStatus]} le compte`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget && (
                <>
                  Voulez-vous vraiment passer le compte de <span className="font-semibold">{statusTarget.user.name}</span> au statut
                  {" "}<span className="font-semibold">{STATUS_LABEL[statusTarget.newStatus].toLowerCase()}</span> ?
                  {statusTarget.newStatus !== "actif" && (
                    <><br /><span className="text-xs text-amber-600">Cette personne ne pourra plus se connecter tant que le compte n'est pas réactivé.</span></>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={applyStatusChange} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}