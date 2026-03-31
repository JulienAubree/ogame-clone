import { useNavigate } from 'react-router';
import { Hammer, FlaskConical, ShieldAlert, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { usePlanetStore } from '@/stores/planet.store';
import { Timer } from '@/components/common/Timer';

interface EmpirePlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  mineraiPerHour: number;
  siliciumPerHour: number;
  hydrogenePerHour: number;
  activeBuild: { buildingId: string; level: number; endTime: string } | null;
  activeResearch: { researchId: string; level: number; endTime: string } | null;
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

  const handleClick = () => {
    setActivePlanet(planet.id);
    navigate('/');
  };

  const badge = planet.inboundAttack
    ? { icon: ShieldAlert, label: 'Attaque', endTime: planet.inboundAttack.arrivalTime, className: 'text-destructive' }
    : planet.activeBuild
      ? { icon: Hammer, label: planet.activeBuild.buildingId, endTime: planet.activeBuild.endTime, className: 'text-energy' }
      : planet.activeResearch
        ? { icon: FlaskConical, label: 'Recherche', endTime: planet.activeResearch.endTime, className: 'text-purple-400' }
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
        <div className="truncate text-sm font-semibold text-foreground">{planet.name}</div>
        <div className="text-xs text-muted-foreground">[{planet.galaxy}:{planet.system}:{planet.position}]</div>
        {badge && (
          <div className={cn('mt-0.5 flex items-center gap-1 text-[11px]', badge.className)}>
            <badge.icon className="h-3 w-3" />
            <Timer endTime={new Date(badge.endTime)} className="inline" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 text-xs font-medium">
        <span className="text-minerai">+{formatRate(planet.mineraiPerHour)}</span>
        <span className="text-silicium">+{formatRate(planet.siliciumPerHour)}</span>
        <span className="text-hydrogene">+{formatRate(planet.hydrogenePerHour)}</span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30" />
    </button>
  );
}
