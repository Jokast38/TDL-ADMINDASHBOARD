import { useEffect, useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FilePdf, DownloadSimple, MagnifyingGlass, Plus, FileText, Trash, Warning, PenNib, Eraser } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import SignatureCanvas from "react-signature-canvas";

const TYPES = ["all", "attestation_presence", "attestation", "facture", "devis", "convention", "autre"];

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
  const [ctxJson, setCtxJson] = useState('{\n  "_info": "Sélectionnez un modèle ci-dessus : le contexte se pré-remplit automatiquement."\n}');
  const [deletingId, setDeletingId] = useState(null);

  const [sigOpen, setSigOpen] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [savingSig, setSavingSig] = useState(false);
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

  useEffect(() => { load(); }, [type]);
  useEffect(() => { api.get("/doc-templates").then((r) => setTemplates(r.data)); }, []);
  useEffect(() => { checkSignature(); }, []);

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
    if (tpl) {
      setCtxJson(JSON.stringify(buildDefaultContext(tpl), null, 2));
    }
  };

  const generate = async () => {
    if (!tplId) return toast.error("Choisissez un modèle");
    let context = {};
    try { context = JSON.parse(ctxJson); } catch { return toast.error("JSON invalide dans contexte"); }
    try {
      await api.post("/documents-generated", { template_id: tplId, context });
      toast.success("Document PDF généré");
      setGenOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur génération");
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
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) return toast.error("Dessinez votre signature d'abord");
    setSavingSig(true);
    try {
      const dataUrl = sigPadRef.current.getCanvas().toDataURL("image/png");
      const blob = dataUrlToBlob(dataUrl);
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
                <img src={signatureUrl} alt="Signature enregistrée" className="h-16" />
              </div>
            )}
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
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Contexte (JSON)</label>
                  {tplId && (
                    <button
                      type="button"
                      onClick={() => selectTemplate(tplId)}
                      className="text-xs text-gray-500 hover:text-gray-800 underline"
                    >
                      Réinitialiser depuis le modèle
                    </button>
                  )}
                </div>
                <Textarea rows={10} value={ctxJson} onChange={(e) => setCtxJson(e.target.value)} className="font-mono text-xs" data-testid="gen-context" />
                <p className="text-xs text-gray-500 mt-1">
                  Les infos entreprise et les dates sont pré-remplies automatiquement. Complétez les champs propres à l'élève / la formation
                  (clés vides <code className="font-mono bg-gray-100 px-1">""</code>), en respectant les variables <code className="font-mono bg-gray-100 px-1">{`{{ variable }}`}</code> du modèle.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setGenOpen(false)}>Annuler</Button>
              <Button onClick={generate} className="bg-[#d4af37] text-black hover:bg-[#b8941f]" data-testid="gen-submit">Générer</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

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