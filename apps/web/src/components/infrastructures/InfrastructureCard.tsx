import type { ReactNode } from 'react';
import { ArrowUp, Lock, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { ClockIcon } from '@/components/icons/utility-icons';
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';
import { formatDuration } from '@/lib/format';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getBuildingIllustrationUrl } from '@/lib/assets';
import type { BuildingForCard } from '@/components/resources/ResourceCard';

type GameConfigData = ReturnType<typeof useGameConfig>['data'];

interface InfrastructureCardProps {
  buildingId: string;
  buildingLabel: string;
  /** Active planet class — used to pick the biome variant of the illustration */
  planetClassId?: string | null;
  /** Short description of what the building does */
  description: string;
  /** Optional dynamic effect line (e.g. "240k bouclier", "4 offres simultanées") */
  effectLine?: ReactNode;
  /** The building data (undefined = not constructed yet) */
  building?: BuildingForCard;
  /** Locked because reserved to homeworld and we're on a colony */
  locked?: boolean;
  lockReason?: string;
  onSwitchToHome?: () => void;

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

export function InfrastructureCard({
  buildingId,
  buildingLabel,
  planetClassId,
  description,
  effectLine,
  building,
  locked,
  lockReason,
  onSwitchToHome,
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
}: InfrastructureCardProps) {
  const currentLevel = building?.currentLevel ?? 0;
  const nextLevel = currentLevel + 1;
  const isConstruction = currentLevel === 0;

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
    <article
      className={cn(
        'relative glass-card overflow-hidden flex flex-col h-full',
        locked && 'opacity-70',
      )}
    >
      {/* Hero illustration */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="relative h-24 lg:h-28 overflow-hidden group"
        title={`Voir le détail de ${buildingLabel}`}
      >
        <img
          src={getBuildingIllustrationUrl(gameConfig, buildingId, planetClassId)}
          alt={buildingLabel}
          className={cn(
            'h-full w-full object-cover transition-transform duration-500 group-hover:scale-105',
            locked && 'grayscale',
          )}
          decoding="async"
          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-card via-card/80 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-3 lg:px-4 pb-2 flex items-end justify-between gap-2">
          <span className="text-sm lg:text-base font-bold text-foreground drop-shadow-md truncate">{buildingLabel}</span>
          {!locked && building && currentLevel > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground bg-background/40 backdrop-blur-sm rounded px-1.5 py-0.5">
              Niv. {currentLevel}
            </span>
          )}
          {!locked && currentLevel === 0 && (
            <span className="font-mono text-[10px] text-amber-300 bg-amber-500/20 backdrop-blur-sm rounded px-1.5 py-0.5 border border-amber-500/30">
              Non construit
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-background/50 backdrop-blur-sm rounded px-1.5 py-0.5">
              <Lock className="h-2.5 w-2.5" /> Verrouillé
            </span>
          )}
        </div>
      </button>

      {/* Body */}
      <div className="p-3 lg:p-4 space-y-2 flex flex-col flex-1">
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{description}</p>

        {effectLine && !locked && (
          <div className="text-xs text-foreground font-medium">{effectLine}</div>
        )}

        {locked ? (
          <div className="mt-auto space-y-1.5">
            {lockReason && (
              <p className="text-[11px] text-muted-foreground italic">{lockReason}</p>
            )}
            {onSwitchToHome && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs gap-1.5"
                onClick={onSwitchToHome}
              >
                <Home className="h-3 w-3" />
                Voir sur la planète-mère
              </Button>
            )}
          </div>
        ) : building ? (
          building.isUpgrading && building.upgradeEndTime ? (
            <div className="mt-auto space-y-1.5">
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
            <div className="mt-auto space-y-1.5">
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
          )
        ) : (
          <p className="mt-auto text-[11px] text-muted-foreground italic">Bâtiment indisponible.</p>
        )}
      </div>
    </article>
  );
}
