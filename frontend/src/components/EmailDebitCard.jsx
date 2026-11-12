import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDateTimeFR } from "@/lib/dateFormat";
import { toast } from "sonner";

// Débit d'envoi des emails (demande du 2026-11-12) — Paramètres → Email.
// Réglages enregistrés avec le bouton général des Paramètres (champs de
// settings.global) ; chiffres en direct et file des campagnes via
// GET /email/debit. Règles : backend services/email_rate.py et
// services/email_campaigns.py.

const STATUT_STYLE = {
  en_cours: "bg-blue-100 text-blue-700",
  en_pause: "bg-amber-100 text-amber-800",
  terminee: "bg-green-100 text-green-700",
  annulee: "bg-gray-100 text-gray-500",
};

function Jauge({ label, value, max, hint }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = pct >= 90 ? "#dc2626" : pct >= 70 ? "#f59e0b" : "#16a34a";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="font-mono">{value} / {max}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function EmailDebitCard({ settings, update }) {
  const [debit, setDebit] = useState(null);

  const load = () => api.get("/email/debit").then((r) => setDebit(r.data)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const act = async (c, action) => {
    if (action === "annuler" && !window.confirm(`Annuler la campagne « ${c.label} » ? Les emails déjà partis ne sont pas rappelés.`)) return;
    try {
      await api.post(`/email/campagnes/${c.id}/${action}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action impossible");
    }
  };

  const rate = Number(settings.smtp_rate_per_minute ?? 28);
  const reserve = Number(settings.smtp_reserve_transactional ?? 10);
  const hourly = Number(settings.marketing_per_hour ?? 300);
  const marketingMinute = Math.max(Math.min(rate, 28) - reserve, 1);

  return (
    <Card className="p-6 border border-gray-200 rounded-md shadow-none mt-4" data-testid="email-debit-card">
      <h3 className="font-display text-xl font-bold mb-1">Débit d'envoi</h3>
      <p className="text-sm text-gray-500 mb-4">
        o2switch autorise <b>30 emails par minute pour tout le domaine</b> tdl-formation.fr (toutes boîtes confondues) et
        suspend le domaine en cas de dépassement. Les envois sont donc étalés, et une part est réservée aux emails
        importants (convocations, RDV, paiements, notifications de l'équipe) pour qu'ils ne fassent jamais la queue
        derrière une relance ou une campagne.
      </p>

      <div className="grid sm:grid-cols-3 gap-3 max-w-3xl">
        <label className="text-sm">
          <span className="font-medium">Emails par minute</span>
          <Input type="number" min={1} max={28} value={settings.smtp_rate_per_minute ?? 28}
            onChange={(e) => update("smtp_rate_per_minute", e.target.value === "" ? null : Number(e.target.value))} />
          <span className="text-[11px] text-gray-400">28 au maximum (limite o2switch : 30)</span>
        </label>
        <label className="text-sm">
          <span className="font-medium">Réservés aux emails importants</span>
          <Input type="number" min={0} max={27} value={settings.smtp_reserve_transactional ?? 10}
            onChange={(e) => update("smtp_reserve_transactional", e.target.value === "" ? null : Number(e.target.value))} />
          <span className="text-[11px] text-gray-400">Le marketing a donc au plus {marketingMinute} emails/minute</span>
        </label>
        <label className="text-sm">
          <span className="font-medium">Marketing par heure</span>
          <Input type="number" min={0} value={settings.marketing_per_hour ?? 300}
            onChange={(e) => update("marketing_per_hour", e.target.value === "" ? null : Number(e.target.value))} />
          <span className="text-[11px] text-gray-400">Relances automatiques et campagnes, partagé ; 0 = tout bloquer</span>
        </label>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Avec ces réglages : au plus {hourly} emails marketing par heure, soit environ {hourly * 24} par jour si une campagne tourne en continu.
        Pensez à cliquer sur « Enregistrer » en bas de page.
      </p>

      {debit && (
        <div className="mt-6 space-y-4">
          <p className="text-sm font-semibold">En ce moment <span className="text-xs font-normal text-gray-400">(actualisé toutes les 30 s)</span></p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Jauge label="Dernière minute (tous emails)" value={debit.derniere_minute} max={debit.par_minute}
              hint={`dont ${debit.derniere_minute_marketing} marketing (max ${debit.marketing_par_minute})`} />
            <Jauge label="Marketing — dernière heure" value={debit.derniere_heure_marketing} max={debit.marketing_par_heure}
              hint={`${debit.quota_marketing_restant} encore possible(s) cette heure-ci`} />
            <div className="text-xs text-gray-600 space-y-1">
              <p><b>{debit.derniere_heure}</b> email(s) sur la dernière heure</p>
              <p><b>{debit.dernieres_24h}</b> sur 24 h, dont {debit.dernieres_24h_marketing} marketing</p>
              <p>
                Relances automatiques actives : <b>{debit.relances_auto_actives}</b>
                {debit.relances_auto_actives === 0 && " (toutes en pause)"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Campagnes</p>
            {!debit.campagnes.length && <p className="text-xs text-gray-400">Aucune campagne. Elles se lancent depuis Leads → « Campagne email ».</p>}
            <div className="space-y-2">
              {debit.campagnes.map((c) => {
                const pct = c.total ? Math.round(((c.sent + c.failed) / c.total) * 100) : 100;
                return (
                  <div key={c.id} className="border border-gray-200 rounded-md p-3" data-testid={`campagne-${c.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.label}</p>
                        <p className="text-[11px] text-gray-400">
                          {c.type === "flash" ? "Offre flash" : "Campagne prospects"} · lancée le {formatDateTimeFR(c.created_at)}
                          {c.created_by_name ? ` par ${c.created_by_name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${STATUT_STYLE[c.status] || "bg-gray-100"} hover:${STATUT_STYLE[c.status] || ""}`}>{c.statut_label}</Badge>
                        {c.status === "en_cours" && <Button size="sm" variant="outline" onClick={() => act(c, "pause")}>Pause</Button>}
                        {c.status === "en_pause" && <Button size="sm" variant="outline" onClick={() => act(c, "reprendre")}>Reprendre</Button>}
                        {["en_cours", "en_pause"].includes(c.status) && (
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => act(c, "annuler")}>Annuler</Button>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2">
                      <div className="h-full bg-[#d4af37]" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {c.sent} envoyé(s){c.failed ? ` · ${c.failed} échec(s)` : ""} sur {c.total}
                      {c.status === "en_cours" && debit.marketing_par_heure > 0 && c.total - c.sent - c.failed > 0 &&
                        ` · fin estimée dans ~${Math.ceil((c.total - c.sent - c.failed) / debit.marketing_par_heure)} h`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
