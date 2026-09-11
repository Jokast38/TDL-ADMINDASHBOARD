import "@/App.css";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import ErrorPage from "@/pages/ErrorPage";

// Toutes les pages sont chargées à la demande (React.lazy) plutôt
// qu'importées statiquement — sans ça, un visiteur anonyme arrivant sur une
// landing page publique (ex: /stage-recuperation-points) téléchargeait et
// parsait aussi tout le code des ~40 pages de l'admin (Stages, Marketing,
// IA...) avant le premier rendu, ce qui plombait les performances mobiles
// (gros JS inutilisé, TBT/LCP élevés — voir rapport Lighthouse). Avec
// React.lazy, chaque route devient son propre chunk téléchargé uniquement
// quand on y navigue.
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const PublicInscription = lazy(() => import("@/pages/PublicInscription"));
const FormationDetail = lazy(() => import("@/pages/FormationDetail"));
const PublicFormations = lazy(() => import("@/pages/PublicFormations"));
const PublicKamiStreet = lazy(() => import("@/pages/PublicKamiStreet"));
const StudentSpace = lazy(() => import("@/pages/StudentSpace"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const OffreFideliteLanding = lazy(() => import("@/pages/OffreFideliteLanding"));
const StageRecuperationPointsLanding = lazy(() => import("@/pages/StageRecuperationPointsLanding"));
const SsiapLanding = lazy(() => import("@/pages/SsiapLanding"));
const TaxiFormationLanding = lazy(() => import("@/pages/TaxiFormationLanding"));
const MobiliteTaxiLanding = lazy(() => import("@/pages/MobiliteTaxiLanding"));
const PasserelleTaxiBanlieueLanding = lazy(() => import("@/pages/PasserelleTaxiBanlieueLanding"));
const VtcFormationLanding = lazy(() => import("@/pages/VtcFormationLanding"));
const CacesFormationLanding = lazy(() => import("@/pages/CacesFormationLanding"));
const MentionsLegales = lazy(() => import("@/pages/MentionsLegales"));
const PositioningTest = lazy(() => import("@/pages/PositioningTest"));
const FrenchTest = lazy(() => import("@/pages/FrenchTest"));
const SatisfactionSurvey = lazy(() => import("@/pages/SatisfactionSurvey"));
const StageRecuperationMerci = lazy(() => import("@/pages/StageRecuperationMerci"));
const FAQ = lazy(() => import("@/pages/FAQ"));

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const EmployeeHome = lazy(() => import("@/pages/EmployeeHome"));
const Formations = lazy(() => import("@/pages/Formations"));
const Inscriptions = lazy(() => import("@/pages/Inscriptions"));
const PaiementConfirmation = lazy(() => import("@/pages/PaiementConfirmation"));
const Students = lazy(() => import("@/pages/Students"));
const Exams = lazy(() => import("@/pages/Exams"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const Dossiers = lazy(() => import("@/pages/Dossiers"));
const KamiStreet = lazy(() => import("@/pages/KamiStreet"));
const Orders = lazy(() => import("@/pages/Orders"));
const AIAssistant = lazy(() => import("@/pages/AIAssistant"));
const Employees = lazy(() => import("@/pages/Employees"));
const Formateurs = lazy(() => import("@/pages/Formateurs"));
const Activity = lazy(() => import("@/pages/Activity"));
const Settings = lazy(() => import("@/pages/Settings"));
const Marketing = lazy(() => import("@/pages/Marketing"));
const AdminBlog = lazy(() => import("@/pages/AdminBlog"));
const Stages = lazy(() => import("@/pages/Stages"));
const Agenda = lazy(() => import("@/pages/Agenda"));
const Modules = lazy(() => import("@/pages/Modules"));
const AnimateurSpace = lazy(() => import("@/pages/AnimateurSpace"));
const DocumentsLibrary = lazy(() => import("@/pages/DocumentsLibrary"));
const DocTemplates = lazy(() => import("@/pages/DocTemplates"));
const CompanyDocuments = lazy(() => import("@/pages/CompanyDocuments"));
const Leads = lazy(() => import("@/pages/Leads"));
const HelpCenter = lazy(() => import("@/pages/HelpCenter"));
const Documentation = lazy(() => import("@/pages/Documentation"));
const PolitiqueConfidentialite = lazy(() => import("@/pages/PolitiqueConfidentialite"));

import Layout from "@/components/Layout";
import { TourProvider } from "@/contexts/TourContext";
import TourOverlay from "@/components/TourOverlay";
import AnalyticsLoader from "@/components/AnalyticsLoader";
import CookieConsent from "@/components/CookieConsent";
import { roleHome } from "@/lib/roleHome";

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="auth-loading">
        <div className="text-sm text-gray-400">Chargement...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  return children;
}

function AdminLayout({ children }) {
  return <Layout>{children}</Layout>;
}

// Fallback minimal pendant le chargement du chunk de la route — évite un
// écran blanc sans pour autant peser sur le bundle initial.
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div
        className="w-8 h-8 rounded-full border-[3px] border-[#d4af37]/25 border-t-[#d4af37] animate-spin"
        role="status"
        aria-label="Chargement"
      />
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <TourProvider>
          <AnalyticsLoader />
          <CookieConsent />
          <TourOverlay />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/change-password" element={
              <ProtectedRoute><ChangePassword /></ProtectedRoute>
            } />
            <Route path="/inscription" element={<PublicInscription />} />
            <Route path="/formations" element={<PublicFormations />} />
            <Route path="/formations/:id" element={<FormationDetail />} />
            <Route path="/kami-street" element={<PublicKamiStreet />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/offre-fidelite" element={<OffreFideliteLanding />} />
            <Route path="/stage-recuperation-points" element={<StageRecuperationPointsLanding />} />
            <Route path="/stage-recuperation-points/merci" element={<StageRecuperationMerci />} />
            <Route path="/formation-ssiap" element={<SsiapLanding />} />
            <Route path="/formation-taxi" element={<TaxiFormationLanding />} />
            <Route path="/mobilite-taxi" element={<MobiliteTaxiLanding />} />
            <Route path="/passerelle-taxi-banlieue-parisien" element={<PasserelleTaxiBanlieueLanding />} />
            <Route path="/formation-vtc" element={<VtcFormationLanding />} />
            <Route path="/formation-caces" element={<CacesFormationLanding />} />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
            <Route path="/politique-de-confidentialite" element={<PolitiqueConfidentialite />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/test-positionnement/:token" element={<PositioningTest />} />
            <Route path="/test-francais/:token" element={<FrenchTest />} />
            <Route path="/satisfaction/:type/:inscriptionId" element={<SatisfactionSurvey />} />

            <Route path="/espace-eleve" element={
              <ProtectedRoute roles={["etudiant"]}><StudentSpace /></ProtectedRoute>
            } />
            <Route path="/espace-animateur" element={
              <ProtectedRoute roles={["animateur"]}><AdminLayout><AnimateurSpace /></AdminLayout></ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_commercial"]}><AdminLayout><Dashboard /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/accueil" element={
              <ProtectedRoute roles={["responsable_admission", "agent_admin"]}><AdminLayout><EmployeeHome /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/formations" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission"]}><AdminLayout><Formations /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/stages" element={
              <ProtectedRoute roles={["admin", "responsable_admission"]}><AdminLayout><Stages /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/agenda" element={
              <ProtectedRoute roles={["admin", "responsable_admission", "animateur"]}><AdminLayout><Agenda /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/modules" element={
              <ProtectedRoute roles={["admin", "responsable_admission"]}><AdminLayout><Modules /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/inscriptions" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"]}><AdminLayout><Inscriptions /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/paiement-confirmation" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"]}><AdminLayout><PaiementConfirmation /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/apprenants" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin"]}><AdminLayout><Students /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/dossiers" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin"]}><AdminLayout><Dossiers /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/examens" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin"]}><AdminLayout><Exams /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/rdv" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin"]}><AdminLayout><Appointments /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/leads" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"]}><AdminLayout><Leads /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/documents-library" element={
              <ProtectedRoute roles={["admin", "responsable_admission", "agent_admin"]}><AdminLayout><DocumentsLibrary /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/doc-templates" element={
              <ProtectedRoute roles={["admin"]}><AdminLayout><DocTemplates /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/company-documents" element={
              <ProtectedRoute roles={["admin", "responsable_admission", "agent_admin"]}><AdminLayout><CompanyDocuments /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/kami-street" element={
              <ProtectedRoute roles={["admin", "employe", "commercial", "responsable_commercial"]}><AdminLayout><KamiStreet /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/orders" element={
              <ProtectedRoute roles={["admin", "employe", "commercial", "responsable_commercial"]}><AdminLayout><Orders /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/blog" element={
              <ProtectedRoute roles={["admin", "employe"]}><AdminLayout><AdminBlog /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/ai" element={
              <ProtectedRoute roles={["admin", "employe", "animateur", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"]}><AdminLayout><AIAssistant /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/employees" element={
              <ProtectedRoute roles={["admin", "responsable_commercial"]}><AdminLayout><Employees /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/formateurs" element={
              <ProtectedRoute roles={["admin", "responsable_admission", "agent_admin"]}><AdminLayout><Formateurs /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/activite" element={
              <ProtectedRoute roles={["admin"]}><AdminLayout><Activity /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <ProtectedRoute roles={["admin"]}><AdminLayout><Settings /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/aide" element={
              <ProtectedRoute roles={["admin", "employe", "animateur", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"]}><AdminLayout><HelpCenter /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/documentation" element={
              <ProtectedRoute roles={["admin"]}><AdminLayout><Documentation /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/marketing" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"]}><AdminLayout><Marketing /></AdminLayout></ProtectedRoute>
            } />

            <Route path="*" element={<ErrorPage />} />
          </Routes>
          </Suspense>
          <Toaster position="top-right" richColors />
          </TourProvider>
        </AuthProvider>
      </BrowserRouter>
      </ErrorBoundary>
    </div>
  );
}

export default App;
