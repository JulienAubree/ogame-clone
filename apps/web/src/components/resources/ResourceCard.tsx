import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { ClockIcon } from '@/components/icons/utility-icons';
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';
import { formatDuration } from '@/lib/format';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getAssetUrl } from '@/lib/assets';

type GameConfigData = ReturnType<typeof useGameConfig>['data'];
type BuildingPrereq = { buildingId: string; level: number; currentLevel?: number };

export interface BuildingForCard {
  id: string;
  currentLevel: number;
  nextLevelCost: { minerai: number; silicium: number; hydrogene: number };
  nextLevelTime: number;
  prerequisites: BuildingPrereq[];
  isUpgrading: boolean;
  upgradeEndTime: string | null;
}

interface ResourceCardProps {
  /** Visual identity */
  icon: ReactNode;
  label: string;
  buildingLabel: string;
  /** Building id used to pull the background illustration */
  buildingId: string;
  /** Tailwind class for the accent color (text-minerai, text-silicium, etc.) */
  accentColor: string;
  /** Tailwind class for the progress bar fill (bg-minerai, etc.) */
  fillColor: string;

  /** Production per hour (already multiplied by all factors) */
  perHour: number;
  /** Current resource amount on the planet */
  current: number;
  /** Max storage capacity */
  capacity: number;
  /** Cumulated multiplier (1.0 = neutral, 1.34 = +34% bonuses, 0.7 = -30% malus) */
  productionFactor: number;

  /** Production at the current level — for displaying the next-level gain */
  productionAtCurrentLevel?: number;
  productionAtNextLevel?: number;

  /** The building tied to this resource (the mine/synth) */
  building?: BuildingForCard;

  /** Resources in wallet — to check affordability */
  resources: { minerai: number; silicium: number; hydrogene: number };
  buildingLevels: Record<string, number>;
  isAnyUpgrading: boolean;
  upgradePending: boolean;
  cancelPending: boolean;
  gameConfig: GameConfigData;
  onUpgrade: () => void;
  onCancel: () => void;
  onTimerComplete: () => void;
  onOpenDetail: () => void;
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

function formatTimeUntilFull(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return '< 1 min';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(seconds / 86_400)}j`;
}

export function ResourceCard({
  icon,
  label,
  buildingLabel,
  buildingId,
  accentColor,
  fillColor,
  perHour,
  current,
  capacity,
  productionFactor,
  productionAtCurrentLevel,
  productionAtNextLevel,
  building,
  resources,
  buildingLevels,
  isAnyUpgrading,
  upgradePending,
  cancelPending,
  gameConfig,
  onUpgrade,
  onCancel,
  onTimerComplete,
  onOpenDetail,
}: ResourceCardProps) {
  const fillPercent = capacity > 0 ? Math.min(100, (current / capacity) * 100) : 0;
  const isFull = capacity > 0 && current >= capacity;
  const remaining = Math.max(0, capacity - current);
  const secondsUntilFull = perHour > 0 ? (remaining / perHour) * 3600 : Infinity;

  const factorPercent = Math.round((productionFactor - 1) * 100);
  const factorTrend: 'up' | 'down' | 'flat' =
    factorPercent > 1 ? 'up' : factorPercent < -1 ? 'down' : 'flat';

  const nextLevelGain =
    productionAtCurrentLevel != null && productionAtNextLevel != null
      ? productionAtNextLevel - productionAtCurrentLevel
      : null;

  const nextLevel = building ? building.currentLevel + 1 : null;
  const isConstruction = building?.currentLevel === 0;

  const canAfford = building
    ? resources.minerai >= building.nextLevelCost.minerai &&
      resources.silicium >= building.nextLevelCost.silicium &&
      resources.hydrogene >= building.nextLevelCost.hydrogene
    : false;

  const prereqsMet = building
    ? building.prerequisites.every((p) => {
        const lvl = p.currentLevel ?? buildingLevels[p.buildingId] ?? 0;
        return lvl >= p.level;
      })
    : false;

  return (
    <article className="relative glass-card overflow-hidden flex flex-col">
      {/* Background illustration */}
      <div className="absolute inset-0 pointer-events-none">
        <img
          src={getAssetUrl('buildings', buildingId)}
          alt=""
          className="h-full w-full object-cover opacity-20 blur-[2px] scale-105"
          decoding="async"
          fetchPriority="low"
          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-card/70 via-card/85 to-card/95" />
      </div>

      <div className="relative p-3 lg:p-4 space-y-3 flex flex-col flex-1">
      {/* Header — icon + label + multiplier */}
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenDetail}
          className="flex items-center gap-2 min-w-0 group"
          title={`Voir le détail de ${buildingLabel}`}
        >
          <span className="shrink-0">{icon}</span>
          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</span>
        </button>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold',
            factorTrend === 'up' && 'bg-emerald-500/10 text-emerald-400',
            factorTrend === 'down' && 'bg-destructive/10 text-destructive',
            factorTrend === 'flat' && 'bg-muted/40 text-muted-foreground',
          )}
          title="Multiplicateur cumulé (type de planète, biomes, recherches)"
        >
          {factorTrend === 'up' && <ArrowUp className="h-3 w-3" />}
          {factorTrend === 'down' && <ArrowDown className="h-3 w-3" />}
          {factorPercent > 0 ? '+' : ''}{factorPercent}%
        </span>
      </header>

      {/* Production headline */}
      <div className="flex items-baseline gap-1">
        <span className={cn('font-mono text-3xl font-bold tabular-nums', accentColor)}>
          {formatCompact(perHour)}
        </span>
        <span className="text-xs text-muted-foreground">/ heure</span>
      </div>

      {/* Storage */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Stockage</span>
          <span className={cn('font-mono', isFull ? 'text-amber-400 font-semibold' : 'text-foreground')}>
            {formatCompact(current)} / {formatCompact(capacity)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              fillColor,
              fillPercent > 95 && 'animate-pulse',
            )}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
          <span>{Math.round(fillPercent)}%</span>
          {isFull ? (
            <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
              <AlertTriangle className="h-3 w-3" /> Plein — production gaspillée
            </span>
          ) : perHour > 0 ? (
            <span>Plein dans {formatTimeUntilFull(secondsUntilFull)}</span>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>

      {/* Building section */}
      {building && (
        <div className="rounded-md border border-border/30 bg-background/30 p-2.5 space-y-2">
          <button
            type="button"
            onClick={onOpenDetail}
            className="flex items-baseline justify-between w-full gap-2 group"
          >
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
              {buildingLabel}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">Niv. {building.currentLevel}</span>
          </button>
          {nextLevelGain != null && nextLevelGain > 0 && (
            <div className={cn('text-[11px]', accentColor)}>
              <span className="font-mono">+{formatCompact(nextLevelGain)}/h</span>
              <span className="text-muted-foreground/80"> au niv. {nextLevel}</span>
            </div>
          )}

          {building.isUpgrading && building.upgradeEndTime ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">
                  {isConstruction ? 'Construction' : 'Amélioration'} en cours
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">→ {nextLevel}</span>
              </div>
              <Timer
                endTime={new Date(building.upgradeEndTime)}
                totalDuration={building.nextLevelTime}
                onComplete={onTimerComplete}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={onCancel}
                disabled={cancelPending}
              >
                Annuler
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <ResourceCost
                minerai={building.nextLevelCost.minerai}
                silicium={building.nextLevelCost.silicium}
                hydrogene={building.nextLevelCost.hydrogene}
                currentMinerai={resources.minerai}
                currentSilicium={resources.silicium}
                currentHydrogene={resources.hydrogene}
              />
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                <ClockIcon className="h-3 w-3" />
                {formatDuration(building.nextLevelTime)}
              </div>
              {!prereqsMet ? (
                <PrerequisiteList
                  items={buildPrerequisiteItems(
                    { buildings: building.prerequisites },
                    Object.fromEntries(
                      building.prerequisites.map((p) => [p.buildingId, p.currentLevel ?? buildingLevels[p.buildingId] ?? 0]),
                    ),
                    {},
                    gameConfig,
                  )}
                  missingOnly
                />
              ) : (
                <Button
                  variant="retro"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={onUpgrade}
                  disabled={!canAfford || isAnyUpgrading || upgradePending}
                >
                  <ArrowUp className="h-3 w-3 mr-1" />
                  {isConstruction ? 'Construire' : 'Améliorer'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </article>
  );
}
