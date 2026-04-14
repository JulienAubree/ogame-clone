import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Globe, Rocket, ShieldAlert, Landmark, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { usePlanetStore } from '@/stores/planet.store';

/** Live countdown that ticks every second. */
function useCountdown(targetDate: Date): string {
  const compute = useCallback(() => {
    const diff = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [targetDate]);

  const [display, setDisplay] = useState(compute);

  useEffect(() => {
    const id = setInterval(() => setDisplay(compute()), 1000);
    return () => clearInterval(id);
  }, [compute]);

  return display;
}

interface GovernanceData {
  colonyCount: number;
  capacity: number;
  overextend: number;
  harvestMalus: number;
  constructionMalus: number;
}

interface PlanetData {
  id: string;
  name: string;
  mineraiPerHour?: number;
  siliciumPerHour?: number;
  hydrogenePerHour?: number;
  status?: string;
  outboundFleets?: { count: number; earliestArrival: string } | null;
  inboundAttack?: { arrivalTime: string } | null;
}

interface EmpireKpiBarProps {
  totalRates: { mineraiPerHour: number; siliciumPerHour: number; hydrogenePerHour: number };
  planetCount: number;
  activeFleetCount: number;
  inboundAttackCount: number;
  governance?: GovernanceData | null;
  planets?: PlanetData[];
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

type PanelId = 'minerai' | 'silicium' | 'hydrogene' | 'planets' | 'governance' | 'fleets' | null;

export function EmpireKpiBar({ totalRates, planetCount, activeFleetCount, inboundAttackCount, governance, planets }: EmpireKpiBarProps) {
  const [openPanel, setOpenPanel] = useState<PanelId>(null);

  const toggle = (id: PanelId) => setOpenPanel((prev) => (prev === id ? null : id));

  const govColor = governance
    ? governance.colonyCount > governance.capacity
      ? 'text-destructive'
      : governance.colonyCount === governance.capacity
        ? 'text-amber-400'
        : 'text-emerald-400'
    : 'text-foreground';

  const govIconBg = governance
    ? governance.colonyCount > governance.capacity
      ? 'bg-destructive/10'
      : governance.colonyCount === governance.capacity
        ? 'bg-amber-400/10'
        : 'bg-emerald-400/10'
    : 'bg-muted';

  const activePlanets = planets?.filter(p => p.status !== 'colonizing') ?? [];

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      {/* KPI row — single line, compact */}
      <div className="flex items-center justify-between gap-1 px-2 py-2 lg:gap-3 lg:px-4 overflow-x-auto">
        <Kpi
          iconNode={<MineraiIcon size={14} className="text-minerai" />}
          color="text-minerai"
          value={`${formatRate(totalRates.mineraiPerHour)}/h`}
          label="Fe"
          active={openPanel === 'minerai'}
          onClick={() => toggle('minerai')}
        />
        <Kpi
          iconNode={<SiliciumIcon size={14} className="text-silicium" />}
          color="text-silicium"
          value={`${formatRate(totalRates.siliciumPerHour)}/h`}
          label="Si"
          active={openPanel === 'silicium'}
          onClick={() => toggle('silicium')}
        />
        <Kpi
          iconNode={<HydrogeneIcon size={14} className="text-hydrogene" />}
          color="text-hydrogene"
          value={`${formatRate(totalRates.hydrogenePerHour)}/h`}
          label="H"
          active={openPanel === 'hydrogene'}
          onClick={() => toggle('hydrogene')}
        />
        <div className="hidden h-5 w-px bg-border/40 lg:block" />
        <Kpi
          iconNode={<Globe className="h-3.5 w-3.5 text-foreground" />}
          color="text-foreground"
          value={String(planetCount)}
          label="Planetes"
          active={openPanel === 'planets'}
          onClick={() => toggle('planets')}
        />
        {governance && (
          <Kpi
            iconNode={<Landmark className={cn('h-3.5 w-3.5', govColor)} />}
            color={govColor}
            value={`${governance.colonyCount}/${governance.capacity}`}
            label="Gouv."
            active={openPanel === 'governance'}
            onClick={() => toggle('governance')}
          />
        )}
        <Kpi
          iconNode={<Rocket className="h-3.5 w-3.5 text-primary" />}
          color="text-primary"
          value={String(activeFleetCount)}
          label="Flottes"
          active={openPanel === 'fleets'}
          onClick={() => toggle('fleets')}
        />
        {inboundAttackCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive animate-pulse">
            <ShieldAlert className="h-3.5 w-3.5" />
            {inboundAttackCount}
          </div>
        )}
      </div>

      {/* Expandable panels */}
      {openPanel && (
        <div className="border-t border-border/30 px-4 py-3">
          {(openPanel === 'minerai' || openPanel === 'silicium' || openPanel === 'hydrogene') && (
            <ResourcePanel
              resource={openPanel}
              planets={activePlanets}
              total={
                openPanel === 'minerai' ? totalRates.mineraiPerHour
                  : openPanel === 'silicium' ? totalRates.siliciumPerHour
                    : totalRates.hydrogenePerHour
              }
            />
          )}
          {openPanel === 'planets' && <PlanetsPanel planets={planets ?? []} />}
          {openPanel === 'governance' && governance && <GovernancePanel governance={governance} />}
          {openPanel === 'fleets' && <FleetsPanel planets={planets ?? []} totalFleets={activeFleetCount} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI pill (clickable)
// ---------------------------------------------------------------------------

function Kpi({ iconNode, color, value, label, active, onClick }: {
  iconNode: React.ReactNode;
  color: string;
  value: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors shrink-0',
        active ? 'bg-accent/60 ring-1 ring-primary/30' : 'hover:bg-accent/30',
      )}
    >
      {iconNode}
      <span className={cn('text-xs font-bold', color)}>{value}</span>
      <span className="text-[9px] uppercase text-muted-foreground hidden lg:inline">{label}</span>
      <ChevronDown className={cn(
        'h-2.5 w-2.5 text-muted-foreground/40 transition-transform',
        active && 'rotate-180',
      )} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Resource breakdown panel
// ---------------------------------------------------------------------------

function PlanetLink({ planet }: { planet: PlanetData }) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  return (
    <button
      type="button"
      onClick={() => { setActivePlanet(planet.id); navigate('/'); }}
      className="truncate text-foreground font-medium hover:text-primary transition-colors text-left"
    >
      {planet.name}
    </button>
  );
}

function ResourcePanel({ resource, planets, total }: {
  resource: 'minerai' | 'silicium' | 'hydrogene';
  planets: PlanetData[];
  total: number;
}) {
  const colorMap = { minerai: 'text-minerai', silicium: 'text-silicium', hydrogene: 'text-hydrogene' };
  const rateKey = resource === 'minerai' ? 'mineraiPerHour' : resource === 'silicium' ? 'siliciumPerHour' : 'hydrogenePerHour';
  const label = resource === 'minerai' ? 'Minerai' : resource === 'silicium' ? 'Silicium' : 'Hydrogene';

  const sorted = [...planets].sort((a, b) => (b[rateKey] ?? 0) - (a[rateKey] ?? 0));

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Production {label} par planete
      </div>
      <div className="space-y-1">
        {sorted.map((p) => {
          const rate = p[rateKey] ?? 0;
          const pct = total > 0 ? (rate / total) * 100 : 0;
          return (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <div className="w-24"><PlanetLink planet={p} /></div>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full', resource === 'minerai' ? 'bg-minerai' : resource === 'silicium' ? 'bg-silicium' : 'bg-hydrogene')}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className={cn('w-16 text-right font-mono text-[11px]', colorMap[resource])}>
                {formatRate(rate)}/h
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end text-xs text-muted-foreground pt-1 border-t border-border/30">
        Total : <span className={cn('font-semibold ml-1', colorMap[resource])}>{formatRate(total)}/h</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planets panel
// ---------------------------------------------------------------------------

function PlanetsPanel({ planets }: { planets: PlanetData[] }) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const active = planets.filter(p => p.status !== 'colonizing');
  const colonizing = planets.filter(p => p.status === 'colonizing');

  const goToPlanet = (p: PlanetData) => { setActivePlanet(p.id); navigate('/'); };

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {active.length} planete{active.length > 1 ? 's' : ''} active{active.length > 1 ? 's' : ''}
        {colonizing.length > 0 && `, ${colonizing.length} en colonisation`}
      </div>
      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
        {planets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => goToPlanet(p)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs text-left transition-colors',
              p.status === 'colonizing'
                ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
                : 'border-border/30 bg-card/50 hover:border-primary/30',
            )}
          >
            <div className="font-medium text-foreground truncate hover:text-primary transition-colors">{p.name}</div>
            <div className="text-muted-foreground text-[10px]">
              {p.status === 'colonizing' ? 'Colonisation en cours' : `${formatRate(p.mineraiPerHour ?? 0)} / ${formatRate(p.siliciumPerHour ?? 0)} / ${formatRate(p.hydrogenePerHour ?? 0)}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Governance panel
// ---------------------------------------------------------------------------

function GovernancePanel({ governance }: { governance: GovernanceData }) {
  const isOver = governance.overextend > 0;
  const freeSlots = Math.max(0, governance.capacity - governance.colonyCount);

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Gouvernance imperiale
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MiniCard label="Capacite" value={`${governance.capacity} planete${governance.capacity > 1 ? 's' : ''}`} color="text-amber-400" />
        <MiniCard label="Colonies" value={String(governance.colonyCount)} color={isOver ? 'text-destructive' : 'text-emerald-400'} />
        <MiniCard label="Malus recolte" value={isOver ? `-${Math.round(governance.harvestMalus * 100)}%` : 'Aucun'} color={isOver ? 'text-destructive' : 'text-emerald-400'} />
        <MiniCard label="Malus construction" value={isOver ? `+${Math.round(governance.constructionMalus * 100)}%` : 'Aucun'} color={isOver ? 'text-destructive' : 'text-emerald-400'} />
      </div>
      <div className="text-xs text-muted-foreground">
        {isOver
          ? `Depassement de +${governance.overextend}. Ameliorez le Centre de Pouvoir Imperial pour reduire les penalites.`
          : freeSlots > 0
            ? `${freeSlots} slot${freeSlots > 1 ? 's' : ''} disponible${freeSlots > 1 ? 's' : ''} pour coloniser sans penalite.`
            : 'Capacite atteinte. Prochaine colonie = penalites sur toutes les colonies.'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fleets panel
// ---------------------------------------------------------------------------

const MISSION_COLORS: Record<string, string> = {
  transport: 'text-blue-400',
  station: 'text-emerald-400',
  spy: 'text-violet-400',
  attack: 'text-destructive',
  colonize: 'text-orange-400',
  recycle: 'text-cyan-400',
  mine: 'text-amber-400',
  pirate: 'text-rose-400',
  trade: 'text-purple-400',
  scan: 'text-violet-400',
  explore: 'text-teal-400',
  colonize_supply: 'text-emerald-400',
  colonize_reinforce: 'text-blue-400',
};

const PHASE_LABELS: Record<string, string> = {
  outbound: 'En route',
  return: 'Retour',
  prospecting: 'Prospection',
  mining: 'Extraction',
  exploring: 'Exploration',
};

function FleetRow({ movement, gameConfig }: { movement: any; gameConfig: any }) {
  const navigate = useNavigate();
  const missionLabel = gameConfig?.missions?.[movement.mission]?.label ?? movement.mission;
  const missionColor = MISSION_COLORS[movement.mission] ?? 'text-foreground';
  const phaseLabel = PHASE_LABELS[movement.phase] ?? movement.phase;
  const arrival = new Date(movement.arrivalTime);
  const countdown = useCountdown(arrival);
  const coords = `[${movement.targetGalaxy}:${movement.targetSystem}:${movement.targetPosition}]`;
  const shipCount = Object.values(movement.ships as Record<string, number>).reduce((s: number, c: number) => s + c, 0);

  return (
    <button
      type="button"
      onClick={() => navigate('/fleet/movements')}
      className="flex w-full items-center gap-3 rounded-lg border border-border/30 bg-card/50 px-3 py-2 text-xs text-left transition-colors hover:border-primary/30"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('font-semibold', missionColor)}>{missionLabel}</span>
          <span className="text-muted-foreground">-</span>
          <span className="text-muted-foreground">{phaseLabel}</span>
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {coords} · {shipCount} vaisseau{shipCount > 1 ? 'x' : ''}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-foreground tabular-nums">{countdown}</div>
        <div className="text-[10px] text-muted-foreground">
          {arrival.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </button>
  );
}

function FleetsPanel({ planets, totalFleets }: { planets: PlanetData[]; totalFleets: number }) {
  const navigate = useNavigate();
  const { data: movements } = trpc.fleet.movements.useQuery();
  const { data: gameConfig } = useGameConfig();
  const underAttack = planets.filter(p => p.inboundAttack);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {totalFleets} flotte{totalFleets > 1 ? 's' : ''} en vol
        </div>
        <button
          type="button"
          onClick={() => navigate('/fleet/movements')}
          className="text-[10px] text-primary hover:underline"
        >
          Voir les mouvements
        </button>
      </div>
      {movements && movements.length > 0 ? (
        <div className="space-y-1">
          {[...movements]
            .sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
            .map((m) => (
              <FleetRow key={m.id} movement={m} gameConfig={gameConfig} />
            ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Aucune flotte en vol.</div>
      )}
      {underAttack.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border/30">
          <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold">
            Planetes attaquees
          </div>
          {underAttack.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5">
              <span className="font-medium">{p.name}</span>
              <span className="font-mono">Attaque imminente</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini card helper
// ---------------------------------------------------------------------------

function MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/50 px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-bold', color)}>{value}</div>
    </div>
  );
}
