import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Star, StarHalf } from "@phosphor-icons/react";

const GOLD = "#f5c518";

const StarRow = ({ rating = 0, size = 18 }) => (
  <div className="flex gap-1" aria-label={`${rating} sur 5 étoiles`}>
    {[1, 2, 3, 4, 5].map((i) => {
      if (rating >= i) return <Star key={i} weight="fill" size={size} style={{ color: GOLD }} />;
      if (rating >= i - 0.5) return <StarHalf key={i} weight="fill" size={size} style={{ color: GOLD }} />;
      return <Star key={i} weight="regular" size={size} style={{ color: GOLD }} />;
    })}
  </div>
);

const ReviewCard = ({ review }) => {
  const [headline, ...rest] = (review.text || "").split(/(?<=[.!])\s/);
  const body = rest.join(" ") || headline;

  return (
    <div
      data-reveal
      className="reveal relative bg-[#111214] border border-white/10 rounded-md p-6 flex flex-col"
      style={{ clipPath: "polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%)" }}
    >
      <StarRow rating={review.rating} size={16} />
      {rest.length > 0 && (
        <p className="font-display font-bold text-lg mt-3 mb-2 leading-snug">{headline}</p>
      )}
      <p className="text-gray-300 text-sm leading-relaxed line-clamp-4">{body}</p>
      <div className="flex items-center gap-3 mt-6 pt-4 border-t border-white/10">
        {review.profile_photo_url ? (
          <img
            src={review.profile_photo_url}
            alt={review.author_name}
            className="w-11 h-11 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center font-bold shrink-0">
            {review.author_name?.[0] || "?"}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{review.author_name}</p>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GOLD }}>
            Avis Google · {review.relative_time_description}
          </p>
        </div>
      </div>
    </div>
  );
};

// Avis Google Business affichés en carrousel — récupérés via l'API Google Places
// (voir backend routers/reviews.py), avec repli silencieux si non configuré.
export default function GoogleReviewsCarousel() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api.get("/reviews/google").then((r) => setData(r.data)).catch(() => setFailed(true));
  }, []);

  const reviews = data?.reviews || [];

  useEffect(() => {
    if (reviews.length <= 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % reviews.length), 6000);
    return () => clearInterval(id);
  }, [reviews.length]);

  if (failed || !reviews.length) return null;

  const visible = [0, 1].map((offset) => reviews[(index + offset) % reviews.length]).filter(Boolean);

  return (
    <section className="relative bg-black text-white overflow-hidden">
      <div className="grid-bg-noise absolute inset-0 opacity-40 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-4" data-reveal>
          <h2 className="reveal font-display text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] mb-6">
            Ce qu'en disent<br />nos étudiants
          </h2>
          <p className="font-display text-xl font-bold mb-2">Excellent</p>
          <StarRow rating={data.rating} size={22} />
          {data.user_ratings_total != null && (
            <p className="text-gray-400 text-sm mt-3">
              Note de confiance {data.rating} ({data.user_ratings_total.toLocaleString("fr-FR")} avis)
            </p>
          )}
        </div>
        <div className="lg:col-span-8 grid sm:grid-cols-2 gap-6">
          {visible.map((rev, i) => (
            <ReviewCard key={`${rev.author_name}-${rev.time}-${i}`} review={rev} />
          ))}
        </div>
      </div>
    </section>
  );
}
