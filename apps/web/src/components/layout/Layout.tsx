import { useEffect, useMemo } from 'react';
import { Outlet } from 'react-router';
import { TopBar } from './TopBar';
import { ResourceBar } from './ResourceBar';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { Toaster } from '@/components/ui/Toaster';
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { ChatOverlay } from '@/components/chat/ChatOverlay';
import { FloatingFeedbackButton } from '@/components/feedback/FloatingFeedbackButton';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { HostileAlertBanner } from '@/components/fleet/HostileAlertBanner';

export function Layout() {
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanetId = usePlanetStore((s) => s.activePlanetId);
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);

  // Trust localStorage activePlanetId while planet.list is loading
  // This avoids a query waterfall: dependent queries can fire immediately
  const resolvedPlanetId = planets
    ? (planets.find((p) => p.id === activePlanetId) ? activePlanetId : planets[0]?.id ?? null)
    : activePlanetId;

  useEffect(() => {
    if (resolvedPlanetId && resolvedPlanetId !== activePlanetId) {
      setActivePlanet(resolvedPlanetId);
    }
  }, [resolvedPlanetId, activePlanetId, setActivePlanet]);

  useNotifications();
  useDocumentTitle();

  const { data: inboundFleets } = trpc.fleet.inbound.useQuery();
  const hostileFleets = useMemo(
    () => (inboundFleets ?? []).filter((f) => f.hostile),
    [inboundFleets],
  );

  return (
    <div className="flex h-dvh flex-col bg-background bg-stars text-foreground">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex flex-1 flex-col min-h-0 lg:ml-56">
        <TopBar planetId={resolvedPlanetId} planets={planets ?? []} />
        <OfflineBanner />
        <ResourceBar planetId={resolvedPlanetId} />
        <HostileAlertBanner hostileFleets={hostileFleets} fixed />

        {/* Page content — scrolls independently; the mobile BottomTabBar
            below is a flex sibling, so it is anchored naturally at the
            bottom of the viewport without position:fixed. */}
        <main className="flex-1 overflow-y-auto min-h-0">
          <div className="mx-auto lg:max-w-6xl">
            <Outlet context={{ planetId: resolvedPlanetId }} />
          </div>
        </main>

        {/* Mobile/tablet bottom navigation (flex sibling, not fixed) */}
        <BottomTabBar />
      </div>

      <FloatingFeedbackButton />

      <ChatOverlay />
      <Toaster />
      <UpdatePrompt />
    </div>
  );
}
