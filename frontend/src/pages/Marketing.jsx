import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChartLineUp, MagnifyingGlass, Megaphone, EnvelopeSimple, ShareNetwork, Sparkle,
  EnvelopeOpen, Cursor, PaperPlaneTilt, WarningCircle, Paperclip, X as XIcon, PencilSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

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
        <Channel icon={EnvelopeSimple} title="Email nurturing" desc="Séquences post-inscription" status="Actif" color="#0052CC" />
        <Channel icon={ShareNetwork} title="Réseaux sociaux" desc="KAMI STREET Instagram" status="À planifier" color="#d4af37" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList data-testid="marketing-tabs">
          <TabsTrigger value="overview" data-testid="tab-overview"><Sparkle size={14} className="mr-1" /> Plan IA</TabsTrigger>
          <TabsTrigger value="emails" data-testid="tab-emails"><EnvelopeSimple size={14} className="mr-1" /> Emails</TabsTrigger>
          <TabsTrigger value="compose" data-testid="tab-compose"><PencilSimple size={14} className="mr-1" /> Email personnalisé</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
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
        </TabsContent>

        <TabsContent value="emails">
          <EmailStatsTab />
        </TabsContent>

        <TabsContent value="compose">
          <ComposeEmailTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <Card className="p-5 border border-gray-200 rounded-md shadow-none">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon size={16} style={{ color }} />
        <p className="overline">{label}</p>
      </div>
      <p className="font-display text-3xl font-bold mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Card>
  );
}

function EmailStatsTab() {
  const [stats, setStats] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/track/stats", { params: { days } })
      .then((r) => setStats(r.data))
      .catch(() => toast.error("Erreur de chargement des statistiques email"))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading && !stats) {
    return <p className="text-sm text-gray-400 py-8 text-center">Chargement des statistiques...</p>;
  }
  if (!stats) return null;

  const chartData = {
    labels: stats.by_day.map((d) => new Date(d.day).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })),
    datasets: [
      { label: "Envoyés", data: stats.by_day.map((d) => d.sent), borderColor: "#0a0a0a", backgroundColor: "rgba(10,10,10,0.08)", tension: 0.3, fill: true },
      { label: "Ouverts", data: stats.by_day.map((d) => d.opened), borderColor: "#0B7238", backgroundColor: "rgba(11,114,56,0.1)", tension: 0.3, fill: true },
      { label: "Cliqués", data: stats.by_day.map((d) => d.clicked), borderColor: "#d4af37", backgroundColor: "rgba(212,175,55,0.15)", tension: 0.3, fill: true },
    ],
  };

  return (
    <div className="space-y-6 mt-2">
      <div className="flex justify-end">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5"
          data-testid="email-stats-period"
        >
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option>
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={PaperPlaneTilt} label="Envoyés" value={stats.sent} color="#0a0a0a" />
        <StatCard icon={EnvelopeOpen} label="Taux d'ouverture" value={`${stats.open_rate}%`} sub={`${stats.opened} ouvert(s)`} color="#0B7238" />
        <StatCard icon={Cursor} label="Taux de clic" value={`${stats.click_rate}%`} sub={`${stats.clicked} clic(s)`} color="#d4af37" />
        <StatCard icon={WarningCircle} label="Échecs d'envoi" value={stats.failed} color="#d0021b" />
      </div>

      <Card className="p-6 border border-gray-200 rounded-md shadow-none">
        <p className="overline mb-1">Évolution</p>
        <h3 className="font-display text-xl font-bold mb-4">Envois / ouvertures / clics par jour</h3>
        <div className="h-64">
          <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }} />
        </div>
      </Card>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="p-5 pb-0">
          <p className="overline mb-1">Par modèle</p>
          <h3 className="font-display text-xl font-bold">Performance par objet d'email</h3>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-y border-gray-200">
              <tr>
                <th className="py-2.5 px-5 overline">Premier envoi</th>
                <th className="py-2.5 px-5 overline">Dernier envoi</th>
                <th className="py-2.5 px-5 overline">Objet (campagne)</th>
                <th className="py-2.5 px-5 overline text-right">Envoyés</th>
                <th className="py-2.5 px-5 overline text-right">Ouverts</th>
                <th className="py-2.5 px-5 overline text-right">Clics</th>
                <th className="py-2.5 px-5 overline text-right">Inscrits</th>
                <th className="py-2.5 px-5 overline text-right">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_subject.filter((s) => s.sent > 0).map((s) => (
                <tr key={s.subject} className="border-b border-gray-100">
                  <td className="py-2.5 px-5 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {s.first_sent ? new Date(s.first_sent).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="py-2.5 px-5 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {s.last_sent ? new Date(s.last_sent).toLocaleDateString("fr-FR") : "—"}
                    {s.last_sent && s.first_sent && s.last_sent !== s.first_sent && (
                      <Badge className="ml-2 bg-[#0052CC]/10 text-[#0052CC] hover:bg-[#0052CC]/10 text-[10px]">Relancée</Badge>
                    )}
                  </td>
                  <td className="py-2.5 px-5 max-w-md truncate" title={s.subject}>{s.subject}</td>
                  <td className="py-2.5 px-5 text-right font-mono">{s.sent}</td>
                  <td className="py-2.5 px-5 text-right font-mono text-[#0B7238]">
                    {s.opened} {s.sent > 0 && <span className="text-gray-400">({Math.round(s.opened / s.sent * 100)}%)</span>}
                  </td>
                  <td className="py-2.5 px-5 text-right font-mono text-[#d4af37]">
                    {s.clicked} {s.sent > 0 && <span className="text-gray-400">({Math.round(s.clicked / s.sent * 100)}%)</span>}
                  </td>
                  <td className="py-2.5 px-5 text-right font-mono">{s.converted}</td>
                  <td className="py-2.5 px-5 text-right">
                    <Badge className={s.conversion_rate > 0 ? "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10" : "bg-gray-100 text-gray-500 hover:bg-gray-100"}>
                      {s.conversion_rate}%
                    </Badge>
                  </td>
                </tr>
              ))}
              {!stats.by_subject.filter((s) => s.sent > 0).length && (
                <tr><td colSpan="8" className="py-8 text-center text-gray-400">Aucun email envoyé sur cette période.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-gray-400">
        Le suivi d'ouverture/clic repose sur un pixel invisible et une redirection de liens : certains clients mail
        (Gmail proxy, Apple Mail Privacy Protection, images bloquées par défaut...) peuvent fausser ces chiffres.
        À prendre comme indicateur de tendance, pas comme mesure exacte à 100%. La colonne "Inscrits" compte les
        inscriptions dont l'email correspond à un destinataire de la campagne, sans tenir compte de la date exacte
        (une inscription antérieure à l'envoi serait aussi comptée) — un indicateur de résultat, pas une preuve stricte
        de causalité.
      </p>
    </div>
  );
}

const EMPTY_COMPOSE = { to: "", subject: "", message: "", button_text: "", button_url: "" };

function ComposeEmailTab() {
  const [form, setForm] = useState(EMPTY_COMPOSE);
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const send = async () => {
    if (!form.to.trim() || !form.subject.trim() || !form.message.trim()) {
      return toast.error("Destinataire, objet et message sont requis");
    }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("to", form.to.trim());
      fd.append("subject", form.subject.trim());
      fd.append("message", form.message);
      if (form.button_text.trim() && form.button_url.trim()) {
        fd.append("button_text", form.button_text.trim());
        fd.append("button_url", form.button_url.trim());
      }
      if (file) fd.append("file", file);
      await api.post("/email/send-custom", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Email envoyé");
      setForm(EMPTY_COMPOSE);
      setFile(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none">
      <div className="flex items-center gap-2 mb-2">
        <PencilSimple size={16} className="text-[#d4af37]" weight="fill" />
        <p className="overline">Email libre</p>
      </div>
      <h2 className="font-display text-2xl font-bold mb-1">Composer un email personnalisé</h2>
      <p className="text-sm text-gray-500 mb-6">
        Écrivez simplement votre message — il sera automatiquement mis en forme avec le design TDL Formation
        (logo, couleurs, pied de page) avant l'envoi.
      </p>

      <div className="max-w-xl space-y-4">
        <div>
          <label className="text-sm font-medium">Destinataire</label>
          <Input
            type="email"
            value={form.to}
            onChange={(e) => set("to", e.target.value)}
            placeholder="destinataire@exemple.fr"
            data-testid="compose-to"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Objet</label>
          <Input
            value={form.subject}
            onChange={(e) => set("subject", e.target.value)}
            placeholder="Objet de votre email"
            data-testid="compose-subject"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Message</label>
          <Textarea
            rows={8}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            placeholder="Écrivez votre message ici..."
            data-testid="compose-message"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
          <div>
            <label className="text-sm font-medium">Bouton de redirection (optionnel)</label>
            <Input
              value={form.button_text}
              onChange={(e) => set("button_text", e.target.value)}
              placeholder="Texte du bouton"
              data-testid="compose-button-text"
            />
          </div>
          <div>
            <label className="text-sm font-medium invisible">URL</label>
            <Input
              value={form.button_url}
              onChange={(e) => set("button_url", e.target.value)}
              placeholder="https://..."
              data-testid="compose-button-url"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Pièce jointe (optionnel)</label>
          {file ? (
            <div className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
              <Paperclip size={14} className="text-gray-500 shrink-0" />
              <span className="truncate flex-1">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-600" data-testid="compose-remove-file">
                <XIcon size={14} />
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
              <Paperclip size={14} /> Joindre un fichier
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="compose-file-input" />
            </label>
          )}
        </div>

        <Button
          onClick={send}
          disabled={sending}
          className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white"
          data-testid="compose-send-btn"
        >
          <PaperPlaneTilt size={16} className="mr-2" /> {sending ? "Envoi en cours..." : "Envoyer l'email"}
        </Button>
      </div>
    </Card>
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
