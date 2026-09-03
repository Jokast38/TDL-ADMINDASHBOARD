import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PasswordInput from "@/components/PasswordInput";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Plus, FileText, UploadSimple, Trash, Calendar, PencilSimple, Signature } from "@phosphor-icons/react";
import { toast } from "sonner";

const emptyForm = { name: "", email: "", phone: "", password: "", titre: "" };

// Page dédiée aux formateurs (animateurs) : répertoire, documents
// (habilitations, diplômes...) et sessions assignées — à ne pas confondre
// avec la page Employés (comptes de tout le staff, sans gestion documentaire
// ni assignation session). Réutilise le même backend que Employés
// (POST/GET /employees, role="animateur") + les endpoints staff_profiles.
export default function Formateurs() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null); // formateur sélectionné
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [titreDraft, setTitreDraft] = useState("");
  const [savingTitre, setSavingTitre] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => api.get("/employees").then((r) => setItems(r.data.filter((u) => u.role === "animateur")));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      return toast.error("Nom, email et mot de passe sont requis");
    }
    setSaving(true);
    try {
      await api.post("/employees", { ...form, role: "animateur" });
      toast.success("Formateur créé");
      setOpen(false); setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (u) => {
    setDetail(u);
    setTitreDraft(u.titre || "");
    setProfile(null);
    setSessions([]);
    try {
      const [{ data: p }, { data: s }] = await Promise.all([
        api.get(`/staff/${u.id}/profile`),
        api.get("/stages", { params: { animateur_id: u.id } }),
      ]);
      setProfile(p);
      setSessions(s);
    } catch {
      toast.error("Erreur de chargement du profil");
    }
  };

  const saveTitre = async () => {
    if (!detail) return;
    setSavingTitre(true);
    try {
      const { data } = await api.put(`/employees/${detail.id}/titre`, { titre: titreDraft || null });
      toast.success("Intitulé enregistré");
      setDetail(data);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingTitre(false);
    }
  };

  const uploadDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      await api.post(`/staff/${detail.id}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document ajouté");
      const { data: p } = await api.get(`/staff/${detail.id}/profile`);
      setProfile(p);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const deleteDoc = async (docId) => {
    if (!detail) return;
    try {
      await api.delete(`/staff/${detail.id}/documents/${docId}`);
      toast.success("Document supprimé");
      const { data: p } = await api.get(`/staff/${detail.id}/profile`);
      setProfile(p);
    } catch {
      toast.error("Erreur");
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/employees/${id}`);
      toast.success("Formateur supprimé");
      setDeleteTarget(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <div className="space-y-6" data-testid="formateurs-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Équipe pédagogique</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Formateurs</h1>
          <p className="text-gray-500 mt-2">{items.length} formateur(s). Documents, intitulés et sessions assignées.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="add-formateur-btn">
              <Plus size={16} className="mr-2" /> Nouveau formateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouveau formateur</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-sm font-medium">Nom complet</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="formateur-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="formateur-email" />
                </div>
                <div>
                  <label className="text-sm font-medium">Téléphone</label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Intitulé (affiché sur les documents)</label>
                <Input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="Ex: Formateur BAFM, Moniteur auto-école" data-testid="formateur-titre" />
              </div>
              <div>
                <label className="text-sm font-medium">Mot de passe initial</label>
                <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="formateur-password" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
              <Button onClick={save} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="formateur-save">
                {saving ? "Création..." : "Créer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((u) => (
          <Card
            key={u.id}
            className="p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer"
            onClick={() => openDetail(u)}
            data-testid={`formateur-card-${u.id}`}
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-display text-lg font-bold leading-tight">{u.name}</h3>
              {u.signature_path && <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10 text-[10px]"><Signature size={10} className="mr-1" />Signature OK</Badge>}
            </div>
            <p className="text-xs text-gray-500">{u.titre || "Formateur"}</p>
            <p className="text-xs text-gray-400 font-mono mt-1">{u.email}</p>
            {u.agrement_bafm_numero && <p className="text-xs text-gray-400 mt-1">BAFM : {u.agrement_bafm_numero}</p>}
          </Card>
        ))}
        {!items.length && (
          <Card className="col-span-full p-12 text-center border-dashed">
            <p className="text-gray-500">Aucun formateur. Cliquez sur "Nouveau formateur" pour en créer un.</p>
          </Card>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="formateur-detail-dialog">
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.name}</DialogTitle></DialogHeader>
              <div className="space-y-6 mt-2">
                <div>
                  <label className="text-sm font-medium">Intitulé (affiché sur les attestations générées)</label>
                  <div className="flex gap-2 mt-1">
                    <Input value={titreDraft} onChange={(e) => setTitreDraft(e.target.value)} placeholder="Ex: Formateur BAFM" data-testid="formateur-titre-edit" />
                    <Button onClick={saveTitre} disabled={savingTitre} variant="outline">
                      <PencilSimple size={14} className="mr-1" /> {savingTitre ? "..." : "Enregistrer"}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Agrément BAFM et signature manuscrite sont gérés par le formateur lui-même depuis son espace ("Ma signature").
                    {detail.agrement_bafm_numero ? ` Actuellement : ${detail.agrement_bafm_numero}.` : " Aucun numéro renseigné pour l'instant."}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1"><FileText size={15} /> Documents / habilitations</p>
                  <label className="inline-block mb-3">
                    <input type="file" className="hidden" onChange={uploadDoc} data-testid="formateur-doc-upload" />
                    <Button type="button" variant="outline" size="sm" disabled={uploading} className="cursor-pointer">
                      <UploadSimple size={14} className="mr-1" /> {uploading ? "Envoi..." : "Ajouter un document"}
                    </Button>
                  </label>
                  <div className="space-y-1">
                    {(profile?.documents_details || []).map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                        <span className="truncate">{d.original_filename}</span>
                        <button onClick={() => deleteDoc(d.id)} className="p-1 text-red-600 hover:bg-red-50 rounded shrink-0" title="Supprimer">
                          <Trash size={14} />
                        </button>
                      </div>
                    ))}
                    {profile && !(profile.documents_details || []).length && (
                      <p className="text-xs text-gray-400">Aucun document.</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1"><Calendar size={15} /> Sessions assignées</p>
                  <div className="space-y-1">
                    {sessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                        <span>{s.formation_titre}</span>
                        <span className="text-xs text-gray-500 font-mono">{s.date_debut} → {s.date_fin}</span>
                      </div>
                    ))}
                    {!sessions.length && <p className="text-xs text-gray-400">Aucune session assignée pour l'instant — assignez-le depuis la page Sessions de stage.</p>}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t">
                  <AlertDialog open={deleteTarget === detail.id} onOpenChange={(v) => !v && setDeleteTarget(null)}>
                    <AlertDialogTrigger asChild>
                      <button onClick={() => setDeleteTarget(detail.id)} className="text-xs text-red-600 hover:underline">
                        Supprimer ce formateur
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer {detail.name} ?</AlertDialogTitle>
                        <AlertDialogDescription>Cette action est irréversible. Les sessions déjà assignées conservent son nom en historique.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(detail.id)} className="bg-red-600 hover:bg-red-700 text-white">Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
