import { useEffect, useState } from "react";

// Diaporama plein fond en fondu croisé, pour un hero visuellement riche (image de fond animée).
export default function HeroSlideshow({ slides, interval = 5000, className = "" }) {
  const [active, setActive] = useState(0);
  // On ne monte qu'une image à la fois au départ : les 4 autres sont de
  // gros fichiers qui, montés en même temps que la 1ère, se battent pour la
  // bande passante avec l'image LCP et ralentissent le premier affichage.
  // On les ajoute progressivement une fois le rendu initial passé.
  const [mounted, setMounted] = useState(1);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), interval);
    return () => clearInterval(id);
  }, [slides.length, interval]);

  useEffect(() => {
    if (mounted >= slides.length) return;
    const id = setTimeout(() => setMounted((n) => Math.min(n + 1, slides.length)), 1500);
    return () => clearTimeout(id);
  }, [mounted, slides.length]);

  const visibleSlides = slides.slice(0, Math.max(mounted, active + 1));

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {visibleSlides.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt={s.alt || ""}
          loading={i === 0 ? "eager" : "lazy"}
          fetchPriority={i === 0 ? "high" : "auto"}
          className={`hero-slide ${i === active ? "hero-slide-active" : ""} w-full h-full object-cover`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
    </div>
  );
}
