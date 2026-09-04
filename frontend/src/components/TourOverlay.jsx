import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, CheckCircle, X } from "@phosphor-icons/react";
import { useTour } from "@/contexts/TourContext";

const PAD = 8; // marge autour de l'élément entouré
const FIND_TIMEOUT_MS = 3000;
const FIND_POLL_MS = 100;

// Halo réel autour du bouton à utiliser (pas juste un dialog décrivant la
// fonctionnalité) : on navigue vers la page de l'étape, on cherche le vrai
// élément du DOM (via son data-testid), on le fait défiler dans l'écran, puis
// on assombrit tout le reste avec 4 bandes découpées autour de son contour —
// la zone entourée reste cliquable (aucun div ne la recouvre), le reste de
// la page est visuellement désactivé. Se recalcule au scroll/resize.
export default function TourOverlay() {
  const { tour, nextStep, prevStep, stopTour } = useTour();
  const navigate = useNavigate();
  const location = useLocation();
  const [rect, setRect] = useState(null);
  const [searching, setSearching] = useState(false);
  const timeoutRef = useRef(null);
  const pollRef = useRef(null);
  const tooltipRef = useRef(null);
  const [tooltipHeight, setTooltipHeight] = useState(260); // estimation avant mesure réelle

  const step = tour?.category?.steps?.[tour.stepIndex];
  const stepCount = tour?.category?.steps?.length || 0;
  const isLast = tour && tour.stepIndex === stepCount - 1;
  const isFirst = tour && tour.stepIndex === 0;

  // Navigue vers la page de l'étape si besoin.
  useEffect(() => {
    if (!step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [step, step?.route, location.pathname, navigate]);

  // Cherche l'élément cible une fois sur la bonne page, avec un timeout —
  // certaines pages chargent leurs données en async, l'élément peut mettre
  // un instant à apparaître.
  useEffect(() => {
    setRect(null);
    if (!step) return;
    if (step.route && location.pathname !== step.route) return; // navigation en cours
    if (!step.targetSelector) return;

    setSearching(true);
    const start = Date.now();

    const tryFind = () => {
      const el = document.querySelector(step.targetSelector);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // Laisse le temps au scroll fluide de se terminer avant de mesurer.
        setTimeout(() => {
          setRect(el.getBoundingClientRect());
          setSearching(false);
        }, 350);
        return;
      }
      if (Date.now() - start > FIND_TIMEOUT_MS) {
        setSearching(false);
        return;
      }
      pollRef.current = setTimeout(tryFind, FIND_POLL_MS);
    };
    tryFind();

    return () => clearTimeout(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.targetSelector, step?.route, location.pathname]);

  // Recalcule la position au scroll/resize pendant qu'une étape est affichée.
  useEffect(() => {
    if (!step?.targetSelector || !rect) return;
    const update = () => {
      const el = document.querySelector(step.targetSelector);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.targetSelector, !!rect]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // Mesure la hauteur réelle du tooltip une fois rendu (le texte de chaque
  // étape a une longueur différente) pour pouvoir le clamper précisément
  // dans l'écran — sans ça, un tooltip placé "au-dessus" d'un élément proche
  // du haut de l'écran pouvait dépasser par le haut et devenir invisible.
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const h = tooltipRef.current.getBoundingClientRect().height;
      if (h && Math.abs(h - tooltipHeight) > 2) setTooltipHeight(h);
    }
  });

  if (!tour || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box = rect
    ? {
        top: Math.max(rect.top - PAD, 0),
        left: Math.max(rect.left - PAD, 0),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Position du tooltip : sous l'élément si la place le permet, sinon
  // au-dessus — dans tous les cas, le résultat est ensuite clampé pour
  // rester entièrement dans l'écran (jamais coupé en haut ni en bas), quelle
  // que soit la position de l'élément entouré ou la longueur du texte.
  const MARGIN = 16;
  let tooltipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  if (box) {
    const tooltipWidth = 360;
    const spaceBelow = vh - (box.top + box.height);
    const spaceAbove = box.top;
    const placeBelow = spaceBelow >= tooltipHeight + MARGIN || spaceBelow >= spaceAbove;
    let top = placeBelow ? box.top + box.height + 14 : box.top - 14 - tooltipHeight;
    top = Math.min(Math.max(top, MARGIN), Math.max(vh - tooltipHeight - MARGIN, MARGIN));
    const left = Math.min(Math.max(box.left, MARGIN), Math.max(vw - tooltipWidth - MARGIN, MARGIN));
    tooltipStyle = { top, left };
  }

  return (
    <div className="fixed inset-0 z-[9999]" data-testid="tour-overlay">
      {box ? (
        <>
          {/* 4 bandes assombries autour du cutout — la zone entourée n'a aucun
              div par-dessus, elle reste donc normalement cliquable. */}
          <div className="fixed bg-black/70 pointer-events-none" style={{ top: 0, left: 0, right: 0, height: box.top }} />
          <div className="fixed bg-black/70 pointer-events-none" style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
          <div className="fixed bg-black/70 pointer-events-none" style={{ top: box.top, left: 0, width: box.left, height: box.height }} />
          <div className="fixed bg-black/70 pointer-events-none" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          <div
            className="fixed rounded-lg pointer-events-none animate-pulse"
            style={{
              top: box.top, left: box.left, width: box.width, height: box.height,
              boxShadow: "0 0 0 3px #d4af37, 0 0 24px 4px rgba(212,175,55,0.6)",
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/70 pointer-events-none" />
      )}

      <div
        ref={tooltipRef}
        className="fixed z-[10000] w-[360px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto bg-white rounded-lg shadow-2xl p-5 pointer-events-auto"
        style={tooltipStyle}
        data-testid="tour-tooltip"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#d4af37]">
            {tour.category.label} — {tour.stepIndex + 1}/{stepCount}
          </p>
          <button onClick={stopTour} className="text-gray-400 hover:text-gray-700 shrink-0" aria-label="Fermer la visite" data-testid="tour-close">
            <X size={16} />
          </button>
        </div>
        <h3 className="font-display font-bold text-lg mt-1">{step.title}</h3>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{step.description}</p>
        {!rect && !searching && step.targetSelector && (
          <p className="text-xs text-amber-600 mt-2">
            Élément introuvable sur cette page pour le moment (peut-être caché derrière une autre action) — utilisez "Suivant" pour continuer.
          </p>
        )}
        {searching && <p className="text-xs text-gray-400 mt-2">Recherche de l'élément...</p>}

        <div className="flex items-center justify-center gap-1.5 py-3">
          {tour.category.steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === tour.stepIndex ? "w-6 bg-[#0a0a0a]" : "w-1.5 bg-gray-200"}`} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={stopTour} className="text-gray-500" data-testid="tour-skip">
            Passer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={prevStep} disabled={isFirst} data-testid="tour-prev">
              <ArrowLeft size={14} className="mr-1" /> Précédent
            </Button>
            {isLast ? (
              <Button size="sm" onClick={stopTour} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="tour-finish">
                <CheckCircle size={14} className="mr-1" weight="fill" /> Terminer
              </Button>
            ) : (
              <Button size="sm" onClick={nextStep} className="bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white" data-testid="tour-next">
                Suivant <ArrowRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
