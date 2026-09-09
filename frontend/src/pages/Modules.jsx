import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash, PencilSimple, Books, Stack, Image as ImageIcon, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { API } from "@/lib/api";

const CATEGORIES = ["CACES", "PERMIS", "AUTO_ECOLE", "SSIAP", "VTC_TAXI", "ECSR", "VENTE"];

const emptyModule = { nom: "", category: "VTC_TAXI", duree_heures: 7, description: "" };
const emptyTemplate = { nom: "", category: "VTC_TAXI", modules: [] };

export default function Modules() {
  const [modules, setModules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [moduleForm, setModuleForm] = useState(emptyModule);
  const [moduleOpen, setModuleOpen] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [deletingModuleId, setDeletingModuleId] = useState(null);

  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState(null);

  const [imageVersions, setImageVersions] = useState(() => Object.fromEntries(CATEGORIES.map((c) => [c, Date.now()])));
  const [uploadingCategory, setUploadingCategory] = useState(null);

  const uploadFrenchTestImage = async (category, file) => {
    if (!file) return;
    setUploadingCategory(category);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post(`/french-tests/image/${category}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Image mise à jour");
      setImageVersions((v) => ({ ...v, [category]: Date.now() }));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi de l'image");
    } finally {
      setUploadingCategory(null);
    }
  };

  const load = () => {
    api.get("/formation-modules").then((r) => setModules(r.data));
    api.get("/session-templates").then((r) => setTemplates(r.data));
  };
  useEffect(load, []);

  const openCreateModule = () => { setEditingModuleId(null); setModuleForm(emptyModule); setModuleOpen(true); };
  const openEditModule = (m) => { setEditingModuleId(m.id); setModuleForm({ nom: m.nom, category: m.category, duree_heures: m.duree_heures, description: m.description || "" }); setModuleOpen(true); };
  const saveModule = async () => {
    try {
      if (editingModuleId) await api.put(`/formation-modules/${editingModuleId}`, moduleForm);
      else await api.post("/formation-modules", moduleForm);
      toast.success("Module enregistré");
      setModuleOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const removeModule = async (id) => {
    try { await api.delete(`/formation-modules/${id}`); toast.success("Module supprimé"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    setDeletingModuleId(null);
  };

  const openCreateTemplate = () => { setEditingTemplateId(null); setTemplateForm(emptyTemplate); setTemplateOpen(true); };
  const openEditTemplate = (t) => { setEditingTemplateId(t.id); setTemplateForm({ nom: t.nom, category: t.category, modules: t.modules || [] }); setTemplateOpen(true); };
  const saveTemplate = async () => {
    try {
      if (editingTemplateId) await api.put(`/session-templates/${editingTemplateId}`, templateForm);
      else await api.post("/session-templates", templateForm);
      toast.success("Modèle de session enregistré");
      setTemplateOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const removeTemplate = async (id) => {
    try { await api.delete(`/session-templates/${id}`); toast.success("Modèle supprimé"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    setDeletingTemplateId(null);
  };

  const addTemplateModuleRow = () => {
    const catModules = modules.filter((m) => m.category === templateForm.category);
    setTemplateForm((f) => ({
      ...f,
      modules: [...f.modules, { module_id: catModules[0]?.id || "", jour: f.modules.length + 1, heure_debut: "09:00", heure_fin: "17:00", animateur_id: null }],
    }));
  };
  const updateTemplateModuleRow = (idx, patch) => {
    setTemplateForm((f) => ({ ...f, modules: f.modules.map((m, i) => (i === idx ? { ...m, ...patch } : m)) }));
  };
  const removeTemplateModuleRow = (idx) => setTemplateForm((f) => ({ ...f, modules: f.modules.filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-6" data-testid="modules-page">
      <div>
        <p className="overline">Paramétrage</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Modules de formation</h1>
        <p className="text-gray-500 mt-2">Bibliothèque de modules et modèles de session pré-enregistrés, réutilisables à la création d'une session (voir page Sessions de stage).</p>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules"><Books size={14} className="mr-1" /> Modules</TabsTrigger>
          <TabsTrigger value="templates"><Stack size={14} className="mr-1" /> Modèles de session</TabsTrigger>
          <TabsTrigger value="french-images"><ImageIcon size={14} className="mr-1" /> Images test de français</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Dialog open={moduleOpen} onOpenChange={setModuleOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" onClick={openCreateModule}>
                  <Plus size={16} className="mr-1" /> Nouveau module
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingModuleId ? "Modifier le module" : "Nouveau module"}</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div>
                    <label className="text-sm font-medium">Nom du module</label>
                    <Input value={moduleForm.nom} onChange={(e) => setModuleForm({ ...moduleForm, nom: e.target.value })} placeholder="Ex : Réglementation VTC" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Catégorie de formation</label>
                    <Select value={moduleForm.category} onValueChange={(v) => setModuleForm({ ...moduleForm, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Durée (heures)</label>
                    <Input type="number" value={moduleForm.duree_heures} onChange={(e) => setModuleForm({ ...moduleForm, duree_heures: +e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Input value={moduleForm.description} onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setModuleOpen(false)}>Annuler</Button>
                  <Button onClick={saveModule} className="bg-[#d4af37] text-black hover:bg-[#b8941f]">Enregistrer</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!modules.length && <Card className="p-12 text-center border-dashed"><p className="text-gray-500">Aucun module — le contenu des modules sera fourni prochainement par l'équipe pédagogique.</p></Card>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m) => (
              <Card key={m.id} className="p-4 border border-gray-200">
                <div className="flex items-start justify-between">
                  <Badge variant="outline">{m.category}</Badge>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditModule(m)} className="text-gray-300 hover:text-[#d4af37]"><PencilSimple size={14} /></button>
                    <AlertDialog open={deletingModuleId === m.id} onOpenChange={(v) => !v && setDeletingModuleId(null)}>
                      <AlertDialogTrigger asChild>
                        <button onClick={() => setDeletingModuleId(m.id)} className="text-gray-300 hover:text-red-600"><Trash size={14} /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce module ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setDeletingModuleId(null)}>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeModule(m.id)} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <h3 className="font-display font-bold mt-2">{m.nom}</h3>
                <p className="text-xs text-gray-500 mt-1">{m.duree_heures}h {m.description ? `· ${m.description}` : ""}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" onClick={openCreateTemplate}>
                  <Plus size={16} className="mr-1" /> Nouveau modèle
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{editingTemplateId ? "Modifier le modèle" : "Nouveau modèle de session"}</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Nom du modèle</label>
                      <Input value={templateForm.nom} onChange={(e) => setTemplateForm({ ...templateForm, nom: e.target.value })} placeholder="Ex : Session Formation VTC standard" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Catégorie</label>
                      <Select value={templateForm.category} onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Modules du modèle (jour relatif au démarrage de la session)</label>
                    <div className="space-y-2 mt-1 max-h-64 overflow-y-auto">
                      {templateForm.modules.map((m, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-md p-2">
                          <span className="text-xs text-gray-500 w-14">Jour</span>
                          <Input type="number" className="w-16" min={1} value={m.jour} onChange={(e) => updateTemplateModuleRow(idx, { jour: +e.target.value })} />
                          <Select value={m.module_id} onValueChange={(v) => updateTemplateModuleRow(idx, { module_id: v })}>
                            <SelectTrigger className="flex-1 min-w-[160px]"><SelectValue placeholder="Module" /></SelectTrigger>
                            <SelectContent>
                              {modules.filter((mm) => mm.category === templateForm.category).map((mm) => <SelectItem key={mm.id} value={mm.id}>{mm.nom}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input type="time" className="w-24" value={m.heure_debut} onChange={(e) => updateTemplateModuleRow(idx, { heure_debut: e.target.value })} />
                          <Input type="time" className="w-24" value={m.heure_fin} onChange={(e) => updateTemplateModuleRow(idx, { heure_fin: e.target.value })} />
                          <button onClick={() => removeTemplateModuleRow(idx)} className="text-gray-300 hover:text-red-600"><Trash size={14} /></button>
                        </div>
                      ))}
                      {!templateForm.modules.length && <p className="text-xs text-gray-400 text-center py-3">Aucun module dans ce modèle.</p>}
                    </div>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addTemplateModuleRow}>
                      <Plus size={14} className="mr-1" /> Ajouter un module
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => setTemplateOpen(false)}>Annuler</Button>
                  <Button onClick={saveTemplate} className="bg-[#d4af37] text-black hover:bg-[#b8941f]">Enregistrer</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!templates.length && <Card className="p-12 text-center border-dashed"><p className="text-gray-500">Aucun modèle de session enregistré.</p></Card>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((t) => (
              <Card key={t.id} className="p-4 border border-gray-200">
                <div className="flex items-start justify-between">
                  <Badge variant="outline">{t.category}</Badge>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditTemplate(t)} className="text-gray-300 hover:text-[#d4af37]"><PencilSimple size={14} /></button>
                    <AlertDialog open={deletingTemplateId === t.id} onOpenChange={(v) => !v && setDeletingTemplateId(null)}>
                      <AlertDialogTrigger asChild>
                        <button onClick={() => setDeletingTemplateId(t.id)} className="text-gray-300 hover:text-red-600"><Trash size={14} /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce modèle ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setDeletingTemplateId(null)}>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeTemplate(t.id)} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <h3 className="font-display font-bold mt-2">{t.nom}</h3>
                <p className="text-xs text-gray-500 mt-1">{(t.modules || []).length} module(s)</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="french-images" className="mt-4 space-y-4">
          <p className="text-sm text-gray-500">
            Déposez ici l'image de situation utilisée en partie 1] du test de connaissance du français (voir page
            Bibliothèque de documents), pour chaque catégorie de formation — elle remplace automatiquement le texte
            descriptif de secours dès qu'une image est présente.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((cat) => (
              <Card key={cat} className="p-4 border border-gray-200">
                <Badge variant="outline">{cat}</Badge>
                <div className="mt-2 aspect-video bg-gray-50 border border-gray-200 rounded-md overflow-hidden flex items-center justify-center">
                  <img
                    src={`${API}/french-tests/image/${cat}?v=${imageVersions[cat]}`}
                    alt={cat}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      if (!e.target.dataset.fallback) {
                        e.target.dataset.fallback = "1";
                        e.target.src = `/tdl-image/${cat}.jpg`;
                      } else {
                        e.target.style.display = "none";
                        e.target.nextSibling.style.display = "flex";
                      }
                    }}
                  />
                  <div className="hidden items-center justify-center text-xs text-gray-400 h-full w-full">Aucune image</div>
                </div>
                <label className="inline-block mt-2">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadFrenchTestImage(cat, e.target.files?.[0])} />
                  <Button variant="outline" size="sm" disabled={uploadingCategory === cat} className="cursor-pointer">
                    <UploadSimple size={14} className="mr-1" /> {uploadingCategory === cat ? "Envoi..." : "Changer l'image"}
                  </Button>
                </label>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
