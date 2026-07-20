import { useState } from "react";
import { Play } from "@phosphor-icons/react";

const NAVY = "#12224a";

// Aperçu vidéo YouTube en "click-to-play" (facade légère : la miniature se
// charge sans script tiers, l'iframe n'est injectée qu'au clic).
export default function VideoPreview({ videoId, title, className = "" }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      data-reveal
      className={`reveal relative aspect-video rounded-xl overflow-hidden shadow-lg bg-black ${className}`}
    >
      {playing ? (
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          data-testid="video-preview-iframe"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative w-full h-full block"
          aria-label={`Lire la vidéo — ${title}`}
          data-testid="video-preview-play"
        >
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt={`Aperçu vidéo — ${title}`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/45 transition-colors flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
              <Play size={28} weight="fill" style={{ color: NAVY }} />
            </span>
          </div>
        </button>
      )}
    </div>
  );
}
