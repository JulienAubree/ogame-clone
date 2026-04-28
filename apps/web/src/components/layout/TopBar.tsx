import { usePlanetStore } from '@/stores/planet.store';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PlanetSelectorDropdown } from './topbar/PlanetSelectorDropdown';
import { TopBarActions } from './topbar/TopBarActions';

interface Planet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  status?: string;
}

/**
 * Mobile-only topbar. On desktop the planet block (PlanetSubnav) acts as the
 * sticky header — it carries the selector, the per-planet resources, the
 * action cluster and the navigation tabs, all in one visually unified block.
 */
export function TopBar({ planetId, planets }: { planetId: string | null; planets: Planet[] }) {
  useGameConfig();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);

  return (
    <header className="sticky top-0 z-40 flex min-h-12 items-center justify-between border-b border-white/10 bg-card/80 backdrop-blur-md px-4 pt-[env(safe-area-inset-top)] lg:hidden">
      <PlanetSelectorDropdown
        planetId={planetId}
        planets={planets}
        onSelect={setActivePlanet}
      />
      <TopBarActions />
    </header>
  );
}
