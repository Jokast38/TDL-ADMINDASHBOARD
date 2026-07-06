import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  PencilSimple,
  Trash,
  FileText,
  Eye,
  Tag,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const TYPES = ["attestation", "facture", "devis", "convention", "autre"];

const TYPE_COLORS = {
  attestation: "bg-blue-50 text-blue-700 border-blue-200",
  facture: "bg-amber-50 text-amber-700 border-amber-200",
  devis: "bg-purple-50 text-purple-700 border-purple-200",
  convention: "bg-teal-50 text-teal-700 border-teal-200",
  autre: "bg-gray-50 text-gray-600 border-gray-200",
};

const empty = {
  nom: "",
  type_doc: "attestation",
  description: "",
  contenu_html: "",
  variables: [],
  actif: true,
};

// ── Variable pill input ──────────────────────────────────────────────────────
function VarInput({ vars, onAdd, onRemove, onInsert }) {
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/gi, "");
    if (val && !vars.includes(val)) onAdd(val);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="nom_variable (Entrée pour ajouter)"
          className="font-mono text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          className="shrink-0"
        >
          <Plus size={14} />
        </Button>
      </div>
      {vars.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vars.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-mono border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors"
              title="Cliquer pour insérer dans le HTML"
              onClick={() => onInsert(v)}
            >
              {"{{ "}
              {v}
              {" }}"}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(v);
                }}
                className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {vars.length > 0 && (
        <p className="text-[11px] text-gray-400">
          Cliquez sur une variable pour l'insérer au curseur dans le HTML.
        </p>
      )}
    </div>
  );
}

// ── Live HTML preview ────────────────────────────────────────────────────────
function HtmlPreview({ html }) {
  if (!html?.trim()) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm italic">
        Rédigez du HTML ci-dessus pour voir l'aperçu
      </div>
    );
  }

  // Highlight {{ variables }} in preview
  const highlighted = html.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    '<mark style="background:#fef3c7;color:#92400e;border-radius:3px;padding:0 3px;font-family:monospace;font-size:11px;">{{ $1 }}</mark>'
  );

  return (
    <div
      className="prose prose-sm max-w-none p-4 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_p]:my-2 [&_b]:font-semibold [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

// ── Template card ────────────────────────────────────────────────────────────
function TemplateCard({ t, onEdit, onRemove }) {
  return (
    <Card
      className="p-5 border border-gray-200 rounded-xl shadow-none flex flex-col gap-3 hover:border-gray-300 transition-colors"
      data-testid={`tpl-${t.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
          <FileText size={18} weight="duotone" className="text-amber-600" />
        </div>
        <div className="flex items-center gap-1.5">
          {t.actif ? (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle size={10} weight="fill" /> Actif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              <XCircle size={10} weight="fill" /> Inactif
            </span>
          )}
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border font-medium capitalize ${
              TYPE_COLORS[t.type_doc] ?? TYPE_COLORS.autre
            }`}
          >
            {t.type_doc}
          </span>
        </div>
      </div>

      {/* Content */}
      <div>
        <h3 className="font-semibold text-sm leading-tight">{t.nom}</h3>
        {t.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {t.description}
          </p>
        )}
      </div>

      {/* Variables */}
      {t.variables?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {t.variables.slice(0, 3).map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 font-mono"
            >
              <Tag size={8} />
              {v}
            </span>
          ))}
          {t.variables.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
              +{t.variables.length - 3}
            </span>
          )}
        </div>
      )}

      {/* HTML snippet */}
      {t.contenu_html && (
        <div className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2 font-mono text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
          {t.contenu_html.slice(0, 120)}
          {t.contenu_html.length > 120 ? "…" : ""}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1.5 pt-2 border-t border-gray-100 mt-auto">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 px-2.5"
          onClick={() => onEdit(t)}
        >
          <PencilSimple size={12} className="mr-1" /> Modifier
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 px-2.5 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={() => onRemove(t.id)}
        >
          <Trash size={12} />
        </Button>
      </div>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DocTemplates() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [htmlRef, setHtmlRef] = useState(null);

  const load = () => api.get("/doc-templates").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const handleDialogChange = (v) => {
    setOpen(v);
    if (!v) { setForm(empty); setEditId(null); }
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addVar = (v) => setField("variables", [...(form.variables ?? []), v]);
  const removeVar = (v) => setField("variables", form.variables.filter((x) => x !== v));

  const insertVar = useCallback(
    (v) => {
      if (!htmlRef) return;
      const ta = htmlRef;
      const pos = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, pos);
      const after = ta.value.slice(pos);
      const next = `${before}{{ ${v} }}${after}`;
      setField("contenu_html", next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(pos + v.length + 7, pos + v.length + 7);
      });
    },
    [htmlRef]
  );

  const save = async () => {
    if (!form.nom.trim()) { toast.error("Le nom est requis"); return; }
    if (!form.contenu_html.trim()) { toast.error("Le contenu HTML est requis"); return; }
    try {
      if (editId) await api.put(`/doc-templates/${editId}`, form);
      else await api.post("/doc-templates", form);
      toast.success(editId ? "Modèle mis à jour" : "Modèle créé");
      setOpen(false);
      setForm(empty);
      setEditId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la sauvegarde");
    }
  };

  const edit = (t) => {
    setForm({ ...t, variables: [...(t.variables ?? [])] });
    setEditId(t.id);
    setOpen(true);
  };

  const remove = async (id) => {
    if (!window.confirm("Désactiver ce modèle ?")) return;
    await api.delete(`/doc-templates/${id}`);
    toast.success("Modèle désactivé");
    load();
  };

  return (
    <div className="space-y-6" data-testid="doc-templates-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">
            Modèles de documents
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">
            Templates PDF
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Créez des modèles HTML réutilisables pour attestations, factures,
            devis et conventions.
          </p>
        </div>

        <Dialog open={open} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button
              className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
              data-testid="new-tpl-btn"
            >
              <Plus size={16} className="mr-1.5" /> Nouveau modèle
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
            <DialogHeader className="px-6 py-4 border-b border-gray-100">
              <DialogTitle className="text-lg font-semibold">
                {editId ? "Modifier le modèle" : "Nouveau modèle"}
              </DialogTitle>
            </DialogHeader>

            <div className="p-6 space-y-5">
              {/* Row 1: nom + type + actif */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-sm font-medium">Nom *</label>
                  <Input
                    value={form.nom}
                    onChange={(e) => setField("nom", e.target.value)}
                    placeholder="Ex: Attestation de présence"
                    data-testid="tpl-nom"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={form.type_doc}
                    onValueChange={(v) => setField("type_doc", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t} className="capitalize">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: description + actif */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    placeholder="Décrivez l'usage de ce modèle..."
                  />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <Switch
                    checked={form.actif}
                    onCheckedChange={(v) => setField("actif", v)}
                    id="actif-switch"
                  />
                  <label htmlFor="actif-switch" className="text-sm cursor-pointer">
                    {form.actif ? (
                      <span className="text-emerald-700 font-medium">Actif</span>
                    ) : (
                      <span className="text-gray-400">Inactif</span>
                    )}
                  </label>
                </div>
              </div>

              {/* Variables */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Variables dynamiques</label>
                <VarInput
                  vars={form.variables ?? []}
                  onAdd={addVar}
                  onRemove={removeVar}
                  onInsert={insertVar}
                />
              </div>

              {/* HTML + Preview tabs */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contenu HTML *</label>
                <Tabs defaultValue="edit" className="w-full">
                  <TabsList className="mb-2 h-8">
                    <TabsTrigger value="edit" className="text-xs h-6 px-3">
                      Éditeur
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="text-xs h-6 px-3">
                      <span className="inline-flex items-center gap-1">
                        <Eye size={12} weight="regular" />
                        Aperçu
                      </span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="edit" className="mt-0">
                    <Textarea
                      ref={(el) => setHtmlRef(el)}
                      rows={14}
                      value={form.contenu_html}
                      onChange={(e) => setField("contenu_html", e.target.value)}
                      className="font-mono text-xs leading-relaxed resize-y"
                      placeholder={"<h1>{{ stagiaire_nom }}</h1>\n<p>Formation : <b>{{ formation_titre }}</b></p>\n<p>Du {{ date_debut }} au {{ date_fin }}</p>"}
                      data-testid="tpl-html"
                    />
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      Utilisez{" "}
                      <code className="font-mono bg-gray-100 px-1 rounded text-gray-600">
                        {"{{ variable }}"}
                      </code>{" "}
                      pour les variables. Balises supportées : h1–h3, p, b, ul, li, table, tr, td.
                    </p>
                  </TabsContent>

                  <TabsContent value="preview" className="mt-0">
                    <div className="border border-gray-200 rounded-lg min-h-[280px] bg-white">
                      {/* Simulated A4 header */}
                      <div className="border-b border-gray-100 px-4 py-2 flex items-center justify-between bg-gray-50 rounded-t-lg">
                        <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
                          <Eye size={12} weight="regular" />
                          Aperçu du rendu — les variables sont surlignées
                        </span>
                        <span className="text-[11px] text-gray-400 capitalize">
                          {form.type_doc}
                        </span>
                      </div>
                      <HtmlPreview html={form.contenu_html} />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={save}
                className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
                data-testid="tpl-save"
              >
                {editId ? "Enregistrer les modifications" : "Créer le modèle"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cards grid */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <FileText size={48} weight="thin" />
          <p className="text-sm">Aucun modèle pour l'instant. Créez-en un !</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t) => (
            <TemplateCard key={t.id} t={t} onEdit={edit} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  );
}
