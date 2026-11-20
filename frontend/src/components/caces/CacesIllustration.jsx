// Illustration d'une question de la grille officielle CACES® R.489 (image,
// schéma, tableau de charges) — chargée avec la session de l'utilisateur :
// le contenu de l'examen n'est pas public (backend routers/caces_exam.py).
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const cache = new Map();

export default function CacesIllustration({ name, className = "" }) {
  const [src, setSrc] = useState(() => (name ? cache.get(name) : null));

  useEffect(() => {
    if (!name || cache.has(name)) {
      setSrc(name ? cache.get(name) : null);
      return undefined;
    }
    let alive = true;
    api.get(`/caces/theorie/illustrations/${name}`, { responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(r.data);
        cache.set(name, url);
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [name]);

  if (!name) return null;
  if (!src) return <div className={`bg-gray-50 border border-dashed border-gray-200 rounded text-xs text-gray-400 p-3 ${className}`}>Illustration…</div>;
  return <img src={src} alt="Illustration de la question" className={`border border-gray-200 rounded bg-white max-h-64 object-contain ${className}`} />;
}
