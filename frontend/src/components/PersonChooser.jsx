import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass, UserPlus } from "@phosphor-icons/react";

// Choix de la personne d'un rendez-vous ou d'un rappel : recherche dans le
// CRM (prospects, inscrits, apprenants) OU saisie d'une nouvelle personne qui
// n'est pas encore dans le CRM (demande du 2026-11-24, priorité 1) — le
// serveur crée alors sa fiche prospect, ou retrouve celle qui a le même
// téléphone ou le même email.

export const EMPTY_CONTACT = { prenom: "", nom: "", telephone: "", email: "" };

export const contactValide = (c) => !!(c.prenom.trim() && (c.telephone.trim() || c.email.trim()));

const PERSON_TYPES = {
  inscrit: ["Inscrit", "bg-green-50 text-green-700 border-green-200"],
  apprenant: ["Apprenant", "bg-blue-50 text-blue-700 border-blue-200"],
  prospect: ["Prospect", "bg-gray-50 text-gray-500 border-gray-200"],
};

export function PersonBadge({ type }) {
  const t = PERSON_TYPES[type];
  if (!t) return null;
  return <span className={`ml-1 text-[10px] font-normal border rounded px-1.5 py-0.5 ${t[1]}`}>{t[0]}</span>;
}

export default function PersonChooser({ lead, setLead, mode, setMode, contact, setContact, testid = "person" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (mode !== "recherche" || !query.trim()) { setResults([]); return undefined; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get("/call-center/people", { params: { q: query.trim() } })
        .then((r) => setResults(r.data || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, mode]);

  const set = (k) => (e) => setContact({ ...contact, [k]: e.target.value });

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Personne</label>
        <div className="flex text-xs border border-gray-200 rounded-md overflow-hidden">
          <button type="button" onClick={() => setMode("recherche")}
            className={`px-2 py-1 ${mode === "recherche" ? "bg-[#0a0a0a] text-white" : "text-gray-600 hover:bg-gray-50"}`}
            data-testid={`${testid}-mode-recherche`}>
            Déjà dans le CRM
          </button>
          <button type="button" onClick={() => { setMode("nouveau"); setLead(null); }}
            className={`px-2 py-1 flex items-center gap-1 ${mode === "nouveau" ? "bg-[#0a0a0a] text-white" : "text-gray-600 hover:bg-gray-50"}`}
            data-testid={`${testid}-mode-nouveau`}>
            <UserPlus size={12} /> Nouvelle personne
          </button>
        </div>
      </div>

      {mode === "nouveau" ? (
        <div className="grid grid-cols-2 gap-2 mt-2" data-testid={`${testid}-nouveau`}>
          <Input placeholder="Prénom *" value={contact.prenom} onChange={set("prenom")} data-testid={`${testid}-prenom`} />
          <Input placeholder="Nom" value={contact.nom} onChange={set("nom")} data-testid={`${testid}-nom`} />
          <Input placeholder="Téléphone *" value={contact.telephone} onChange={set("telephone")} data-testid={`${testid}-telephone`} />
          <Input placeholder="Email" type="email" value={contact.email} onChange={set("email")} data-testid={`${testid}-email`} />
          <p className="col-span-2 text-[11px] text-gray-400">
            Téléphone ou email obligatoire. La fiche prospect est créée automatiquement (ou retrouvée si la personne existe déjà).
          </p>
        </div>
      ) : lead ? (
        <div className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2 mt-1">
          <div className="text-sm">
            <p className="font-medium">{lead.name || lead.full_name} <PersonBadge type={lead.type} /></p>
            <p className="text-xs text-gray-400">{lead.phone || lead.email}{lead.formation ? ` · ${lead.formation}` : ""}</p>
          </div>
          <button type="button" className="text-xs text-gray-400 hover:text-red-600 underline" onClick={() => setLead(null)}>Changer</button>
        </div>
      ) : (
        <div className="relative mt-1">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input
            className="pl-8" placeholder="Rechercher (nom, email, téléphone)..."
            value={query} onChange={(e) => setQuery(e.target.value)} data-testid={`${testid}-search`}
          />
          {query.trim() && (
            <div className="mt-1 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
              {searching ? (
                <p className="text-xs text-gray-400 px-3 py-2">Recherche...</p>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">
                  {query.trim().length < 2 ? "Tapez au moins 2 caractères" : (
                    <>
                      Personne trouvée.{" "}
                      <button type="button" className="text-[#0052CC] underline" onClick={() => {
                        const q = query.trim();
                        const isPhone = /^[+\d][\d\s.]{5,}$/.test(q);
                        const isEmail = q.includes("@");
                        const [prenom, ...nom] = q.split(" ");
                        setContact({
                          ...EMPTY_CONTACT,
                          prenom: isPhone || isEmail ? "" : prenom, nom: isPhone || isEmail ? "" : nom.join(" "),
                          telephone: isPhone ? q : "", email: isEmail ? q : "",
                        });
                        setMode("nouveau");
                      }}>Saisir une nouvelle personne</button>
                    </>
                  )}
                </div>
              ) : results.map((l) => (
                <button
                  key={l.id} type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  onClick={() => { setLead(l); setQuery(""); setResults([]); }}
                >
                  <p className="font-medium">{l.name || l.full_name} <PersonBadge type={l.type} /></p>
                  <p className="text-xs text-gray-400">{l.phone || l.email}{l.formation ? ` · ${l.formation}` : ""}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
