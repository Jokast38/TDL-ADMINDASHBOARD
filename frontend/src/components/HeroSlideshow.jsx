import { useEffect, useState } from "react";

// Diaporama plein fond en fondu croisé, pour un hero visuellement riche (image de fond animée).
export default function HeroSlideshow({ slides, interval = 5000, className = "" }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), interval);
    return () => clearInterval(id);
  }, [slides.length, interval]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {slides.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt={s.alt || ""}
          className={`hero-slide ${i === active ? "hero-slide-active" : ""} w-full h-full object-cover`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/40" />
    </div>
  );
}
