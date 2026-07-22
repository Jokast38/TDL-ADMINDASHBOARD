import { useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import {
  House, GraduationCap, Folders, Users, Storefront,
  Robot, Gear, SignOut, List, X, ChartBar, ShoppingCart, IdentificationCard, Article,
  CalendarCheck, FilePdf, FileText, UsersThree
} from "@phosphor-icons/react";

const navAll = [
  { to: "/admin", label: "Dashboard", icon: House, roles: ["admin", "employe", "responsable_admission", "agent_admin", "responsable_commercial"], end: true },
  { to: "/admin/formations", label: "Formations", icon: GraduationCap, roles: ["admin", "employe", "responsable_admission"] },
  { to: "/admin/stages", label: "Sessions de stage", icon: CalendarCheck, roles: ["admin", "responsable_admission"] },
  { to: "/admin/inscriptions", label: "Inscriptions", icon: IdentificationCard, roles: ["admin", "employe", "responsable_admission", "agent_admin"] },
  { to: "/admin/dossiers", label: "Dossiers (Kanban)", icon: Folders, roles: ["admin", "employe", "responsable_admission", "agent_admin"] },
  { to: "/admin/leads", label: "Leads", icon: UsersThree, roles: ["admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"] },
  { to: "/admin/documents-library", label: "Bibliothèque PDF", icon: FilePdf, roles: ["admin", "responsable_admission", "agent_admin"] },
  { to: "/admin/doc-templates", label: "Modèles PDF", icon: FileText, roles: ["admin"] },
  { to: "/admin/kami-street", label: "KAMI STREET", icon: ShoppingCart, roles: ["admin", "employe", "commercial", "responsable_commercial"] },
  { to: "/admin/orders", label: "Commandes", icon: Storefront, roles: ["admin", "employe", "commercial", "responsable_commercial"] },
  { to: "/admin/ai", label: "Assistant IA", icon: Robot, roles: ["admin", "employe", "responsable_admission", "agent_admin"] },
  { to: "/admin/blog", label: "Blog", icon: Article, roles: ["admin", "employe"] },
  { to: "/admin/employees", label: "Employés", icon: Users, roles: ["admin", "responsable_commercial"] },
  { to: "/admin/settings", label: "Paramètres", icon: Gear, roles: ["admin"] },
  { to: "/admin/marketing", label: "Marketing", icon: ChartBar, roles: ["admin"] },
];

const NOTIFICATION_ROLES = ["admin", "employe", "responsable_admission", "agent_admin", "commercial", "responsable_commercial"];

const ROLE_LABELS = {
  admin: "Administrateur",
  employe: "Employé",
  animateur: "Animateur",
  responsable_admission: "Resp. admission",
  agent_admin: "Agent administratif",
  commercial: "Commercial",
  responsable_commercial: "Responsable commercial",
  etudiant: "Étudiant",
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const nav = navAll.filter((n) => n.roles.includes(user?.role));

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-[#f8f9fa]" data-testid="admin-layout">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-gray-200 transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 overflow-y-auto`}
        data-testid="sidebar"
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <Link to="/admin" className="flex items-center gap-2" data-testid="sidebar-logo">
            <img src="https://customer-assets.emergentagent.com/job_tdl-admin-hub/artifacts/o12h65zz_image.png" alt="TDL Formation" className="w-9 h-9 rounded object-contain bg-black" />
            <span className="font-display font-bold text-lg tracking-tight">TDL Formation</span>
          </Link>
          <button onClick={() => setOpen(false)} className="md:hidden p-2" aria-label="Fermer menu" data-testid="sidebar-close">
            <X size={20} />
          </button>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "bg-[#0a0a0a] text-white hover:bg-[#1a1a1a]" : "text-gray-700 hover:bg-gray-100"
                }`
              }
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <item.icon size={18} weight={location.pathname === item.to ? "fill" : "regular"} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4 mt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-[#d4af37] flex items-center justify-center font-semibold text-sm text-black">
              {user?.name?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" data-testid="sidebar-user-name">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{ROLE_LABELS[user?.role] || user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-100 text-gray-700 transition-colors"
            data-testid="logout-button"
          >
            <SignOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {open && (
        <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/40 z-30 md:hidden" />
      )}

      <div className="flex-1 md:ml-72 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-8 sticky top-0 z-20">
          <button onClick={() => setOpen(true)} className="md:hidden p-2 mr-2" aria-label="Ouvrir menu" data-testid="sidebar-open">
            <List size={22} />
          </button>
          <div className="flex-1">
            <p className="overline">TDL Formation · Plateforme interne</p>
          </div>
          {NOTIFICATION_ROLES.includes(user?.role) && <NotificationBell />}
          <Link to="/" className="text-sm text-gray-600 hover:text-[#d4af37] hidden md:inline ml-4" data-testid="header-public-link">
            Site public →
          </Link>
        </header>
        <main className="flex-1 p-4 md:p-8" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}