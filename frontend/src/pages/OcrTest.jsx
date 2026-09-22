import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle, WarningCircle, Spinner } from "@phosphor-icons/react";

// Page de TEST, pas une fonctionnalité livrée aux apprenants/animateurs —
// réservée aux admins (voir App.js) pour comparer, sur de vraies pièces
// (permis, CNI, justificatif), deux moteurs d'extraction :
//   - Tesseract (local, gratuit) : texte brut + extraction par motifs
//   - le modèle Ollama hébergé (multimodal) : JSON directement
// Le but est de décider si l'un des deux (ou une combinaison) est assez
// fiable pour préremplir l'attestation (aujourd'hui saisie à la main dans
// StageAttestation) et, plus tard, servir de contrôle "pièce lisible ?" au
// dépôt d'un document. Rien ici n'écrit en base : c'est un aller-retour
// fichier -> résultat affiché à l'écran.
export default function OcrTest() {
  const [docTypes, setDocTypes] = useState([]);
  const [docType, setDocType] = useState("permis");
  const [ollamaModel, setOllamaModel] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [tesseractAvailable, setTesseractAvailable] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/ocr-test/doc-types").then(({ data }) => {
      setDocTypes(data.doc_types);
      setTesseractAvailable(data.tesseract_available);
      setDefaultModel(data.default_ollama_model);
    }).catch(() => setError("Impossible de charger la configuration OCR."));
  }, []);

  const onFile = (f) => {
    setFile(f);
    setResult(null);
    setError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("doc_type", docType);
      if (ollamaModel) form.append("ollama_model", ollamaModel);
      const { data } = await api.post("/ocr-test/run", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Échec du test OCR.");
    } finally {
      setLoading(false);
    }
  };

  const schema = docTypes.find((d) => d.value === docType);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-md px-4 py-3">
        <strong>Page de test — pas une fonctionnalité livrée.</strong> Sert à comparer les moteurs
        OCR avant de décider comment préremplir l'attestation. Rien n'est enregistré en base.
      </div>

      <div>
        <h1 className="text-xl font-bold">Test OCR — comparatif Tesseract / Ollama</h1>
        <p className="text-sm text-gray-500 mt-1">
          Déposez une pièce (image ou PDF) pour comparer les deux moteurs d'extraction.
        </p>
      </div>

      {!tesseractAvailable && (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded-md px-4 py-3">
          Tesseract n'est pas disponible côté serveur : seul le résultat Ollama s'affichera.
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Type de document</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            {docTypes.map((d) => (
              <option key={d.value} value={d.value}>{d.value}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Modèle Ollama (optionnel)</label>
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder={defaultModel || "défaut serveur"}
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Fichier (image ou PDF)</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="w-full text-sm"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {schema && (
        <p className="text-xs text-gray-400">
          Champs attendus pour « {docType} » : {schema.fields.map((f) => f.key).join(", ")}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={!file || loading}>
          {loading ? <><Spinner className="animate-spin mr-2" size={16} /> Analyse en cours…</> : "Lancer le test"}
        </Button>
        {preview && <img src={preview} alt="Aperçu du fichier déposé" className="h-16 rounded border object-cover" />}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid md:grid-cols-2 gap-6">
          <EngineResult
            title="Tesseract (local)"
            duration={result.tesseract.duration_ms}
            error={result.tesseract.error}
            fields={result.tesseract.fields}
            validation={result.tesseract.validation}
            raw={result.tesseract.text}
            rawLabel="Texte brut extrait"
          />
          <EngineResult
            title={`Ollama (${ollamaModel || defaultModel})`}
            duration={result.ollama.duration_ms}
            error={result.ollama.error}
            fields={result.ollama.fields}
            validation={result.ollama.validation}
            raw={result.ollama.raw}
            rawLabel="Réponse brute du modèle"
          />
        </div>
      )}
    </div>
  );
}

function EngineResult({ title, duration, error, fields, validation, raw, rawLabel }) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-gray-400">{duration} ms</span>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-start gap-1">
          <WarningCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {validation && Object.keys(validation).length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(validation).map(([field, v]) => (
              <tr key={field} className="border-t">
                <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{field}</td>
                <td className="py-1.5 pr-2 font-mono">{v.value || <span className="text-gray-300">—</span>}</td>
                <td className="py-1.5 w-6">
                  {v.valid
                    ? <CheckCircle size={16} weight="fill" className="text-green-600" />
                    : <WarningCircle size={16} weight="fill" className="text-amber-500" title={v.reason} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {raw && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400">{rawLabel}</summary>
          <pre className="mt-2 whitespace-pre-wrap bg-gray-50 rounded p-2 max-h-64 overflow-auto">{raw}</pre>
        </details>
      )}
    </div>
  );
}
