import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, MagnifyingGlass } from "@phosphor-icons/react";

// Vérification publique d'un CACES® (demande du 2026-11-04) :
// - /verif-caces/:certificateId — ouverte par le QR code de la carte ;
// - /verif-caces — par le numéro CACES® imprimé sur la carte + le nom du
//   titulaire (le nom est exigé pour qu'on ne puisse pas parcourir les
//   numéros, voir backend/core/caces_verif.py).

const formatDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");

function Resultat({ data }) {
  return (
    <div className={`rounded-md border p-5 ${data.valide ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`} data-testid="verif-caces-result">
      <div className="flex items-center gap-2 mb-3">
        {data.valide ? <CheckCircle size={28} weight="fill" className="text-green-600" /> : <XCircle size={28} weight="fill" className="text-red-600" />}
        <p className="font-display text-xl font-bold">{data.valide ? "CACES® authentique et valide" : "CACES® authentique mais expiré"}</p>
      </div>
      <p className="text-sm"><span className="text-gray-500">Titulaire :</span> <b>{data.student_name}</b></p>
      <p className="text-sm"><span className="text-gray-500">Organisme testeur :</span> {data.otc}</p>
      <p className="text-sm"><span className="text-gray-500">Valable jusqu'au :</span> {formatDate(data.expiration_date)}</p>
      <table className="w-full text-sm mt-4">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-1.5 pr-2 font-normal">Catégorie</th>
            <th className="py-1.5 pr-2 font-normal">Numéro</th>
            <th className="py-1.5 font-normal">Obtenu le</th>
          </tr>
        </thead>
        <tbody>
          {data.categories.map((c) => (
            <tr key={c.category} className={`border-b border-gray-100 ${c.numero_caces === data.numero_verifie ? "font-semibold" : ""}`}>
              <td className="py-1.5 pr-2">{c.category}</td>
              <td className="py-1.5 pr-2 font-mono break-all">{c.numero_caces}</td>
              <td className="py-1.5">{formatDate(c.date_obtention)}{c.origine !== "TDL Formation" ? ` (${c.origine})` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VerifCaces() {
  const { certificateId } = useParams();
  const [numero, setNumero] = useState("");
  const [nom, setNom] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!certificateId) return;
    setLoading(true);
    api.get(`/caces/public/${certificateId}`)
      .then((r) => setResult(r.data))
      .catch(() => setError("Ce CACES® n'est pas enregistré chez TDL Formation. Le document présenté n'est pas authentique."))
      .finally(() => setLoading(false));
  }, [certificateId]);

  const verify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const { data } = await api.get("/caces/public/verify", { params: { numero, nom } });
      setResult(data);
    } catch (err) {
      setError(err.response?.status === 404
        ? "Aucun CACES® délivré par TDL Formation ne correspond à ce numéro et ce nom. Vérifiez la saisie : sinon, le document n'est pas authentique."
        : "Vérification impossible pour le moment, réessayez plus tard.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <img src="/tdl.png" alt="TDL Formation" className="h-14 mx-auto" />
          <h1 className="font-display text-3xl font-bold tracking-tight">Vérifier un CACES®</h1>
          <p className="text-gray-500 text-sm">
            Contrôlez l'authenticité d'une carte CACES® R.489 délivrée par TDL Formation, organisme testeur certifié.
          </p>
        </div>

        {!certificateId && (
          <form onSubmit={verify} className="space-y-3 border border-gray-200 rounded-md p-5" data-testid="verif-caces-form">
            <div>
              <label className="text-sm font-medium" htmlFor="verif-numero">Numéro CACES®</label>
              <Input id="verif-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex : C1B.000000000012" className="mt-1 font-mono" required />
              <p className="text-xs text-gray-500 mt-1">Le numéro figure sur le recto de la carte, à côté de chaque catégorie.</p>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="verif-nom">Nom du titulaire</label>
              <Input id="verif-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de famille" className="mt-1" required />
            </div>
            <Button type="submit" disabled={loading || !numero.trim() || !nom.trim()} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              <MagnifyingGlass size={16} className="mr-1" /> Vérifier
            </Button>
          </form>
        )}

        {loading && certificateId && <p className="text-center text-gray-500 text-sm">Vérification en cours…</p>}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-5 flex gap-2" data-testid="verif-caces-error">
            <XCircle size={24} weight="fill" className="text-red-600 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        {result && <Resultat data={result} />}

        {certificateId && (
          <p className="text-center text-sm"><Link to="/verif-caces" className="underline">Vérifier un autre CACES® par son numéro</Link></p>
        )}
        <p className="text-center text-xs text-gray-400">
          Cette vérification porte sur les CACES® délivrés par TDL Formation. La marque CACES® est protégée par un dépôt à l'INPI sous le numéro 03.3237295.
        </p>
      </div>
    </div>
  );
}
