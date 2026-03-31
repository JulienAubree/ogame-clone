import { useNavigate } from 'react-router';
import { Hammer, FlaskConical, Rocket, ShieldAlert, Check, Building2, Wrench, Layers, Shield } from 'lucide-react';
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
  diameter: number;
  minerai: number;
  silicium: number;
  hydrogene: number;
  mineraiPerHour: number;
  siliciumPerHour: number;
  hydrogenePerHour: number;
  storageMineraiCapacity: number;
  storageSiliciumCapacity: number;
  storageHydrogeneCapacity: number;
  energyProduced: number;
  energyConsumed: number;
  activeBuild: { buildingId: string; level: number; endTime: string } | null;
  activeResearch: { researchId: string; level: number; endTime: string } | null;
  outboundFleetCount: number;
  inboundAttack: { arrivalTime: string } | null;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpirePlanetCard({ planet, isFirst }: { planet: EmpirePlanet; isFirst: boolean }) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const hasAttack = !!planet.inboundAttack;

  const goTo = (path: string) => {
    setActivePlanet(planet.id);
    navigate(path);
  };

  const resources = [
    { label: 'Fe', value: planet.minerai, max: planet.storageMineraiCapacity, rate: planet.mineraiPerHour, color: 'text-minerai', fill: 'bg-minerai' },
    { label: 'Si', value: planet.silicium, max: planet.storageSiliciumCapacity, rate: planet.siliciumPerHour, color: 'text-silicium', fill: 'bg-silicium' },
    { label: 'H', value: planet.hydrogene, max: planet.storageHydrogeneCapacity, rate: planet.hydrogenePerHour, color: 'text-hydrogene', fill: 'bg-hydrogene' },
  ];

  const hasActivity = planet.activeBuild || planet.activeResearch || planet.outboundFleetCount > 0 || hasAttack;

  return (
    <div className={cn(
      'rounded-xl border bg-card/80 overflow-hidden transition-colors',
      hasAttack
        ? 'border-destructive/25 hover:border-destructive/60 hover:shadow-lg hover:shadow-destructive/10'
        : 'border-border/50 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5',
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5 pb-2.5">
        {planet.planetClassId && planet.planetImageIndex != null ? (
          <img
            src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
            alt={planet.name}
            className={cn('h-11 w-11 rounded-full border-2 object-cover', hasAttack ? 'border-destructive/40' : 'border-border/50')}
          />
        ) : (
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-full border-2 bg-muted font-semibold text-muted-foreground', hasAttack ? 'border-destructive/40' : 'border-border/50')}>
            {planet.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{planet.name}</div>
          <div className="text-xs text-muted-foreground">
            [{planet.galaxy}:{planet.system}:{planet.position}] · {planet.diameter.toLocaleString('fr-FR')} km
          </div>
        </div>
        <span className={cn(
          'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium',
          isFirst ? 'bg-primary/15 text-primary' : 'bg-purple-500/15 text-purple-400',
        )}>
          {isFirst ? 'Capitale' : 'Colonie'}
        </span>
      </div>

      {/* Resource bars */}
      <div className="flex flex-col gap-1.5 px-3.5 pb-2.5">
        {resources.map((r) => {
          const pct = r.max > 0 ? Math.min(100, (r.value / r.max) * 100) : 0;
          const isFull = pct > 95;
          return (
            <div key={r.label} className="flex items-center gap-2">
              <span className={cn('w-4 text-center text-[10px] font-bold', r.color)}>{r.label}</span>
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', r.fill, isFull && 'animate-pulse')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={cn('w-16 text-right text-xs', r.color)}>+{formatRate(r.rate)}/h</span>
            </div>
          );
        })}
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
        {planet.activeBuild && (
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            <Hammer className="h-3 w-3" />
            <span>{planet.activeBuild.buildingId} Nv.{planet.activeBuild.level}</span>
            <Timer endTime={new Date(planet.activeBuild.endTime)} className="inline [&>span]:text-energy" />
          </div>
        )}
        {planet.activeResearch && (
          <div className="flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[11px] text-purple-400">
            <FlaskConical className="h-3 w-3" />
            <span>Recherche</span>
            <Timer endTime={new Date(planet.activeResearch.endTime)} className="inline [&>span]:text-purple-400" />
          </div>
        )}
        {planet.outboundFleetCount > 0 && (
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            <Rocket className="h-3 w-3" />
            <span>{planet.outboundFleetCount} flotte{planet.outboundFleetCount > 1 ? 's' : ''}</span>
          </div>
        )}
        {hasAttack && (
          <div className="flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            <ShieldAlert className="h-3 w-3" />
            <span>Attaque</span>
            <Timer endTime={new Date(planet.inboundAttack!.arrivalTime)} className="inline [&>span]:text-destructive" />
          </div>
        )}
        {planet.energyConsumed > planet.energyProduced && !hasAttack && (
          <div className="flex items-center gap-1 rounded-md border border-energy/20 bg-energy/10 px-2 py-1 text-[11px] text-energy">
            ⚡ Déficit énergie
          </div>
        )}
        {!hasActivity && planet.energyConsumed <= planet.energyProduced && (
          <div className="flex items-center gap-1 rounded-md border border-green-500/20 bg-green-500/10 px-2 py-1 text-[11px] text-green-500">
            <Check className="h-3 w-3" />
            <span>Aucune activité</span>
          </div>
        )}
      </div>

      {/* Nav shortcuts */}
      <div className="flex border-t border-border/30">
        {[
          { label: 'Bâtiments', icon: Building2, path: '/buildings' },
          { label: 'Chantier', icon: Wrench, path: '/shipyard' },
          { label: 'Flottes', icon: Layers, path: '/fleet' },
          { label: 'Défenses', icon: Shield, path: '/defense' },
        ].map((item, i, arr) => (
          <button
            key={item.path}
            onClick={() => goTo(item.path)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary',
              i < arr.length - 1 && 'border-r border-border/30',
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
