import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Contexte de visite guidée monté à la racine de l'app (voir App.js), en
// dehors du <Routes> — indispensable puisqu'une visite enchaîne des étapes
// sur des pages différentes : si l'état vivait dans une page, il serait
// perdu à chaque navigation.
const TourContext = createContext(null);

export function TourProvider({ children }) {
  const [tour, setTour] = useState(null); // { category, stepIndex }

  const startTour = useCallback((category, stepIndex = 0) => {
    setTour({ category, stepIndex });
  }, []);

  const stopTour = useCallback(() => setTour(null), []);

  const nextStep = useCallback(() => {
    setTour((t) => {
      if (!t) return t;
      const next = t.stepIndex + 1;
      if (next >= t.category.steps.length) return null;
      return { ...t, stepIndex: next };
    });
  }, []);

  const prevStep = useCallback(() => {
    setTour((t) => (t && t.stepIndex > 0 ? { ...t, stepIndex: t.stepIndex - 1 } : t));
  }, []);

  const value = useMemo(() => ({ tour, startTour, stopTour, nextStep, prevStep }), [tour, startTour, stopTour, nextStep, prevStep]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}
