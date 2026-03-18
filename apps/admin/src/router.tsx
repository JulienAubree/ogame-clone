import { createBrowserRouter, Navigate } from 'react-router';
import { AdminLayout } from './components/layout/AdminLayout';
import { useAuthStore } from './stores/auth.store';

function AdminGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!token || !user?.isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('./pages/Login').then((m) => ({ Component: m.default })),
  },
  {
    path: '/',
    element: (
      <AdminGuard>
        <AdminLayout />
      </AdminGuard>
    ),
    children: [
      { index: true, lazy: () => import('./pages/Buildings').then((m) => ({ Component: m.default })) },
      { path: 'categories', lazy: () => import('./pages/Categories').then((m) => ({ Component: m.default })) },
      { path: 'buildings', lazy: () => import('./pages/Buildings').then((m) => ({ Component: m.default })) },
      { path: 'research', lazy: () => import('./pages/Research').then((m) => ({ Component: m.default })) },
      { path: 'ships', lazy: () => import('./pages/Ships').then((m) => ({ Component: m.default })) },
      { path: 'defenses', lazy: () => import('./pages/Defenses').then((m) => ({ Component: m.default })) },
      { path: 'rapid-fire', lazy: () => import('./pages/RapidFire').then((m) => ({ Component: m.default })) },
      { path: 'production', lazy: () => import('./pages/Production').then((m) => ({ Component: m.default })) },
      { path: 'universe', lazy: () => import('./pages/Universe').then((m) => ({ Component: m.default })) },
      { path: 'planet-types', lazy: () => import('./pages/PlanetTypes').then((m) => ({ Component: m.default })) },
      { path: 'players', lazy: () => import('./pages/Players').then((m) => ({ Component: m.default })) },
      { path: 'players/:id', lazy: () => import('./pages/PlayerDetail').then((m) => ({ Component: m.default })) },
      { path: 'pve-missions', lazy: () => import('./pages/PveMissions').then((m) => ({ Component: m.default })) },
      { path: 'tutorial-quests', lazy: () => import('./pages/TutorialQuests').then((m) => ({ Component: m.default })) },
    ],
  },
]);
