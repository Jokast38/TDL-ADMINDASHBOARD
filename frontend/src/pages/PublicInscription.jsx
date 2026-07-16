import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import { toast } from "sonner";

// Validation basique : téléphone français (avec ou sans +33, espaces/points/
// tirets tolérés) et email — pour éviter les dossiers avec un numéro
// incomplet (chiffre oublié) ou un email mal formé, impossibles à recontacter.
const PHONE_RE = /^(0[1-9]\d{8}|\+33[1-9]\d{8})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidPhone = (v) => PHONE_RE.test((v || "").replace(/[\s.\-]/g, ""));

export default function PublicInscription() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [formations, setFormations] = useState([]);
  const [step, setStep] = useState(1);
  const [formationId, setFormationId] = useState(params.get("formation") || "");
  const [form, setForm] = useState({ student_name: "", student_email: "", student_phone: "", notes: "" });
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    api.get("/formations", { params: { active_only: true } }).then((r) => {
      setFormations(r.data);
      if (formationId && r.data.find((f) => f.id === formationId)) setStep(2);
    });
  }, []);

  const submit = async () => {
    if (!EMAIL_RE.test(form.student_email.trim())) {
      return toast.error("Merci de vérifier le format de votre email");
    }
    if (form.student_phone.trim() && !isValidPhone(form.student_phone)) {
      return toast.error("Merci de vérifier votre numéro de téléphone (10 chiffres, ex : 06 12 34 56 78)");
    }
    try {
      const { data } = await api.post("/inscriptions", { formation_id: formationId, ...form });
      setSuccess(data);
      setStep(3);
      toast.success("Inscription enregistrée");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const selected = formations.find((f) => f.id === formationId);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="public-inscription">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold">TDL Formation</span>
          </Link>
          <Link to="/" className="text-sm text-gray-500 hover:text-[#0a0a0a] flex items-center gap-1">
            <ArrowLeft size={14} /> Retour
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                s <= step ? "bg-[#0a0a0a] text-white" : "bg-gray-200 text-gray-500"
              }`}>{s}</div>
              {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? "bg-[#0a0a0a]" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div data-testid="step-1">
            <p className="overline">Étape 1 / 3</p>
            <h1 className="font-display text-4xl font-bold tracking-tight mt-1 mb-6">Choisir une formation</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formations.map((f) => (
                <Card
                  key={f.id}
                  onClick={() => { setFormationId(f.id); setStep(2); }}
                  className={`p-5 border rounded-md cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg ${
                    formationId === f.id ? "border-[#0a0a0a] ring-2 ring-[#0a0a0a]/20" : "border-gray-200"
                  }`}
                  data-testid={`pick-${f.id}`}
                >
                  <Badge variant="outline" className="text-xs mb-2">{f.category}</Badge>
                  <h3 className="font-display font-bold leading-tight">{f.title}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{f.description}</p>
                  <p className="font-display font-bold text-2xl mt-3">{f.price}€</p>
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === 2 && selected && (
          <div data-testid="step-2">
            <p className="overline">Étape 2 / 3</p>
            <h1 className="font-display text-4xl font-bold tracking-tight mt-1 mb-2">Vos informations</h1>
            <p className="text-gray-500 mb-6">Formation choisie : <strong>{selected.title}</strong> — {selected.price}€</p>
            <Card className="p-6 border border-gray-200 rounded-md shadow-none">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Nom complet *</label>
                  <Input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} data-testid="inscr-name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email *</label>
                  <Input type="email" value={form.student_email} onChange={(e) => setForm({ ...form, student_email: e.target.value })} data-testid="inscr-email" />
                </div>
                <div>
                  <label className="text-sm font-medium">Téléphone</label>
                  <Input value={form.student_phone} onChange={(e) => setForm({ ...form, student_phone: e.target.value })} data-testid="inscr-phone" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Notes / questions</label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} data-testid="inscr-notes" />
                </div>
              </div>
              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={() => setStep(1)}>← Modifier la formation</Button>
                <Button
                  onClick={submit}
                  disabled={!form.student_name || !form.student_email}
                  className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
                  data-testid="inscr-submit"
                >
                  Valider mon inscription <ArrowRight size={16} className="ml-2" />
                </Button>
              </div>
            </Card>
          </div>
        )}

        {step === 3 && success && (
          <div data-testid="step-3" className="text-center py-12">
            <CheckCircle size={64} className="mx-auto text-[#0B7238] mb-4" weight="fill" />
            <h1 className="font-display text-4xl font-bold tracking-tight">Inscription confirmée !</h1>
            <p className="text-gray-500 mt-3 max-w-md mx-auto">
              Votre dossier <span className="font-mono">{success.dossier?.id?.slice(0, 8)}</span> a été créé.
              Vous allez recevoir un email avec les étapes suivantes.
            </p>
            <div className="flex justify-center gap-3 mt-8">
              <Link to="/"><Button variant="outline">Retour à l'accueil</Button></Link>
              <Link to="/login"><Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Accéder à mon espace</Button></Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
