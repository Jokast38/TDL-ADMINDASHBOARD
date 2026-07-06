import { useEffect } from "react";

export default function PublicKamiStreet() {
  useEffect(() => {
    window.location.replace("https://kamistreet.fr/");
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white" data-testid="kami-redirect">
      <div className="text-center">
        <p className="overline mb-2" style={{ color: "#d4af37" }}>Redirection</p>
        <p className="text-lg">Vous êtes redirigé vers <a href="https://kamistreet.fr/" className="underline">kamistreet.fr</a>…</p>
      </div>
    </div>
  );
}
