import { useNavigate } from 'react-router';
import { Hammer, FlaskConical, ShieldAlert, ChevronRight, ShieldPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { usePlanetStore } from '@/stores/planet.store';
import { ShipyardIcon, FlagshipIcon } from '@/lib/icons';
import { Timer } from '@/components/common/Timer';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getBuildingName, getResearchName, getShipName, getDefenseName } from '@/lib/entity-names';

interface EmpirePlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  minerai: number;
  silicium: number;
  hydrogene: number;
  mineraiPerHour: number;
  siliciumPerHour: number;
  hydrogenePerHour: number;
  hasFlagship: boolean;
  activeBuild: { buildingId: string; level: number; endTime: string } | null;
  activeResearch: { researchId: string; level: number; endTime: string } | null;
  activeShipyard: { shipId: string; quantity: number; endTime: string; facilityId: string | null } | null;
  activeDefense: { defenseId: string; quantity: number; endTime: string } | null;
  outboundFleets: { count: number; earliestArrival: string } | null;
  inboundFriendlyFleets: { count: number; earliestArrival: string } | null;
  inboundAttack: { arrivalTime: string } | null;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpirePlanetRow({ planet, isFirst, isLast }: { planet: EmpirePlanet; isFirst: boolean; isLast: boolean }) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const { data: gameConfig } = useGameConfig();

  const handleClick = () => {
    setActivePlanet(planet.id);
    navigate('/');
  };

  const badge = planet.inboundAttack
    ? { icon: ShieldAlert, label: 'Attaque', endTime: planet.inboundAttack.arrivalTime, className: 'text-destructive' }
    : planet.activeBuild
      ? { icon: Hammer, label: getBuildingName(planet.activeBuild.buildingId, gameConfig), endTime: planet.activeBuild.endTime, className: 'text-energy' }
      : planet.activeResearch
        ? { icon: FlaskConical, label: getResearchName(planet.activeResearch.researchId, gameConfig), endTime: planet.activeResearch.endTime, className: 'text-purple-400' }
        : planet.activeShipyard
          ? { icon: ShipyardIcon, label: getShipName(planet.activeShipyard.shipId, gameConfig), endTime: planet.activeShipyard.endTime, className: 'text-primary' }
          : planet.activeDefense
            ? { icon: ShieldPlus, label: getDefenseName(planet.activeDefense.defenseId, gameConfig), endTime: planet.activeDefense.endTime, className: 'text-cyan-400' }
            : null;

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-3 border border-border/50 bg-card/80 p-3 text-left transition-colors hover:bg-accent/30 touch-feedback',
        !isFirst && 'border-t-0',
        isFirst && 'rounded-t-xl',
        isLast && 'rounded-b-xl',
      )}
    >
      {planet.planetClassId && planet.planetImageIndex != null ? (
        <img
          src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'icon')}
          alt={planet.name}
          className="h-9 w-9 rounded-full border border-border/50 object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-muted text-xs font-semibold text-muted-foreground">
          {planet.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold text-foreground">{planet.name}</span>
          {planet.hasFlagship && <FlagshipIcon width={12} height={12} className="shrink-0 text-energy" />}
        </div>
        <div className="text-xs text-muted-foreground">[{planet.galaxy}:{planet.system}:{planet.position}]</div>
        {badge && (
          <div className={cn('mt-0.5 flex items-center gap-1 text-[11px]', badge.className)}>
            <badge.icon className="h-3 w-3" width={12} height={12} />
            <Timer endTime={new Date(badge.endTime)} className="inline" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 text-xs">
        <span className="text-minerai font-semibold">{formatRate(planet.minerai)}</span>
        <span className="text-silicium font-semibold">{formatRate(planet.silicium)}</span>
        <span className="text-hydrogene font-semibold">{formatRate(planet.hydrogene)}</span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30" />
    </button>
  );
}
