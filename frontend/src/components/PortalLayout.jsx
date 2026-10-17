import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ClipboardList, FolderOpen, PlusCircle, Users, LogOut, Car } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/lib/api";

const NavItem = ({ to, icon: Icon, label, testid }) => (
  <NavLink
    to={to}
    end
    data-testid={testid}
    className={({ isActive }) =>
      `flex items-center gap-2.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors border-l-2 lg:border-l-2 ${
        isActive ? "border-[#C0474A] bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-white/60"
      }`
    }
  >
    <Icon className="h-4 w-4" />
    {label}
  </NavLink>
);

export default function PortalLayout() {
  const { user, logout, isStaff } = useAuth();
  const nav = useNavigate();
  const items = isStaff
    ? [
        { to: "/portaal", icon: ClipboardList, label: "Werkorders", testid: "nav-werkorders-tab" },
        { to: "/portaal/voertuigen", icon: FolderOpen, label: "Voertuigen mappen", testid: "nav-voertuigen-mappen-tab" },
        { to: "/portaal/werkorders/nieuw", icon: PlusCircle, label: "Nieuwe werkorder", testid: "nav-nieuwe-order-tab" },
        ...(user.role === "beheerder" ? [{ to: "/portaal/gebruikers", icon: Users, label: "Gebruikers", testid: "nav-gebruikersbeheer-tab" }] : []),
      ]
    : [{ to: "/portaal", icon: Car, label: "Mijn auto's", testid: "nav-klant-portaal-tab" }];

  return (
    <div className="min-h-screen lg:flex">
      <aside className="lg:w-64 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 lg:sticky lg:top-0 lg:h-screen flex flex-col">
        <div className="px-5 py-5 flex items-center justify-between lg:block">
          <div data-testid="portal-header-logo">
            <a href="/" className="font-display text-xl font-extrabold tracking-tight">MERKANIC<span className="text-[#C0474A]">.</span></a>
            <div className="eyebrow mt-1 !text-slate-400">Werkplaats & portaal</div>
          </div>
          <button data-testid="logout-button-mobile" onClick={async () => { await logout(); nav("/login"); }} className="lg:hidden text-slate-500"><LogOut className="h-5 w-5" /></button>
        </div>
        <nav className="flex lg:flex-col overflow-x-auto px-2 lg:px-3 pb-2 lg:pb-0 gap-1">
          {items.map((i) => <NavItem key={i.to} {...i} />)}
        </nav>
        <div className="hidden lg:block mt-auto p-5 border-t border-slate-200">
          <div className="text-sm font-semibold" data-testid="current-user-name">{user.name}</div>
          <div className="text-xs text-slate-500 mb-3" data-testid="current-user-role">{ROLE_LABELS[user.role]} · {user.email}</div>
          <button data-testid="logout-button" onClick={async () => { await logout(); nav("/login"); }} className="flex items-center gap-2 text-sm text-slate-600 hover:text-[#C0474A] transition-colors">
            <LogOut className="h-4 w-4" /> Uitloggen
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-4 sm:px-8 lg:px-12 py-8 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
