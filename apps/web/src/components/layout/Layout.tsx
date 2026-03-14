import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Toaster } from '@/components/ui/Toaster';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { useNotifications } from '@/hooks/useNotifications';

export function Layout() {
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanetId = usePlanetStore((s) => s.activePlanetId);
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);

  // Resolve the active planet: use store value if valid, else fallback to first planet
  const resolvedPlanetId = planets?.find((p) => p.id === activePlanetId)
    ? activePlanetId
    : planets?.[0]?.id ?? null;

  // Sync store if fallback was used
  useEffect(() => {
    if (resolvedPlanetId && resolvedPlanetId !== activePlanetId) {
      setActivePlanet(resolvedPlanetId);
    }
  }, [resolvedPlanetId, activePlanetId, setActivePlanet]);

  useNotifications();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar planetId={resolvedPlanetId} planets={planets ?? []} />
        <main className="flex-1 overflow-y-auto">
          <Outlet context={{ planetId: resolvedPlanetId }} />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
