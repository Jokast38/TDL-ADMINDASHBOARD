import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Tooltip as UiTooltip, TooltipTrigger as UiTooltipTrigger, TooltipContent as UiTooltipContent, TooltipProvider as UiTooltipProvider,
} from "@/components/ui/tooltip";
import {
  ChartLineUp, MagnifyingGlass, Megaphone, EnvelopeSimple, ShareNetwork, Sparkle,
  EnvelopeOpen, Cursor, PaperPlaneTilt, WarningCircle, Paperclip, X as XIcon, PencilSimple,
  Browser, ArrowSquareOut, Robot, PhoneCall, LinkedinLogo, Phone, Headset, NotePencil,
  LinkSimple, UploadSimple, Tag, CalendarPlus,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useAuth } from "@/contexts/AuthContext";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

// Onglet "Agents IA" (Limova) : déclenche de vraies actions payantes (appels,
// LinkedIn) — réservé à l'admin et aux employés, pas ouvert à tout le
// personnel comme le reste de la page Marketing.
const AGENTS_TAB_ROLES = ["admin", "employe"];

export default function Marketing() {
  const { user } = useAuth();
  const canSeeAgentsTab = AGENTS_TAB_ROLES.includes(user?.role);
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
          <TabsTrigger value="landing" data-testid="tab-landing"><Browser size={14} className="mr-1" /> Landing pages</TabsTrigger>
          <TabsTrigger value="backlinks" data-testid="tab-backlinks"><LinkSimple size={14} className="mr-1" /> Backlinks</TabsTrigger>
          <TabsTrigger value="meta-events" data-testid="tab-meta-events"><Megaphone size={14} className="mr-1" /> Prospects Meta</TabsTrigger>
          <TabsTrigger value="cosmosia" data-testid="tab-cosmosia"><UploadSimple size={14} className="mr-1" /> Prospects Cosmosia</TabsTrigger>
          {canSeeAgentsTab && (
            <TabsTrigger value="agents" data-testid="tab-agents"><Robot size={14} className="mr-1" /> Agents IA</TabsTrigger>
          )}
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

        <TabsContent value="landing">
          <LandingPagesTab />
        </TabsContent>

        <TabsContent value="backlinks">
          <BacklinksTab />
        </TabsContent>

        <TabsContent value="meta-events">
          <MetaEventsTab />
        </TabsContent>

        <TabsContent value="cosmosia">
          <CosmosiaTab />
        </TabsContent>

        {canSeeAgentsTab && (
          <TabsContent value="agents">
            <AgentsIaTab />
          </TabsContent>
        )}
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

// ─── Landing pages ──────────────────────────────────────────────────────────
// Pages de destination utilisées dans les campagnes (emails de relance, ads...).
// Le chemin est relatif : ces pages sont servies par ce même frontend.
const LANDING_PAGES = [
  {
    title: "Site TDL Formation",
    desc: "Page d'accueil principale — présentation de l'organisme et du catalogue.",
    path: "/",
    color: "#0a0a0a",
  },
  {
    title: "Offre fidélité — Stage récupération de points",
    desc: "Landing dédiée au tarif fidélité 189€ pour les anciens stagiaires.",
    path: "/offre-fidelite",
    color: "#d4af37",
  },
  {
    title: "Stage récupération de points",
    desc: "Landing générale pour le stage de récupération de points (tarif standard).",
    path: "/stage-recuperation-points",
    color: "#0052CC",
  },
  {
    title: "⚡ Offre flash -50% — Récupération de points",
    desc: "Landing provisoire : 15 places à 120€ (au lieu de 240€) pour la session du 21-22 septembre 2026. Campagne email anciens leads.",
    path: "/offre-flash-points",
    color: "#d4af37",
  },
  {
    title: "Formation SSIAP",
    desc: "Landing dédiée aux formations SSIAP 1, 2 et 3 (sécurité incendie).",
    path: "/formation-ssiap",
    color: "#d0021b",
  },
  {
    title: "Formation Taxi",
    desc: "Landing dédiée à la formation Taxi (initiale, continue, passerelle VTC→Taxi).",
    path: "/formation-taxi",
    color: "#F5A623",
  },
  {
    title: "Catalogue des formations",
    desc: "Liste publique de toutes les formations actives, avec fiches détaillées.",
    path: "/formations",
    color: "#0B7238",
  },
];

function LandingPageCard({ page }) {
  // La landing Meta (StageRecuperationPointsLanding.jsx) redirige tout
  // visiteur sans preuve d'origine Meta (fbclid, cookie _fbc, referrer) vers
  // la fiche publique à 200€ — sans ce paramètre, la miniature en iframe ET
  // le clic "Ouvrir la page" depuis ce dashboard tombaient dans ce cas et
  // n'affichaient jamais la vraie page promo. Les autres landings ignorent
  // ce paramètre sans effet de bord.
  const url = `${window.location.origin}${page.path}`;
  const previewUrl = `${url}?preview=admin`;
  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-md cursor-pointer group hover:-translate-y-1 hover:shadow-lg transition-all"
      data-testid={`landing-card-${page.path}`}
    >
      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="relative h-44 bg-gray-100 overflow-hidden border-b border-gray-200">
        {/* Aperçu miniature : la vraie page rendue dans un iframe, réduite à l'échelle.
            L'iframe garde sa largeur native (1280px) pour le rendu desktop, puis est
            recentrée via marginLeft (une fois réduite, elle est plus étroite que la
            carte, sans quoi elle restait collée à gauche avec du vide à droite).
            `?preview=admin` : la landing Meta (StageRecuperationPointsLanding.jsx)
            redirige tout visiteur sans preuve d'origine Meta (fbclid, cookie _fbc,
            referrer) vers la fiche publique à 200€ — sans ce paramètre, ni la
            miniature ni le clic n'affichaient jamais la vraie page promo. Les
            autres landings ignorent ce paramètre sans effet de bord. */}
          <iframe
            src={previewUrl}
            title={page.title}
            className="pointer-events-none border-0 absolute top-0 left-1/2"
            style={{
              width: "1280px", height: "1000px",
              transform: "scale(0.235)", transformOrigin: "top left",
              marginLeft: -(1280 * 0.235) / 2,
            }}
            tabIndex={-1}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium flex items-center gap-1.5 bg-black/70 px-3 py-1.5 rounded-md">
              <ArrowSquareOut size={16} /> Ouvrir la page
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: page.color }} />
            <h3 className="font-display font-bold text-sm truncate">{page.title}</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{page.desc}</p>
          <p className="text-[11px] text-gray-400 mt-2 font-mono truncate">{url}</p>
        </div>
      </Card>
    </a>
  );
}

function LandingPagesTab() {
  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center gap-2">
        <Browser size={16} className="text-[#d4af37]" />
        <p className="overline">Pages de destination</p>
      </div>
      <h2 className="font-display text-2xl font-bold -mt-1">Landing pages</h2>
      <p className="text-sm text-gray-500 max-w-2xl">
        Cliquez sur une page pour l'ouvrir dans un nouvel onglet — ce sont les liens à utiliser dans vos
        campagnes email, publicités ou relances.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LANDING_PAGES.map((page) => <LandingPageCard key={page.path} page={page} />)}
      </div>
    </div>
  );
}

// ─── Backlinks ──────────────────────────────────────────────────────────────
// Liste de sites où demander un backlink (importée depuis un export Excel),
// avec envoi d'une demande par email (prix proposé + mots-clés visés) et
// suivi du statut de chaque démarche directement depuis le dashboard.
const BACKLINK_STATUS_COLORS = {
  a_contacter: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  demande_envoyee: "bg-[#0052CC]/10 text-[#0052CC] hover:bg-[#0052CC]/10",
  relance_envoyee: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  accepte: "bg-green-100 text-green-700 hover:bg-green-100",
  refuse: "bg-red-100 text-red-700 hover:bg-red-100",
  publie: "bg-[#d4af37]/20 text-[#8a6d1f] hover:bg-[#d4af37]/20",
};

const PRIORITY_COLORS = { Haute: "text-red-600", Moyenne: "text-amber-600", Basse: "text-gray-400" };

// Mots-clés SEO par catégorie de formation — utilisés pour suggérer, pour
// chaque site de backlink, les mots-clés les plus pertinents à demander selon
// sa catégorie/thématique (mêmes catégories que le catalogue public, voir
// Landing.jsx). Si aucune catégorie ne correspond, on retombe sur des
// mots-clés génériques (annuaires généralistes, portails formation...).
const FORMATION_LABELS = {
  VTC_TAXI: "VTC / Taxi",
  CACES: "CACES",
  PERMIS: "Permis à points",
  AUTO_ECOLE: "Auto-école",
  SSIAP: "SSIAP",
  ECSR: "ECSR",
  VENTE: "Conseiller de vente",
  GENERALISTE: "Généraliste (toutes formations)",
};
const FORMATION_KEYWORDS = {
  VTC_TAXI: ["formation VTC Paris", "formation taxi Île-de-France", "carte professionnelle VTC"],
  CACES: ["formation CACES Paris", "formation CACES chariot élévateur", "certificat CACES"],
  PERMIS: ["stage récupération de points", "stage permis à points Paris"],
  AUTO_ECOLE: ["auto-école Paris", "permis B accompagné"],
  SSIAP: ["formation SSIAP 1 2 3", "formation sécurité incendie Paris"],
  ECSR: ["formation enseignant de la conduite", "titre ECSR"],
  VENTE: ["titre pro conseiller de vente", "formation vente en alternance"],
  // Sites généralistes (annuaires tous secteurs, portails formation...) : plutôt
  // qu'un mot-clé unique, on demande un lien sur un mix de nos formations phares
  // pour capter du trafic sur toutes nos activités depuis un seul backlink.
  GENERALISTE: [
    "formation professionnelle Paris",
    "formation VTC taxi",
    "formation CACES",
    "formation SSIAP",
    "organisme de formation Qualiopi",
  ],
};
const _KEYWORD_TRIGGERS = [
  ["VTC_TAXI", ["vtc", "taxi"]],
  ["CACES", ["caces", "chariot", "nacelle", "grue", "engin"]],
  ["PERMIS", ["permis à points", "récupération de points", "stage de points"]],
  ["AUTO_ECOLE", ["auto-école", "auto ecole", "conduite accompagnée"]],
  ["SSIAP", ["ssiap", "incendie", "sécurité"]],
  ["ECSR", ["ecsr", "enseignant de la conduite"]],
  ["VENTE", ["vente", "commerc"]],
];

function suggestFormationKey(backlink) {
  const text = `${backlink.category || ""} ${backlink.niche || ""} ${backlink.link_type || ""}`.toLowerCase();
  for (const [key, triggers] of _KEYWORD_TRIGGERS) {
    if (triggers.some((t) => text.includes(t))) return key;
  }
  return "GENERALISTE";
}

function suggestKeywords(backlink) {
  return FORMATION_KEYWORDS[suggestFormationKey(backlink)];
}

const META_LEAD_QUALIF_COLORS = {
  a_contacter: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  non_qualifie: "bg-gray-200 text-gray-500 hover:bg-gray-200",
  interesse: "bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10",
  pas_de_reponse: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  injoignable: "bg-gray-200 text-gray-700 hover:bg-gray-200",
  a_relancer: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  plus_interesse: "bg-red-100 text-red-700 hover:bg-red-100",
  // Vert franc (distinct de "interesse", vert plus clair) — pour que le
  // passage en "Inscrit" (lead converti) saute aux yeux dans le tableau.
  inscrit: "bg-green-600 text-white hover:bg-green-600",
};
const META_LEADS_PAGE_SIZE = 25;

// Tableau de qualification des leads Meta Lead Ads, importés manuellement
// depuis un export CSV du Gestionnaire d'événements Meta (pas de webhook
// temps réel ici, voir backend/routers/meta_lead_import.py pour le pourquoi
// d'une liste séparée de Prospects). On qualifie chaque lead, puis on
// l'inscrit à une session choisie à la main — ce qui crée l'inscription
// tout de suite et prévient le prospect par email de la session retenue.
const COSMOSIA_PAGE_SIZE = 25;

function CosmosiaTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [campaignOptions, setCampaignOptions] = useState([]);
  const [qualifOptions, setQualifOptions] = useState({});
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);

  const load = () => {
    setLoading(true);
    const params = { source: "cosmosia", page, page_size: COSMOSIA_PAGE_SIZE };
    if (search.trim()) params.q = search.trim();
    if (campaignFilter) params.campaign = campaignFilter;
    api.get("/leads", { params })
      .then(({ data }) => { setItems(data.items); setTotal(data.total); })
      .catch(() => toast.error("Erreur de chargement des leads Cosmosia"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, campaignFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [search, campaignFilter]);
  useEffect(() => {
    api.get("/leads/campaigns", { params: { source: "cosmosia" } }).then(({ data }) => setCampaignOptions(data)).catch(() => {});
    // Mêmes libellés de qualification que l'onglet Meta, pour rester cohérent
    // entre les deux tableaux de prospects publicitaires.
    api.get("/meta-lead-import/qualification-options").then(({ data }) => setQualifOptions(data)).catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / COSMOSIA_PAGE_SIZE));

  const pickImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/cosmosia/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(
        `${data.inserted} nouveau(x) prospect(s)` +
        (data.skipped_duplicates ? ` · ${data.skipped_duplicates} déjà dans Prospects (ignoré)` : "") +
        (data.skipped_duplicate_meta_lead ? ` · ${data.skipped_duplicate_meta_lead} déjà dans Prospects Meta (ignoré)` : "")
      );
      setPage(1);
      load();
      api.get("/leads/campaigns", { params: { source: "cosmosia" } }).then(({ data }) => setCampaignOptions(data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  const updateQualification = async (id, qualification) => {
    try {
      const { data } = await api.put(`/leads/${id}`, { qualification });
      setItems((prev) => prev.map((l) => (l.id === data.id ? data : l)));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };

  const updateNotes = async (id, notes) => {
    try {
      const { data } = await api.put(`/leads/${id}`, { notes });
      setItems((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      toast.success("Note enregistrée");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };

  if (loading && !items.length) {
    return <p className="text-sm text-gray-400 py-8 text-center">Chargement...</p>;
  }

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <UploadSimple size={16} className="text-[#d4af37]" />
            <p className="overline">Partenaire Cosmosia</p>
          </div>
          <h2 className="font-display text-2xl font-bold -mt-1">Prospects Cosmosia</h2>
          <p className="text-sm text-gray-500 max-w-2xl mt-1">
            Exportez les opportunités depuis votre espace Cosmosia (tunnel de vente GoFunnel) en CSV et
            importez-les ici — elles rejoignent directement Prospects et la file d'appel de l'espace commercial,
            doublons automatiquement écartés.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 shrink-0">
          <UploadSimple size={14} /> {importing ? "Import..." : "Importer un export CSV"}
          <input type="file" accept=".csv" className="hidden" onChange={pickImportFile} disabled={importing} data-testid="cosmosia-import-input" />
        </label>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom, un email, un téléphone..." className="max-w-xs"
          data-testid="cosmosia-search"
        />
        <Select value={campaignFilter || "all"} onValueChange={(v) => setCampaignFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" data-testid="cosmosia-campaign-filter"><SelectValue placeholder="Toutes les campagnes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les campagnes</SelectItem>
            {campaignOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="cosmosia-table">
            <thead className="bg-gray-50 text-left border-y border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Prospect</th>
                <th className="py-2.5 px-4 overline">Campagne</th>
                <th className="py-2.5 px-4 overline">Intérêt</th>
                <th className="py-2.5 px-4 overline">Qualification</th>
                <th className="py-2.5 px-4 overline">Traité par</th>
                <th className="py-2.5 px-4 overline">Notes</th>
                <th className="py-2.5 px-4 overline">Importé le</th>
              </tr>
            </thead>
            <tbody>
              {!items.length && (
                <tr><td colSpan="7" className="py-10 text-center text-gray-400">
                  {total ? "Aucun lead pour ce filtre." : "Aucun lead Cosmosia importé — utilisez le bouton ci-dessus."}
                </td></tr>
              )}
              {items.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 px-4 max-w-[200px]">
                    <p className="font-medium truncate">{l.name || "—"}</p>
                    {l.email && <p className="text-xs text-gray-500 truncate">{l.email}</p>}
                    {l.phone && <p className="text-xs text-gray-400 truncate">{l.phone}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-600 max-w-[160px] truncate">{l.campaign || "—"}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-600">{l.interest || "—"}</td>
                  <td className="py-2.5 px-4">
                    <Select value={l.qualification || "a_contacter"} onValueChange={(v) => updateQualification(l.id, v)}>
                      <SelectTrigger className={`h-7 text-xs border-0 ${META_LEAD_QUALIF_COLORS[l.qualification] || "bg-gray-100"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(qualifOptions).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-600">{l.qualified_by_name || <span className="text-gray-300">—</span>}</td>
                  <td className="py-2.5 px-4 max-w-[220px]">
                    <MetaLeadNotesCell lead={l} onSave={updateNotes} />
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {l.created_at ? new Date(l.created_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>{(page - 1) * COSMOSIA_PAGE_SIZE + 1}–{Math.min(page * COSMOSIA_PAGE_SIZE, total)} sur {total}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="cosmosia-prev-page">Précédent</Button>
            <span className="text-xs">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} data-testid="cosmosia-next-page">Suivant</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaEventsTab() {
  const [items, setItems] = useState([]);
  const [qualifOptions, setQualifOptions] = useState({});
  const [accountOptions, setAccountOptions] = useState([]);
  const [campaignOptions, setCampaignOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [qualifFilter, setQualifFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importAccount, setImportAccount] = useState("");
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [enrollFor, setEnrollFor] = useState(null);

  const load = () => {
    setLoading(true);
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (qualifFilter) params.qualification = qualifFilter;
    if (accountFilter) params.meta_account = accountFilter;
    if (campaignFilter) params.campaign_name = campaignFilter;
    api.get("/meta-lead-import", { params })
      .then(({ data }) => {
        setItems(data.items);
        setQualifOptions(data.qualification_options);
        setAccountOptions(data.account_options || []);
        setCampaignOptions(data.campaign_options || []);
      })
      .catch(() => toast.error("Erreur de chargement des leads Meta"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, qualifFilter, accountFilter, campaignFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [search, qualifFilter, accountFilter, campaignFilter]);

  const totalPages = Math.max(1, Math.ceil(items.length / META_LEADS_PAGE_SIZE));
  const pagedItems = items.slice((page - 1) * META_LEADS_PAGE_SIZE, page * META_LEADS_PAGE_SIZE);

  const pickImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setPendingImportFile(file);
  };

  const confirmImport = async () => {
    if (!pendingImportFile || !importAccount.trim()) {
      toast.error("Indiquez le compte Meta d'origine de cet export");
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingImportFile);
      fd.append("meta_account", importAccount.trim());
      const { data } = await api.post("/meta-lead-import/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(
        `${data.imported} nouveau(x), ${data.updated} mis à jour` +
        (data.skipped_already_enrolled ? ` · ${data.skipped_already_enrolled} déjà inscrit(s) (ignoré)` : "") +
        (data.skipped_duplicate_prospect ? ` · ${data.skipped_duplicate_prospect} déjà dans Prospects (ignoré)` : "") +
        (data.skipped_no_contact ? ` · ${data.skipped_no_contact} sans email/téléphone (ignoré)` : "")
      );
      setPendingImportFile(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  const updateQualification = async (id, qualification) => {
    try {
      const { data } = await api.patch(`/meta-lead-import/${id}`, { qualification });
      setItems((prev) => prev.map((l) => (l.id === data.id ? data : l)));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };

  const updateNotes = async (id, notes) => {
    try {
      const { data } = await api.patch(`/meta-lead-import/${id}`, { notes });
      setItems((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      toast.success("Note enregistrée");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };

  const onEnrolled = (updated) => {
    setItems((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setEnrollFor(null);
    toast.success("Inscription créée — email de confirmation envoyé");
  };

  if (loading && !items.length) {
    return <p className="text-sm text-gray-400 py-8 text-center">Chargement...</p>;
  }

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-[#d4af37]" />
            <p className="overline">Publicités Meta</p>
          </div>
          <h2 className="font-display text-2xl font-bold -mt-1">Prospects Meta</h2>
          <p className="text-sm text-gray-500 max-w-2xl mt-1">
            Importez l'export CSV du Gestionnaire d'événements Meta, qualifiez chaque lead, puis inscrivez-le
            directement à la session de votre choix — l'email de confirmation part automatiquement.
          </p>
        </div>

        <Dialog open={!!pendingImportFile} onOpenChange={(open) => !open && setPendingImportFile(null)}>
          <DialogTrigger asChild>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 shrink-0">
              <UploadSimple size={14} /> Importer un export CSV
              <input type="file" accept=".csv" className="hidden" onChange={pickImportFile} data-testid="meta-leads-import-input" />
            </label>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Importer {pendingImportFile?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Compte Meta d'origine</label>
                <Input
                  value={importAccount} onChange={(e) => setImportAccount(e.target.value)}
                  placeholder="ex : TDL Formation" data-testid="meta-leads-import-account"
                />
                <p className="text-xs text-gray-400 mt-1">Le CSV ne précise pas de quel compte publicitaire il vient — à indiquer à la main.</p>
              </div>
              <Button onClick={confirmImport} disabled={importing} className="w-full bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="meta-leads-import-confirm">
                {importing ? "Import..." : "Importer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom, un email, un téléphone..." className="max-w-xs"
          data-testid="meta-leads-search"
        />
        <Select value={qualifFilter || "all"} onValueChange={(v) => setQualifFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" data-testid="meta-leads-qualif-filter"><SelectValue placeholder="Toutes les qualifications" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les qualifications</SelectItem>
            {Object.entries(qualifOptions).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={accountFilter || "all"} onValueChange={(v) => setAccountFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" data-testid="meta-leads-account-filter"><SelectValue placeholder="Tous les comptes Meta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les comptes Meta</SelectItem>
            {accountOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={campaignFilter || "all"} onValueChange={(v) => setCampaignFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" data-testid="meta-leads-campaign-filter"><SelectValue placeholder="Toutes les campagnes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les campagnes</SelectItem>
            {campaignOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="meta-leads-table">
            <thead className="bg-gray-50 text-left border-y border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Prospect</th>
                <th className="py-2.5 px-4 overline">Compte Meta</th>
                <th className="py-2.5 px-4 overline">Campagne</th>
                <th className="py-2.5 px-4 overline">Inscrit le</th>
                <th className="py-2.5 px-4 overline">Qualification</th>
                <th className="py-2.5 px-4 overline">Traité par</th>
                <th className="py-2.5 px-4 overline">Notes</th>
                <th className="py-2.5 px-4 overline text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {!pagedItems.length && (
                <tr><td colSpan="8" className="py-10 text-center text-gray-400">
                  {items.length ? "Aucun lead pour ce filtre." : "Aucun lead — importez un export CSV pour commencer."}
                </td></tr>
              )}
              {pagedItems.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 px-4 max-w-[200px]">
                    <p className="font-medium truncate">{l.name || "—"}</p>
                    {l.email && <p className="text-xs text-gray-500 truncate">{l.email}</p>}
                    {l.phone && <p className="text-xs text-gray-400 truncate">{l.phone}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-600">{l.meta_account}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-600 max-w-[180px]">
                    <p className="truncate">{l.campaign_name}</p>
                    <p className="text-gray-400 truncate">{l.form_name}{l.platform ? ` · ${l.platform}` : ""}</p>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {l.created_time ? new Date(l.created_time).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="py-2.5 px-4">
                    <Select value={l.qualification} onValueChange={(v) => updateQualification(l.id, v)}>
                      <SelectTrigger className={`h-7 text-xs border-0 ${META_LEAD_QUALIF_COLORS[l.qualification] || "bg-gray-100"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(qualifOptions).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-600">{l.qualified_by_name || <span className="text-gray-300">—</span>}</td>
                  <td className="py-2.5 px-4 max-w-[220px]">
                    <MetaLeadNotesCell lead={l} onSave={updateNotes} />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {l.inscription_id ? (
                      <span className="text-xs text-gray-400">Déjà inscrit</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setEnrollFor(l)} disabled={!l.email} data-testid={`meta-lead-enroll-btn-${l.id}`}>
                        Inscrire
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>{(page - 1) * META_LEADS_PAGE_SIZE + 1}–{Math.min(page * META_LEADS_PAGE_SIZE, items.length)} sur {items.length}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="meta-leads-prev-page">Précédent</Button>
            <span className="text-xs">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} data-testid="meta-leads-next-page">Suivant</Button>
          </div>
        </div>
      )}

      <Dialog open={!!enrollFor} onOpenChange={(open) => !open && setEnrollFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inscrire {enrollFor?.name || enrollFor?.email}</DialogTitle></DialogHeader>
          {enrollFor && <MetaLeadEnrollForm lead={enrollFor} onEnrolled={onEnrolled} onCancel={() => setEnrollFor(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Cellule Notes de la table Prospects Meta — toujours visible (fond ambre
// dès qu'une note existe, pas juste une icône discrète) pour qu'un agent ne
// passe pas à côté d'une note laissée par un collègue. Survol -> tooltip
// avec le texte complet (les notes longues sont tronquées dans la cellule).
// Clic -> popover d'édition avec Textarea + bouton Enregistrer.
function MetaLeadNotesCell({ lead, onSave }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(lead.notes || "");
  const [saving, setSaving] = useState(false);
  const hasNotes = !!(lead.notes || "").trim();

  const handleOpenChange = (v) => {
    setOpen(v);
    if (v) setDraft(lead.notes || "");
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(lead.id, draft);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <button
      type="button"
      className={`w-full text-left text-xs rounded-md border px-2.5 py-1.5 transition-colors ${
        hasNotes
          ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
          : "border-dashed border-gray-300 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      }`}
      data-testid={`meta-lead-notes-btn-${lead.id}`}
    >
      {hasNotes ? (
        <span className="flex items-start gap-1.5">
          <NotePencil size={13} weight="fill" className="mt-0.5 shrink-0" />
          <span className="line-clamp-2 break-words">{lead.notes}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5"><NotePencil size={13} /> Ajouter une note</span>
      )}
    </button>
  );

  return (
    <UiTooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        {hasNotes ? (
          <UiTooltip>
            <UiTooltipTrigger asChild>
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            </UiTooltipTrigger>
            <UiTooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-left">
              {lead.notes}
            </UiTooltipContent>
          </UiTooltip>
        ) : (
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        )}
        <PopoverContent className="w-80" align="start">
          <p className="text-xs font-medium text-gray-600 mb-2">Note sur {lead.name || lead.email || "ce prospect"}</p>
          <Textarea
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Laisser une note sur ce prospect..."
            data-testid={`meta-lead-notes-textarea-${lead.id}`}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={save} disabled={saving} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid={`meta-lead-notes-save-${lead.id}`}>
              {saving ? "..." : "Enregistrer"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </UiTooltipProvider>
  );
}

function MetaLeadEnrollForm({ lead, onEnrolled, onCancel }) {
  const [formations, setFormations] = useState([]);
  const [stages, setStages] = useState([]);
  const [formationId, setFormationId] = useState("");
  const [stageId, setStageId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/formations").then(({ data }) => setFormations(data)).catch(() => {}); }, []);
  useEffect(() => {
    setStageId("");
    if (!formationId) { setStages([]); return; }
    api.get("/stages", { params: { formation_id: formationId } }).then(({ data }) => setStages(data)).catch(() => setStages([]));
  }, [formationId]);

  const save = async () => {
    if (!formationId) return toast.error("Choisissez une formation");
    setSaving(true);
    try {
      const { data } = await api.post(`/meta-lead-import/${lead.id}/enroll`, { formation_id: formationId, stage_id: stageId || null });
      onEnrolled(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'inscription");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium block mb-1">Formation</label>
        <Select value={formationId} onValueChange={setFormationId}>
          <SelectTrigger data-testid="meta-lead-enroll-formation"><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
          <SelectContent>
            {formations.map((f) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Session (optionnel)</label>
        <Select value={stageId || "none"} onValueChange={(v) => setStageId(v === "none" ? "" : v)} disabled={!formationId}>
          <SelectTrigger data-testid="meta-lead-enroll-stage"><SelectValue placeholder="Aucune session précise" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucune session précise</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                Du {s.date_debut} au {s.date_fin}{s.lieu_ville ? ` — ${s.lieu_ville}` : ""} ({s.nb_inscrits} inscrit{s.nb_inscrits > 1 ? "s" : ""})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">Annuler</Button>
        <Button onClick={save} disabled={saving} className="flex-1 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="meta-lead-enroll-confirm">
          {saving ? "..." : "Inscrire"}
        </Button>
      </div>
    </div>
  );
}

const BACKLINKS_PAGE_SIZE = 25;

function BacklinksTab() {
  const [items, setItems] = useState([]);
  const [statusOptions, setStatusOptions] = useState({});
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [linkTypeOptions, setLinkTypeOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [linkTypeFilter, setLinkTypeFilter] = useState("");
  const [formationFilter, setFormationFilter] = useState("");
  const [importing, setImporting] = useState(false);
  const [requestFor, setRequestFor] = useState(null);
  const [page, setPage] = useState(1);
  const [emailSearch, setEmailSearch] = useState({ running: false, total: 0, done: 0, found: 0 });
  const [findingEmailFor, setFindingEmailFor] = useState(null); // id du backlink en recherche ponctuelle

  const load = () => {
    setLoading(true);
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;
    if (linkTypeFilter) params.link_type = linkTypeFilter;
    api.get("/backlinks", { params })
      .then(({ data }) => {
        setItems(data.items);
        setStatusOptions(data.status_options);
        setCategoryOptions(data.category_options || []);
        setLinkTypeOptions(data.link_type_options || []);
      })
      .catch(() => toast.error("Erreur de chargement des backlinks"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [search, statusFilter, categoryFilter, linkTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  // Une recherche par lot peut avoir été lancée par quelqu'un d'autre (ou par
  // vous, sur un précédent chargement de la page) — on reprend son suivi
  // plutôt que de la perdre de vue.
  useEffect(() => { api.get("/backlinks/find-emails/status").then(({ data }) => setEmailSearch(data)).catch(() => {}); }, []);
  // Retour en page 1 à chaque changement de filtre — sinon on peut se
  // retrouver sur une page qui n'existe plus pour le nouveau résultat filtré.
  useEffect(() => { setPage(1); }, [search, statusFilter, categoryFilter, linkTypeFilter, formationFilter]);

  // Filtre par formation ciblée : calculé côté client à partir de la catégorie/
  // niche du site (voir suggestFormationKey), pas une colonne en base — pas
  // besoin d'aller-retour serveur pour ce filtre. La plupart des sites de la
  // liste sont des annuaires généralistes (pas de mention explicite "CACES"
  // ou "SSIAP" dans leurs colonnes) : on leur demande justement un lien mixte
  // couvrant toutes nos formations (voir FORMATION_KEYWORDS.GENERALISTE), donc
  // ils restent pertinents — et donc visibles — quel que soit le filtre formation.
  const filteredItems = formationFilter
    ? items.filter((b) => {
        const key = suggestFormationKey(b);
        return key === formationFilter || key === "GENERALISTE";
      })
    : items;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / BACKLINKS_PAGE_SIZE));
  const pagedItems = filteredItems.slice((page - 1) * BACKLINKS_PAGE_SIZE, page * BACKLINKS_PAGE_SIZE);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const { data } = await api.post(
        isCsv ? "/backlinks/import-csv" : "/backlinks/import-excel",
        fd, { headers: { "Content-Type": "multipart/form-data" } }
      );
      toast.success(
        `Import terminé — ${data.imported} nouveau(x), ${data.updated} mis à jour` +
        (data.skipped ? ` · ${data.skipped} ligne(s) ignorée(s) (sans lien ni domaine)` : "")
      );
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const { data } = await api.patch(`/backlinks/${id}`, { status });
      setItems((prev) => prev.map((b) => (b.id === id ? data : b)));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur");
    }
  };

  const onRequestSent = (updated) => {
    setItems((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setRequestFor(null);
  };

  // Recherche d'emails en masse — tourne en tâche de fond côté serveur
  // (des centaines de sites à visiter), on interroge périodiquement son
  // statut pendant qu'elle tourne, jusqu'à ce qu'elle se termine.
  useEffect(() => {
    if (!emailSearch.running) return;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get("/backlinks/find-emails/status");
        setEmailSearch(data);
        if (!data.running) load(); // rafraîchit la liste pour voir les emails trouvés
      } catch {
        // ignore une erreur de polling isolée, réessaie au prochain tick
      }
    }, 3000);
    return () => clearInterval(t);
  }, [emailSearch.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEmailSearch = async () => {
    try {
      const { data } = await api.post("/backlinks/find-emails");
      if (!data.started) {
        toast.info(data.reason || "Rien à chercher");
        return;
      }
      setEmailSearch({ running: true, total: data.total, done: 0, found: 0 });
      toast.success(`Recherche lancée sur ${data.total} site(s) — ça tourne en fond, vous pouvez continuer à travailler.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur au lancement");
    }
  };

  const findEmailForOne = async (b) => {
    setFindingEmailFor(b.id);
    try {
      const { data } = await api.post(`/backlinks/${b.id}/find-email`);
      setItems((prev) => prev.map((x) => (x.id === data.id ? data : x)));
      toast.success(`Email trouvé : ${data.contact_email}`);
    } catch (err) {
      toast.error(err.response?.status === 404 ? "Aucun email trouvé sur ce site" : (err.response?.data?.detail || "Erreur"));
    } finally {
      setFindingEmailFor(null);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <LinkSimple size={16} className="text-[#d4af37]" />
            <p className="overline">Netlinking</p>
          </div>
          <h2 className="font-display text-2xl font-bold -mt-1">Demandes de backlinks</h2>
          <p className="text-sm text-gray-500 max-w-2xl mt-1">
            Sélectionnez un site dans la liste, proposez un prix et les mots-clés visés, puis envoyez la demande par
            email — le statut de chaque démarche est suivi ici.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline" size="sm" onClick={startEmailSearch} disabled={emailSearch.running}
            data-testid="backlinks-find-emails-btn"
          >
            <MagnifyingGlass size={14} className="mr-1" />
            {emailSearch.running ? `Recherche en cours (${emailSearch.done}/${emailSearch.total}, ${emailSearch.found} trouvé${emailSearch.found > 1 ? "s" : ""})` : "Chercher les emails manquants"}
          </Button>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
            <UploadSimple size={14} /> {importing ? "Import..." : "Importer / actualiser la liste (Excel ou CSV)"}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} disabled={importing} data-testid="backlinks-import-input" />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un site, une catégorie..."
          className="max-w-xs"
          data-testid="backlinks-search"
        />
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Tous les statuts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(statusOptions).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" data-testid="backlinks-category-filter"><SelectValue placeholder="Toutes les catégories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={linkTypeFilter || "all"} onValueChange={(v) => setLinkTypeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" data-testid="backlinks-link-type-filter"><SelectValue placeholder="Tous les types de lien" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types de lien</SelectItem>
            {linkTypeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={formationFilter || "all"} onValueChange={(v) => setFormationFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-64" data-testid="backlinks-formation-filter"><SelectValue placeholder="Toutes les formations" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les formations</SelectItem>
            {Object.entries(FORMATION_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="backlinks-table">
            <thead className="bg-gray-50 text-left border-y border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Site</th>
                <th className="py-2.5 px-4 overline">Catégorie</th>
                <th className="py-2.5 px-4 overline">Type de lien</th>
                <th className="py-2.5 px-4 overline">Mots-clés suggérés</th>
                <th className="py-2.5 px-4 overline">Priorité</th>
                <th className="py-2.5 px-4 overline">Statut</th>
                <th className="py-2.5 px-4 overline text-right">Dernier prix</th>
                <th className="py-2.5 px-4 overline text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="8" className="py-8 text-center text-gray-400">Chargement...</td></tr>
              )}
              {!loading && !filteredItems.length && (
                <tr><td colSpan="8" className="py-10 text-center text-gray-400">
                  {items.length ? "Aucun backlink pour ce filtre." : "Aucun backlink — importez votre liste Excel pour commencer."}
                </td></tr>
              )}
              {pagedItems.map((b) => (
                <tr key={b.id} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 px-4 max-w-[220px]">
                    <p className="font-medium truncate">{b.site_name}</p>
                    <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0052CC] hover:underline truncate block">
                      {b.url}
                    </a>
                    {b.contact_email && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{b.contact_email}</p>}
                    {b.competitor && <p className="text-[11px] text-gray-400 mt-0.5 truncate">Lien du concurrent : {b.competitor}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-600 max-w-[200px]">
                    <p>{b.category}</p>
                    <p className="text-gray-400 truncate">{b.niche}</p>
                    {b.notes && <p className="text-gray-400 text-[11px] mt-1 line-clamp-2">{b.notes}</p>}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-600 max-w-[160px]">{b.link_type}</td>
                  <td className="py-2.5 px-4 max-w-[200px]">
                    <div className="flex flex-wrap gap-1">
                      {(b.last_request?.keywords?.length
                        ? b.last_request.keywords
                        // Sous un filtre formation donné, un site généraliste doit afficher
                        // les mots-clés de CETTE formation (c'est ce qu'on lui demanderait),
                        // pas tout le mix généraliste — sinon le lien avec le filtre n'est pas clair.
                        : formationFilter && suggestFormationKey(b) === "GENERALISTE"
                          ? FORMATION_KEYWORDS[formationFilter]
                          : suggestKeywords(b)
                      ).map((k) => (
                        <Badge key={k} className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-[10px] font-normal">{k}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className={`py-2.5 px-4 text-xs font-medium ${PRIORITY_COLORS[b.priority] || "text-gray-500"}`}>{b.priority}</td>
                  <td className="py-2.5 px-4">
                    <Select value={b.status} onValueChange={(v) => updateStatus(b.id, v)}>
                      <SelectTrigger className={`h-7 text-xs border-0 ${BACKLINK_STATUS_COLORS[b.status] || "bg-gray-100"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusOptions).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {b.request_count > 0 && (
                      <p className="text-[11px] text-gray-400 mt-1">{b.request_count} demande(s) envoyée(s)</p>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs">
                    {b.last_request?.price != null ? `${b.last_request.price} €` : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!b.contact_email && (
                        <Button
                          size="sm" variant="ghost" onClick={() => findEmailForOne(b)}
                          disabled={findingEmailFor === b.id} title="Chercher l'email de contact de ce site"
                          data-testid={`backlink-find-email-btn-${b.id}`}
                        >
                          <MagnifyingGlass size={13} className={findingEmailFor === b.id ? "animate-pulse" : ""} />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setRequestFor({ ...b, _filterHint: formationFilter })} data-testid={`backlink-request-btn-${b.id}`}>
                        <EnvelopeSimple size={13} className="mr-1" /> {b.request_count > 0 ? "Relancer" : "Demander"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredItems.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>
            {(page - 1) * BACKLINKS_PAGE_SIZE + 1}–{Math.min(page * BACKLINKS_PAGE_SIZE, filteredItems.length)} sur {filteredItems.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="backlinks-prev-page"
            >
              Précédent
            </Button>
            <span className="text-xs">Page {page} / {totalPages}</span>
            <Button
              variant="outline" size="sm" disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="backlinks-next-page"
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!requestFor} onOpenChange={(open) => !open && setRequestFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Demande de backlink — {requestFor?.site_name}</DialogTitle></DialogHeader>
          {requestFor && <BacklinkRequestForm backlink={requestFor} onSent={onRequestSent} onCancel={() => setRequestFor(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BacklinkRequestForm({ backlink, onSent, onCancel }) {
  const [toEmail, setToEmail] = useState(backlink.contact_email || "");
  const [price, setPrice] = useState(backlink.last_request?.price ?? "");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState(
    backlink.last_request?.keywords?.length
      ? backlink.last_request.keywords
      : backlink._filterHint && suggestFormationKey(backlink) === "GENERALISTE"
        ? FORMATION_KEYWORDS[backlink._filterHint]
        : suggestKeywords(backlink)
  );
  const [message, setMessage] = useState(
    backlink.last_request?.message ||
    `Bonjour,\n\nNous sommes TDL Formation, organisme de formation certifié Qualiopi (permis, CACES, SSIAP, VTC/Taxi) basé en Île-de-France.\n\nNous souhaiterions obtenir un lien depuis votre site (${backlink.url}) vers le nôtre (https://tdl-formation.fr), idéalement sur les mots-clés ci-dessous. Nous sommes disposés à rémunérer cet emplacement.\n\nN'hésitez pas à nous indiquer vos conditions si celles proposées ne conviennent pas.\n\nBien cordialement,\nL'équipe TDL Formation`
  );
  const [sending, setSending] = useState(false);

  const addKeyword = () => {
    const v = keywordInput.trim();
    if (v && !keywords.includes(v)) setKeywords((k) => [...k, v]);
    setKeywordInput("");
  };
  const removeKeyword = (v) => setKeywords((k) => k.filter((x) => x !== v));

  const send = async () => {
    if (!toEmail.trim()) return toast.error("Adresse email destinataire requise");
    if (!price || Number(price) <= 0) return toast.error("Indiquez un prix proposé");
    if (!message.trim()) return toast.error("Le message ne peut pas être vide");
    setSending(true);
    try {
      const { data } = await api.post(`/backlinks/${backlink.id}/request`, {
        to_email: toEmail.trim(),
        price: Number(price),
        keywords,
        message,
      });
      toast.success("Demande envoyée");
      onSent(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 mt-1">
      <div>
        <label className="text-sm font-medium">Email destinataire</label>
        <Input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="contact@site.fr" data-testid="backlink-to-email" />
      </div>
      <div>
        <label className="text-sm font-medium">Prix proposé (€)</label>
        <Input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex: 80" data-testid="backlink-price" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Mots-clés visés</label>
        <div className="flex gap-2">
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
            placeholder="ex: formation CACES Paris"
            data-testid="backlink-keyword-input"
          />
          <Button type="button" variant="outline" onClick={addKeyword}><Tag size={14} /></Button>
        </div>
        {!!keywords.length && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {keywords.map((k) => (
              <Badge key={k} className="bg-gray-100 text-gray-700 hover:bg-gray-100 gap-1">
                {k}
                <button onClick={() => removeKeyword(k)} className="hover:text-red-600"><XIcon size={11} /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="text-sm font-medium">Message</label>
        <Textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="backlink-message" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={sending}>Annuler</Button>
        <Button onClick={send} disabled={sending} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="backlink-send-btn">
          <PaperPlaneTilt size={14} className="mr-2" /> {sending ? "Envoi..." : "Envoyer la demande"}
        </Button>
      </div>
    </div>
  );
}

// ─── Agents IA (Limova) ─────────────────────────────────────────────────────
const OUTCOME_COLORS = {
  veut_etre_rappele: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  veut_sinscrire: "bg-green-100 text-green-700 hover:bg-green-100",
  pas_interesse: "bg-red-100 text-red-700 hover:bg-red-100",
  injoignable: "bg-gray-100 text-gray-600 hover:bg-gray-100",
};

function AgentsIaTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = () => api.get("/limova/status").then(({ data }) => setStatus(data)).catch(() => setStatus(null));
  useEffect(() => { loadStatus().finally(() => setLoading(false)); }, []);

  const toggle = async (field, value) => {
    try {
      const { data } = await api.put("/limova/toggle", { [field]: value });
      setStatus(data);
      toast.success(value ? "Agent activé" : "Agent désactivé");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Chargement...</p>;

  return (
    <div className="space-y-6 mt-2">
      <p className="text-sm text-gray-500 max-w-2xl">
        Agents IA propulsés par Limova — appels téléphoniques automatisés et prospection LinkedIn. Configurez la clé
        API et les identifiants d'agent dans <b>Paramètres → Limova</b>, puis activez/désactivez ici.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PhoneAgentCard status={status} onToggle={(v) => toggle("phone_enabled", v)} />
        <LinkedinAgentCard status={status} onToggle={(v) => toggle("linkedin_enabled", v)} />
      </div>
      <InboundReceptionCard status={status} />
      <SocialConnectionsCard />
    </div>
  );
}

// Agent d'accueil : Limova achète un numéro dédié qui transfère les appels vers
// votre vrai numéro ; une fois l'agent connecté, il décroche si l'appel
// transféré reste sans réponse. L'achat du numéro est facturé (3600 crédits
// Limova) et non réversible — jamais déclenché sans confirmation explicite.
function InboundReceptionCard({ status }) {
  const configured = !!status?.phone_agent_configured;
  const [numbers, setNumbers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userPhone, setUserPhone] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/limova/phone/inbound-numbers")
      .then(({ data }) => setNumbers(data?.data || []))
      .catch(() => setNumbers(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const register = async () => {
    if (!userPhone.trim()) return toast.error("Indiquez le numéro à faire sonner en premier");
    setRegistering(true);
    try {
      await api.post("/limova/phone/inbound-numbers", {
        user_phone_number: userPhone.trim(), friendly_name: friendlyName.trim() || null, confirm_cost: true,
      });
      toast.success("Numéro d'accueil créé");
      setUserPhone(""); setFriendlyName("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la création du numéro");
    } finally {
      setRegistering(false);
    }
  };

  const connectAgent = async () => {
    setConnecting(true);
    try {
      await api.post("/limova/phone/inbound-numbers/connect-agent");
      toast.success("Agent d'accueil connecté");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de la connexion de l'agent");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none">
      <div className="flex items-center gap-2 mb-1">
        <Headset size={20} className="text-[#0052CC]" weight="duotone" />
        <h3 className="font-display text-lg font-bold">Agent d'accueil (appels entrants)</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Un numéro dédié reçoit les appels et les transfère vers votre vrai numéro. Si personne ne décroche, l'agent IA
        prend le relais automatiquement.
      </p>
      {!configured && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
          Configurez d'abord l'ID de l'agent téléphonique dans Paramètres → Limova.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-4">Chargement...</p>
      ) : numbers?.length ? (
        <div className="space-y-2 mb-4">
          {numbers.map((n) => (
            <div key={n.id} className="border border-gray-200 rounded-md p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{n.friendlyName || n.twilioPhoneNumber}</p>
                <p className="text-xs text-gray-400">
                  {n.twilioPhoneNumber} → transfère vers {n.userPhoneNumber}
                </p>
              </div>
              {n.connectedAgents?.length ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 shrink-0">Agent connecté</Badge>
              ) : (
                <Button size="sm" variant="outline" disabled={!configured || connecting} onClick={connectAgent} className="shrink-0">
                  {connecting ? "..." : "Connecter l'agent"}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">Aucun numéro d'accueil configuré pour le moment.</p>
      )}

      <div className="pt-4 border-t border-gray-200 space-y-2">
        <p className="text-sm font-medium">Créer un numéro d'accueil</p>
        <Input value={userPhone} onChange={(e) => setUserPhone(e.target.value)} placeholder="Votre numéro actuel (+33...)" />
        <Input value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} placeholder="Nom (ex: Accueil TDL Formation)" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={!userPhone.trim()} className="bg-[#0a0a0a] text-white w-full">
              <PhoneCall size={14} className="mr-1" /> Créer ce numéro
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Achat d'un numéro dédié</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action achète un vrai numéro de téléphone via Limova/Twilio et facture <b>3600 crédits</b> de
                votre compte Limova. L'action n'est pas réversible. Confirmez-vous ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={register} disabled={registering} className="bg-[#0a0a0a] text-white hover:bg-[#1a1a1a]">
                {registering ? "Création..." : "Confirmer l'achat"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}

// Instagram/Facebook : Limova ne documente que la connexion OAuth pour ces deux
// réseaux, pas de publication via l'API (contrairement à LinkedIn) — cette carte
// sert donc juste à connecter les comptes en vue d'un usage futur.
function SocialConnectionsCard() {
  const [statuses, setStatuses] = useState({ instagram: null, facebook: null });
  const [connecting, setConnecting] = useState(null);

  const loadStatus = (network) => {
    api.get(`/limova/${network}/auth-status`)
      .then(({ data }) => setStatuses((s) => ({ ...s, [network]: data })))
      .catch(() => setStatuses((s) => ({ ...s, [network]: { connected: false } })));
  };
  useEffect(() => { loadStatus("instagram"); loadStatus("facebook"); }, []);

  const connect = async (network) => {
    setConnecting(network);
    try {
      const { data } = await api.post(`/limova/${network}/auth-initiate`);
      if (data?.url || data?.authUrl) {
        window.open(data.url || data.authUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.success("Connexion initiée — suivez les instructions Limova");
      }
      loadStatus(network);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de connexion");
    } finally {
      setConnecting(null);
    }
  };

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none">
      <div className="flex items-center gap-2 mb-1">
        <ShareNetwork size={20} className="text-[#d4af37]" weight="duotone" />
        <h3 className="font-display text-lg font-bold">Réseaux sociaux</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Connexion des comptes Instagram et Facebook via Limova. À ce jour, l'API Limova ne permet que la connexion
        (pas encore de publication automatique) — utile pour préparer l'intégration.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {["instagram", "facebook"].map((network) => (
          <div key={network} className="border border-gray-200 rounded-md p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium capitalize">{network}</p>
              <Badge className={statuses[network]?.connected ? "bg-green-100 text-green-700 hover:bg-green-100 mt-1" : "bg-gray-100 text-gray-500 hover:bg-gray-100 mt-1"}>
                {statuses[network]?.connected ? "Connecté" : "Non connecté"}
              </Badge>
            </div>
            <Button size="sm" variant="outline" disabled={connecting === network} onClick={() => connect(network)}>
              {connecting === network ? "..." : "Connecter"}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AgentStatusBadge({ configured, enabled }) {
  if (!configured) return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">Non configuré</Badge>;
  return enabled
    ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Actif</Badge>
    : <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">En pause</Badge>;
}

function PhoneAgentCard({ status, onToggle }) {
  const configured = !!status?.phone_agent_configured;
  const enabled = !!status?.phone_enabled;
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/limova/phone/stats").then(({ data }) => setStats(data)).catch(() => setStats(null));
  }, []);

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <PhoneCall size={20} className="text-[#0052CC]" weight="duotone" />
          <h3 className="font-display text-lg font-bold">Agent téléphonique</h3>
        </div>
        <AgentStatusBadge configured={configured} enabled={enabled} />
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Lance des campagnes d'appels automatisés vers vos leads (par intérêt), et laisse un employé qualifier le
        résultat de chaque appel (veut être rappelé, veut s'inscrire...).
      </p>
      <div className="flex items-center gap-2 mb-4">
        <Switch checked={enabled} disabled={!configured} onCheckedChange={onToggle} data-testid="phone-agent-toggle" />
        <label className="text-sm">{enabled ? "Activé" : "Désactivé"}</label>
      </div>
      {!configured && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
          Renseignez la clé API et l'ID de l'agent téléphonique dans Paramètres → Limova pour l'activer.
        </p>
      )}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatTile label="Campagnes lancées" value={stats.campaigns_launched} />
          <StatTile label="Appels qualifiés" value={stats.qualified_calls} />
          {stats.by_outcome.map((o) => (
            <StatTile key={o.outcome} label={o.label} value={o.count} small />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!configured || !enabled} className="bg-[#0a0a0a] text-white">
              <Phone size={14} className="mr-1" /> Lancer une campagne d'appels
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nouvelle campagne d'appels</DialogTitle></DialogHeader>
            <PhoneCampaignForm onDone={() => setCampaignOpen(false)} />
          </DialogContent>
        </Dialog>
        <Dialog open={callsOpen} onOpenChange={setCallsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!configured}>Voir les appels</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Appels récents</DialogTitle></DialogHeader>
            <PhoneCallsList />
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function StatTile({ label, value, small }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
      <p className={small ? "font-display text-lg font-bold" : "font-display text-2xl font-bold"}>{value ?? 0}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function PhoneCampaignForm({ onDone }) {
  const [name, setName] = useState("");
  const [interests, setInterests] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [count, setCount] = useState(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    api.get("/leads/interests").then(({ data }) => setInterests([...new Set(data)].sort())).catch(() => {});
  }, []);

  const interestIn = useMemo(() => Array.from(selected).join("|"), [selected]);

  useEffect(() => {
    const params = { has_phone: true, page_size: 1 };
    if (interestIn) params.interest_in = interestIn;
    api.get("/leads", { params }).then(({ data }) => setCount(data.total)).catch(() => setCount(null));
  }, [interestIn]);

  const toggleInterest = (label) =>
    setSelected((prev) => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });

  const launch = async () => {
    if (!name.trim()) return toast.error("Donnez un nom à cette campagne");
    setLaunching(true);
    try {
      const { data } = await api.post("/limova/phone/campaigns", {
        name: name.trim(), interest_in: interestIn || null,
      });
      toast.success(`Campagne lancée — ${data.targeted_count} lead(s) appelé(s)`);
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors du lancement");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
      <div>
        <label className="text-sm font-medium">Nom de la campagne</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Relance téléphonique VTC" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Cibler par intérêt (laisser vide = tous les leads avec téléphone)</label>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {interests.map((label) => (
            <label key={label} className="flex items-center gap-2 p-2 rounded-md border border-gray-200 hover:bg-gray-50 cursor-pointer text-sm">
              <Checkbox checked={selected.has(label)} onCheckedChange={() => toggleInterest(label)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-md p-3">
        <Phone size={16} /> {count === null ? "—" : `${count} lead(s) avec téléphone correspondant(s)`}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone} disabled={launching}>Annuler</Button>
        <Button onClick={launch} disabled={launching || !count} className="bg-[#d4af37] text-black hover:bg-[#b8941f]">
          {launching ? "Lancement..." : `Lancer (${count ?? 0})`}
        </Button>
      </div>
    </div>
  );
}

function PhoneCallsList() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/limova/phone/calls")
      .then(({ data }) => { setData(data); setError(null); })
      .catch((e) => setError(e.response?.data?.detail || "Erreur de chargement"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setOutcome = async (callId, outcome) => {
    try {
      await api.post(`/limova/phone/calls/${callId}/outcome`, { outcome });
      toast.success("Issue de l'appel enregistrée");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  if (loading) return <p className="text-sm text-gray-400 py-6 text-center">Chargement...</p>;
  if (error) return <p className="text-sm text-red-600 py-6 text-center">{error}</p>;
  if (!data?.calls?.length) return <p className="text-sm text-gray-400 py-6 text-center">Aucun appel pour le moment.</p>;

  return (
    <div className="space-y-2 mt-2">
      {data.calls.map((c) => (
        <div key={c.id} className="border border-gray-200 rounded-md p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{c.prospectName || c.to || c.phoneNumber || "Appel"}</p>
            <p className="text-xs text-gray-400">{c.createdAt ? new Date(c.createdAt).toLocaleString("fr-FR") : ""}</p>
            {c.outcome && <Badge className={`mt-1 text-xs ${OUTCOME_COLORS[c.outcome] || ""}`}>{c.outcome_label}</Badge>}
          </div>
          <Select value={c.outcome || ""} onValueChange={(v) => setOutcome(c.id, v)}>
            <SelectTrigger className="w-44 shrink-0"><SelectValue placeholder="Qualifier..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(data.outcome_options).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

function LinkedinAgentCard({ status, onToggle }) {
  const configured = !!status?.linkedin_agent_configured;
  const enabled = !!status?.linkedin_enabled;
  const [profileUrl, setProfileUrl] = useState("");
  const [message, setMessage] = useState("");
  const [connectionRequest, setConnectionRequest] = useState(true);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    api.get("/limova/linkedin/stats").then(({ data }) => setStats(data)).catch(() => setStats(null));
    api.get("/limova/linkedin/auth-status").then(({ data }) => setAuthStatus(data)).catch(() => setAuthStatus({ connected: false }));
  }, []);

  const connectLinkedin = async () => {
    setConnecting(true);
    try {
      const { data } = await api.post("/limova/linkedin/auth-initiate");
      if (data?.url || data?.authUrl) window.open(data.url || data.authUrl, "_blank", "noopener,noreferrer");
      api.get("/limova/linkedin/auth-status").then(({ data }) => setAuthStatus(data)).catch(() => {});
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur de connexion");
    } finally {
      setConnecting(false);
    }
  };

  const send = async () => {
    if (!profileUrl.trim() || !message.trim()) return toast.error("Profil LinkedIn et message requis");
    setSending(true);
    try {
      await api.post("/limova/linkedin/send", {
        profile_url: profileUrl.trim(), message: message.trim(), connection_request: connectionRequest,
      });
      toast.success("Envoyé sur LinkedIn");
      setProfileUrl(""); setMessage("");
      api.get("/limova/linkedin/stats").then(({ data }) => setStats(data)).catch(() => {});
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <LinkedinLogo size={20} className="text-[#0052CC]" weight="duotone" />
          <h3 className="font-display text-lg font-bold">Agent LinkedIn</h3>
        </div>
        <AgentStatusBadge configured={configured} enabled={enabled} />
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Envoie une demande de connexion ou un message personnalisé à un profil LinkedIn via l'agent Limova.
      </p>
      <div className="flex items-center gap-2 mb-4">
        <Switch checked={enabled} disabled={!configured} onCheckedChange={onToggle} data-testid="linkedin-agent-toggle" />
        <label className="text-sm">{enabled ? "Activé" : "Désactivé"}</label>
      </div>
      {!configured && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
          Renseignez la clé API et l'ID de l'agent marketing/LinkedIn dans Paramètres → Limova pour l'activer.
        </p>
      )}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatTile label="Demandes de connexion" value={stats.connection_requests} />
          <StatTile label="Messages envoyés" value={stats.messages} />
        </div>
      )}
      {configured && !authStatus?.connected && (
        <Button size="sm" variant="outline" onClick={connectLinkedin} disabled={connecting} className="mb-4 w-full">
          {connecting ? "..." : "Connecter le compte LinkedIn"}
        </Button>
      )}
      <div className="space-y-2">
        <Input value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="URL du profil LinkedIn" disabled={!configured || !enabled} />
        <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message personnalisé..." disabled={!configured || !enabled} />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={connectionRequest} onCheckedChange={setConnectionRequest} disabled={!configured || !enabled} />
          Demande de connexion (sinon, message direct)
        </label>
        <Button onClick={send} disabled={!configured || !enabled || sending} className="bg-[#0a0a0a] text-white w-full">
          {sending ? "Envoi..." : "Envoyer"}
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
