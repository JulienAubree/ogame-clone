import { NavLink, Outlet } from 'react-router';
import { useAuthStore } from '@/stores/auth.store';
import {
  Building2, FlaskConical, Rocket, Shield, Zap,
  Factory, Globe, Users, LogOut, Crosshair, LayoutGrid,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    title: 'Config Jeu',
    items: [
      { to: '/categories', label: 'Catégories', icon: LayoutGrid },
      { to: '/buildings', label: 'Batiments', icon: Building2 },
      { to: '/research', label: 'Recherches', icon: FlaskConical },
      { to: '/ships', label: 'Vaisseaux', icon: Rocket },
      { to: '/defenses', label: 'Defenses', icon: Shield },
      { to: '/rapid-fire', label: 'Rapid Fire', icon: Crosshair },
      { to: '/production', label: 'Production', icon: Factory },
      { to: '/universe', label: 'Univers', icon: Globe },
    ],
  },
  {
    title: 'Joueurs',
    items: [
      { to: '/players', label: 'Gestion joueurs', icon: Users },
    ],
  },
];

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-panel-light border-r border-panel-border flex flex-col">
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto grid-bg">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
