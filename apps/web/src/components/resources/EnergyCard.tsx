import type { ReactNode } from 'react';
import { ArrowUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { ClockIcon } from '@/components/icons/utility-icons';
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';
import { formatDuration } from '@/lib/format';
import { useGameConfig } from '@/hooks/useGameConfig';
import type { BuildingForCard } from './ResourceCard';

type GameConfigData = ReturnType<typeof useGameConfig>['data'];

interface EnergyCardProps {
  icon: ReactNode;
  produced: number;
  consumed: number;
  productionAtCurrentLevel?: number;
  productionAtNextLevel?: number;
  building?: BuildingForCard;
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

export function EnergyCard({
  icon,
  produced,
  consumed,
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
}: EnergyCardProps) {
  const net = produced - consumed;
  const isDeficit = net < 0;

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
    <article className="glass-card p-3 lg:p-4 space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 lg:gap-6 lg:items-center">
        {/* Headline + breakdown */}
        <div className="flex items-center gap-3">
          <span className="shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">Énergie nette</span>
              <span
                className={cn(
                  'font-mono text-2xl font-bold tabular-nums',
                  isDeficit ? 'text-destructive' : 'text-energy',
                )}
              >
                {net >= 0 ? '+' : ''}{formatCompact(net)}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              <span className="font-mono text-foreground">{formatCompact(produced)}</span> produits ·{' '}
              <span className="font-mono text-foreground">{formatCompact(consumed)}</span> consommés
            </div>
            {isDeficit && (
              <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-destructive font-semibold">
                <AlertTriangle className="h-3 w-3" /> Déficit — production des mines réduite
              </div>
            )}
          </div>
        </div>

        {/* Building info inline */}
        {building && (
          <div className="lg:border-l lg:border-border/30 lg:pl-6 lg:min-w-[180px]">
            <button
              type="button"
              onClick={onOpenDetail}
              className="flex items-baseline justify-between w-full gap-2 mb-1 group"
            >
              <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                Centrale solaire
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">Niv. {building.currentLevel}</span>
            </button>
            {nextLevelGain != null && nextLevelGain > 0 && (
              <div className="text-[11px] text-energy">
                <span className="font-mono">+{formatCompact(nextLevelGain)}</span>
                <span className="text-muted-foreground/80"> au niv. {nextLevel}</span>
              </div>
            )}
          </div>
        )}

        {/* Upgrade CTA */}
        {building && (
          <div className="lg:min-w-[200px]">
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
