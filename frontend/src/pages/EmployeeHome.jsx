import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Folders, IdentificationCard, Student, UsersThree, PhoneCall, Bell, CheckCircle,
} from "@phosphor-icons/react";

const DOSSIER_STATUS_LABEL = {
  nouveau: "À traiter", en_verification: "En cours", complet: "Complet",
  soumis_ants: "Soumis ANTS", termine: "Terminé", rejete: "À corriger",
};

const DOSSIER_STATUS_COLOR = {
  nouveau: "bg-gray-100 text-gray-700",
  en_verification: "bg-[#F5A623]/10 text-[#F5A623]",
  complet: "bg-blue-100 text-blue-700",
  soumis_ants: "bg-gray-800 text-white",
  termine: "bg-[#0B7238]/10 text-[#0B7238]",
  rejete: "bg-red-100 text-red-700",
};

const SHORTCUTS = [
  { to: "/admin/apprenants", label: "Apprenants", icon: Student },
  { to: "/admin/dossiers", label: "Dossiers (Kanban)", icon: Folders },
  { to: "/admin/inscriptions", label: "Inscriptions", icon: IdentificationCard },
  { to: "/admin/leads", label: "Leads", icon: UsersThree },
];

export default function EmployeeHome() {
  const { user } = useAuth();
  const [myDossiers, setMyDossiers] = useState([]);
  const [callbacksPending, setCallbacksPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/dossiers").catch(() => ({ data: [] })),
      api.get("/callback-requests").catch(() => ({ data: [] })),
    ]).then(([dossiersRes, callbacksRes]) => {
      const mine = (dossiersRes.data || []).filter(
        (d) => d.assigned_to === user?.id && d.status !== "termine"
      );
      setMyDossiers(mine);
      const pending = (callbacksRes.data || []).filter((c) => !c.handled).slice(0, 6);
      setCallbacksPending(pending);
    }).finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <div className="space-y-6" data-testid="employee-home">
      <div>
        <p className="overline">Mon espace</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-1">Bonjour {user?.name?.split(" ")[0] || ""}</h1>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to} data-testid={`shortcut-${s.to.split("/").pop()}`}>
            <Card className="p-4 border border-gray-200 rounded-md shadow-none hover:border-[#d4af37] transition-colors flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                <s.icon size={20} className="text-gray-600" weight="duotone" />
              </div>
              <span className="font-medium text-sm">{s.label}</span>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-5 border border-gray-200 rounded-md shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <Folders size={18} className="text-[#d4af37]" weight="duotone" />
          <h2 className="font-display font-bold text-lg">Mes dossiers assignés</h2>
          {myDossiers.length > 0 && <Badge className="bg-[#d4af37] text-black hover:bg-[#d4af37]">{myDossiers.length}</Badge>}
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : myDossiers.length ? (
          <div className="space-y-2">
            {myDossiers.slice(0, 8).map((d) => (
              <Link key={d.id} to="/admin/dossiers" className="flex items-center justify-between p-3 border border-gray-100 rounded-md hover:border-gray-300 transition-colors" data-testid={`my-dossier-${d.id}`}>
                <div>
                  <p className="text-sm font-medium">{d.student_name}</p>
                  <p className="text-xs text-gray-500">{d.formation_title}</p>
                </div>
                <Badge className={`${DOSSIER_STATUS_COLOR[d.status] || ""} hover:${DOSSIER_STATUS_COLOR[d.status] || ""} text-[10px]`}>
                  {DOSSIER_STATUS_LABEL[d.status] || d.status}
                </Badge>
              </Link>
            ))}
            {myDossiers.length > 8 && (
              <Link to="/admin/dossiers" className="text-xs text-[#d4af37] hover:underline">Voir les {myDossiers.length} dossiers →</Link>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <CheckCircle size={16} /> Aucun dossier qui vous est assigné pour le moment.
          </div>
        )}
      </Card>

      <Card className="p-5 border border-gray-200 rounded-md shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-[#d4af37]" weight="duotone" />
          <h2 className="font-display font-bold text-lg">Notifications récentes</h2>
          {callbacksPending.length > 0 && <Badge className="bg-[#d4af37] text-black hover:bg-[#d4af37]">{callbacksPending.length}</Badge>}
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : callbacksPending.length ? (
          <div className="space-y-2">
            {callbacksPending.map((c) => (
              <Link key={c.id} to="/admin/inscriptions" className="flex items-center gap-3 p-3 border border-gray-100 rounded-md hover:border-gray-300 transition-colors" data-testid={`callback-${c.id}`}>
                <PhoneCall size={16} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{c.prenom} {c.nom}</p>
                  <p className="text-xs text-gray-500">Demande de rappel — {c.telephone}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <CheckCircle size={16} /> Aucune demande de rappel en attente.
          </div>
        )}
      </Card>
    </div>
  );
}
