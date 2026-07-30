import { useEffect } from "react";
import { setPageMeta } from "@/lib/seo";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/StageLandingPage";
import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import SiteFooter from "@/components/SiteFooter";
import { openCookieSettings } from "@/lib/consent";

const SECTIONS = [
  {
    title: "Responsable du traitement",
    content: (
      <p>
        Le responsable du traitement des données collectées sur ce site est <strong>TOP DRIVE LEARNING</strong>
        (TDL Formation), SASU immatriculée au RCS de Bobigny sous le n° 900 968 801, dont le siège social est situé
        au 59 Avenue Joffre, 93800 Épinay-sur-Seine. Pour toute question relative à vos données personnelles :{" "}
        <a href="mailto:contact@tdl-formation.fr" className="text-[#d4af37] hover:underline">contact@tdl-formation.fr</a>.
      </p>
    ),
  },
  {
    title: "Données collectées",
    content: (
      <>
        <p className="mb-3">Selon vos interactions avec le site, nous collectons :</p>
        <ul className="space-y-1.5 list-disc pl-5">
          <li><strong>Données d'identification et de contact</strong> : nom, prénom, email, téléphone (formulaires d'inscription, de contact et de demande de rappel).</li>
          <li><strong>Données relatives à votre projet de formation</strong> : formation souhaitée, financement envisagé, messages transmis.</li>
          <li><strong>Données de suivi de dossier</strong> : documents transmis pour l'inscription (pièce d'identité, justificatifs), échanges avec notre équipe.</li>
          <li><strong>Données de paiement</strong> : lorsque vous payez en ligne, vos coordonnées bancaires sont saisies directement sur la page sécurisée de notre prestataire de paiement (Stripe) — nous ne les collectons ni ne les stockons nous-mêmes.</li>
          <li><strong>Données de navigation</strong> : pages visitées, statistiques d'ouverture/clic sur nos emails, et cookies décrits ci-dessous, selon vos choix de consentement.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Finalités et bases légales",
    content: (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-2 pr-4 font-semibold">Finalité</th>
              <th className="py-2 font-semibold">Base légale</th>
            </tr>
          </thead>
          <tbody className="text-gray-600">
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4">Traitement de votre demande d'inscription ou de rappel</td>
              <td className="py-2">Mesures précontractuelles / exécution du contrat de formation</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4">Suivi administratif du dossier (ANTS, financement, documents)</td>
              <td className="py-2">Exécution du contrat / obligation légale</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4">Paiement en ligne</td>
              <td className="py-2">Exécution du contrat (traitement réalisé par Stripe, sous-traitant)</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4">Relance commerciale (email) sur nos formations</td>
              <td className="py-2">Intérêt légitime (clients/prospects ayant déjà manifesté un intérêt) — droit d'opposition à tout moment</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 pr-4">Mesure d'audience du site (Google Analytics)</td>
              <td className="py-2">Consentement (bandeau cookies)</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">Suivi publicitaire (Meta Pixel)</td>
              <td className="py-2">Consentement (bandeau cookies)</td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    title: "Destinataires des données",
    content: (
      <>
        <p className="mb-3">
          Vos données sont destinées à notre équipe interne (conseillers, chargés d'admission) habilitée selon son
          rôle. Elles peuvent également être transmises aux sous-traitants suivants, dans la limite de ce qui est
          nécessaire à leur prestation :
        </p>
        <ul className="space-y-1.5 list-disc pl-5">
          <li><strong>Stripe</strong> (paiement en ligne) — traitement des transactions par carte bancaire.</li>
          <li><strong>Hostinger</strong> (hébergement du site).</li>
          <li><strong>Prestataires d'envoi d'email</strong> (Resend, Brevo ou service SMTP configuré) — délivrance des emails transactionnels et de relance.</li>
          <li><strong>Limova</strong> (le cas échéant) — agents IA d'appel téléphonique et de prospection LinkedIn.</li>
          <li><strong>ANTS / autorités compétentes</strong> — dans le cadre légal du dossier de formation (VTC, Taxi, permis).</li>
        </ul>
        <p className="mt-3">
          Certains de ces prestataires peuvent être situés hors de l'Union européenne ; dans ce cas, le transfert est
          encadré par des garanties appropriées (clauses contractuelles types de la Commission européenne ou
          équivalent).
        </p>
      </>
    ),
  },
  {
    title: "Durée de conservation",
    content: (
      <ul className="space-y-1.5 list-disc pl-5">
        <li>Dossier d'inscription et documents associés : durée nécessaire à la formation, puis archivage selon les obligations légales applicables (comptables, Qualiopi).</li>
        <li>Lead/prospect n'ayant pas donné suite : 3 ans à compter du dernier contact, conformément aux recommandations de la CNIL.</li>
        <li>Données de paiement : non conservées par nos soins (gérées par Stripe selon sa propre politique).</li>
        <li>Cookies de mesure d'audience et publicitaires : 13 mois maximum, conformément aux recommandations CNIL.</li>
      </ul>
    ),
  },
  {
    title: "Cookies",
    content: (
      <p>
        Le site utilise des cookies nécessaires à son fonctionnement, ainsi que, sous réserve de votre consentement,
        des cookies de mesure d'audience (Google Analytics) et publicitaires (Meta Pixel). Vous pouvez à tout moment
        modifier vos choix en cliquant sur{" "}
        <button
          type="button"
          onClick={() => openCookieSettings()}
          className="text-[#d4af37] hover:underline font-medium"
          data-testid="reopen-cookie-settings"
        >
          gérer mes préférences de cookies
        </button>.
      </p>
    ),
  },
  {
    title: "Vos droits",
    content: (
      <>
        <p className="mb-3">
          Conformément au RGPD et à la loi Informatique et Libertés, vous disposez des droits suivants sur vos
          données : accès, rectification, effacement, limitation du traitement, opposition, et portabilité. Vous
          pouvez également retirer votre consentement à tout moment lorsque le traitement en dépend (cookies,
          prospection commerciale).
        </p>
        <p className="mb-3">
          Pour exercer ces droits, contactez-nous à{" "}
          <a href="mailto:contact@tdl-formation.fr" className="text-[#d4af37] hover:underline">contact@tdl-formation.fr</a>{" "}
          en précisant votre demande et en joignant un justificatif d'identité si nécessaire. Nous nous engageons à
          vous répondre dans un délai maximum d'un mois.
        </p>
        <p>
          Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire
          une réclamation auprès de la{" "}
          <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer" className="text-[#d4af37] hover:underline">
            CNIL (cnil.fr/fr/plaintes)
          </a>.
        </p>
      </>
    ),
  },
  {
    title: "Sécurité des données",
    content: (
      <p>
        Nous mettons en œuvre les mesures techniques et organisationnelles appropriées pour protéger vos données
        contre la perte, l'accès non autorisé, la divulgation ou l'altération (connexion chiffrée HTTPS, accès
        restreint par rôle, mots de passe hashés, paiement délégué à un prestataire certifié PCI-DSS).
      </p>
    ),
  },
];

export default function PolitiqueConfidentialite() {
  useEffect(() => {
    setPageMeta({
      title: "Politique de confidentialité — TDL Formation",
      description: "Comment TDL Formation collecte, utilise et protège vos données personnelles : finalités, durées de conservation, cookies et vos droits RGPD.",
      path: "/politique-de-confidentialite",
    });
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-white" data-testid="privacy-policy-page">
      <TopBar />
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-10 h-10 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">TDL Formation</span>
          </Link>
          <Link to="/" className="text-sm text-gray-600 hover:text-[#d4af37] inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Retour à l'accueil
          </Link>
        </div>
      </header>

      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 py-3 flex items-center gap-2 text-xs text-gray-500">
          <Link to="/" className="hover:text-[#d4af37]">Accueil</Link>
          <CaretRight size={10} />
          <span className="text-gray-700">Politique de confidentialité</span>
        </div>
      </div>

      <section className="border-b border-gray-200 bg-[#0a0a0a]">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
          <p className="overline mb-3 text-white/70">Vos données, vos droits</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tighter leading-[0.95] text-white">
            Politique de <span className="text-[#d4af37]">confidentialité</span>
          </h1>
        </div>
      </section>

      <article className="max-w-4xl mx-auto px-6 lg:px-8 py-12 lg:py-16">
        <div className="space-y-10">
          {SECTIONS.map((s) => (
            <div key={s.title} className="pb-10 border-b border-gray-100 last:border-b-0 last:pb-0">
              <h2 className="font-display text-xl font-bold mb-4">{s.title}</h2>
              <div className="text-gray-600 text-sm leading-relaxed">{s.content}</div>
            </div>
          ))}
        </div>
      </article>

      <SiteFooter />
    </div>
  );
}
