import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PasswordInput from "@/components/PasswordInput";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Plus, Trash, Pause, Play, Archive, Warning, Key, Tag } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = { email: "", name: "", role: "employe", phone: "", department: "", password: "", assigned_categories: [], assigned_centers: [], assigned_training_assignments: [] };
const CENTER_OPTIONS = [
  { key: "Épinay-sur-Seine (93)", label: "Épinay-sur-Seine (93)" },
  { key: "Creil (60)", label: "Creil (60)" },
];

// Catégories de formation (alignées sur Formation.category) — un commercial ou
// un chargé d'admission assigné à une ou plusieurs catégories ne reçoit que les
// leads/demandes de rappel les concernant (dashboard + email + push).
const CATEGORY_OPTIONS = [
  { key: "CACES", label: "CACES" },
  { key: "PERMIS", label: "Récupération de points" },
  { key: "AUTO_ECOLE", label: "Auto-école" },
  { key: "SSIAP", label: "SSIAP" },
  { key: "VTC_TAXI", label: "VTC / Taxi" },
  { key: "ECSR", label: "ECSR" },
  { key: "VENTE", label: "Conseiller de Vente" },
];
const ROLES_WITH_ASSIGNMENT = ["commercial", "responsable_commercial", "responsable_admission", "agent_admin"];

const STATUS_BADGE = {
  actif: "bg-green-100 text-green-700 hover:bg-green-100",
  suspendu: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  archive: "bg-gray-200 text-gray-600 hover:bg-gray-200",
};
const STATUS_LABEL = { actif: "Actif", suspendu: "Suspendu", archive: "Archivé" };

export default function Employees() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [statusTarget, setStatusTarget] = useState(null); // { user, newStatus }
  const [categoriesTarget, setCategoriesTarget] = useState(null); // employee being edited
  const [categoriesDraft, setCategoriesDraft] = useState([]);
  const [centersDraft, setCentersDraft] = useState([]);
  const [assignmentsDraft, setAssignmentsDraft] = useState([]);
  const [savingCategories, setSavingCategories] = useState(false);

  const load = () => api.get("/employees").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (form.assigned_training_assignments.some((assignment) => !assignment.category || !assignment.center)) {
      return toast.error("Complétez ou supprimez chaque attribution incomplète");
    }
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

  const sendPasswordReset = async (u) => {
    if (!window.confirm(`Envoyer un lien de réinitialisation de mot de passe à ${u.name} (${u.email}) ?`)) return;
    try {
      await api.post(`/employees/${u.id}/send-password-reset`);
      toast.success("Email de réinitialisation envoyé");
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

  const openCategories = (u) => {
    setCategoriesTarget(u);
    setCategoriesDraft(u.assigned_categories || []);
    setCentersDraft(u.assigned_centers || []);
    setAssignmentsDraft(u.assigned_training_assignments?.length
      ? u.assigned_training_assignments
      : (u.assigned_categories || []).flatMap((category) => (u.assigned_centers || []).map((center) => ({ category, center }))));
  };

  const toggleCategoryDraft = (key) =>
    setCategoriesDraft((prev) => prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]);

  const saveCategories = async () => {
    if (!categoriesTarget) return;
    if (assignmentsDraft.some((assignment) => !assignment.category || !assignment.center)) {
      return toast.error("Complétez ou supprimez chaque attribution incomplète");
    }
    setSavingCategories(true);
    try {
      await api.put(`/employees/${categoriesTarget.id}/categories`, { assigned_categories: categoriesDraft });
      await api.put(`/employees/${categoriesTarget.id}/centers`, { assigned_centers: centersDraft });
      await api.put(`/employees/${categoriesTarget.id}/assignments`, { assigned_training_assignments: assignmentsDraft });
      toast.success("Catégories mises à jour");
      setCategoriesTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingCategories(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="employees-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Équipe interne</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Employés</h1>
          <p className="text-gray-500 mt-2">{items.length} membre(s).</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !isAdmin) setForm((f) => ({ ...f, role: "commercial" })); }}>
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
                    {isAdmin ? (
                      <>
                        <SelectItem value="employe">Employé</SelectItem>
                        <SelectItem value="animateur">Animateur / Formateur</SelectItem>
                        <SelectItem value="responsable_admission">Responsable admission</SelectItem>
                        <SelectItem value="agent_admin">Agent administratif</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                        <SelectItem value="responsable_commercial">Responsable commercial</SelectItem>
                        <SelectItem value="admin">Administrateur</SelectItem>
                      </>
                    ) : (
                      <SelectItem value="commercial">Commercial</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Département</label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Mot de passe initial</label>
                <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="emp-password" />
              </div>
              {ROLES_WITH_ASSIGNMENT.includes(form.role) && (
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium mb-1 block">Cours et centre attribués</label>
                  <p className="text-xs text-gray-500 mb-2">Ajoutez chaque combinaison séparément. Exemple : SSIAP à Épinay et CACES à Creil.</p>
                  <AssignmentEditor
                    assignments={form.assigned_training_assignments}
                    onChange={(assigned_training_assignments) => setForm((f) => ({ ...f, assigned_training_assignments }))}
                  />
                </div>
              )}
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
                <th className="py-3 px-4 overline">Formations</th>
                <th className="py-3 px-4 overline">Centres</th>
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
                    <td className="py-3 px-4">
                      {ROLES_WITH_ASSIGNMENT.includes(u.role) ? (
                        (u.assigned_training_assignments || []).length ? (
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {u.assigned_training_assignments.map((assignment, index) => (
                              <Badge key={`${assignment.category}-${assignment.center}-${index}`} variant="outline" className="text-[10px]">
                                {CATEGORY_OPTIONS.find((o) => o.key === assignment.category)?.label || assignment.category} · {assignment.center}
                              </Badge>
                            ))}
                          </div>
                        ) : <span className="text-xs text-gray-400">Ancienne attribution / tous</span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      {ROLES_WITH_ASSIGNMENT.includes(u.role) ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(u.assigned_categories || []).length ? (
                            u.assigned_categories.map((c) => (
                              <Badge key={c} variant="outline" className="text-[10px]">
                                {CATEGORY_OPTIONS.find((o) => o.key === c)?.label || c}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">Toutes (non assigné)</span>
                          )}
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
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
                        {ROLES_WITH_ASSIGNMENT.includes(u.role) && (
                          <button
                            onClick={() => openCategories(u)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Attribuer des formations"
                            data-testid={`categories-${u.id}`}
                          >
                            <Tag size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => sendPasswordReset(u)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Réinitialiser le mot de passe"
                          data-testid={`reset-password-${u.id}`}
                        >
                          <Key size={14} />
                        </button>
                        {isAdmin && (
                          <button onClick={() => remove(u.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Supprimer définitivement">
                            <Trash size={14} />
                          </button>
                        )}
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

      <Dialog open={!!categoriesTarget} onOpenChange={(v) => !v && setCategoriesTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Formations attribuées — {categoriesTarget?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500 -mt-1">
            Cette personne ne recevra que les leads et demandes de rappel correspondant aux catégories cochées.
            Aucune case cochée = elle voit tout (comportement par défaut).
          </p>
          <div className="space-y-5 mt-2">
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1"><Tag size={15} /> Cours et centres attribués</p>
            <p className="text-xs text-gray-500 mb-2">Chaque ligne est indépendante : vous pouvez attribuer des cours à des centres différents.</p>
            <AssignmentEditor assignments={assignmentsDraft} onChange={setAssignmentsDraft} />
          </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setCategoriesTarget(null)} disabled={savingCategories}>Annuler</Button>
            <Button onClick={saveCategories} disabled={savingCategories} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              {savingCategories ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignmentEditor({ assignments, onChange }) {
  const addAssignment = () => onChange([...assignments, { category: "", center: "" }]);
  const updateAssignment = (index, field, value) => {
    onChange(assignments.map((assignment, currentIndex) =>
      currentIndex === index ? { ...assignment, [field]: value } : assignment
    ));
  };
  const removeAssignment = (index) => onChange(assignments.filter((_, currentIndex) => currentIndex !== index));

  return (
    <div className="space-y-2">
      {assignments.map((assignment, index) => (
        <div key={`${index}-${assignment.category}-${assignment.center}`} className="flex items-center gap-2">
          <Select value={assignment.category} onValueChange={(value) => updateAssignment(index, "category", value)}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Choisir un cours" /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((category) => <SelectItem key={category.key} value={category.key}>{category.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assignment.center} onValueChange={(value) => updateAssignment(index, "center", value)}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Choisir un centre" /></SelectTrigger>
            <SelectContent>
              {CENTER_OPTIONS.map((center) => <SelectItem key={center.key} value={center.key}>{center.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => removeAssignment(index)}
            className="p-2 text-red-600 hover:bg-red-50 rounded"
            title="Supprimer cette attribution"
            aria-label="Supprimer cette attribution"
          >
            <Trash size={15} />
          </button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={addAssignment}>
        <Plus size={14} className="mr-1" /> Ajouter un cours dans un centre
      </Button>
    </div>
  );
}