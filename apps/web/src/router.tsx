import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/layout/Layout';
import { useAuthStore } from './stores/auth.store';
import { ErrorBoundary } from './components/common/ErrorBoundary';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RouteErrorFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold text-destructive">Page introuvable ou erreur</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a rencontré un problème.
        </p>
        <a href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Retour à l'accueil
        </a>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('./pages/Login').then((m) => ({ Component: m.default })),
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/register',
    lazy: () => import('./pages/Register').then((m) => ({ Component: m.default })),
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    errorElement: <RouteErrorFallback />,
    children: [
      {
        index: true,
        lazy: () => import('./pages/Overview').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'resources',
        lazy: () => import('./pages/Resources').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'buildings',
        lazy: () => import('./pages/Buildings').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'research',
        lazy: () => import('./pages/Research').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'shipyard',
        lazy: () => import('./pages/Shipyard').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'defense',
        lazy: () => import('./pages/Defense').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'galaxy',
        lazy: () => import('./pages/Galaxy').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'fleet',
        lazy: () => import('./pages/Fleet').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'movements',
        lazy: () => import('./pages/Movements').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'messages',
        lazy: () => import('./pages/Messages').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'ranking',
        lazy: () => import('./pages/Ranking').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'alliance',
        lazy: () => import('./pages/Alliance').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'alliance-ranking',
        lazy: () => import('./pages/AllianceRanking').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'history',
        lazy: () => import('./pages/History').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
    ],
  },
]);
