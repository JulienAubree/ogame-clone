import { useMemo } from 'react';
import { NavLink } from 'react-router';
import { Zap } from 'lucide-react';
import { getVisibleSidebarPaths, type SidebarPath } from '@exilium/game-engine';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { cn } from '@/lib/utils';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { PlanetSelectorDropdown } from './topbar/PlanetSelectorDropdown';
import { TopBarActions } from './topbar/TopBarActions';
import {
  OverviewIcon,
  ResourcesIcon,
  BuildingsIcon,
  ShipyardIcon,
  CommandCenterIcon,
  DefenseIcon,
} from '@/lib/icons';

interface PlanetNavItem {
  label: string;
  path: SidebarPath;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  end?: boolean;
}

const PLANET_NAV_ITEMS: PlanetNavItem[] = [
  { label: "Vue d'ensemble", path: '/', icon: OverviewIcon, end: true },
  { label: 'Ressources', path: '/resources', icon: ResourcesIcon },
  { label: 'Infrastructures', path: '/infrastructures', icon: BuildingsIcon },
  { label: 'Énergie', path: '/energy', icon: Zap as React.ComponentType<React.SVGProps<SVGSVGElement>> },
  { label: 'Chantier spatial', path: '/shipyard', icon: ShipyardIcon },
  { label: 'Centre de commandement', path: '/command-center', icon: CommandCenterIcon },
  { label: 'Défense', path: '/defense', icon: DefenseIcon },
];

function ResourceBadge({ label, value, glowClass, colorClass, icon, capacity }: {
  label: string;
  value: number;
  glowClass: string;
  colorClass: string;
  icon?: React.ReactNode;
  capacity?: number;
}) {
  const overCap = capacity != null && value > capacity;
  return (
    <div className="flex items-center gap-2">
      {icon && <span className={colorClass}>{icon}</span>}
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          overCap ? 'text-amber-400' : colorClass,
          overCap ? '' : glowClass,
        )}
        title={overCap ? 'Stock au-delà de la capacité (production à l\'arrêt)' : undefined}
      >
        {value.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}

/**
 * Planet-scoped header (desktop). Groups in a single visually unified block:
 *  - row 1 : planet selector + per-planet resource badges
 *  - row 2 : per-planet navigation tabs
 *
 * Hosting selector + resources together prevents the topbar resources from
 * being mistaken for empire-wide totals: anything inside this block belongs
 * to the currently selected planet.
 */
export function PlanetSubnav() {
  const { data: tutorialData } = trpc.tutorial.getCurrent.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanetId = usePlanetStore((s) => s.activePlanetId);
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);

  const isComplete = tutorialData?.isComplete ?? false;
  const parsedChapter = tutorialData?.chapter
    ? Number.parseInt(tutorialData.chapter.id.replace('chapter_', ''), 10)
    : NaN;
  const chapterOrder = Number.isFinite(parsedChapter)
    ? parsedChapter
    : (isComplete ? 4 : 1);
  const colonyCount = planets?.length ?? 1;

  const visiblePaths = useMemo(
    () => getVisibleSidebarPaths({ chapterOrder, isComplete, colonyCount }),
    [chapterOrder, isComplete, colonyCount],
  );

  const items = PLANET_NAV_ITEMS.filter((item) => visiblePaths.has(item.path));

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: activePlanetId! },
    { enabled: !!activePlanetId, refetchInterval: 300_000 },
  );

  const resources = useResourceCounter(
    resourceData
      ? {
          minerai: resourceData.minerai,
          silicium: resourceData.silicium,
          hydrogene: resourceData.hydrogene,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          mineraiPerHour: resourceData.rates.mineraiPerHour,
          siliciumPerHour: resourceData.rates.siliciumPerHour,
          hydrogenePerHour: resourceData.rates.hydrogenePerHour,
          storageMineraiCapacity: resourceData.rates.storageMineraiCapacity,
          storageSiliciumCapacity: resourceData.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: resourceData.rates.storageHydrogeneCapacity,
        }
      : undefined,
  );

  const energyBalance = resourceData
    ? resourceData.rates.energyProduced - resourceData.rates.energyConsumed
    : 0;

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Bloc planète"
      className="sticky top-0 z-40 hidden lg:block border-b border-primary/20 bg-gradient-to-b from-primary/[0.05] to-card/80 backdrop-blur-md"
    >
      {/* Row 1 : planet selector + resources + global actions */}
      <div className="flex items-center justify-between gap-4 px-4 py-1.5 border-b border-white/5">
        <div className="flex items-center gap-6 min-w-0">
          <PlanetSelectorDropdown
            planetId={activePlanetId}
            planets={planets ?? []}
            onSelect={setActivePlanet}
          />

          <div className="flex items-center gap-5">
            <ResourceBadge
              label="Minerai"
              value={resources.minerai}
              glowClass="glow-minerai"
              colorClass="text-minerai"
              icon={<MineraiIcon size={14} />}
              capacity={resourceData?.rates.storageMineraiCapacity}
            />
            <ResourceBadge
              label="Silicium"
              value={resources.silicium}
              glowClass="glow-silicium"
              colorClass="text-silicium"
              icon={<SiliciumIcon size={14} />}
              capacity={resourceData?.rates.storageSiliciumCapacity}
            />
            <ResourceBadge
              label="Hydrogène"
              value={resources.hydrogene}
              glowClass="glow-hydrogene"
              colorClass="text-hydrogene"
              icon={<HydrogeneIcon size={14} />}
              capacity={resourceData?.rates.storageHydrogeneCapacity}
            />
            <ResourceBadge
              label="Énergie"
              value={energyBalance}
              glowClass={energyBalance >= 0 ? 'glow-energy' : ''}
              colorClass={energyBalance >= 0 ? 'text-energy' : 'text-destructive'}
              icon={<EnergieIcon size={14} />}
            />
          </div>
        </div>

        <TopBarActions />
      </div>

      {/* Row 2 : navigation tabs */}
      <nav aria-label="Navigation planète">
        <ul className="flex items-center gap-1 px-4 py-1.5 overflow-x-auto">
          {items.map((item) => (
            <li key={item.path} className="shrink-0">
              <NavLink
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/30 shadow-[0_0_12px_-4px_hsl(var(--accent-glow))]'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent',
                  )
                }
              >
                <item.icon width={16} height={16} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
