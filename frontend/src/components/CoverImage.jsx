// Affiche une image de couverture EN ENTIER (jamais rognée), quel que soit
// son ratio d'origine, tout en remplissant proprement un cadre au ratio fixe
// (ex: 16:9 pour les cartes de blog) — technique du fond flouté : une copie
// de l'image en arrière-plan (object-cover, floutée) remplit tout le cadre
// pour qu'il n'y ait jamais de bande vide disgracieuse, et l'image réelle
// est posée par-dessus en object-contain, donc toujours visible en entier.
export default function CoverImage({ src, alt, className = "", imgClassName = "", onError }) {
  if (!src) return null;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        src={src} alt="" aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"
      />
      <img
        src={src} alt={alt}
        className={`relative w-full h-full object-contain ${imgClassName}`}
        onError={onError}
      />
    </div>
  );
}
