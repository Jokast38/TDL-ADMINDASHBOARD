import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const SESSIONS = [
  { mois: "Juillet", items: [["20–21", "20 & 21 juillet"], ["24–25", "24 & 25 juillet"], ["29–30", "29 & 30 juillet"]] },
  { mois: "Août", items: [["03–04", "03 & 04 août"], ["07–08", "07 & 08 août"], ["10–11", "10 & 11 août"], ["12–13", "12 & 13 août"], ["21–22", "21 & 22 août"]] },
];

const RAISONS = [
  { n: "01", titre: "Plus de disponibilités", texte: "Des sessions régulières tout l'été pour vous inscrire rapidement." },
  { n: "02", titre: "Prix fidélité", texte: "189 € au lieu du tarif standard, réservé à nos anciens stagiaires." },
  { n: "03", titre: "Équipe reconnue", texte: "Des formateurs que vous connaissez déjà, agréés par la Préfecture." },
  { n: "04", titre: "Inscription rapide", texte: "Un dossier déjà connu chez nous : moins de démarches pour vous." },
  { n: "05", titre: "Excellent accueil", texte: "Une équipe disponible du lundi au samedi, 9h–18h." },
  { n: "06", titre: "Centre agréé", texte: "Stage conforme à la réglementation, points crédités sous 48h." },
];

const AVIS = [
  "Accueil très agréable et formateurs à l'écoute, le stage s'est très bien passé.",
  "Équipe efficace, inscription rapide et bonne ambiance pendant les deux jours.",
  "Un centre sérieux et bien organisé, je recommande sans hésiter.",
];

const FAQ = [
  { q: "Puis-je refaire un stage ?", r: "Oui. Un stage de récupération de points ne peut être effectué qu'une fois par période de 12 mois. Si votre dernier stage date de plus d'un an, vous pouvez en refaire un dès aujourd'hui." },
  { q: "Pourquoi 189 € ?", r: "189 € est notre tarif fidélité, réservé aux personnes ayant déjà suivi un stage chez TDL Formation, en dessous de notre tarif standard." },
  { q: "Comment se déroule le stage ?", r: "Le stage se déroule sur 2 jours consécutifs (7h/jour), en salle, avec des formateurs agréés par la Préfecture, autour de la sensibilisation à la sécurité routière." },
  { q: "En combien de temps suis-je rappelé ?", r: "Notre équipe vous recontacte sous 24h ouvrées après votre demande pour confirmer votre inscription et le tarif fidélité." },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
  .ofl{--asphalte:#1B2430;--asphalte-clair:#2C3746;--ivoire:#F1F2ED;--carte:#FFFFFF;--ambre:#E2B92B;--ambre-fonce:#C29F1F;--vert:#4F7A68;--vert-clair:#E4EEE9;--gris-texte:#5B6472;--radius:4px;
    background:var(--ivoire);color:var(--asphalte);font-family:'Public Sans',sans-serif;line-height:1.5;}
  .ofl *{box-sizing:border-box;}
  .ofl h1,.ofl h2,.ofl h3{font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.02em;margin:0;}
  .ofl .mono{font-family:'IBM Plex Mono',monospace;}
  .ofl a{color:inherit;}
  .ofl .bandeau-route{height:6px;background-repeat:repeat-x;background-size:64px 6px;background-image:linear-gradient(90deg,var(--ambre) 0 32px,transparent 32px 64px);}
  .ofl .wrap{max-width:1080px;margin:0 auto;padding:0 24px;}
  .ofl .hero{background:var(--asphalte);color:var(--ivoire);padding:64px 0 48px;position:relative;overflow:hidden;}
  .ofl .hero .wrap{position:relative;z-index:1;max-width:760px;}
  .ofl .badge-fidelite{display:inline-flex;align-items:center;gap:8px;background:rgba(226,185,43,0.12);border:1px solid var(--ambre);color:var(--ambre);font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;padding:7px 14px;border-radius:999px;margin-bottom:18px;}
  .ofl .hero h1{font-size:clamp(30px,4.4vw,46px);line-height:1.1;margin-bottom:16px;}
  .ofl .hero p.lead{color:#C7CCD4;font-size:17px;max-width:52ch;margin-bottom:10px;}
  .ofl .hero p.fidelite{color:var(--ivoire);font-size:17px;margin-bottom:28px;background:var(--asphalte-clair);border-left:3px solid var(--ambre);padding:12px 16px;border-radius:var(--radius);}
  .ofl .hero p.fidelite strong{color:var(--ambre);}
  .ofl .hero-actions{display:flex;gap:14px;flex-wrap:wrap;}
  .ofl .btn{font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.03em;font-size:15px;font-weight:600;padding:14px 26px;border-radius:var(--radius);border:2px solid transparent;cursor:pointer;text-decoration:none;display:inline-block;transition:transform .15s ease,background .15s ease,border-color .15s ease;}
  .ofl .btn-plein{background:var(--ambre);color:var(--asphalte);}
  .ofl .btn-plein:hover{background:var(--ambre-fonce);transform:translateY(-1px);}
  .ofl .btn-contour{border-color:#4A5566;color:var(--ivoire);}
  .ofl .btn-contour:hover{border-color:var(--ambre);color:var(--ambre);}
  .ofl .avantages{background:var(--asphalte-clair);border-top:1px solid #3A4557;}
  .ofl .avantages .wrap{display:flex;flex-wrap:wrap;gap:0;}
  .ofl .avantage-item{flex:1 1 180px;padding:20px 24px;border-left:1px solid #3A4557;color:var(--ivoire);font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:14px;letter-spacing:0.02em;display:flex;align-items:center;gap:10px;}
  .ofl .avantage-item:first-child{border-left:none;}
  .ofl .avantage-item .puce{color:var(--ambre);font-size:18px;line-height:1;}
  .ofl section{padding:68px 0;}
  .ofl .section-tete{max-width:58ch;margin-bottom:36px;}
  .ofl .section-tete .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ambre-fonce);margin-bottom:10px;display:block;}
  .ofl .section-tete h2{font-size:clamp(24px,3vw,32px);margin-bottom:10px;}
  .ofl .section-tete p{color:var(--gris-texte);font-size:16px;}
  .ofl .mois-groupe{margin-bottom:32px;}
  .ofl .mois-titre{display:flex;align-items:baseline;gap:12px;margin-bottom:16px;}
  .ofl .mois-titre h3{font-size:19px;color:var(--asphalte);}
  .ofl .mois-titre::after{content:"";flex:1;height:1px;background:#D8D6CC;}
  .ofl .sessions-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;}
  .ofl .session-carte{background:var(--carte);border:1px solid #E1DFD4;border-left:4px solid var(--ambre);border-radius:var(--radius);padding:16px 18px;display:flex;flex-direction:column;gap:10px;}
  .ofl .session-jours{font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:600;color:var(--asphalte);line-height:1;}
  .ofl .session-mois{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:var(--gris-texte);}
  .ofl .btn-mini{align-self:flex-start;font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.02em;font-size:12px;font-weight:600;color:var(--asphalte);background:var(--ambre);border:none;padding:8px 14px;border-radius:var(--radius);cursor:pointer;transition:background .15s ease;}
  .ofl .btn-mini:hover{background:var(--ambre-fonce);}
  .ofl .zone-alt{background:var(--carte);border-top:1px solid #E1DFD4;border-bottom:1px solid #E1DFD4;}
  .ofl .raisons-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;}
  .ofl .raison-carte{padding:22px;border:1px solid #E1DFD4;border-radius:var(--radius);background:var(--ivoire);}
  .ofl .raison-carte .num{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--ambre-fonce);margin-bottom:8px;display:block;}
  .ofl .raison-carte h3{font-size:16px;text-transform:none;letter-spacing:0;margin-bottom:6px;}
  .ofl .raison-carte p{font-size:14px;color:var(--gris-texte);margin:0;}
  .ofl .avis-entete{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:28px;}
  .ofl .avis-note{font-family:'Oswald',sans-serif;font-size:40px;color:var(--asphalte);line-height:1;}
  .ofl .avis-etoiles{color:var(--ambre);font-size:18px;letter-spacing:2px;}
  .ofl .avis-source{font-size:13px;color:var(--gris-texte);}
  .ofl .avis-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;}
  .ofl .avis-carte{background:var(--carte);border:1px solid #E1DFD4;border-radius:var(--radius);padding:18px 20px;}
  .ofl .avis-carte .avis-etoiles{margin-bottom:8px;}
  .ofl .avis-carte p{font-size:14px;color:var(--asphalte);margin:0 0 10px;}
  .ofl .avis-carte .avis-auteur{font-size:12px;color:var(--gris-texte);font-family:'IBM Plex Mono',monospace;}
  .ofl .zone-rappel{background:var(--asphalte);color:var(--ivoire);}
  .ofl .rappel-grille{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;}
  .ofl .rappel-grille h2{color:var(--ivoire);font-size:clamp(24px,3vw,32px);margin-bottom:14px;}
  .ofl .rappel-grille p{color:#C7CCD4;font-size:15px;margin-bottom:0;}
  .ofl .form-carte{background:var(--carte);border-radius:var(--radius);padding:32px;color:var(--asphalte);}
  .ofl .champ{margin-bottom:16px;}
  .ofl .champ label{display:block;font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:var(--gris-texte);margin-bottom:6px;}
  .ofl .champ input{width:100%;padding:12px 14px;border:1.5px solid #D8D6CC;border-radius:var(--radius);font-family:'Public Sans',sans-serif;font-size:15px;color:var(--asphalte);background:#FBFAF7;}
  .ofl .champ input:focus{outline:none;border-color:var(--ambre);background:#fff;}
  .ofl .session-choisie-note{font-size:13px;color:var(--vert);font-weight:600;margin-bottom:14px;min-height:18px;}
  .ofl .btn-envoyer{width:100%;background:var(--ambre);color:var(--asphalte);border:none;font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.03em;font-size:16px;font-weight:600;padding:15px;border-radius:var(--radius);cursor:pointer;}
  .ofl .btn-envoyer:hover{background:var(--ambre-fonce);}
  .ofl .btn-envoyer:disabled{opacity:0.6;cursor:not-allowed;}
  .ofl .confirmation{display:none;background:var(--vert-clair);border:1px solid var(--vert);color:#2F5344;padding:12px 14px;border-radius:var(--radius);font-size:14px;margin-top:14px;}
  .ofl .confirmation.visible{display:block;}
  .ofl .faq-item{border-bottom:1px solid #D8D6CC;}
  .ofl .faq-question{width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:18px 0;display:flex;justify-content:space-between;align-items:center;font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:0.01em;font-size:15px;color:var(--asphalte);}
  .ofl .faq-question .plus{color:var(--ambre-fonce);font-size:20px;transition:transform .2s ease;}
  .ofl .faq-item.ouvert .faq-question .plus{transform:rotate(45deg);}
  .ofl .faq-reponse{overflow:hidden;transition:max-height .25s ease;}
  .ofl .faq-reponse p{color:var(--gris-texte);font-size:14px;padding-bottom:18px;margin:0;max-width:70ch;}
  .ofl footer{padding:32px 0;text-align:center;color:var(--gris-texte);font-size:13px;}
  @media (max-width:860px){
    .ofl .avantages .wrap{flex-direction:column;}
    .ofl .avantage-item{border-left:none;border-top:1px solid #3A4557;}
    .ofl .avantage-item:first-child{border-top:none;}
    .ofl .rappel-grille{grid-template-columns:1fr;}
  }
`;

export default function OffreFideliteLanding() {
  const [session, setSession] = useState("");
  const [form, setForm] = useState({ prenom: "", nom: "", telephone: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const formRef = useRef(null);

  const chooseSession = (label) => {
    setSession(label);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim()) {
      return toast.error("Merci de remplir tous les champs");
    }
    setSending(true);
    try {
      await api.post("/callback-requests", { ...form, session });
      setSent(true);
    } catch {
      toast.error("Erreur lors de l'envoi, merci de réessayer ou de nous appeler directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ofl">
      <style>{CSS}</style>

      <div className="bandeau-route" />

      <header className="hero">
        <div className="wrap">
          <span className="badge-fidelite">Offre réservée à nos anciens clients</span>
          <h1>Votre dernier stage date de plus d'un an ?</h1>
          <p className="lead">Si votre solde de points a de nouveau diminué, vous pouvez peut-être récupérer jusqu'à 4 points grâce à un nouveau stage agréé.</p>
          <p className="fidelite">Parce que vous avez déjà effectué un stage chez nous, bénéficiez de notre <strong>tarif fidélité de 180&nbsp;€</strong>.</p>
          <div className="hero-actions">
            <a href="#rappel" className="btn btn-plein" onClick={(e) => { e.preventDefault(); formRef.current?.scrollIntoView({ behavior: "smooth" }); }}>
              Être rappelé gratuitement
            </a>
            <a href="tel:+33180907249" className="btn btn-contour">Appeler maintenant</a>
          </div>
        </div>
      </header>

      <div className="avantages">
        <div className="wrap">
          <div className="avantage-item"><span className="puce">✓</span>Tarif fidélité 180&nbsp;€</div>
          <div className="avantage-item"><span className="puce">✓</span>Jusqu'à 4 points récupérables</div>
          <div className="avantage-item"><span className="puce">✓</span>Stage agréé</div>
          <div className="avantage-item"><span className="puce">✓</span>En seulement 2 jours</div>
          <div className="avantage-item"><span className="puce">✓</span>Épinay-sur-Seine</div>
        </div>
      </div>

      <section id="calendrier">
        <div className="wrap">
          <div className="section-tete">
            <span className="eyebrow">Calendrier</span>
            <h2>Les prochaines sessions</h2>
            <p>Cliquez sur « Être rappelé » à côté de la date qui vous convient : nous vous recontactons pour finaliser votre inscription au tarif fidélité.</p>
          </div>
          {SESSIONS.map(({ mois, items }) => (
            <div className="mois-groupe" key={mois}>
              <div className="mois-titre"><h3>{mois}</h3></div>
              <div className="sessions-grille">
                {items.map(([jours, label]) => (
                  <div className="session-carte" key={label}>
                    <div>
                      <div className="session-jours">{jours}</div>
                      <div className="session-mois">{mois}</div>
                    </div>
                    <button type="button" className="btn-mini" onClick={() => chooseSession(label)}>Être rappelé</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="zone-alt">
        <div className="wrap" style={{ padding: "68px 0" }}>
          <div className="section-tete">
            <span className="eyebrow">Pourquoi nous revenir</span>
            <h2>Pourquoi revenir chez TDL ?</h2>
          </div>
          <div className="raisons-grille">
            {RAISONS.map((r) => (
              <div className="raison-carte" key={r.n}>
                <span className="num">{r.n}</span>
                <h3>{r.titre}</h3>
                <p>{r.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section id="avis">
        <div className="wrap">
          <div className="section-tete">
            <span className="eyebrow">Ils nous ont fait confiance</span>
            <h2>Les avis Google</h2>
          </div>
          <div className="avis-entete">
            <div className="avis-note">4,6/5</div>
            <div>
              <div className="avis-etoiles">★★★★★</div>
              <div className="avis-source">
                Note moyenne — <a href="https://www.google.com/search?q=TDL+Formation+Epinay-sur-Seine+avis" target="_blank" rel="noopener noreferrer">voir tous nos avis sur Google</a>
              </div>
            </div>
          </div>
          <div className="avis-grille">
            {AVIS.map((a, i) => (
              <div className="avis-carte" key={i}>
                <div className="avis-etoiles">★★★★★</div>
                <p>{a}</p>
                <div className="avis-auteur">Exemple d'avis client</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="zone-rappel" id="rappel" ref={formRef}>
        <div className="wrap" style={{ padding: "72px 0" }}>
          <div className="rappel-grille">
            <div>
              <h2>Récupérez vos points au tarif fidélité</h2>
              <p>Laissez-nous vos coordonnées, un membre de notre équipe vous rappelle sous 24h ouvrées pour finaliser votre inscription au tarif de 180&nbsp;€.</p>
            </div>
            <div className="form-carte">
              {sent ? (
                <div className="confirmation visible">
                  Merci, votre demande a bien été prise en compte. Nous vous rappelons sous 24h ouvrées.
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="champ">
                    <label htmlFor="prenom">Prénom</label>
                    <input id="prenom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required />
                  </div>
                  <div className="champ">
                    <label htmlFor="nom">Nom</label>
                    <input id="nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                  </div>
                  <div className="champ">
                    <label htmlFor="telephone">Téléphone</label>
                    <input id="telephone" type="tel" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} required />
                  </div>
                  <div className="session-choisie-note">{session ? `Session souhaitée : ${session}` : ""}</div>
                  <button type="submit" className="btn-envoyer" disabled={sending}>
                    {sending ? "Envoi..." : "Être rappelé"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      <section id="faq">
        <div className="wrap">
          <div className="section-tete">
            <span className="eyebrow">Questions fréquentes</span>
            <h2>FAQ</h2>
          </div>
          <div className="faq-liste">
            {FAQ.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <div className={`faq-item ${isOpen ? "ouvert" : ""}`} key={i}>
                  <button type="button" className="faq-question" onClick={() => setOpenFaq(isOpen ? null : i)}>
                    <span>{f.q}</span>
                    <span className="plus">+</span>
                  </button>
                  <div className="faq-reponse" style={{ maxHeight: isOpen ? "200px" : "0" }}>
                    <p>{f.r}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer>
        TDL Formation — 59 avenue Joffre, 93800 Épinay-sur-Seine · 01 80 90 72 49 · contact@tdl-formation.fr
      </footer>

      <div className="bandeau-route" />
    </div>
  );
}
