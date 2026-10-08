// Regroupement des intérêts par mots-clés — le texte libre saisi/importé
// varie beaucoup (casse, mots en plus, accents…) : deux leads "VTC" et
// "Formation VTC complète" doivent finir dans le même groupe. Partagé entre
// Leads.jsx (Prospects) et Marketing.jsx (Prospects Cosmosia/Meta) pour que
// les onglets de formation restent cohérents partout.
export const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export const INTEREST_GROUPS = [
  { label: "Passerelle VTC", test: (s) => s.includes("passerelle") && s.includes("vtc") },
  { label: "Passerelle Taxi", test: (s) => s.includes("passerelle") && s.includes("taxi") },
  { label: "Passerelle", test: (s) => s.includes("passerelle") },
  { label: "Mobilité Taxi", test: (s) => s.includes("mobilit") && s.includes("taxi") },
  { label: "Mobilité", test: (s) => s.includes("mobilit") },
  { label: "Récupération points de permis", test: (s) => (s.includes("recuperation") || s.includes("rattrapage")) && s.includes("permis") },
  { label: "Permis B", test: (s) => s.includes("permis b") },
  { label: "VTC", test: (s) => s.includes("vtc") },
  { label: "Taxi", test: (s) => s.includes("taxi") },
  { label: "CACES", test: (s) => s.includes("caces") },
  { label: "SSIAP", test: (s) => s.includes("ssiap") },
  { label: "CRM", test: (s) => s.includes("crm") },
  { label: "Stage", test: (s) => s.includes("stage") },
];

export const canonicalizeInterest = (raw) => {
  if (!raw || !raw.trim()) return "Inconnus";
  const s = stripAccents(raw.trim().toLowerCase());
  const group = INTEREST_GROUPS.find((g) => g.test(s));
  return group ? group.label : "Inconnus";
};
