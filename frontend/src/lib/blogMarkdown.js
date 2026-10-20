import { defaultSchema } from "rehype-sanitize";

// Partagé entre BlogPost.jsx (rendu public) et AdminBlog.jsx (aperçu avant
// publication) — pour que l'aperçu montre vraiment ce que verra le lecteur.
// Beaucoup d'articles (import WordPress, copier-coller depuis un traitement
// de texte) contiennent du HTML brut au milieu du Markdown : sans
// rehype-raw, react-markdown supprime ces balises (titres, listes, gras...),
// qui réapparaissaient comme du texte plat. rehype-sanitize borne ensuite ce
// qui est autorisé à un schéma sûr (pas de <script>/<style>/attributs on*).
export const blogSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), "loading", "className"],
    "*": [...(defaultSchema.attributes?.["*"] || []), "className"],
  },
  tagNames: [...(defaultSchema.tagNames || []), "figure", "figcaption", "mark"],
};
