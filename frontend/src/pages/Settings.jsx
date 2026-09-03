import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CreditCard, EnvelopeSimple, Kanban, Plugs, ChartBar, MagnifyingGlass, Robot, Signature, UploadSimple, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Settings() {
  const [s, setS] = useState({});

  useEffect(() => { api.get("/settings").then((r) => setS(r.data || {})); }, []);

  const save = async () => {
    try {
      await api.put("/settings", s);
      toast.success("Paramètres enregistrés");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const update = (k, v) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <p className="overline">Intégrations & API</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Paramètres</h1>
        <p className="text-gray-500 mt-2">Configurez paiement, email, Trello, webhooks n8n, SEO & analytics.</p>
      </div>

      <Tabs defaultValue="email">
        <TabsList className="mb-4 flex-wrap" data-testid="settings-tabs">
          <TabsTrigger value="email" data-testid="tab-email"><EnvelopeSimple size={14} className="mr-1" /> Email</TabsTrigger>
          <TabsTrigger value="stripe" data-testid="tab-stripe"><CreditCard size={14} className="mr-1" /> Stripe</TabsTrigger>
          <TabsTrigger value="trello" data-testid="tab-trello"><Kanban size={14} className="mr-1" /> Trello</TabsTrigger>
          <TabsTrigger value="n8n" data-testid="tab-n8n"><Plugs size={14} className="mr-1" /> n8n</TabsTrigger>
          <TabsTrigger value="seo" data-testid="tab-seo"><MagnifyingGlass size={14} className="mr-1" /> SEO</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics"><ChartBar size={14} className="mr-1" /> Analytics</TabsTrigger>
          <TabsTrigger value="limova" data-testid="tab-limova"><Robot size={14} className="mr-1" /> Limova</TabsTrigger>
          <TabsTrigger value="attestations" data-testid="tab-attestations"><Signature size={14} className="mr-1" /> Attestations</TabsTrigger>
        </TabsList>

        <TabsContent value="email">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">Email transactionnel</h3>
            <p className="text-sm text-gray-500 mb-6">
              Resend recommandé (fiable, HTTPS) : le SMTP Gmail depuis un serveur cloud échoue parfois de façon aléatoire
              (IP partagée méfiante aux yeux de Gmail), même si les logs indiquent "envoyé".
            </p>
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="text-sm font-medium">Fournisseur principal</label>
                <Select value={s.email_provider || "mock"} onValueChange={(v) => update("email_provider", v)}>
                  <SelectTrigger data-testid="email-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mock">Mock (logs serveur)</SelectItem>
                    <SelectItem value="resend">Resend (recommandé)</SelectItem>
                    <SelectItem value="brevo">Brevo</SelectItem>
                    <SelectItem value="smtp">SMTP</SelectItem>
                    <SelectItem value="sendgrid">SendGrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field label="Email expéditeur" value={s.email_from} onChange={(v) => update("email_from", v)} testid="email-from" placeholder="noreply@tdlformation.fr" />

              {s.email_provider === "resend" && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-green-900" data-testid="resend-helper">
                  <b>✅ Resend :</b> créez un compte gratuit sur <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline">resend.com</a> (3000 emails/mois),
                  générez une clé API et collez-la ci-dessous.
                </div>
              )}
              {s.email_provider === "brevo" && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-green-900" data-testid="brevo-helper">
                  <b>✅ Brevo :</b> utilisez une clé <b>API v3</b> (commence par <code className="font-mono">xkeysib-</code>), générée
                  depuis <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noreferrer" className="underline">SMTP &amp; API → Clés API</a> —
                  pas une clé SMTP (<code className="font-mono">xsmtpsib-</code>), qui ne fonctionne pas avec l'API HTTP utilisée ici.
                  L'adresse expéditeur doit être un email vérifié dans Brevo (Expéditeurs &amp; IP).
                </div>
              )}
              {(s.email_provider === "resend" || s.email_provider === "sendgrid" || s.email_provider === "brevo") && (
                <Field
                  label="Clé API"
                  value={s.email_api_key}
                  onChange={(v) => update("email_api_key", v)}
                  testid="email-key"
                  type="password"
                  placeholder={s.email_provider === "resend" ? "re_..." : s.email_provider === "brevo" ? "xkeysib-..." : "SG.xxx"}
                />
              )}

              {(s.email_provider === "smtp" || s.email_provider === "resend") && (
                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <p className="text-sm font-semibold">
                    {s.email_provider === "resend" ? "SMTP (secours, optionnel)" : "SMTP (principal)"}
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900" data-testid="gmail-helper">
                    <b>📧 SMTP :</b> renseignez les identifiants fournis par votre hébergeur mail (ex: o2switch) ou, pour Gmail,
                    activez la <b>validation en 2 étapes</b> puis créez un <b>mot de passe d'application</b> sur
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline ml-1 text-[#d4af37] hover:text-[#b8941f]">myaccount.google.com/apppasswords</a>.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Hôte SMTP" value={s.smtp_host} onChange={(v) => update("smtp_host", v)} testid="smtp-host" placeholder="montage.o2switch.net" />
                    <Field label="Port" type="number" value={s.smtp_port || 587} onChange={(v) => update("smtp_port", +v)} testid="smtp-port" />
                  </div>
                  <Field label="Compte / utilisateur" value={s.smtp_user} onChange={(v) => update("smtp_user", v)} testid="smtp-user" placeholder="administration@tdl-formation.fr" />
                  <Field label="Mot de passe" type="password" value={s.smtp_password} onChange={(v) => update("smtp_password", v)} testid="smtp-password" />
                  <div className="flex items-center gap-2">
                    <Switch checked={s.smtp_tls !== false} onCheckedChange={(v) => update("smtp_tls", v)} data-testid="smtp-tls" />
                    <label className="text-sm">STARTTLS (décochez pour SSL direct, ex: port 465)</label>
                  </div>
                </div>
              )}

              {s.email_provider === "smtp" && (
                <div className="space-y-4 pt-4 border-t border-gray-200">
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900" data-testid="fallback-helper">
                    <b>🔁 Secours automatique :</b> si les 3 tentatives SMTP échouent, un email part automatiquement via
                    Brevo puis, à défaut, via Resend — renseignez au moins une des deux clés ci-dessous.
                  </div>
                  <Field
                    label="Clé API Brevo (secours si SMTP échoue, prioritaire)"
                    value={s.brevo_fallback_api_key}
                    onChange={(v) => update("brevo_fallback_api_key", v)}
                    testid="brevo-fallback-key"
                    type="password"
                    placeholder="xkeysib-..."
                  />
                  <Field
                    label="Clé API Resend (secours si SMTP et Brevo échouent)"
                    value={s.resend_fallback_api_key}
                    onChange={(v) => update("resend_fallback_api_key", v)}
                    testid="resend-fallback-key"
                    type="password"
                    placeholder="re_..."
                  />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="stripe">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">Paiements Stripe</h3>
            <p className="text-sm text-gray-500 mb-6">Clés depuis le dashboard Stripe (mode test ou production).</p>
            <div className="space-y-4 max-w-xl">
              <Field label="Publishable Key (pk_...)" value={s.stripe_public_key} onChange={(v) => update("stripe_public_key", v)} testid="stripe-pub" />
              <Field label="Secret Key (sk_...)" value={s.stripe_secret_key} onChange={(v) => update("stripe_secret_key", v)} testid="stripe-sec" type="password" placeholder="sk_... (laisser vide si déjà définie via STRIPE_SECRET_KEY sur le serveur)" />
              {s.stripe_secret_key && <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10">Configuré</Badge>}
              <Field label="Webhook Secret (whsec_...)" value={s.stripe_webhook_secret} onChange={(v) => update("stripe_webhook_secret", v)} testid="stripe-webhook-secret" type="password" placeholder="whsec_..." />
              <p className="text-xs text-gray-500">
                Créez un endpoint webhook dans Stripe (Développeurs → Webhooks) pointant vers
                <code className="font-mono bg-gray-100 px-1 mx-1">/api/payments/webhook</code>, écoutant l'événement
                <code className="font-mono bg-gray-100 px-1 mx-1">checkout.session.completed</code>, puis collez ici son
                secret de signature.
              </p>
            </div>
          </Card>

          <Card className="p-6 border border-gray-200 rounded-md shadow-none mt-4">
            <h3 className="font-display text-xl font-bold mb-1">Paiement des inscriptions</h3>
            <p className="text-sm text-gray-500 mb-4">
              Une fois activé, un bouton de paiement (comptant, 2x ou 3x) apparaît sur la page publique d'inscription
              pour les formations <b>non éligibles CPF</b>.
            </p>
            <PaymentsToggle />
          </Card>
        </TabsContent>

        <TabsContent value="trello">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">Trello — Kanban des dossiers</h3>
            <p className="text-sm text-gray-500 mb-6">Board créé automatiquement au 1er dossier. Pour utiliser un board existant, copiez son ID depuis l'URL : trello.com/b/<b>BOARD_ID</b>/...</p>
            <div className="space-y-4 max-w-xl">
              <Field label="Board ID Trello (auto)" value={s.trello_board_id} onChange={(v) => update("trello_board_id", v)} testid="trello-board" />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="n8n">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">n8n — Workflows externes</h3>
            <p className="text-sm text-gray-500 mb-6">URLs de webhooks n8n. POST JSON envoyé à chaque événement clé.</p>
            <div className="space-y-4 max-w-xl">
              <Field label="Webhook 'inscription'" value={s.n8n_webhook_inscription} onChange={(v) => update("n8n_webhook_inscription", v)} testid="n8n-insc" placeholder="https://localhost:5678/webhook/inscription" />
              <Field label="Webhook 'dossier' (changement de statut)" value={s.n8n_webhook_dossier} onChange={(v) => update("n8n_webhook_dossier", v)} testid="n8n-dos" />
              <Field label="Webhook 'payment' (commande/paiement)" value={s.n8n_webhook_payment} onChange={(v) => update("n8n_webhook_payment", v)} testid="n8n-pay" />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="seo">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">SEO & Sitemap</h3>
            <p className="text-sm text-gray-500 mb-6">Le sitemap.xml est généré dynamiquement à partir des formations et des articles publiés.</p>
            <div className="space-y-4 max-w-xl">
              <Field label="URL publique du site (sans / final)" value={s.public_base_url} onChange={(v) => update("public_base_url", v)} testid="public-url" placeholder="https://tdlformation.fr" />
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Sitemap XML (dynamique)</p>
                  <a href="/api/sitemap.xml" target="_blank" rel="noreferrer" className="text-sm text-[#d4af37] hover:underline" data-testid="sitemap-link">Ouvrir /api/sitemap.xml ↗</a>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">robots.txt</p>
                  <a href="/robots.txt" target="_blank" rel="noreferrer" className="text-sm text-[#d4af37] hover:underline">Ouvrir /robots.txt ↗</a>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-700">
                  <p className="font-semibold mb-1">Pour Google Search Console :</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Allez sur <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="text-[#d4af37] underline">search.google.com/search-console</a></li>
                    <li>Ajoutez votre propriété (URL ci-dessus)</li>
                    <li>Soumettez l'URL : <code className="font-mono bg-white px-1.5 rounded">/api/sitemap.xml</code></li>
                  </ol>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">Analytics & tracking</h3>
            <p className="text-sm text-gray-500 mb-6">Suivez le trafic sur les pages publiques (blog, landing). Les scripts ne se chargent que si l'ID est renseigné.</p>
            <div className="space-y-4 max-w-xl">
              <Field label="Google Analytics 4 — Measurement ID" value={s.google_analytics_id} onChange={(v) => update("google_analytics_id", v)} testid="ga-id" placeholder="G-XXXXXXXX" />
              <Field label="Plausible — domaine (RGPD friendly)" value={s.plausible_domain} onChange={(v) => update("plausible_domain", v)} testid="plausible-domain" placeholder="tdlformation.fr" />
              <p className="text-xs text-gray-500">💡 Plausible est privacy-friendly (chargé sans attendre de consentement). GA4 et Meta Pixel ne se chargent que si le visiteur a accepté via le bandeau cookies du site (mesure d'audience / publicité).</p>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-semibold mb-1">Meta (Facebook) Pixel</p>
                <p className="text-xs text-gray-500 mb-3">
                  Utilisé pour le suivi des campagnes Meta Ads : recherche, prise de rendez-vous, demande de rappel et
                  inscription sont déjà instrumentés côté site — ils s'activent automatiquement dès que l'ID est renseigné.
                </p>
                <Field label="Pixel ID" value={s.meta_pixel_id} onChange={(v) => update("meta_pixel_id", v)} testid="meta-pixel-id" placeholder="1234567890123456" />
                <div className="mt-3">
                  <Field
                    label="Token API de Conversion (optionnel, pour plus tard)"
                    value={s.meta_conversion_api_token}
                    onChange={(v) => update("meta_conversion_api_token", v)}
                    testid="meta-capi-token"
                    type="password"
                    placeholder="EAAG..."
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Pas encore utilisé — réservé au futur suivi côté serveur (plus fiable que le pixel seul, contourne les
                    bloqueurs de pub).
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="limova">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">Limova — Agents IA</h3>
            <p className="text-sm text-gray-500 mb-6">
              Créez vos agents (téléphonique, marketing/LinkedIn) depuis votre espace Limova, puis collez ici leur clé
              API et leurs identifiants. L'activation/désactivation et le lancement des campagnes se font ensuite
              depuis Marketing → Agents IA.
            </p>
            <div className="space-y-4 max-w-xl">
              <Field label="Clé API Limova" value={s.limova_api_key} onChange={(v) => update("limova_api_key", v)} testid="limova-api-key" type="password" placeholder="lmv_... (laisser vide si déjà définie via LIMOVA_API_KEY sur le serveur)" />
              {s.limova_api_key && <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10">Configuré</Badge>}
              <Field label="ID de l'agent téléphonique" value={s.limova_phone_agent_id} onChange={(v) => update("limova_phone_agent_id", v)} testid="limova-phone-agent" placeholder="agent-uuid" />
              <Field label="ID de l'agent marketing / LinkedIn" value={s.limova_marketing_agent_id} onChange={(v) => update("limova_marketing_agent_id", v)} testid="limova-marketing-agent" placeholder="agent-uuid" />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="attestations">
          <Card className="p-6 border border-gray-200 rounded-md shadow-none">
            <h3 className="font-display text-xl font-bold mb-1">Attestation de stage — récupération de points</h3>
            <p className="text-sm text-gray-500 mb-6">
              Identité du centre et signataires par défaut apposés sur l'attestation officielle de suivi de stage de
              sensibilisation à la sécurité routière. La signature de l'animateur BAFM vient de son propre espace
              (Espace animateur → Ma signature) — pas d'ici.
            </p>
            <div className="space-y-4 max-w-xl">
              <Field label="Nom du centre" value={s.attestation_centre_nom} onChange={(v) => update("attestation_centre_nom", v)} testid="attestation-centre-nom" placeholder="Top Drive Learning (TDL)" />
              <Field label="Adresse du centre" value={s.attestation_centre_adresse} onChange={(v) => update("attestation_centre_adresse", v)} testid="attestation-centre-adresse" placeholder="59 avenue Joffre" />
              <Field label="Ville du centre" value={s.attestation_centre_ville} onChange={(v) => update("attestation_centre_ville", v)} testid="attestation-centre-ville" placeholder="93800 Epinay-sur-seine" />
              <Field label="SIRET" value={s.attestation_centre_siret} onChange={(v) => update("attestation_centre_siret", v)} testid="attestation-centre-siret" />
              <Field label="Nom du directeur / responsable de formation" value={s.attestation_directeur_nom} onChange={(v) => update("attestation_directeur_nom", v)} testid="attestation-directeur-nom" />
              <Field label="Numéro d'agrément préfectoral" value={s.attestation_agrement_numero} onChange={(v) => update("attestation_agrement_numero", v)} testid="attestation-agrement" />
              <Field label="Nom du psychologue" value={s.attestation_psychologue_nom} onChange={(v) => update("attestation_psychologue_nom", v)} testid="attestation-psy-nom" />
              <Field label="Numéro d'agrément du psychologue" value={s.attestation_psychologue_numero} onChange={(v) => update("attestation_psychologue_numero", v)} testid="attestation-psy-numero" />
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 space-y-4 max-w-xl">
              <AttestationImageUpload
                label="Cachet du centre (case « Signature du directeur »)"
                endpoint="/settings/attestation-cachet"
                testid="attestation-cachet"
              />
              <AttestationImageUpload
                label="Signature du psychologue"
                endpoint="/settings/attestation-psychologue-signature"
                testid="attestation-psy-signature"
              />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={save} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="settings-save">
          Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
}

function PaymentsToggle() {
  const [status, setStatus] = useState(null);

  const load = () => api.get("/payments/status").then((r) => setStatus(r.data)).catch(() => setStatus(null));
  useEffect(() => { load(); }, []);

  const toggle = async (enabled) => {
    try {
      const { data } = await api.put("/payments/toggle", { enabled });
      setStatus(data);
      toast.success(enabled ? "Paiement en ligne activé" : "Paiement en ligne désactivé");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  if (!status) return <p className="text-sm text-gray-400">Chargement...</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Switch checked={status.enabled} disabled={!status.configured} onCheckedChange={toggle} data-testid="payments-toggle" />
        <label className="text-sm">{status.enabled ? "Activé" : "Désactivé"}</label>
      </div>
      {!status.configured && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Renseignez la clé secrète Stripe ci-dessus (ou STRIPE_SECRET_KEY sur le serveur) pour pouvoir activer.
        </p>
      )}
    </div>
  );
}

function AttestationImageUpload({ label, endpoint, testid }) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(endpoint, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Image enregistrée");
      setUploaded(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
          <UploadSimple size={14} /> {uploading ? "Envoi..." : "Choisir une image"}
          <input type="file" accept="image/*" className="hidden" onChange={upload} data-testid={testid} />
        </label>
        {uploaded && <span className="text-xs text-[#0B7238] flex items-center gap-1"><CheckCircle size={14} weight="fill" /> Enregistrée</span>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", testid, placeholder }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      {type === "password" ? (
        <PasswordInput value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testid} />
      ) : (
        <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testid} />
      )}
    </div>
  );
}
