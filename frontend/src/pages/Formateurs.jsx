import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, UploadSimple, Trash, Calendar, PencilSimple, Signature, CheckCircle, Clock, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import FormateurTitrePicker from "@/components/FormateurTitrePicker";
import FormateursAgenda from "@/components/FormateursAgenda";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const emptyForm = { nom: "", prenom: "", email: "", phone: "", titre: "", matricule: "", assigned_categories: [] };

// Doit rester synchronisé avec FORMATEUR_DOC_TYPES côté backend
// (routers/employees.py) et STAFF_DOC_TYPE_LABELS dans AnimateurSpace.jsx.
const DOC_TYPE_LABELS = {
  identite_recto: "Pièce d'identité (recto)",
  identite_verso: "Pièce d'identité (verso)",
  diplome_bafm_psy: "Diplôme BAFM / PSY",
  autorisation_animer_initiale: "Autorisation d'animer initiale",
  attestation_formation_continue: "Attestation de formation continue",
  attestation_gta_initiale: "Attestation GTA initiale",
  attestation_gta_continue: "Attestation GTA continue",
  kbis: "KBIS de moins de 3 mois",
  attestation_vigilance_urssaf: "Attestation de vigilance URSSAF",
  justificatif_domicile: "Justificatif de domicile",
};

function DossierBadge({ u }) {
  if (u.dossier_complete) {
    return <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10 text-[10px]"><CheckCircle size={10} className="mr-1" weight="fill" />Dossier complet</Badge>;
  }
  if (u.dossier_overdue) {
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]"><WarningCircle size={10} className="mr-1" weight="fill" />Dossier en retard</Badge>;
  }
  return <Badge className="bg-[#F5A623]/10 text-[#F5A623] hover:bg-[#F5A623]/10 text-[10px]"><Clock size={10} className="mr-1" />Dossier incomplet</Badge>;
}

// Page dédiée aux formateurs (animateurs) : répertoire, documents
// (habilitations, diplômes...) et sessions assignées — à ne pas confondre
// avec la page Employés (comptes de tout le staff, sans gestion documentaire
// ni assignation session). Réutilise le même backend que Employés
// (POST/GET /employees, role="animateur") + les endpoints staff_profiles.
export default function Formateurs() {
  const [items, setItems] = useState([]);
  const [planningOverview, setPlanningOverview] = useState(null);
  const [identiteDraft, setIdentiteDraft] = useState({ nom: "", prenom: "" });
  const [savingIdentite, setSavingIdentite] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState("");
  const [savingQuota, setSavingQuota] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null); // formateur sélectionné
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [titreDraft, setTitreDraft] = useState("");
  const [categoriesDraft, setCategoriesDraft] = useState([]);
  const [savingTitre, setSavingTitre] = useState(false);
  const [matriculeDraft, setMatriculeDraft] = useState("");
  const [savingMatricule, setSavingMatricule] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploadDocType, setUploadDocType] = useState(Object.keys(DOC_TYPE_LABELS)[0]);

  const load = () => api.get("/employees").then((r) => setItems(r.data.filter((u) => u.role === "animateur")));
  useEffect(() => {
    load();
    api.get("/formateurs/planning-overview").then((r) => setPlanningOverview(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    const nom = form.nom.trim();
    const prenom = form.prenom.trim();
    if (!nom || !prenom || !form.email.trim()) {
      return toast.error("Nom, prénom et email sont requis");
    }
    if (!form.assigned_categories.length || !form.titre) {
      return toast.error("Choisissez au moins un type de formation et un titre");
    }
    setSaving(true);
    try {
      await api.post("/employees", { ...form, nom, prenom, name: `${prenom} ${nom}`, role: "animateur" });
      toast.success("Formateur créé — ses identifiants (mot de passe généré automatiquement) lui ont été envoyés par email");
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
    setCategoriesDraft(u.assigned_categories || []);
    setIdentiteDraft({ nom: u.nom || "", prenom: u.prenom || "" });
    setQuotaDraft(u.quota_jours_annuel ?? "");
    setMatriculeDraft(u.matricule || "");
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
      const { data } = await api.put(`/employees/${detail.id}/titre`, { titre: titreDraft || null, assigned_categories: categoriesDraft });
      toast.success("Titre enregistré");
      setDetail({ ...detail, ...data });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingTitre(false);
    }
  };

  const saveIdentite = async () => {
    if (!detail) return;
    if (!identiteDraft.nom.trim() || !identiteDraft.prenom.trim()) return toast.error("Nom et prénom sont requis");
    setSavingIdentite(true);
    try {
      const { data } = await api.put(`/employees/${detail.id}/identite`, identiteDraft);
      toast.success("Nom et prénom enregistrés");
      setDetail({ ...detail, ...data });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingIdentite(false);
    }
  };

  const saveQuota = async () => {
    if (!detail) return;
    setSavingQuota(true);
    try {
      const { data } = await api.put(`/employees/${detail.id}/quota`, { quota_jours_annuel: quotaDraft === "" ? null : Number(quotaDraft) });
      toast.success("Quota enregistré");
      setDetail({ ...detail, ...data });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingQuota(false);
    }
  };

  const saveMatricule = async () => {
    if (!detail) return;
    setSavingMatricule(true);
    try {
      const { data } = await api.put(`/employees/${detail.id}/matricule`, { matricule: matriculeDraft || null });
      toast.success("Matricule enregistré");
      setDetail(data);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSavingMatricule(false);
    }
  };

  const uploadDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("doc_type", uploadDocType);
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
          <p className="text-gray-500 mt-2">{items.length} formateur(s). Documents, titres et sessions assignées.</p>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Nom</label>
                  <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} data-testid="formateur-nom" />
                </div>
                <div>
                  <label className="text-sm font-medium">Prénom</label>
                  <Input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} data-testid="formateur-prenom" />
                </div>
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
              <FormateurTitrePicker
                categories={form.assigned_categories}
                titre={form.titre}
                onChange={({ categories, titre }) => setForm({ ...form, assigned_categories: categories, titre })}
              />
              <div>
                <label className="text-sm font-medium">Matricule</label>
                <Input value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} placeholder="Ex: F-0042" data-testid="formateur-matricule" />
                <p className="text-xs text-gray-400 mt-1">Affiché à la place du nom sur la feuille d'émargement.</p>
              </div>
              <p className="text-xs text-gray-400">
                Un mot de passe temporaire sera généré automatiquement et envoyé par email au formateur, avec un lien de connexion.
              </p>
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

      <Tabs defaultValue="repertoire">
        <TabsList>
          <TabsTrigger value="repertoire" data-testid="formateurs-tab-repertoire">Répertoire</TabsTrigger>
          <TabsTrigger value="agenda" data-testid="formateurs-tab-agenda"><Calendar size={14} className="mr-1" /> Agenda des placements</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda" className="mt-4">
          <FormateursAgenda formateurs={items} />
        </TabsContent>
        <TabsContent value="repertoire" className="mt-4">
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
                {u.matricule && <p className="text-xs text-gray-400 font-mono mt-0.5">Matricule : {u.matricule}</p>}
                {u.agrement_bafm_numero && <p className="text-xs text-gray-400 mt-1">BAFM : {u.agrement_bafm_numero}</p>}
                {planningOverview && (
                  <p className="text-xs text-gray-400 mt-1" data-testid={`formateur-planning-${u.id}`}>
                    Planning {planningOverview.year} : {planningOverview.jours[u.id] || 0} jour(s)
                    {u.quota_jours_annuel != null ? ` / ${u.quota_jours_annuel}` : ""}
                  </p>
                )}
                <div className="mt-2"><DossierBadge u={u} /></div>
              </Card>
            ))}
            {!items.length && (
              <Card className="col-span-full p-12 text-center border-dashed">
                <p className="text-gray-500">Aucun formateur. Cliquez sur "Nouveau formateur" pour en créer un.</p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="formateur-detail-dialog">
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.name}</DialogTitle></DialogHeader>
              <div className="space-y-6 mt-2">
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Nom</label>
                      <Input value={identiteDraft.nom} onChange={(e) => setIdentiteDraft({ ...identiteDraft, nom: e.target.value })} className="mt-1" data-testid="formateur-nom-edit" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Prénom</label>
                      <Input value={identiteDraft.prenom} onChange={(e) => setIdentiteDraft({ ...identiteDraft, prenom: e.target.value })} className="mt-1" data-testid="formateur-prenom-edit" />
                    </div>
                  </div>
                  <Button onClick={saveIdentite} disabled={savingIdentite} variant="outline" className="mt-2" data-testid="formateur-identite-save">
                    <PencilSimple size={14} className="mr-1" /> {savingIdentite ? "..." : "Enregistrer"}
                  </Button>
                </div>

                <div>
                  <label className="text-sm font-medium">Quota de jours par an</label>
                  <div className="flex gap-2 mt-1">
                    <Input type="number" min="0" value={quotaDraft} onChange={(e) => setQuotaDraft(e.target.value)} placeholder="Pas de limite" data-testid="formateur-quota-edit" />
                    <Button onClick={saveQuota} disabled={savingQuota} variant="outline">
                      <PencilSimple size={14} className="mr-1" /> {savingQuota ? "..." : "Enregistrer"}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Limite les dates que le formateur choisit lui-même. Pour le placer au-delà, assignez-le depuis la page Sessions de formation.
                  </p>
                </div>

                <div>
                  <FormateurTitrePicker
                    categories={categoriesDraft}
                    titre={titreDraft}
                    onChange={({ categories, titre }) => { setCategoriesDraft(categories); setTitreDraft(titre); }}
                  />
                  <Button onClick={saveTitre} disabled={savingTitre} variant="outline" className="mt-2" data-testid="formateur-titre-save">
                    <PencilSimple size={14} className="mr-1" /> {savingTitre ? "..." : "Enregistrer"}
                  </Button>
                  <p className="text-xs text-gray-400 mt-2">
                    Agrément BAFM et signature manuscrite sont gérés par le formateur lui-même depuis son espace ("Ma signature").
                    {detail.agrement_bafm_numero ? ` Actuellement : ${detail.agrement_bafm_numero}.` : " Aucun numéro renseigné pour l'instant."}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">Matricule (affiché sur la feuille d'émargement, à la place du nom)</label>
                  <div className="flex gap-2 mt-1">
                    <Input value={matriculeDraft} onChange={(e) => setMatriculeDraft(e.target.value)} placeholder="Ex: F-0042" data-testid="formateur-matricule-edit" />
                    <Button onClick={saveMatricule} disabled={savingMatricule} variant="outline">
                      <PencilSimple size={14} className="mr-1" /> {savingMatricule ? "..." : "Enregistrer"}
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium flex items-center gap-1"><FileText size={15} /> Documents / habilitations</p>
                    <DossierBadge u={detail} />
                  </div>
                  <div className="flex gap-2 mb-3">
                    <Select value={uploadDocType} onValueChange={setUploadDocType}>
                      <SelectTrigger className="flex-1" data-testid="formateur-doc-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <label className="shrink-0">
                      <input type="file" className="hidden" onChange={uploadDoc} data-testid="formateur-doc-upload" />
                      <Button type="button" variant="outline" disabled={uploading} className="cursor-pointer">
                        <UploadSimple size={14} className="mr-1" /> {uploading ? "Envoi..." : "Charger"}
                      </Button>
                    </label>
                  </div>
                  <div className="space-y-1">
                    {Object.entries(DOC_TYPE_LABELS).map(([type, label]) => {
                      const doc = (profile?.documents_details || []).find((d) => d.doc_type === type);
                      return (
                        <div key={type} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                          <span className="flex items-center gap-2 truncate">
                            {doc ? <CheckCircle size={14} className="text-[#0B7238] shrink-0" weight="fill" /> : <Clock size={14} className="text-gray-300 shrink-0" />}
                            <span className="truncate">{label}{doc ? ` — ${doc.original_filename}` : ""}</span>
                          </span>
                          {doc && (
                            <button onClick={() => deleteDoc(doc.id)} className="p-1 text-red-600 hover:bg-red-50 rounded shrink-0" title="Supprimer">
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {detail.convention_required === false
                      ? "Pas de convention : elle ne concerne que les stages de récupération de points."
                      : detail.convention_signed
                      ? "Convention de collaboration signée par le formateur."
                      : "Convention pas encore signée — le formateur la signe depuis son espace (\"Mon dossier\")."}
                  </p>
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
                    {!sessions.length && <p className="text-xs text-gray-400">Aucune session assignée pour l'instant — assignez-le depuis la page Sessions de formation.</p>}
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
