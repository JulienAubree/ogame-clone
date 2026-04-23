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
    path: '/forgot-password',
    lazy: lazyLoad(() => import('./pages/ForgotPassword')),
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/reset-password',
    lazy: lazyLoad(() => import('./pages/ResetPassword')),
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/verify-email',
    lazy: lazyLoad(() => import('./pages/VerifyEmail')),
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
        path: 'empire',
        lazy: lazyLoad(() => import('./pages/Empire')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'energy',
        lazy: lazyLoad(() => import('./pages/Energy')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'resources',
        element: <Navigate to="/energy" replace />,
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
        path: 'flagship',
        lazy: lazyLoad(() => import('./pages/FlagshipProfile')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'flagship/talents',
        lazy: lazyLoad(() => import('./pages/FlagshipTalents')),
        errorElement: <RouteErrorFallback />,
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
        path: 'reports/:reportId',
        lazy: lazyLoad(() => import('./pages/ReportDetail')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'reports/:reportId/analysis',
        lazy: lazyLoad(() => import('./pages/CombatAnalysis')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'feedback',
        lazy: lazyLoad(() => import('./pages/Feedback')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'feedback/:feedbackId',
        lazy: lazyLoad(() => import('./pages/FeedbackDetail')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'changelog',
        lazy: lazyLoad(() => import('./pages/Changelog')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'changelog/:changelogId',
        lazy: lazyLoad(() => import('./pages/ChangelogDetail')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'ranking',
        lazy: lazyLoad(() => import('./pages/Ranking')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'alliance',
        lazy: lazyLoad(() => import('./pages/alliance/AlliancePage')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
        children: [
          {
            index: true,
            lazy: lazyLoad(() => import('./pages/alliance/AllianceHubRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'activite',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceActivityRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'membres',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceMembersRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'chat',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceChatRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'gestion',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceManageRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
        ],
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
        path: 'guide/combat',
        lazy: lazyLoad(() => import('./pages/CombatGuide')),
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
      {
        path: 'settings/notifications',
        lazy: lazyLoad(() => import('./pages/SettingsNotifications')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
    ],
  },
]);
