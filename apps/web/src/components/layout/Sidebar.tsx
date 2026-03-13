import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

const navItems = [
  { label: "Vue d'ensemble", path: '/', icon: '🌍' },
  { label: 'Ressources', path: '/resources', icon: '⛏️' },
  { label: 'Bâtiments', path: '/buildings', icon: '🏗️' },
  { label: 'Recherche', path: '/research', icon: '🔬' },
  { label: 'Chantier spatial', path: '/shipyard', icon: '🚀' },
  { label: 'Défense', path: '/defense', icon: '🛡️' },
  { label: 'Flotte', path: '/fleet', icon: '🛸' },
  { label: 'Galaxie', path: '/galaxy', icon: '🌌' },
  { label: 'Messages', path: '/messages', icon: '✉️' },
  { label: 'Classement', path: '/ranking', icon: '🏆' },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-lg font-bold text-primary">OGame Clone</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
