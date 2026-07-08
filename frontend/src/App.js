import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import PublicInscription from "@/pages/PublicInscription";
import PublicKamiStreet from "@/pages/PublicKamiStreet";
import StudentSpace from "@/pages/StudentSpace";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";

import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Formations from "@/pages/Formations";
import Inscriptions from "@/pages/Inscriptions";
import Dossiers from "@/pages/Dossiers";
import KamiStreet from "@/pages/KamiStreet";
import Orders from "@/pages/Orders";
import AIAssistant from "@/pages/AIAssistant";
import Employees from "@/pages/Employees";
import Settings from "@/pages/Settings";
import Marketing from "@/pages/Marketing";
import AdminBlog from "@/pages/AdminBlog";
import Stages from "@/pages/Stages";
import AnimateurSpace from "@/pages/AnimateurSpace";
import DocumentsLibrary from "@/pages/DocumentsLibrary";
import DocTemplates from "@/pages/DocTemplates";
import Leads from "@/pages/Leads";
import AnalyticsLoader from "@/components/AnalyticsLoader";

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="auth-loading">
        <div className="text-sm text-gray-400">Chargement...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const fallback =
      user.role === "etudiant" ? "/espace-eleve" :
      user.role === "animateur" ? "/espace-animateur" :
      user.role === "commercial" ? "/admin/leads" :
      "/admin";
    return <Navigate to={fallback} replace />;
  }
  return children;
}

function AdminLayout({ children }) {
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AnalyticsLoader />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/inscription" element={<PublicInscription />} />
            <Route path="/kami-street" element={<PublicKamiStreet />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />

            <Route path="/espace-eleve" element={
              <ProtectedRoute roles={["etudiant"]}><StudentSpace /></ProtectedRoute>
            } />
            <Route path="/espace-animateur" element={
              <ProtectedRoute roles={["animateur"]}><AdminLayout><AnimateurSpace /></AdminLayout></ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin", "responsable_commercial"]}><AdminLayout><Dashboard /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/formations" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission"]}><AdminLayout><Formations /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/stages" element={
              <ProtectedRoute roles={["admin", "responsable_admission"]}><AdminLayout><Stages /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/inscriptions" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin"]}><AdminLayout><Inscriptions /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/dossiers" element={
              <ProtectedRoute roles={["admin", "employe", "responsable_admission", "agent_admin"]}><AdminLayout><Dossiers /></AdminLayout></ProtectedRoute>
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
            <Route path="/admin/kami-street" element={
              <ProtectedRoute roles={["admin", "employe", "commercial", "responsable_commercial"]}><AdminLayout><KamiStreet /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/orders" element={
              <ProtectedRoute roles={["admin", "employe", "commercial", "responsable_commercial"]}><AdminLayout><Orders /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/ai" element={
              <ProtectedRoute roles={["admin", "employe"]}><AdminLayout><AIAssistant /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/employees" element={
              <ProtectedRoute roles={["admin", "responsable_commercial"]}><AdminLayout><Employees /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <ProtectedRoute roles={["admin"]}><AdminLayout><Settings /></AdminLayout></ProtectedRoute>
            } />
            <Route path="/admin/marketing" element={
              <ProtectedRoute roles={["admin"]}><AdminLayout><Marketing /></AdminLayout></ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;