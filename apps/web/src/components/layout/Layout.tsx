import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { TopBar } from './TopBar';
import { ResourceBar } from './ResourceBar';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { Toaster } from '@/components/ui/Toaster';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function Layout() {
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanetId = usePlanetStore((s) => s.activePlanetId);
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);

  const resolvedPlanetId = planets?.find((p) => p.id === activePlanetId)
    ? activePlanetId
    : planets?.[0]?.id ?? null;

  useEffect(() => {
    if (resolvedPlanetId && resolvedPlanetId !== activePlanetId) {
      setActivePlanet(resolvedPlanetId);
    }
  }, [resolvedPlanetId, activePlanetId, setActivePlanet]);

  useNotifications();
  useDocumentTitle();

  return (
    <div className="flex h-dvh flex-col bg-background bg-stars text-foreground">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex flex-1 flex-col lg:ml-56">
        <TopBar planetId={resolvedPlanetId} planets={planets ?? []} />
        <ResourceBar planetId={resolvedPlanetId} />

        {/* Page content - pb-14 for bottom tab bar on mobile */}
        <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
          <div className="mx-auto lg:max-w-6xl">
            <Outlet context={{ planetId: resolvedPlanetId }} />
          </div>
        </main>
      </div>

      {/* Mobile/tablet bottom navigation */}
      <BottomTabBar />
      <Toaster />
    </div>
  );
}
