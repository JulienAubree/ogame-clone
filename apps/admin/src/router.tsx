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
      { index: true, lazy: () => import('./pages/Dashboard').then((m) => ({ Component: m.default })) },
      { path: 'dashboard', lazy: () => import('./pages/Dashboard').then((m) => ({ Component: m.default })) },
      { path: 'categories', lazy: () => import('./pages/Categories').then((m) => ({ Component: m.default })) },
      { path: 'buildings', lazy: () => import('./pages/Buildings').then((m) => ({ Component: m.default })) },
      { path: 'research', lazy: () => import('./pages/Research').then((m) => ({ Component: m.default })) },
      { path: 'ships', lazy: () => import('./pages/Ships').then((m) => ({ Component: m.default })) },
      { path: 'defenses', lazy: () => import('./pages/Defenses').then((m) => ({ Component: m.default })) },
      { path: 'production', lazy: () => import('./pages/Production').then((m) => ({ Component: m.default })) },
      { path: 'universe', lazy: () => import('./pages/Universe').then((m) => ({ Component: m.default })) },
      { path: 'planet-types', lazy: () => import('./pages/PlanetTypes').then((m) => ({ Component: m.default })) },
      { path: 'players', lazy: () => import('./pages/Players').then((m) => ({ Component: m.default })) },
      { path: 'players/:id', lazy: () => import('./pages/PlayerDetail').then((m) => ({ Component: m.default })) },
      { path: 'pve-missions', lazy: () => import('./pages/PveMissions').then((m) => ({ Component: m.default })) },
      { path: 'tutorial-quests', lazy: () => import('./pages/TutorialQuests').then((m) => ({ Component: m.default })) },
      { path: 'missions', lazy: () => import('./pages/Missions').then((m) => ({ Component: m.default })) },
      { path: 'labels', lazy: () => import('./pages/Labels').then((m) => ({ Component: m.default })) },
      { path: 'talents', lazy: () => import('./pages/Talents').then((m) => ({ Component: m.default })) },
      { path: 'hull-abilities', lazy: () => import('./pages/HullAbilities').then((m) => ({ Component: m.default })) },
      { path: 'gameplay-keys', lazy: () => import('./pages/GameplayKeys').then((m) => ({ Component: m.default })) },
      { path: 'portraits', lazy: () => import('./pages/Portraits').then((m) => ({ Component: m.default })) },
      { path: 'feedbacks', lazy: () => import('./pages/Feedbacks').then((m) => ({ Component: m.default })) },
      { path: 'changelogs', lazy: () => import('./pages/Changelogs').then((m) => ({ Component: m.default })) },
      { path: 'announcements', lazy: () => import('./pages/Announcements').then((m) => ({ Component: m.default })) },
      { path: 'homepage', lazy: () => import('./pages/Homepage').then((m) => ({ Component: m.default })) },
      { path: 'anomalies', lazy: () => import('./pages/Anomalies').then((m) => ({ Component: m.default })) },
    ],
  },
]);
