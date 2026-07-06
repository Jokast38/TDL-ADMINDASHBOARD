import { useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChartLineUp, MagnifyingGlass, Megaphone, EnvelopeSimple, ShareNetwork, Sparkle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Marketing() {
  const [prompt, setPrompt] = useState("Plan marketing complet pour booster les inscriptions CACES et auto-école sur Paris");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState("");

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/ai/chat", { message: prompt, context: "marketing" });
      setPlan(data.response);
      toast.success("Plan généré");
    } catch (e) {
      toast.error("Erreur génération");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="marketing-page">
      <div>
        <p className="overline">Acquisition & visibilité</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Marketing</h1>
        <p className="text-gray-500 mt-2">SEO, campagnes publicitaires et automatisation marketing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Channel icon={MagnifyingGlass} title="SEO local" desc="Mots-clés CACES, permis, SSIAP" status="À optimiser" color="#F5A623" />
        <Channel icon={Megaphone} title="Google Ads" desc="Campagnes search par catégorie" status="Inactif" color="#868e96" />
        <Channel icon={EnvelopeSimple} title="Email nurturing" desc="Séquences post-inscription" status="Mocké" color="#0052CC" />
        <Channel icon={ShareNetwork} title="Réseaux sociaux" desc="KAMI STREET Instagram" status="À planifier" color="#d4af37" />
      </div>

      <Card className="p-6 border border-gray-200 rounded-md shadow-none">
        <div className="flex items-center gap-2 mb-2">
          <Sparkle size={16} className="text-[#d4af37]" weight="fill" />
          <p className="overline">Générateur IA</p>
        </div>
        <h2 className="font-display text-2xl font-bold mb-4">Plan marketing assisté par Claude</h2>
        <Textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Décrivez votre objectif marketing..."
          data-testid="marketing-prompt"
        />
        <Button onClick={generate} disabled={loading} className="mt-3 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="generate-plan-btn">
          {loading ? "Génération..." : "Générer un plan d'action"}
        </Button>
        {plan && (
          <div className="mt-6 p-5 bg-gray-50 rounded-md border border-gray-200" data-testid="marketing-plan-output">
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{plan}</pre>
          </div>
        )}
      </Card>
    </div>
  );
}

function Channel({ icon: Icon, title, desc, status, color }) {
  return (
    <Card className="p-5 border border-gray-200 rounded-md shadow-none hover:-translate-y-1 hover:shadow-lg transition-all">
      <Icon size={22} style={{ color }} weight="duotone" />
      <h3 className="font-display font-bold mt-3">{title}</h3>
      <p className="text-xs text-gray-500 mt-1">{desc}</p>
      <Badge variant="outline" className="mt-3 text-xs">{status}</Badge>
    </Card>
  );
}
