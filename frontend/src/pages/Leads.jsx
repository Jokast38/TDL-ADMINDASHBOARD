import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Plus, UploadSimple, FileXls, FileCode, MagnifyingGlass, Trash, Phone,
  EnvelopeSimple, PaperPlaneTilt, Warning, X, UsersThree, PencilSimple, GraduationCap,
  EnvelopeOpen, Eye,
} from "@phosphor-icons/react";
import { toast } from "sonner";

// ─── Regroupement des intérêts par mots-clés ─────────────────────────────────
// Le texte libre saisi/importé varie beaucoup (casse, mots en plus, accents…) :
// deux leads "VTC" et "Formation VTC complète" doivent finir dans le même
// groupe de filtre. On classe donc par mot-clé plutôt que par égalité stricte,
// et tout ce qui ne correspond à aucun mot-clé connu tombe dans "Inconnus".
const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const INTEREST_GROUPS = [
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

const canonicalizeInterest = (raw) => {
  if (!raw || !raw.trim()) return "Inconnus";
  const s = stripAccents(raw.trim().toLowerCase());
  const group = INTEREST_GROUPS.find((g) => g.test(s));
  return group ? group.label : "Inconnus";
};

// ─── Statuts ──────────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  nouveau:       "Nouveau",
  contacte:      "Contacté",
  interesse:     "Intéressé",
  pas_interesse: "Pas intéressé",
  a_relancer:    "À relancer",
};
const STATUS_COLOR = {
  nouveau:       "bg-gray-100 text-gray-600",
  contacte:      "bg-blue-100 text-blue-700",
  interesse:     "bg-green-100 text-green-700",
  pas_interesse: "bg-red-100 text-red-700",
  a_relancer:    "bg-amber-100 text-amber-700",
};

// ─── URLs TDL ─────────────────────────────────────────────────────────────────
const TDL_PHONE   = "01 80 90 72 49";
const TDL_SITE    = "https://tdl-formation.fr";
const TDL_CONTACT = "https://tdl-formation.fr/contact/";
const TDL_VTC     = "https://tdl-formation.fr/formation-continue-vtc/";
const TDL_LANDING_FIDELITE = "https://tdl-admindashboard.vercel.app/offre-fidelite";

// ─── Briques HTML emails ──────────────────────────────────────────────────────
const EMAIL_HEADER = `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
      <tr>
        <td align="center" style="background-color:#0a0a0a;padding:28px 24px;">
          <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" width="60" height="60" style="display:block;border-radius:8px;margin:0 auto 12px;" />
          <p style="margin:0;color:#d4af37;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">TDL Formation</p>
          <p style="margin:6px 0 0 0;color:#ffffff;font-size:12px;">TOP DRIVE LEARNING</p>
        </td>
      </tr>
      <tr><td style="height:4px;background-color:#d4af37;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 36px 8px 36px;">`;

const EMAIL_CTA = (label, url = TDL_SITE) => `
      </td></tr>
      <tr>
        <td align="center" style="padding:8px 36px 36px 36px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:6px;background-color:#d4af37;">
              <a href="${url}" target="_blank"
                 style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:bold;color:#0a0a0a;text-decoration:none;border-radius:6px;letter-spacing:0.3px;">
                ${label}
              </a>
            </td>
          </tr></table>
        </td>
      </tr>`;

const EMAIL_CONTACT_BAR = `
      <tr>
        <td style="padding:0 36px 32px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;border-radius:6px;border-left:3px solid #d4af37;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#555555;">Vous préférez nous appeler directement ?</p>
              <p style="margin:4px 0 0 0;font-size:16px;font-weight:bold;color:#0a0a0a;">${TDL_PHONE}</p>
              <p style="margin:2px 0 0 0;font-size:11px;color:#999999;">Du lundi au vendredi, 9h – 18h</p>
            </td></tr>
          </table>
        </td>
      </tr>`;

const EMAIL_FOOTER = `
      <tr><td style="padding:0 36px;"><hr style="border:none;border-top:1px solid #eeeeee;" /></td></tr>
      <tr>
        <td style="padding:20px 36px 28px 36px;">
          <p style="margin:0;font-size:14px;color:#333333;">Cordialement,</p>
          <p style="margin:4px 0 0 0;font-size:14px;font-weight:bold;color:#0a0a0a;">L'équipe TDL Formation</p>
        </td>
      </tr>
      <tr>
        <td align="center" style="background-color:#0a0a0a;padding:20px 24px;">
          <p style="margin:0;font-size:11px;color:#888888;">TOP DRIVE LEARNING · 59 avenue Joffre, 93800 Épinay-sur-Seine</p>
          <p style="margin:6px 0 2px 0;font-size:11px;color:#888888;">${TDL_PHONE}</p>
          <p style="margin:0;font-size:11px;"><a href="${TDL_SITE}" style="color:#d4af37;text-decoration:none;">tdl-formation.fr</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;

const makeEmail = (body, ctaLabel, ctaUrl = TDL_SITE) =>
  EMAIL_HEADER + body + EMAIL_CTA(ctaLabel, ctaUrl) + EMAIL_CONTACT_BAR + EMAIL_FOOTER;

// ─── Templates de relance ─────────────────────────────────────────────────────
const TEMPLATES = {
  vtc_renouvellement: {
    label: "🚗 Renouvellement carte VTC",
    subject: "Renouvelez votre carte professionnelle VTC avec TDL Formation",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Votre carte professionnelle <b>VTC</b> arrive bientôt à échéance. Sans renouvellement,
         vous ne pourrez plus exercer votre activité.
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         TDL Formation vous propose une <b>formation de renouvellement rapide</b>, disponible
         en journée ou en soirée, dans nos centres d'Épinay-sur-Seine et Montataire.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Contactez-nous dès maintenant pour réserver votre place :
       </p>`,
      "Réserver ma formation VTC →",
      TDL_VTC
    ),
  },

  vtc_complet: {
    label: "🚗 Formation VTC complète",
    subject: "Obtenez votre carte VTC — Formation complète avec TDL Formation",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Vous souhaitez devenir <b>chauffeur VTC</b> et exercer en toute légalité ?
         TDL Formation vous prépare à l'examen d'accès à la profession de conducteur
         de voiture de transport avec chauffeur.
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Notre programme couvre les <b>7 modules théoriques</b> (réglementation, gestion,
         sécurité routière, anglais…) et l'<b>épreuve pratique</b>, en cours du soir
         ou en journée selon votre disponibilité.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Intéressé(e) ? Consultez nos prochaines dates :
       </p>`,
      "Démarrer ma formation VTC →",
      TDL_VTC
    ),
  },

  passerelle_taxi: {
    label: "🚕 Formation Passerelle TAXI",
    subject: "Devenez chauffeur de taxi — Formation Passerelle avec TDL Formation",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Vous êtes déjà titulaire d'une carte VTC et souhaitez élargir votre activité au
         transport de taxi ? La <b>formation Passerelle TAXI</b> est faite pour vous.
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         En quelques jours de formation intensive, TDL Formation vous prépare efficacement
         aux épreuves théoriques et pratiques pour obtenir votre carte de chauffeur de taxi.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Nos sessions démarrent régulièrement — renseignez-vous vite :
       </p>`,
      "Voir les prochaines sessions →",
      TDL_CONTACT
    ),
  },

  taxi: {
    label: "🚕 Formation TAXI complète",
    subject: "Devenez chauffeur de taxi — Prochaines sessions disponibles",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Vous souhaitez obtenir votre <b>carte professionnelle de chauffeur de taxi</b> ?
         TDL Formation vous accompagne de A à Z avec une préparation complète aux 7 modules
         théoriques et à l'épreuve pratique.
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Cours disponibles en <b>journée ou en soirée</b>, dans nos centres agréés
         d'Épinay-sur-Seine et Montataire.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Places limitées — réservez dès aujourd'hui :
       </p>`,
      "Découvrir la formation TAXI →",
      TDL_CONTACT
    ),
  },

  rattrapage_points: {
    label: "🔵 Stage récupération de points permis",
    subject: "Votre dernier stage date d'il y'a plus d'un an ?",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Votre dernier stage de récupération de points date déjà de plus d'un an ?
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Si votre solde de points a diminué depuis, c'est le bon moment pour agir —
         avant d'attendre le prochain courrier, la prochaine infraction ou le risque d'invalidation.
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Bonne nouvelle : vous pouvez récupérer <b>jusqu'à 4 points</b> grâce à notre stage de
         sensibilisation à la sécurité routière, agréé par le Ministère de l'Intérieur.
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Et parce que vous nous avez déjà fait confiance, vous bénéficiez aujourd'hui de notre
         <b>tarif fidélité à 189&nbsp;€</b>.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         La démarche est simple :
       </p>
       <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;">
         <tr><td style="padding:4px 0;font-size:15px;color:#333333;">1. Vous choisissez une date disponible.</td></tr>
         <tr><td style="padding:4px 0;font-size:15px;color:#333333;">2. Vous réservez votre place en ligne.</td></tr>
         <tr><td style="padding:4px 0;font-size:15px;color:#333333;">3. Vous venez au stage pendant 2 jours.</td></tr>
       </table>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Et vos points sont récupérés simplement, selon votre situation.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Ne laissez pas votre permis se fragiliser davantage — contactez-nous pour réserver un stage.
       </p>`,
      "Réserver mon stage à 189 € →",
      TDL_LANDING_FIDELITE
    ),
  },

  ecsr: {
    label: "🎓 Formation ECSR (Moniteur auto-école)",
    subject: "Devenez moniteur d'auto-école — Titre Pro ECSR avec TDL Formation",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Vous souhaitez enseigner la conduite et vous reconvertir dans l'enseignement
         de la sécurité routière ? TDL Formation propose la préparation au
         <b>Titre Professionnel ECSR</b> (Enseignant de la Conduite et de la Sécurité Routière).
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Une formation complète de <b>1 190 heures</b>, certifiée Qualiopi, qui vous ouvre
         les portes des auto-écoles, de l'entrepreneuriat ou de la formation professionnelle.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Renseignez-vous sur les prochaines sessions d'entrée :
       </p>`,
      "Être recontacté →",
      TDL_CONTACT
    ),
  },

  conseiller_vente: {
    label: "🏪 Titre Pro Conseiller de Vente",
    subject: "Obtenez votre Titre Professionnel Conseiller de Vente (Niveau 4)",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         TDL Formation propose la préparation au <b>Titre Professionnel Conseiller de Vente
         (RNCP37098 — Niveau 4)</b>, idéal pour valider vos compétences commerciales ou
         vous reconvertir dans la vente en magasin et en omnicanal.
       </p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Formation disponible par <b>apprentissage</b>, finançable via votre CPF.
         Prochaine rentrée disponible — places limitées.
       </p>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Contactez-nous pour vérifier votre éligibilité et réserver votre place :
       </p>`,
      "En savoir plus sur la formation →",
      TDL_CONTACT
    ),
  },

  relance_generique: {
    label: "📩 Relance générique (toutes formations)",
    subject: "TDL Formation — Des formations adaptées à votre projet",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#333333;">
         Nous vous contactons suite à votre intérêt pour nos formations.
         TDL Formation vous propose un large catalogue pour votre projet professionnel :
       </p>
       <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;">
         <tr><td style="padding:6px 0;font-size:14px;color:#333333;">🚗 &nbsp;<b>Formation VTC</b> — journée ou soirée</td></tr>
         <tr><td style="padding:6px 0;font-size:14px;color:#333333;">🚕 &nbsp;<b>Formation TAXI</b> et Passerelle VTC → TAXI</td></tr>
         <tr><td style="padding:6px 0;font-size:14px;color:#333333;">🔵 &nbsp;<b>Stage récupération de points</b> permis (jusqu'à 4 pts)</td></tr>
         <tr><td style="padding:6px 0;font-size:14px;color:#333333;">🎓 &nbsp;<b>Titre Pro ECSR</b> — Moniteur auto-école</td></tr>
         <tr><td style="padding:6px 0;font-size:14px;color:#333333;">🏪 &nbsp;<b>Titre Pro Conseiller de Vente</b> (Niveau 4, CPF)</td></tr>
       </table>
       <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#333333;">
         Consultez notre site ou appelez-nous pour trouver la formation qui vous correspond :
       </p>`,
      "Voir toutes nos formations →",
      TDL_SITE
    ),
  },

  custom: {
    label: "✏️ Message personnalisé",
    subject: "",
    body: makeEmail(
      `<p style="margin:0 0 18px 0;font-size:16px;color:#0a0a0a;">Bonjour <b>{{name}}</b>,</p>
       <p style="margin:0 0 28px 0;font-size:15px;line-height:1.7;color:#333333;">[Votre message ici]</p>`,
      "Nous contacter →",
      TDL_CONTACT
    ),
  },
};

// ─── Formulaire vide ──────────────────────────────────────────────────────────
const emptyLead = { name: "", email: "", phone: "", interest: "", notes: "", tags: [] };

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Leads() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contactedFilter, setContactedFilter] = useState("all");
  const [callOnlyFilter, setCallOnlyFilter] = useState(false);
  const [interestFilter, setInterestFilter] = useState("all");

  // Autocomplétion : suggestions issues de TOUTE la base (pas seulement la
  // page affichée), indépendante de la recherche/pagination principale.
  const [suggestions, setSuggestions] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);

  const [selected, setSelected] = useState(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [newLead, setNewLead] = useState(emptyLead);
  const [tagInput, setTagInput] = useState("");

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [jsonText, setJsonText] = useState('[\n  { "name": "Jean Dupont", "email": "jean@mail.com", "phone": "0601020304" }\n]');

  const [relanceOpen, setRelanceOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState("vtc_renouvellement");
  const [relanceSubject, setRelanceSubject] = useState(TEMPLATES.vtc_renouvellement.subject);
  const [relanceBody, setRelanceBody] = useState(TEMPLATES.vtc_renouvellement.body);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const resetProgress = () => setProgress(null);

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [editForm, setEditForm] = useState(emptyLead);
  const [savingEdit, setSavingEdit] = useState(false);

  const [formations, setFormations] = useState([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollLead, setEnrollLead] = useState(null);
  const [enrollForm, setEnrollForm] = useState({ formation_id: "", name: "", email: "", phone: "", notes: "" });
  const [enrolling, setEnrolling] = useState(false);

  const [emailsOpen, setEmailsOpen] = useState(false);
  const [emailsLead, setEmailsLead] = useState(null);
  const [emailsList, setEmailsList] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);

  // Pagination serveur — la base compte plusieurs milliers de leads, tout
  // charger d'un coup rendait la page très lente. `total`/`pages` viennent
  // de la réponse paginée du backend.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  // Intérêts distincts sur TOUTE la base (indépendant de la page affichée),
  // via un endpoint léger dédié plutôt que de déduire du seul lot chargé.
  const [allInterests, setAllInterests] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (q) params.q = q;
      if (statusFilter !== "all") params.status = statusFilter;
      if (contactedFilter !== "all") params.contacted = contactedFilter === "yes";
      if (callOnlyFilter) params.has_email = false;
      const { data } = await api.get("/leads", { params });
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      toast.error("Erreur de chargement des leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, statusFilter, contactedFilter, callOnlyFilter]);
  // Un changement de filtre (statut/contacté/à appeler) doit revenir à la page 1.
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    setPage(1);
  }, [statusFilter, contactedFilter, callOnlyFilter]);
  // Recherche texte : debounce, et retour à la page 1 (sinon "page 3" pourrait
  // se retrouver vide après une nouvelle recherche plus étroite).
  useEffect(() => {
    const t = setTimeout(() => { page === 1 ? load() : setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);
  // Autocomplétion : requête légère (8 résultats) sur toute la base, séparée
  // de la recherche principale — ne touche ni `items` ni la pagination.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      api.get("/leads", { params: { q: needle, page: 1, page_size: 8 } })
        .then(({ data }) => setSuggestions(data.items))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    api.get("/leads/interests").then(({ data }) => setAllInterests(data)).catch(() => {});
  }, []);
  useEffect(() => {
    api.get("/formations", { params: { active_only: true } })
      .then(({ data }) => setFormations(data))
      .catch(() => {});
  }, []);

  // Calculé sur TOUTE la base (via /leads/interests), pas seulement la page
  // affichée, pour que le menu de filtre reste complet quelle que soit la page.
  const uniqueInterests = useMemo(() => {
    const s = new Set(allInterests.map(canonicalizeInterest));
    const sorted = Array.from(s).filter((v) => v !== "Inconnus").sort();
    return s.has("Inconnus") ? [...sorted, "Inconnus"] : sorted;
  }, [allInterests]);

  // Le filtre par intérêt s'applique côté client, donc uniquement sur la page
  // actuellement chargée (pas sur l'ensemble des leads) — un compromis pour
  // éviter de recharger toute la base à chaque changement de ce filtre.
  // La recherche texte filtre aussi instantanément la page déjà chargée (pas
  // d'attente réseau), en parallèle de la recherche serveur (debounced, sur
  // toute la base) qui remplace `items` une fois arrivée — les deux se
  // combinent sans se marcher dessus.
  const filteredItems = useMemo(() => {
    let result = items;
    if (interestFilter !== "all") {
      result = result.filter((i) => canonicalizeInterest(i.interest) === interestFilter);
    }
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      result = result.filter((i) =>
        (i.name || "").toLowerCase().includes(needle) ||
        (i.email || "").toLowerCase().includes(needle) ||
        (i.phone || "").toLowerCase().includes(needle)
      );
    }
    return result;
  }, [items, interestFilter, q]);

  const toggleSelect = (id) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleSelectAll = () =>
    setSelected((prev) =>
      prev.size === filteredItems.length ? new Set() : new Set(filteredItems.map((i) => i.id))
    );

  const createLead = async () => {
    if (!newLead.name) return toast.error("Le nom est requis");
    try {
      await api.post("/leads", newLead);
      toast.success("Lead ajouté");
      setAddOpen(false);
      setNewLead(emptyLead);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const addTagToNewLead = () => {
    if (!tagInput.trim()) return;
    setNewLead((p) => ({ ...p, tags: [...new Set([...p.tags, tagInput.trim()])] }));
    setTagInput("");
  };

  const updateLead = async (id, patch) => {
    try { await api.put(`/leads/${id}`, patch); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const removeTag = (lead, tag) =>
    updateLead(lead.id, { tags: (lead.tags || []).filter((t) => t !== tag) });

  const addTag = (lead) => {
    const tag = window.prompt("Nom du tag :");
    if (!tag) return;
    updateLead(lead.id, { tags: [...new Set([...(lead.tags || []), tag.trim()])] });
  };

  const deleteLead = async (id) => {
    try { await api.delete(`/leads/${id}`); toast.success("Lead supprimé"); load(); }
    catch { toast.error("Erreur"); }
  };

  const openEdit = (lead) => {
    setEditLead(lead);
    setEditForm({
      name: lead.name || "", email: lead.email || "", phone: lead.phone || "",
      interest: lead.interest || "", notes: lead.notes || "", tags: lead.tags || [],
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editLead) return;
    if (!editForm.name.trim()) return toast.error("Le nom est requis");
    setSavingEdit(true);
    try {
      await api.put(`/leads/${editLead.id}`, {
        name: editForm.name, email: editForm.email || null, phone: editForm.phone || null,
        interest: editForm.interest, notes: editForm.notes,
      });
      toast.success("Lead mis à jour");
      setEditOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSavingEdit(false); }
  };

  const openEnroll = (lead) => {
    setEnrollLead(lead);
    setEnrollForm({
      formation_id: formations[0]?.id || "",
      name: lead.name || "", email: lead.email || "", phone: lead.phone || "", notes: "",
    });
    setEnrollOpen(true);
  };

  const submitEnroll = async () => {
    if (!enrollForm.formation_id) return toast.error("Choisissez une formation");
    if (!enrollForm.name.trim()) return toast.error("Le nom est requis");
    if (!enrollForm.email.trim()) return toast.error("Un email est requis pour créer l'inscription");
    setEnrolling(true);
    try {
      await api.post("/inscriptions", {
        formation_id: enrollForm.formation_id,
        student_name: enrollForm.name,
        student_email: enrollForm.email,
        student_phone: enrollForm.phone || null,
        notes: enrollForm.notes,
      });
      toast.success("Inscription créée");
      if (enrollLead) updateLead(enrollLead.id, { status: "interesse" });
      setEnrollOpen(false);
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur lors de l'inscription"); }
    finally { setEnrolling(false); }
  };

  const openEmailsHistory = async (lead) => {
    setEmailsLead(lead);
    setEmailsOpen(true);
    setEmailsLoading(true);
    try {
      const { data } = await api.get(`/leads/${lead.id}/emails`);
      setEmailsList(data);
    } catch {
      toast.error("Erreur de chargement de l'historique");
    } finally {
      setEmailsLoading(false);
    }
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const { data } = await api.post("/leads/bulk-delete", { lead_ids: Array.from(selected) });
      toast.success(`${data.deleted} lead(s) supprimé(s)`);
      setBulkDeleteOpen(false);
      setSelected(new Set());
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setBulkDeleting(false); }
  };

  const importXlsx = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/leads/import/xlsx", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${data.inserted} importé(s), ${data.skipped_duplicates} doublon(s) ignoré(s)`);
      setImportOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur import Excel"); }
    finally { setImporting(false); e.target.value = ""; }
  };

  const importJson = async () => {
    let parsed;
    try { parsed = JSON.parse(jsonText); if (!Array.isArray(parsed)) throw new Error(); }
    catch { return toast.error("JSON invalide : doit être un tableau d'objets"); }
    setImporting(true);
    try {
      const { data } = await api.post("/leads/import/json", { leads: parsed });
      toast.success(`${data.inserted} importé(s), ${data.skipped_duplicates} doublon(s) ignoré(s)`);
      setImportOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur import JSON"); }
    finally { setImporting(false); }
  };

  const importFromInscriptions = async () => {
    setImporting(true);
    try {
      const { data } = await api.post("/leads/import/from-inscriptions");
      toast.success(`${data.inserted} importé(s) depuis les inscriptions, ${data.skipped_duplicates} doublon(s)`);
      setImportOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setImporting(false); }
  };

  const applyTemplate = (key) => {
    setTemplateKey(key);
    setRelanceSubject(TEMPLATES[key].subject);
    setRelanceBody(TEMPLATES[key].body);
  };

  const sendRelance = async () => {
    if (!relanceSubject || !relanceBody) return toast.error("Sujet et message requis");
    const leadsToSend = filteredItems.filter((l) => selected.has(l.id));
    let sent = 0, skipped = 0, errors = 0;
    setSending(true);
    setProgress({ total: leadsToSend.length, sent: 0, skipped: 0, errors: 0, done: false });
    for (const lead of leadsToSend) {
      try {
        const { data } = await api.post("/leads/relance/single", {
          lead_id: lead.id, subject: relanceSubject, body: relanceBody,
          mark_contacted: true, add_tag: "relance_envoyee",
        });
        data.sent ? sent++ : skipped++;
      } catch { errors++; }
      setProgress({ total: leadsToSend.length, sent, skipped, errors, done: false });
    }
    setProgress({ total: leadsToSend.length, sent, skipped, errors, done: true });
    setSending(false);
    setSelected(new Set());
    load();
  };

  const selectedLeadsWithEmail = filteredItems.filter((l) => selected.has(l.id) && l.email);
  const selectedLeadsNoEmail   = filteredItems.filter((l) => selected.has(l.id) && !l.email);

  return (
    <div className="space-y-6" data-testid="leads-page">

      {/* ── En-tête ── */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="overline flex items-center gap-2"><UsersThree size={12} /> Prospection commerciale</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-1">Leads</h1>
          <p className="text-gray-500 mt-2">
            {filteredItems.length} lead(s) affiché(s) — page {page}/{pages} ({total} au total)
          </p>
        </div>
        <div className="flex gap-2">

          {/* Importer */}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><UploadSimple size={16} className="mr-1" /> Importer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Importer des leads</DialogTitle></DialogHeader>
              <div className="space-y-5 mt-2">
                <div>
                  <p className="text-sm font-medium mb-1 flex items-center gap-1"><FileXls size={14} /> Fichier Excel (.xlsx)</p>
                  <p className="text-xs text-gray-500 mb-2">
                    Compatible avec les plannings TDL (MÉTIER / RESPONSABLE / PRÉNOM / NOM / @ / TEL)
                    et tout export générique (colonnes reconnues automatiquement).
                  </p>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                    <UploadSimple size={14} /> Choisir un fichier .xlsx
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importXlsx} disabled={importing} />
                  </label>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1 flex items-center gap-1"><FileCode size={14} /> JSON</p>
                  <Textarea rows={5} value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="font-mono text-xs" />
                  <Button size="sm" onClick={importJson} disabled={importing} className="mt-2 bg-[#0a0a0a] text-white">
                    Importer ce JSON
                  </Button>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm font-medium mb-1">Depuis les inscriptions existantes</p>
                  <p className="text-xs text-gray-500 mb-2">Importe les inscrits du dashboard comme leads, sans doublon.</p>
                  <Button size="sm" variant="outline" onClick={importFromInscriptions} disabled={importing}>
                    Importer depuis les inscriptions
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Nouveau lead */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
                <Plus size={16} className="mr-1" /> Nouveau lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nouveau lead</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-sm font-medium">Nom</label>
                  <Input value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Téléphone</label>
                    <Input value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Intérêt / formation</label>
                  <Input value={newLead.interest} onChange={(e) => setNewLead({ ...newLead, interest: e.target.value })} placeholder="ex: VTC, TAXI, Stage récupération de points…" />
                </div>
                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTagToNewLead())}
                      placeholder="Ajouter un tag puis Entrée"
                    />
                    <Button type="button" variant="outline" onClick={addTagToNewLead}>Ajouter</Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {newLead.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                        <button onClick={() => setNewLead((p) => ({ ...p, tags: p.tags.filter((x) => x !== t) }))} className="ml-1">
                          <X size={10} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
                <Button onClick={createLead} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-64">
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-gray-400" />
          <Input
            placeholder="Rechercher nom, email, tél..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            className="pl-9"
          />
          {searchFocused && q.trim().length >= 2 && suggestions.length > 0 && (
            <div className="absolute z-20 top-full mt-1 w-80 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 px-3 pt-2 pb-1">Dans toute la base</p>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => { setQ(s.email || s.phone || s.name); setSearchFocused(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-t border-gray-100 first:border-t-0"
                >
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.email || s.phone || "—"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={contactedFilter} onValueChange={setContactedFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Contacté ou non</SelectItem>
            <SelectItem value="yes">Déjà contacté</SelectItem>
            <SelectItem value="no">Pas encore contacté</SelectItem>
          </SelectContent>
        </Select>

        <Select value={interestFilter} onValueChange={setInterestFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tous les intérêts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les intérêts</SelectItem>
            {uniqueInterests.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>

        <button
          onClick={() => setCallOnlyFilter((v) => !v)}
          className={`text-xs px-3 py-2 rounded-md border inline-flex items-center gap-1 transition-colors
            ${callOnlyFilter ? "bg-amber-100 border-amber-300 text-amber-800" : "border-gray-300 hover:bg-gray-50"}`}
        >
          <Phone size={12} /> À appeler (sans email)
        </button>

        {/* Actions groupées */}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{selected.size} sélectionné(s)</Badge>

            {/* Suppression en masse */}
            <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                  <Trash size={14} className="mr-1" /> Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer {selected.size} lead(s) ?</AlertDialogTitle>
                  <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkDelete} disabled={bulkDeleting} className="bg-red-600 hover:bg-red-700 text-white">
                    {bulkDeleting ? "Suppression..." : "Supprimer"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Relance */}
            <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#d4af37] text-black hover:bg-[#b8941f]">
                  <PaperPlaneTilt size={14} className="mr-1" /> Envoyer une relance
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>Envoyer un email de relance</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-md p-3">
                    <EnvelopeSimple size={16} /> {selectedLeadsWithEmail.length} destinataire(s) avec email
                    {selectedLeadsNoEmail.length > 0 && (
                      <span className="text-amber-700 flex items-center gap-1 ml-3">
                        <Warning size={14} weight="fill" /> {selectedLeadsNoEmail.length} ignoré(s) (sans email)
                      </span>
                    )}
                  </div>

                  {/* Barre de progression */}
                  {progress && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {progress.done
                            ? `Terminé — ${progress.sent} envoyé(s)${progress.skipped ? `, ${progress.skipped} sans email` : ""}${progress.errors ? `, ${progress.errors} erreur(s)` : ""}`
                            : `Envoi en cours… ${progress.sent + progress.skipped + progress.errors} / ${progress.total}`}
                        </span>
                        <span className="font-mono">
                          {Math.round(((progress.sent + progress.skipped + progress.errors) / Math.max(progress.total, 1)) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-2.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.round(((progress.sent + progress.skipped + progress.errors) / Math.max(progress.total, 1)) * 100)}%`,
                            backgroundColor: progress.done ? (progress.errors > 0 ? "#f59e0b" : "#16a34a") : "#d4af37",
                          }}
                        />
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-green-700">✓ {progress.sent} envoyé(s)</span>
                        {progress.skipped > 0 && <span className="text-gray-500">↷ {progress.skipped} ignoré(s)</span>}
                        {progress.errors > 0 && <span className="text-red-600">✗ {progress.errors} erreur(s)</span>}
                      </div>
                    </div>
                  )}

                  {/* Formulaire masqué pendant l'envoi */}
                  {!sending && !progress?.done && (
                    <>
                      <div>
                        <label className="text-sm font-medium">Modèle</label>
                        <Select value={templateKey} onValueChange={applyTemplate}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(TEMPLATES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Sujet</label>
                        <Input value={relanceSubject} onChange={(e) => setRelanceSubject(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">
                          Message HTML — <code className="font-mono bg-gray-100 px-1 text-xs">{"{{name}}"}</code> sera remplacé par le nom du lead
                        </label>
                        <Textarea rows={7} value={relanceBody} onChange={(e) => setRelanceBody(e.target.value)} className="font-mono text-xs" />
                      </div>
                    </>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  {progress?.done ? (
                    <Button onClick={() => { setRelanceOpen(false); resetProgress(); }} className="bg-[#0a0a0a] text-white">Fermer</Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => { setRelanceOpen(false); resetProgress(); }} disabled={sending}>Annuler</Button>
                      <Button onClick={sendRelance} disabled={sending || selectedLeadsWithEmail.length === 0} className="bg-[#d4af37] text-black hover:bg-[#b8941f]">
                        {sending ? "Envoi en cours…" : `Envoyer (${selectedLeadsWithEmail.length})`}
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* ── Tableau ── */}
      <Card className="overflow-hidden border border-gray-200 rounded-md shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">
                  <input type="checkbox"
                    checked={filteredItems.length > 0 && selected.size === filteredItems.length}
                    onChange={toggleSelectAll} />
                </th>
                <th className="py-3 px-4 overline">Nom</th>
                <th className="py-3 px-4 overline">Contact</th>
                <th className="py-3 px-4 overline">Intérêt</th>
                <th className="py-3 px-4 overline">Tags</th>
                <th className="py-3 px-4 overline">Statut</th>
                <th className="py-3 px-4 overline text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />
                  </td>
                  <td className="py-3 px-4 font-medium">{l.name}</td>
                  <td className="py-3 px-4 text-xs">
                    {l.email && <p className="flex items-center gap-1"><EnvelopeSimple size={12} /> {l.email}</p>}
                    {l.phone && <p className="flex items-center gap-1 text-gray-500"><Phone size={12} /> {l.phone}</p>}
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-600">
                    {l.interest || "—"}
                    {l.interest && (
                      <span className="block text-[10px] text-gray-400">{canonicalizeInterest(l.interest)}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {(l.tags || []).map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          onClick={() => removeTag(l, t)}
                          title="Cliquer pour retirer"
                          className={`text-[10px] cursor-pointer ${t === "a_appeler" ? "border-amber-400 text-amber-700 bg-amber-50" : ""}`}
                        >
                          {t === "a_appeler" && <Phone size={9} className="mr-1" />}{t} <X size={9} className="ml-1" />
                        </Badge>
                      ))}
                      <button onClick={() => addTag(l)} className="text-[10px] text-gray-400 hover:text-gray-700">+ tag</button>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Select value={l.status} onValueChange={(v) => updateLead(l.id, { status: v })}>
                      <SelectTrigger className={`h-7 text-xs w-32 border-0 ${STATUS_COLOR[l.status] || ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end items-center gap-1">
                      {l.email && (
                        <button
                          onClick={() => openEmailsHistory(l)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                          title="Historique des emails envoyés"
                        >
                          <EnvelopeOpen size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => openEnroll(l)}
                        className="p-1.5 text-[#0a0a0a] hover:bg-gray-100 rounded"
                        title="Inscrire à une formation"
                      >
                        <GraduationCap size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(l)}
                        className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                        title="Modifier"
                      >
                        <PencilSimple size={14} />
                      </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer">
                          <Trash size={14} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce lead ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <span className="font-semibold">{l.name}</span> sera définitivement supprimé.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteLead(l.id)} className="bg-red-600 hover:bg-red-700 text-white">
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredItems.length && !loading && (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-400">
                    Aucun lead. Importez un fichier ou ajoutez-en un manuellement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <Button
              variant="outline" size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </Button>
            <span className="text-sm text-gray-500">Page {page} / {pages}</span>
            <Button
              variant="outline" size="sm"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Suivant
            </Button>
          </div>
        )}
      </Card>

      {/* ── Modifier un lead ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le lead</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Nom</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Téléphone</label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Intérêt / formation</label>
              <Input value={editForm.interest} onChange={(e) => setEditForm({ ...editForm, interest: e.target.value })} placeholder="ex: VTC, TAXI, Stage récupération de points…" />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>Annuler</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              {savingEdit ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Inscrire à une formation ── */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inscrire {enrollLead?.name} à une formation</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Formation</label>
              <Select value={enrollForm.formation_id} onValueChange={(v) => setEnrollForm({ ...enrollForm, formation_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir une formation" /></SelectTrigger>
                <SelectContent>
                  {formations.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Nom</label>
              <Input value={enrollForm.name} onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Email <span className="text-red-500">*</span></label>
                <Input value={enrollForm.email} onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Requis pour créer l'inscription et envoyer la confirmation.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Téléphone</label>
                <Input value={enrollForm.phone} onChange={(e) => setEnrollForm({ ...enrollForm, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={2} value={enrollForm.notes} onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEnrollOpen(false)} disabled={enrolling}>Annuler</Button>
            <Button onClick={submitEnroll} disabled={enrolling} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white">
              {enrolling ? "Inscription..." : "Inscrire"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Historique des emails envoyés (avec statut d'ouverture) ── */}
      <Dialog open={emailsOpen} onOpenChange={setEmailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Emails envoyés à {emailsLead?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2 max-h-96 overflow-y-auto">
            {emailsLoading && <p className="text-sm text-gray-400">Chargement...</p>}
            {!emailsLoading && emailsList.length === 0 && (
              <p className="text-sm text-gray-400">Aucun email envoyé à ce lead pour l'instant.</p>
            )}
            {emailsList.map((e) => (
              <div key={e.id} className="border border-gray-200 rounded-md p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.subject}</p>
                    <p className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString("fr-FR")}</p>
                  </div>
                  {e.opened ? (
                    <Badge className="bg-[#0B7238]/10 text-[#0B7238] hover:bg-[#0B7238]/10 shrink-0 flex items-center gap-1">
                      <Eye size={11} /> Ouvert{e.open_count > 1 ? ` (${e.open_count}x)` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-500 shrink-0">Non ouvert</Badge>
                  )}
                </div>
                {e.opened && e.opened_at && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Première ouverture : {new Date(e.opened_at).toLocaleString("fr-FR")}
                  </p>
                )}
                {e.status !== "sent" && e.status !== "mocked" && (
                  <p className="text-[11px] text-red-500 mt-1">Échec d'envoi : {e.status}</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
            Le suivi d'ouverture repose sur un pixel invisible : certains clients mail (Gmail proxy, Apple Mail
            Privacy Protection, images bloquées par défaut...) peuvent fausser ce signal. À prendre comme indicateur,
            pas comme preuve absolue.
          </p>
          <div className="flex justify-end mt-2">
            <Button variant="outline" onClick={() => setEmailsOpen(false)}>Fermer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}