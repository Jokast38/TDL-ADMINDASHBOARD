import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MagnifyingGlass, DownloadSimple, FileText } from "@phosphor-icons/react";
import { formatDateFR } from "@/lib/dateFormat";
import { toast } from "sonner";
import { downloadPdf } from "@/components/caces/CacesExamPanel";

// Attestation individuelle de formation CACES® R.489 (demande du 2026-11-16) —
// backend routers/caces_attestations.py : on cherche l'apprenant, le formulaire
// est pré-rempli et tout reste modifiable ; rien n'est généré tant qu'un champ
// obligatoire manque.

const CATEGORIES = [
  ["1A", "Transpalettes / préparateurs de commandes (levée jusqu'à 1,20 m)"],
  ["1B", "Gerbeurs (levée de plus de 1,20 m)"],
  ["2A", "Chariots à plateau porteur (jusqu'à 2 t)"],
  ["2B", "Chariots tracteurs (jusqu'à 25 t)"],
  ["3", "Chariots élévateurs en porte-à-faux (jusqu'à 6 t)"],
  ["4", "Chariots élévateurs en porte-à-faux (plus de 6 t)"],
  ["5", "Chariots à mât rétractable"],
  ["6", "Chariots à poste de conduite élevable"],
  ["7", "Conduite hors production"],
];
const RESULTATS = [
  ["atteints", "Objectifs atteints"],
  ["partiellement_atteints", "Objectifs partiellement atteints"],
  ["non_atteints", "Objectifs non atteints"],
];
const REQUIRED = [
  ["civilite", "civilité"], ["nom", "nom"], ["prenom", "prénom"], ["lieu", "lieu de la formation"],
  ["date_debut", "date de début"], ["date_fin", "date de fin"], ["duree_heures", "durée"],
  ["formateur_nom", "formateur"], ["resultat", "résultat de l'évaluation"], ["signataire_nom", "signataire"],
  ["signataire_qualite", "qualité du signataire"], ["lieu_signature", "lieu de signature"], ["date_emission", "date de l'attestation"],
];

const errorDetail = (e, fallback) => {
  const d = e.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};
const fileName = (name) => `attestation_formation_caces_${(name || "apprenant").replace(/[^A-Za-z0-9_-]+/g, "_")}.pdf`;

function Field({ label, missing, children, className = "" }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className={`text-xs font-medium ${missing ? "text-red-600" : "text-gray-600"}`}>{label}{missing ? " — à remplir" : ""}</span>
      {children}
    </label>
  );
}

export default function AttestationsFormationTab({ candidats }) {
  const [q, setQ] = useState("");
  const [history, setHistory] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [editing, setEditing] = useState(null); // { dossier, form }
  const [saving, setSaving] = useState(false);

  const loadHistory = () => api.get("/caces/attestations-formation").then((r) => setHistory(r.data)).catch(() => toast.error("Attestations non chargées"));
  useEffect(() => {
    loadHistory();
    api.get("/caces/attestations-formation/formateurs").then((r) => setFormateurs(r.data)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return candidats.filter((d) => `${d.student_name || ""} ${d.student_email || ""}`.toLowerCase().includes(s)).slice(0, 10);
  }, [q, candidats]);

  const open = async (dossier) => {
    try {
      const { data } = await api.get(`/caces/attestations-formation/prefill/${dossier.id}`);
      setEditing({ dossier, form: data });
    } catch (e) {
      toast.error(errorDetail(e, "Dossier non chargé"));
    }
  };

  const form = editing?.form;
  const set = (patch) => setEditing((ed) => ({ ...ed, form: { ...ed.form, ...patch } }));
  const missing = form ? REQUIRED.filter(([k]) => !String(form[k] ?? "").trim()).map(([k]) => k) : [];
  const noCategory = form && !(form.categories || []).length;
  const toggleCat = (c) => set({ categories: form.categories.includes(c) ? form.categories.filter((x) => x !== c) : [...form.categories, c] });

  const generate = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/caces/attestations-formation", { ...form, duree_heures: Number(form.duree_heures) });
      await downloadPdf(`/caces/attestations-formation/${data.id}/download`, fileName(data.student_name));
      toast.success("Attestation générée");
      setEditing(null);
      loadHistory();
    } catch (e) {
      toast.error(errorDetail(e, "Attestation non générée"));
    } finally {
      setSaving(false);
    }
  };

  const miss = (k) => missing.includes(k);
  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-none space-y-3">
        <p className="text-sm text-gray-600">
          Attestation individuelle de formation CACES® R.489, signée et cachetée au nom du centre. Recherchez l'apprenant :
          les informations connues sont pré-remplies, vérifiez-les et complétez le reste.
        </p>
        <div className="relative w-full sm:w-96">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input placeholder="Nom ou email de l'apprenant…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="caces-attestation-search" />
        </div>
        {q.trim() && results.length === 0 && <p className="text-sm text-gray-500">Aucun dossier CACES ne correspond.</p>}
        {results.length > 0 && (
          <div className="divide-y border rounded-md">
            {results.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{d.student_name}</p>
                  <p className="text-xs text-gray-500">{d.formation_title}{d.student_email ? ` · ${d.student_email}` : ""}</p>
                </div>
                <Button size="sm" onClick={() => open(d)} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                  <FileText size={14} className="mr-1" /> Préparer l'attestation
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-2">
        <p className="font-display font-bold">Attestations générées ({history.length})</p>
        {history.length === 0 && <p className="text-sm text-gray-500">Aucune attestation pour l'instant.</p>}
        {history.map((a) => (
          <Card key={a.id} className="p-3 border border-gray-200 shadow-none flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-sm">{a.student_name}</p>
                {(a.categories || []).map((c) => <Badge key={c} variant="outline">Cat. {c}</Badge>)}
              </div>
              <p className="text-xs text-gray-500">
                Formateur : {a.formateur_nom} · datée du {formatDateFR(a.date_emission)} · générée le {formatDateFR(a.created_at)}{a.generated_by ? ` par ${a.generated_by}` : ""}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => downloadPdf(`/caces/attestations-formation/${a.id}/download`, fileName(a.student_name))}>
              <DownloadSimple size={14} className="mr-1" /> Télécharger
            </Button>
          </Card>
        ))}
      </div>

      {form && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Attestation de formation — {editing.dossier.student_name}</DialogTitle>
            </DialogHeader>
            {form.deja_generee && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                Une attestation a déjà été générée le {formatDateFR(form.deja_generee)} : sa saisie est reprise ci-dessous.
              </p>
            )}
            <div className="space-y-4">
              <section className="space-y-2">
                <p className="text-sm font-semibold">Apprenant</p>
                <div className="grid sm:grid-cols-4 gap-3">
                  <Field label="Civilité" missing={miss("civilite")}>
                    <Select value={form.civilite || undefined} onValueChange={(v) => set({ civilite: v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent><SelectItem value="M.">M.</SelectItem><SelectItem value="Mme">Mme</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <Field label="Nom" missing={miss("nom")}><Input value={form.nom} onChange={(e) => set({ nom: e.target.value })} /></Field>
                  <Field label="Prénom" missing={miss("prenom")}><Input value={form.prenom} onChange={(e) => set({ prenom: e.target.value })} /></Field>
                  <Field label="Date de naissance (facultatif)"><Input type="date" value={form.date_naissance || ""} onChange={(e) => set({ date_naissance: e.target.value })} /></Field>
                </div>
              </section>

              <section className="space-y-2">
                <p className={`text-sm font-semibold ${noCategory ? "text-red-600" : ""}`}>Catégorie(s) R.489 suivie(s){noCategory ? " — à cocher" : ""}</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {CATEGORIES.map(([c, label]) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.categories.includes(c)} onCheckedChange={() => toggleCat(c)} />
                      <span><b>{c}</b> — {label}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-sm font-semibold">Formation</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Du" missing={miss("date_debut")}><Input type="date" value={form.date_debut} onChange={(e) => set({ date_debut: e.target.value })} /></Field>
                  <Field label="Au" missing={miss("date_fin")}><Input type="date" value={form.date_fin} onChange={(e) => set({ date_fin: e.target.value })} /></Field>
                  <Field label="Durée (heures)" missing={miss("duree_heures")}>
                    <Input type="number" min="1" step="0.5" value={form.duree_heures} onChange={(e) => set({ duree_heures: e.target.value })} />
                  </Field>
                  <Field label="Lieu de la formation" missing={miss("lieu")} className="sm:col-span-2">
                    <Input value={form.lieu} onChange={(e) => set({ lieu: e.target.value })} />
                  </Field>
                  <Field label="Formateur" missing={miss("formateur_nom")}>
                    <Input list="caces-formateurs" value={form.formateur_nom} onChange={(e) => set({ formateur_nom: e.target.value })} placeholder="Nom du formateur" />
                    <datalist id="caces-formateurs">{formateurs.map((f) => <option key={f} value={f} />)}</datalist>
                  </Field>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-sm font-semibold">Résultats de l'évaluation des acquis</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Résultat" missing={miss("resultat")}>
                    <Select value={form.resultat || undefined} onValueChange={(v) => set({ resultat: v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>{RESULTATS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Précision (facultatif)" className="sm:col-span-2">
                    <Input value={form.resultat_detail || ""} onChange={(e) => set({ resultat_detail: e.target.value })} placeholder="ex. tests CACES® réussis" maxLength={300} />
                  </Field>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-sm font-semibold">Signature</p>
                <div className="grid sm:grid-cols-4 gap-3">
                  <Field label="Signataire" missing={miss("signataire_nom")}><Input value={form.signataire_nom} onChange={(e) => set({ signataire_nom: e.target.value })} /></Field>
                  <Field label="Qualité" missing={miss("signataire_qualite")}><Input value={form.signataire_qualite} onChange={(e) => set({ signataire_qualite: e.target.value })} /></Field>
                  <Field label="Fait à" missing={miss("lieu_signature")}><Input value={form.lieu_signature} onChange={(e) => set({ lieu_signature: e.target.value })} /></Field>
                  <Field label="Le" missing={miss("date_emission")}><Input type="date" value={form.date_emission} onChange={(e) => set({ date_emission: e.target.value })} /></Field>
                </div>
                <p className="text-xs text-gray-500">La signature et le cachet du centre (Paramètres → Attestations) sont apposés automatiquement.</p>
              </section>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {(missing.length > 0 || noCategory) && (
                <p className="text-xs text-red-600 mr-auto">
                  À compléter : {[...REQUIRED.filter(([k]) => missing.includes(k)).map(([, l]) => l), ...(noCategory ? ["catégorie"] : [])].join(", ")}
                </p>
              )}
              <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
              <Button disabled={saving || missing.length > 0 || noCategory} onClick={generate} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="caces-attestation-generate">
                <DownloadSimple size={14} className="mr-1" /> {saving ? "Génération…" : "Générer et télécharger"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
