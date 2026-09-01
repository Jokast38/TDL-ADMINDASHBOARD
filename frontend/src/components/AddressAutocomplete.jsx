import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { MapPin } from "@phosphor-icons/react";

/**
 * Champ Adresse avec autocomplétion Google Places (proxy backend
 * /places/autocomplete + /places/details, voir backend/routers/places.py —
 * la clé API reste côté serveur).
 *
 * `value` reste un simple texte libre (l'utilisateur peut toujours taper une
 * adresse à la main sans rien sélectionner) ; `onSelect(ville)` est appelé
 * uniquement quand une suggestion est choisie, pour pré-remplir un éventuel
 * champ Ville séparé.
 */
export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, testId }) {
  const [predictions, setPredictions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef(crypto.randomUUID());
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(debounceRef.current);
    if (v.trim().length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/places/autocomplete", {
          params: { input: v, session_token: sessionToken.current },
        });
        setPredictions(data.predictions || []);
        setOpen(true);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const selectPrediction = async (p) => {
    onChange(p.description);
    setOpen(false);
    setPredictions([]);
    try {
      const { data } = await api.get("/places/details", {
        params: { place_id: p.place_id, session_token: sessionToken.current },
      });
      onChange(data.formatted_address || p.description);
      onSelect?.(data.ville || "");
    } catch {
      // La description brute reste utilisable même si le détail échoue.
    } finally {
      sessionToken.current = crypto.randomUUID();
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={value}
        onChange={handleChange}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testId}
      />
      {open && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
          {predictions.map((p) => (
            <button
              type="button"
              key={p.place_id}
              onClick={() => selectPrediction(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-start gap-2 border-b border-gray-100 last:border-0"
            >
              <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
              <span>{p.description}</span>
            </button>
          ))}
        </div>
      )}
      {loading && <p className="text-xs text-gray-400 mt-1">Recherche...</p>}
    </div>
  );
}
