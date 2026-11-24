import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateFR, formatDateTimeFR } from "@/lib/dateFormat";

// Suivi précis de chaque prospect (demande du 2026-11-24) : colonne
// « Traité par » = dernière personne qui a traité le prospect, quand, et
// combien de contacts / de notes. Un clic ouvre l'historique numéroté :
// 1er contact par X le..., 2e contact par Y le... (backend :
// services/suivi_prospects.py, à partir du journal d'activité).

const ordinal = (n) => (n === 1 ? "1er" : `${n}e`);

export function TraiteParCell({ lead, fallbackName }) {
  const [open, setOpen] = useState(false);
  const s = lead?.suivi;
  if (!s) {
    return fallbackName
      ? <span className="text-xs text-gray-600">{fallbackName}</span>
      : <span className="text-xs text-gray-300">Jamais traité</span>;
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-left group" data-testid={`traite-par-${lead.id}`}
        title="Voir l'historique des contacts">
        <p className="text-xs font-medium text-gray-800 group-hover:underline">{s.traite_par_name || "—"}</p>
        <p className="text-[11px] text-gray-400 whitespace-nowrap">{s.traite_le ? formatDateTimeFR(s.traite_le) : ""}</p>
        <p className="text-[11px] text-[#0052CC] whitespace-nowrap">
          {s.nb_contacts} contact{s.nb_contacts > 1 ? "s" : ""} · {s.nb_notes} note{s.nb_notes > 1 ? "s" : ""}
        </p>
      </button>
      {open && <SuiviProspectDialog lead={lead} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SuiviProspectDialog({ lead, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/leads/${lead.id}/suivi`).then((r) => setData(r.data)).catch(() => setData({ contacts: [] }));
  }, [lead.id]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto" data-testid="suivi-prospect-dialog">
        <DialogHeader><DialogTitle className="font-display">Suivi — {lead.name || lead.email || lead.phone}</DialogTitle></DialogHeader>
        {!data ? <p className="text-sm text-gray-400">Chargement...</p> : !data.contacts.length ? (
          <p className="text-sm text-gray-400">Aucun traitement enregistré pour ce prospect.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              {data.nb_contacts} contact{data.nb_contacts > 1 ? "s" : ""} · {data.nb_traitements} action{data.nb_traitements > 1 ? "s" : ""}
              {" "}(un contact = une personne, un jour)
            </p>
            <div className="space-y-3">
              {data.contacts.map((c) => (
                <div key={`${c.numero}`} className="border-l-2 border-[#d4af37] pl-3">
                  <p className="text-sm">
                    <span className="font-semibold">{ordinal(c.numero)} contact</span>
                    {" "}par <span className="font-medium">{c.by_name || "—"}</span>
                    <span className="text-gray-400"> · {formatDateFR(c.jour)}</span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {c.actions.map((a, i) => (
                      <li key={`${a.at}-${i}`} className="text-xs text-gray-600">
                        <span className="text-gray-400 font-mono">{formatDateTimeFR(a.at).split(" ").pop()}</span>{" "}
                        <span className="font-medium">{a.label}</span>{a.detail ? ` : ${a.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
