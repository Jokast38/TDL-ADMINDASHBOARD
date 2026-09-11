import { Component } from "react";
import ErrorPage from "@/pages/ErrorPage";

// Filet de sécurité global : sans ça, un plantage React affichait un écran
// blanc silencieux (ou l'overlay brut de dev), jamais rien aux couleurs de
// la marque pour un visiteur public.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Erreur applicative interceptée :", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          code="Erreur"
          title="Une erreur est survenue"
          message="Quelque chose s'est mal passé de notre côté. Essayez de revenir à l'accueil, ou réessayez dans quelques instants."
        />
      );
    }
    return this.props.children;
  }
}
