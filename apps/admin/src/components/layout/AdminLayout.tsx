import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/stores/auth.store';
import { useState, useEffect } from 'react';
import {
  Building2, FlaskConical, Rocket, Shield, Zap,
  Factory, Globe, Users, LogOut, LayoutGrid, Orbit,
  Skull, GraduationCap, Compass, Tag, Sparkles, MessageSquare, FileText, Bolt, Key,
  Menu, X, CircleUserRound, Megaphone, LayoutDashboard, Home, Atom,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    title: 'Monitoring',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Config Jeu',
    items: [
      { to: '/categories', label: 'Categories', icon: LayoutGrid },
      { to: '/buildings', label: 'Batiments', icon: Building2 },
      { to: '/research', label: 'Recherches', icon: FlaskConical },
      { to: '/ships', label: 'Vaisseaux', icon: Rocket },
      { to: '/defenses', label: 'Defenses', icon: Shield },
      { to: '/production', label: 'Production', icon: Factory },
      { to: '/universe', label: 'Univers', icon: Globe },
      { to: '/planet-types', label: 'Types de planetes', icon: Orbit },
      { to: '/labels', label: 'Labels', icon: Tag },
    ],
  },
  {
    title: 'Gameplay',
    items: [
      { to: '/missions', label: 'Missions', icon: Compass },
      { to: '/pve-missions', label: 'Missions PvE', icon: Skull },
      { to: '/anomalies', label: 'Anomalies', icon: Atom },
      { to: '/talents', label: 'Talents Flagship', icon: Sparkles },
      { to: '/hull-abilities', label: 'Capacites Flagship', icon: Bolt },
      { to: '/gameplay-keys', label: 'Cles de gameplay', icon: Key },
      { to: '/tutorial-quests', label: 'Onboarding', icon: GraduationCap },
    ],
  },
  {
    title: 'Joueurs',
    items: [
      { to: '/portraits', label: 'Portraits', icon: CircleUserRound },
      { to: '/players', label: 'Gestion joueurs', icon: Users },
      { to: '/feedbacks', label: 'Feedback', icon: MessageSquare },
      { to: '/changelogs', label: 'Changelogs', icon: FileText },
      { to: '/announcements', label: 'Annonces', icon: Megaphone },
    ],
  },
  {
    title: 'Site',
    items: [
      { to: '/homepage', label: "Page d'accueil", icon: Home },
    ],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return (
    <>
      <div className="px-4 py-5 border-b border-panel-border">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-hull-500" />
          <span className="font-mono font-semibold text-hull-400 text-sm tracking-wider">
            EXILIUM
          </span>
        </div>
        <div className="text-[10px] font-mono text-gray-600 mt-1 tracking-widest uppercase">
          Admin Panel
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-4 mb-1.5 text-[10px] font-mono font-medium text-gray-600 uppercase tracking-widest">
              {section.title}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'text-hull-400 bg-hull-950/50 border-r-2 border-hull-500'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-panel-hover'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-panel-border">
        <div className="text-xs text-gray-500 truncate">{user?.email}</div>
        <button
          onClick={() => {
            clearAuth();
            window.location.href = '/login';
          }}
          className="flex items-center gap-1.5 mt-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Deconnexion
        </button>
      </div>
    </>
  );
}

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (for mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 py-3 bg-panel-light border-b border-panel-border md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-400 hover:text-gray-200"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Zap className="w-4 h-4 text-hull-500" />
        <span className="font-mono font-semibold text-hull-400 text-xs tracking-wider">
          EXILIUM
        </span>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <aside
            className="w-64 h-full bg-panel-light border-r border-panel-border flex flex-col animate-slide-in-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end px-3 pt-3">
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 bg-panel-light border-r border-panel-border flex-col">
        <Sidebar />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto grid-bg pt-14 md:pt-0">
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
