import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateFR, formatDateTimeFR } from "@/lib/dateFormat";
import { Trophy, CaretDown, CaretRight, ArrowsLeftRight, CheckCircle } from "@phosphor-icons/react";

// Onglet « Suivi de l'équipe » de la page Prospects, réservé aux
// responsables (demande du 2026-11-24) :
// - classement des employés par prospects traités, par jour et sur la
//   période (notes, qualifications, RDV placés, rappels) ;
// - rapprochement des prospects Meta avec les inscriptions faites sur place
//   (ou par un autre canal), pour corriger la vraie origine.

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const PERIODES = [
  ["Aujourd'hui", () => [new Date(), new Date()]],
  ["Hier", () => { const d = new Date(); d.setDate(d.getDate() - 1); return [d, d]; }],
  ["7 derniers jours", () => { const d = new Date(); d.setDate(d.getDate() - 6); return [d, new Date()]; }],
  ["Ce mois-ci", () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), d]; }],
];
const MEDAILLES = ["🥇", "🥈", "🥉"];

export default function SuiviEquipe() {
  const [from, setFrom] = useState(iso(new Date()));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState(null);
  const [ouvert, setOuvert] = useState(null);

  useEffect(() => {
    setData(null);
    api.get("/leads/suivi-equipe", { params: { date_from: from, date_to: to } })
      .then((r) => setData(r.data))
      .catch((e) => { toast.error(e.response?.data?.detail || "Classement non chargé"); setData({ classement: [] }); });
  }, [from, to]);

  const total = (k) => (data?.classement || []).reduce((s, u) => s + (u[k] || 0), 0);

  return (
    <div className="space-y-6" data-testid="suivi-equipe">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">Du
          <Input type="date" className="w-40 h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-gray-600">Au
          <Input type="date" className="w-40 h-9" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        {PERIODES.map(([label, fn]) => (
          <Button key={label} size="sm" variant="outline" onClick={() => { const [a, b] = fn(); setFrom(iso(a)); setTo(iso(b)); }}>
            {label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[["Prospects traités", "leads_traites"], ["Notes", "notes"], ["Qualifications", "qualifications"], ["RDV placés", "rdv"], ["Rappels", "rappels"]].map(([label, k]) => (
          <Card key={k} className="p-3 border border-gray-200 shadow-none">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-2xl font-bold">{data ? total(k) : "…"}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <Trophy size={18} className="text-[#d4af37]" />
          <h3 className="font-semibold">Classement des traitements de prospects</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="suivi-equipe-classement">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-2.5 px-4 overline">Rang</th>
                <th className="py-2.5 px-4 overline">Employé</th>
                <th className="py-2.5 px-4 overline text-right" title="Prospects distincts traités, jour par jour">Prospects traités</th>
                <th className="py-2.5 px-4 overline text-right">Moyenne / jour</th>
                <th className="py-2.5 px-4 overline text-right">Notes</th>
                <th className="py-2.5 px-4 overline text-right">Qualifications</th>
                <th className="py-2.5 px-4 overline text-right">RDV placés</th>
                <th className="py-2.5 px-4 overline text-right">Rappels</th>
                <th className="py-2.5 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!data && <tr><td colSpan="9" className="py-8 text-center text-gray-400">Chargement...</td></tr>}
              {data && !data.classement.length && (
                <tr><td colSpan="9" className="py-8 text-center text-gray-400">Aucun traitement de prospect sur cette période.</td></tr>
              )}
              {(data?.classement || []).map((u) => {
                const key = u.user_id || u.user_name;
                const isOpen = ouvert === key;
                return (
                  <Fragment key={key}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOuvert(isOpen ? null : key)}>
                      <td className="py-2.5 px-4 font-semibold">{MEDAILLES[u.rang - 1] || u.rang}</td>
                      <td className="py-2.5 px-4 font-medium">
                        <span className="inline-flex items-center gap-1">
                          {u.par_jour.length > 1 && (isOpen ? <CaretDown size={12} /> : <CaretRight size={12} />)}
                          {u.user_name || "—"}
                        </span>
                        <p className="text-[11px] text-gray-400">{u.jours_actifs} jour{u.jours_actifs > 1 ? "s" : ""} actif{u.jours_actifs > 1 ? "s" : ""}</p>
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold">{u.leads_traites}</td>
                      <td className="py-2.5 px-4 text-right">{u.moyenne_par_jour}</td>
                      <td className="py-2.5 px-4 text-right">{u.notes}</td>
                      <td className="py-2.5 px-4 text-right">{u.qualifications}</td>
                      <td className="py-2.5 px-4 text-right">{u.rdv}</td>
                      <td className="py-2.5 px-4 text-right">{u.rappels}</td>
                      <td className="py-2.5 px-4 text-right text-gray-500">{u.actions}</td>
                    </tr>
                    {isOpen && u.par_jour.map((d) => (
                      <tr key={`${key}-${d.jour}`} className="bg-gray-50/60 border-b border-gray-100 text-xs">
                        <td />
                        <td className="py-1.5 px-4 text-gray-500">{formatDateFR(d.jour)}</td>
                        <td className="py-1.5 px-4 text-right font-medium">{d.leads_traites}</td>
                        <td />
                        <td className="py-1.5 px-4 text-right">{d.notes}</td>
                        <td colSpan="3" />
                        <td className="py-1.5 px-4 text-right text-gray-500">{d.actions}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-100">
          Un prospect traité = un prospect sur lequel l'employé a fait au moins une action ce jour-là (note, qualification,
          appel, RDV, rappel, lien de paiement...). Cliquez sur une ligne pour le détail par jour.
        </p>
      </Card>

      <RapprochementMeta />
    </div>
  );
}

function RapprochementMeta() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const analyser = () => {
    setLoading(true);
    api.get("/leads/rapprochement-meta")
      .then((r) => setData(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || "Analyse impossible"))
      .finally(() => setLoading(false));
  };

  const appliquer = async () => {
    if (!window.confirm(`Corriger l'origine de ${data.a_corriger.length} inscription(s) (Pub Meta) et passer les prospects Meta correspondants en « Inscrit » ?`)) return;
    setApplying(true);
    try {
      const { data: r } = await api.post("/leads/rapprochement-meta");
      toast.success(`${r.corrigees} inscription(s) rattachée(s) à leur prospect Meta`);
      analyser();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Correction impossible");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="border border-gray-200 rounded-md shadow-none" data-testid="rapprochement-meta">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowsLeftRight size={18} className="text-indigo-600" />
          <div>
            <h3 className="font-semibold">Prospects Meta inscrits sur place : vraie origine</h3>
            <p className="text-xs text-gray-500">
              Compare les inscriptions (sur place, site, import) aux prospects Meta, par email puis par téléphone.
              Les nouvelles inscriptions sont rattachées automatiquement.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={analyser} disabled={loading} data-testid="rapprochement-analyser">
            {loading ? "Analyse..." : data ? "Relancer l'analyse" : "Analyser"}
          </Button>
          {data?.a_corriger?.length > 0 && (
            <Button size="sm" onClick={appliquer} disabled={applying} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="rapprochement-appliquer">
              {applying ? "..." : `Corriger ${data.a_corriger.length} origine(s)`}
            </Button>
          )}
        </div>
      </div>
      {data && (
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            {data.a_corriger.length} inscription(s) à rattacher à un prospect Meta
            {data.sur_place ? <> dont <b>{data.sur_place} saisie(s) sur place</b></> : null}
            {" "}· {data.deja_rapproches} déjà rattachée(s) · {data.inscriptions} inscriptions comparées.
          </p>
          {!data.a_corriger.length ? (
            <p className="text-sm text-[#0B7238] flex items-center gap-1"><CheckCircle size={16} weight="fill" /> Toutes les origines sont à jour.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="py-2 px-3">Inscrit</th>
                    <th className="py-2 px-3">Formation</th>
                    <th className="py-2 px-3">Inscrit le / par</th>
                    <th className="py-2 px-3">Origine enregistrée</th>
                    <th className="py-2 px-3">Prospect Meta</th>
                    <th className="py-2 px-3">Trouvé par</th>
                  </tr>
                </thead>
                <tbody>
                  {data.a_corriger.map((x) => (
                    <tr key={x.inscription_id} className="border-t border-gray-100">
                      <td className="py-1.5 px-3 font-medium">{x.student_name}</td>
                      <td className="py-1.5 px-3">{x.formation_title}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">{formatDateFR(x.inscrit_le)}{x.inscrit_par ? ` · ${x.inscrit_par}` : ""}</td>
                      <td className="py-1.5 px-3">
                        <Badge variant="outline" className={x.sur_place ? "bg-purple-50 text-purple-700 border-purple-200" : ""}>{x.origine_declaree}</Badge>
                      </td>
                      <td className="py-1.5 px-3">
                        {x.meta_name}<span className="text-gray-400"> · {formatDateTimeFR(x.meta_le)}</span>
                        {x.meta_campagne && <p className="text-gray-400">{x.meta_campagne}</p>}
                      </td>
                      <td className="py-1.5 px-3">{x.par}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
