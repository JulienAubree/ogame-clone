import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/layout/Layout';
import { useAuthStore } from './stores/auth.store';
import { ErrorBoundary } from './components/common/ErrorBoundary';

/** Wrap a lazy import to auto-reload on stale chunk errors (post-deployment) */
function lazyLoad(importFn: () => Promise<{ default: React.ComponentType }>) {
  return () =>
    importFn()
      .then((m) => ({ Component: m.default }))
      .catch((err) => {
        // Chunk load failure (stale deployment) — reload once
        if (!sessionStorage.getItem('chunk_reload')) {
          sessionStorage.setItem('chunk_reload', '1');
          window.location.reload();
        }
        throw err;
      });
}

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
    lazy: lazyLoad(() => import('./pages/Login')),
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/register',
    lazy: lazyLoad(() => import('./pages/Register')),
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
        lazy: lazyLoad(() => import('./pages/Overview')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'resources',
        lazy: lazyLoad(() => import('./pages/Resources')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'buildings',
        lazy: lazyLoad(() => import('./pages/Buildings')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'research',
        lazy: lazyLoad(() => import('./pages/Research')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'shipyard',
        lazy: lazyLoad(() => import('./pages/Shipyard')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'command-center',
        lazy: lazyLoad(() => import('./pages/CommandCenter')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'defense',
        lazy: lazyLoad(() => import('./pages/Defense')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'galaxy',
        lazy: lazyLoad(() => import('./pages/Galaxy')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'fleet',
        lazy: lazyLoad(() => import('./pages/FleetDashboard')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'fleet/send',
        lazy: lazyLoad(() => import('./pages/Fleet')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'fleet/stationed',
        lazy: lazyLoad(() => import('./pages/StationedFleet')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'fleet/movements',
        lazy: lazyLoad(() => import('./pages/Movements')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'missions',
        lazy: lazyLoad(() => import('./pages/Missions')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'movements',
        element: <Navigate to="/fleet/movements" replace />,
      },
      {
        path: 'market',
        lazy: lazyLoad(() => import('./pages/Market')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'messages',
        lazy: lazyLoad(() => import('./pages/Messages')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'reports',
        lazy: lazyLoad(() => import('./pages/Reports')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'ranking',
        lazy: lazyLoad(() => import('./pages/Ranking')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'alliance',
        lazy: lazyLoad(() => import('./pages/Alliance')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'alliance-ranking',
        lazy: lazyLoad(() => import('./pages/AllianceRanking')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'history',
        lazy: lazyLoad(() => import('./pages/History')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'profile',
        lazy: lazyLoad(() => import('./pages/Profile')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'player/:userId',
        lazy: lazyLoad(() => import('./pages/PlayerProfile')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
    ],
  },
]);
