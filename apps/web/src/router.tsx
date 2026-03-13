import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/layout/Layout';
import { useAuthStore } from './stores/auth.store';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('./pages/Login').then((m) => ({ Component: m.default })),
  },
  {
    path: '/register',
    lazy: () => import('./pages/Register').then((m) => ({ Component: m.default })),
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        lazy: () => import('./pages/Overview').then((m) => ({ Component: m.default })),
      },
      {
        path: 'resources',
        lazy: () => import('./pages/Resources').then((m) => ({ Component: m.default })),
      },
      {
        path: 'buildings',
        lazy: () => import('./pages/Buildings').then((m) => ({ Component: m.default })),
      },
      {
        path: 'research',
        lazy: () => import('./pages/Research').then((m) => ({ Component: m.default })),
      },
      {
        path: 'shipyard',
        lazy: () => import('./pages/Shipyard').then((m) => ({ Component: m.default })),
      },
      {
        path: 'defense',
        lazy: () => import('./pages/Defense').then((m) => ({ Component: m.default })),
      },
      {
        path: 'galaxy',
        lazy: () => import('./pages/Galaxy').then((m) => ({ Component: m.default })),
      },
      {
        path: 'fleet',
        lazy: () => import('./pages/Fleet').then((m) => ({ Component: m.default })),
      },
      {
        path: 'movements',
        lazy: () => import('./pages/Movements').then((m) => ({ Component: m.default })),
      },
    ],
  },
]);
