import { useEffect, useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilePdf, DownloadSimple, MagnifyingGlass, Plus, FileText, Trash, Warning, PenNib, Eraser, Eye, Link as LinkIcon, Copy, ClipboardText } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import SignatureCanvas from "react-signature-canvas";

const TYPES = ["all", "attestation_presence", "attestation", "facture", "devis", "convention", "autre"];

// Signatures prédéfinies proposées dans le dropdown (en plus du dessin manuel).
// La première est celle utilisée par défaut à l'ouverture du dialogue.
const PRESET_SIGNATURES = [
  { id: "tdl-default", label: "Signature TDL (par défaut)", src: "/doc/signature-withoutbg.png" },
];

// --- Infos fixes de l'entreprise, pré-remplies automatiquement dans le
// contexte de génération pour chaque modèle (évite de les retaper à chaque fois). ---
const COMPANY_DEFAULTS = {
  organisme_nom: "TOP DRIVE LEARNING",
  adresse: "59 avenue JOFFRE, 93800 EPINAY-SUR-SEINE",
  code_postal: "93800",
  ville: "EPINAY SUR SEINE",
  lieu_signature: "EPINAY SUR SEINE",
  email: "tdlparisformation@gmail.com",
  telephone: "01 80 90 72 49",
  siret: "90096880100010",
  numero_declaration_activite: "11930882293",
  region: "SEINE-SAINT-DENIS",
  region_prefet: "auprès du préfet de région de SEINE-SAINT-DENIS, n° 93300",
  representant_nom: "Tafial RODDY",
  signataire_nom: "Tafial RODDY",
  formateur_nom: "Tafial RODDY",
  service_nom: "Service secrétariat – TDL FORMATION",
  service_telephone: "01 80 90 72 49",
  service_email: "tdlparisformation@gmail.com",
  iban: "FR76 1695 8000 0118 4776 5970 980",
  bic: "",
  agrements: "VTC 93/22-02 | TAXI T22 093 00050",
  tribunal: "Bobigny",
};

// Champs reconnus comme des dates à pré-remplir avec la date du jour
const AUTO_DATE_FIELDS = ["date_emission", "date_signature"];

function todayFR() {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Construit un contexte par défaut à partir des variables déclarées sur le modèle :
// - infos entreprise déjà connues -> pré-remplies
// - champs de date reconnus -> date du jour
// - reste (infos propres à l'élève / la formation) -> à compléter manuellement
function buildDefaultContext(template) {
  const vars = template?.variables?.length ? template.variables : Object.keys(COMPANY_DEFAULTS);
  const ctx = {};
  vars.forEach((v) => {
    if (COMPANY_DEFAULTS[v] !== undefined) ctx[v] = COMPANY_DEFAULTS[v];
    else if (AUTO_DATE_FIELDS.includes(v)) ctx[v] = todayFR();
    else ctx[v] = "";
  });
  return ctx;
}

export default function DocumentsLibrary() {
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [tplId, setTplId] = useState("");
  const [ctx, setCtx] = useState({});
  const [previewing, setPreviewing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [tests, setTests] = useState([]);
  const [testOpen, setTestOpen] = useState(false);
  const [testNom, setTestNom] = useState("");
  const [testSession, setTestSession] = useState("");
  const [testEvaluateur, setTestEvaluateur] = useState("");
  const [staff, setStaff] = useState([]);
  const [creatingTest, setCreatingTest] = useState(false);

  const [sigOpen, setSigOpen] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [savingSig, setSavingSig] = useState(false);
  const [sigMode, setSigMode] = useState(PRESET_SIGNATURES[0].id); // "draw" ou l'id d'une signature prédéfinie
  const sigPadRef = useRef(null);

  const checkSignature = () => {
    api.get("/me/signature/image", { responseType: "blob" })
      .then((r) => { setHasSignature(true); setSignatureUrl(URL.createObjectURL(r.data)); })
      .catch(() => { setHasSignature(false); setSignatureUrl(null); });
  };

  const load = () => {
    const params = type === "all" ? {} : { params: { type_doc: type } };
    api.get("/documents-generated", params).then((r) => setItems(r.data));
  };

  const loadTests = () => { api.get("/positioning-tests").then((r) => setTests(r.data)); };

  useEffect(() => { load(); }, [type]);
  useEffect(() => { api.get("/doc-templates").then((r) => setTemplates(r.data)); }, []);
  useEffect(() => { checkSignature(); }, []);
  useEffect(() => { loadTests(); }, []);
  useEffect(() => { api.get("/employees").then((r) => setStaff(r.data)).catch(() => {}); }, []);

  const filtered = items.filter((d) => (d.nom_fichier + (d.template_nom || "") + (d.type_doc || "")).toLowerCase().includes(q.toLowerCase()));

  const download = async (gid, name) => {
    try {
      const res = await api.get(`/documents-generated/${gid}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = name || "document.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Erreur téléchargement"); }
  };

  const view = (gid) => {
    const token = localStorage.getItem("tdl_token");
    fetch(`${API}/documents-generated/${gid}/download`, { headers: { Authorization: `Bearer ${token}` }})
      .then((r) => r.blob()).then((blob) => window.open(URL.createObjectURL(blob), "_blank"));
  };

  const selectTemplate = (id) => {
    setTplId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setCtx(buildDefaultContext(tpl));
  };

  const generate = async () => {
    if (!tplId) return toast.error("Choisissez un modèle");
    try {
      await api.post("/documents-generated", { template_id: tplId, context: ctx });
      toast.success("Document PDF généré");
      setGenOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur génération");
    }
  };

  const previewTemplate = async () => {
    if (!tplId) return toast.error("Choisissez un modèle");
    setPreviewing(true);
    try {
      const res = await api.post("/documents-generated/preview", { template_id: tplId, context: ctx }, { responseType: "blob" });
      window.open(URL.createObjectURL(res.data), "_blank");
    } catch (e) {
      toast.error("Erreur lors de l'aperçu");
    } finally {
      setPreviewing(false);
    }
  };

  const createTest = async () => {
    if (!testNom.trim()) return toast.error("Indiquez le nom du candidat");
    setCreatingTest(true);
    try {
      const res = await api.post("/positioning-tests", { stagiaire_nom: testNom, session: testSession, evaluateur: testEvaluateur });
      await navigator.clipboard.writeText(res.data.link).catch(() => {});
      toast.success("Lien créé et copié dans le presse-papiers");
      setTestOpen(false);
      setTestNom(""); setTestSession(""); setTestEvaluateur("");
      loadTests();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur création du lien");
    } finally {
      setCreatingTest(false);
    }
  };

  const copyTestLink = (link) => {
    navigator.clipboard.writeText(link).then(() => toast.success("Lien copié")).catch(() => toast.error("Erreur copie"));
  };

  const downloadTestResult = async (t) => {
    try {
      const res = await api.get(`/positioning-tests/${t.id}/result/download`, { responseType: "blob" });
      window.open(URL.createObjectURL(res.data), "_blank");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Résultat non disponible");
    }
  };

  const signDocument = async (id) => {
    try {
      await api.put(`/documents-generated/${id}/sign`);
      toast.success("Document signé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la signature");
    }
  };

  // Convertit une dataURL base64 en Blob à la main : plus fiable que
  // fetch(dataUrl), que certains navigateurs/CSP bloquent sur les URI data:.
  const dataUrlToBlob = (dataUrl) => {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const saveSignature = async () => {
    setSavingSig(true);
    try {
      let blob;
      if (sigMode === "draw") {
        if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
          toast.error("Dessinez votre signature d'abord");
          setSavingSig(false);
          return;
        }
        const dataUrl = sigPadRef.current.getCanvas().toDataURL("image/png");
        blob = dataUrlToBlob(dataUrl);
      } else {
        const preset = PRESET_SIGNATURES.find((p) => p.id === sigMode);
        const res = await fetch(preset.src);
        blob = await res.blob();
      }
      const fd = new FormData();
      fd.append("file", blob, "signature.png");
      await api.post("/me/signature", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Signature enregistrée");
      setSigOpen(false);
      checkSignature();
    } catch (e) {
      console.error("Erreur enregistrement signature:", e);
      toast.error(e.response?.data?.detail || e.message || "Erreur");
    }
    finally { setSavingSig(false); }
  };

  const removeSignature = async () => {
    try {
      await api.delete("/me/signature");
      toast.success("Signature supprimée");
      checkSignature();
    } catch { toast.error("Erreur"); }
  };

  const deleteDocument = async (id) => {
    try {
      await api.delete(`/documents-generated/${id}`);
      toast.success("Document supprimé");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la suppression");
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6" data-testid="docs-library-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline">Bibliothèque</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Documents générés</h1>
          <p className="text-gray-500 mt-2">{items.length} PDF — attestations signées, factures, devis, conventions.</p>
        </div>
        <div className="flex gap-2">
        <Dialog open={sigOpen} onOpenChange={setSigOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="my-signature-btn">
              <PenNib size={16} className="mr-1" /> Ma signature {hasSignature ? "✓" : ""}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ma signature manuscrite</DialogTitle></DialogHeader>
            <p className="text-xs text-gray-500">
              Cette signature sera apposée automatiquement sur les documents que vous signez
              (bouton <PenNib size={11} className="inline" /> dans la liste). Le cachet et la signature
              officielle de TDL Formation restent apposés physiquement après impression.
            </p>
            {hasSignature && signatureUrl && (
              <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
                <p className="text-xs font-medium mb-1">Signature actuelle :</p>
                <img src={signatureUrl} alt="Signature enregistrée" className="h-28" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Source de la signature</label>
              <Select value={sigMode} onValueChange={setSigMode}>
                <SelectTrigger data-testid="sig-mode-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESET_SIGNATURES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                  <SelectItem value="draw">Dessiner ma propre signature</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sigMode === "draw" ? (
              <div>
                <p className="text-sm font-medium mb-1">{hasSignature ? "Remplacer par une nouvelle signature" : "Dessinez votre signature"}</p>
                <div className="border-2 border-dashed border-gray-300 rounded-md bg-white">
                  <SignatureCanvas
                    ref={sigPadRef}
                    canvasProps={{ width: 460, height: 160, className: "w-full rounded-md" }}
                    penColor="#0a0a0a"
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={() => sigPadRef.current?.clear()} className="mt-1">
                  <Eraser size={12} className="mr-1" /> Effacer
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium mb-1">Aperçu</p>
                <div className="border border-gray-200 rounded-md bg-gray-50 p-4 flex items-center justify-center">
                  <img
                    src={PRESET_SIGNATURES.find((p) => p.id === sigMode)?.src}
                    alt="Signature prédéfinie"
                    className="h-28"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-between gap-2 mt-2">
              {hasSignature ? (
                <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={removeSignature}>
                  Supprimer ma signature
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSigOpen(false)}>Fermer</Button>
                <Button onClick={saveSignature} disabled={savingSig} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                  {savingSig ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={testOpen} onOpenChange={setTestOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="new-test-btn">
              <LinkIcon size={16} className="mr-1" /> Test de positionnement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Envoyer un test de positionnement</DialogTitle></DialogHeader>
            <p className="text-xs text-gray-500">
              Génère un lien unique à envoyer au candidat : il répond en ligne, sans compte à créer.
              Le PDF récapitulatif (réponses cochées) est généré automatiquement à la soumission ; la partie évaluateur reste à compléter manuellement.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nom du candidat</label>
                <Input value={testNom} onChange={(e) => setTestNom(e.target.value)} data-testid="test-nom" />
              </div>
              <div>
                <label className="text-sm font-medium">Session (optionnel)</label>
                <Input value={testSession} onChange={(e) => setTestSession(e.target.value)} data-testid="test-session" />
              </div>
              <div>
                <label className="text-sm font-medium">Évaluateur assigné</label>
                <Select value={testEvaluateur} onValueChange={setTestEvaluateur}>
                  <SelectTrigger data-testid="test-evaluateur"><SelectValue placeholder="Choisir un évaluateur" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">La personne qui complètera la partie évaluateur (score, niveau, conclusion) sur le PDF résultat.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setTestOpen(false)}>Annuler</Button>
              <Button onClick={createTest} disabled={creatingTest} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="test-create-submit">
                {creatingTest ? "Création..." : "Créer le lien"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={genOpen} onOpenChange={setGenOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="gen-doc-btn">
              <Plus size={16} className="mr-1" /> Générer un document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="gen-dialog">
            <DialogHeader><DialogTitle>Générer un PDF depuis un modèle</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-sm font-medium">Modèle</label>
                <Select value={tplId} onValueChange={selectTemplate}>
                  <SelectTrigger data-testid="gen-template"><SelectValue placeholder="Choisir un modèle" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.nom} ({t.type_doc})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {tplId && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Champs du modèle</label>
                    <button
                      type="button"
                      onClick={() => selectTemplate(tplId)}
                      className="text-xs text-gray-500 hover:text-gray-800 underline"
                    >
                      Réinitialiser depuis le modèle
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 max-h-80 overflow-y-auto pr-1">
                    {Object.keys(ctx).map((k) => (
                      <div key={k}>
                        <label className="text-xs text-gray-500 block mb-1 font-mono">{k}</label>
                        <Input
                          value={ctx[k]}
                          onChange={(e) => setCtx((c) => ({ ...c, [k]: e.target.value }))}
                          data-testid={`gen-field-${k}`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Les infos entreprise et les dates sont pré-remplies automatiquement. Complétez les champs propres à l'élève / la formation.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setGenOpen(false)}>Annuler</Button>
              <Button variant="outline" onClick={previewTemplate} disabled={!tplId || previewing} data-testid="gen-preview">
                <Eye size={16} className="mr-1" /> {previewing ? "Aperçu..." : "Aperçu"}
              </Button>
              <Button onClick={generate} className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="gen-submit">Générer</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {tests.length > 0 && (
        <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="overline">Tests de positionnement envoyés</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left border-b border-gray-200">
                <tr>
                  <th className="py-2 px-4 overline">Candidat</th>
                  <th className="py-2 px-4 overline">Session</th>
                  <th className="py-2 px-4 overline">Évaluateur</th>
                  <th className="py-2 px-4 overline">Statut</th>
                  <th className="py-2 px-4 overline text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium">{t.stagiaire_nom}</td>
                    <td className="py-2 px-4 text-xs text-gray-500">{t.session || "—"}</td>
                    <td className="py-2 px-4 text-xs text-gray-500">{t.evaluateur || "—"}</td>
                    <td className="py-2 px-4">
                      {t.status === "submitted"
                        ? <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10 text-xs">Complété</Badge>
                        : <Badge variant="outline" className="text-xs">En attente</Badge>}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <div className="inline-flex gap-1">
                        {t.status === "pending" && (
                          <button onClick={() => copyTestLink(t.link)} className="p-1.5 hover:bg-gray-100 rounded" title="Copier le lien">
                            <Copy size={14} />
                          </button>
                        )}
                        {t.status === "submitted" && (
                          <button onClick={() => downloadTestResult(t)} className="p-1.5 hover:bg-gray-100 rounded" title="Voir le résultat">
                            <ClipboardText size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-56" data-testid="type-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "Tous les types" : t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input placeholder="Rechercher..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="search" />
        </div>
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 overline">Document</th>
                <th className="py-3 px-4 overline">Type</th>
                <th className="py-3 px-4 overline">Signé</th>
                <th className="py-3 px-4 overline">Généré par</th>
                <th className="py-3 px-4 overline">Date</th>
                <th className="py-3 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`row-${d.id}`}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <FilePdf size={16} className="text-[#d0021b]" weight="fill" />
                      <span className="font-medium">{d.nom_fichier}</span>
                    </div>
                    {d.template_nom && <p className="text-xs text-gray-500 ml-6">{d.template_nom}</p>}
                  </td>
                  <td className="py-3 px-4"><Badge variant="outline" className="text-xs">{d.type_doc}</Badge></td>
                  <td className="py-3 px-4">
                    {d.signed ? <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10 text-xs">Signé</Badge> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="py-3 px-4 text-xs">{d.generated_by_name || "—"}</td>
                  <td className="py-3 px-4 text-xs text-gray-500 font-mono">{new Date(d.generated_at).toLocaleDateString("fr-FR")}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => view(d.id)} className="p-1.5 hover:bg-gray-100 rounded" title="Voir"><FileText size={14} /></button>
                      <button onClick={() => download(d.id, d.nom_fichier)} className="p-1.5 hover:bg-gray-100 rounded" title="Télécharger" data-testid={`dl-${d.id}`}><DownloadSimple size={14} /></button>
                      {!d.signed && (
                        <button onClick={() => signDocument(d.id)} className="p-1.5 hover:bg-gray-100 rounded text-[#d4af37]" title="Signer avec ma signature enregistrée" data-testid={`sign-${d.id}`}>
                          <PenNib size={14} />
                        </button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button 
                            className="p-1.5 hover:bg-red-50 rounded text-red-500 hover:text-red-600" 
                            title="Supprimer"
                            data-testid={`delete-${d.id}`}
                          >
                            <Trash size={14} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <Warning size={20} className="text-red-500" weight="fill" />
                              Supprimer le document
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Êtes-vous sûr de vouloir supprimer le document <span className="font-semibold">{d.nom_fichier}</span> ?<br/>
                              <span className="text-xs text-red-500">Cette action est irréversible.</span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => deleteDocument(d.id)}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan="6" className="py-12 text-center text-gray-400">Aucun document.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}