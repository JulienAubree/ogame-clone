import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PlanetaryShieldBannerProps {
  currentLevel: number;
  levelBonus: number;
  effectiveCapacity?: number;
  shieldPercent?: number;
  shieldingMultiplier?: number;
  nextLevelCost: { minerai: number; silicium: number; hydrogene: number };
  nextLevelTime: number;
  isUpgrading: boolean;
  upgradeEndTime: string | null;
  resources: { minerai: number; silicium: number; hydrogene: number };
  isAnyUpgrading: boolean;
  upgradePending: boolean;
  cancelPending: boolean;
  planetClassId?: string | null;
  hasVariant?: boolean;
  onUpgrade: () => void;
  onCancel: () => void;
  onTimerComplete: () => void;
}

export function PlanetaryShieldBanner({
  currentLevel,
  levelBonus,
  effectiveCapacity,
  shieldPercent,
  shieldingMultiplier,
  nextLevelCost,
  nextLevelTime,
  isUpgrading,
  upgradeEndTime,
  resources,
  isAnyUpgrading,
  upgradePending,
  cancelPending,
  planetClassId,
  hasVariant,
  onUpgrade,
  onCancel,
  onTimerComplete,
}: PlanetaryShieldBannerProps) {
  const effectiveLevel = currentLevel + (levelBonus > 0 ? levelBonus : 0);
  const fmt = (n: number) => n.toLocaleString('fr-FR');
  const canAfford =
    resources.minerai >= nextLevelCost.minerai &&
    resources.silicium >= nextLevelCost.silicium &&
    resources.hydrogene >= nextLevelCost.hydrogene;

  const isConstructing = currentLevel === 0;

  return (
    <section className="glass-card p-4 relative overflow-hidden">
      {/* subtle cyan glow backdrop */}
      <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Shield visual */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="relative shrink-0 h-14 w-14 rounded-xl overflow-hidden border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
            <GameImage
              category="buildings"
              id="planetaryShield"
              size="icon"
              alt="Bouclier planétaire"
              className="h-full w-full object-cover"
              planetType={planetClassId ?? undefined}
              hasVariant={hasVariant ?? false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/10 to-transparent pointer-events-none" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground">Bouclier planétaire</h2>
              {currentLevel > 0 ? (
                <span className="text-xs text-cyan-400 font-mono tabular-nums">
                  Niv. {currentLevel}
                  {levelBonus > 0 && <span className="text-cyan-300 ml-0.5">+{levelBonus}</span>}
                  {levelBonus > 0 && <span className="text-muted-foreground"> (eff. {effectiveLevel})</span>}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground font-mono">Non construit</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/90 leading-relaxed mt-0.5">
              {currentLevel > 0
                ? "Champ de force indestructible qui se régénère à chaque round. Tant qu'il tient, vos défenses sont intouchables."
                : "Construisez le bouclier pour protéger vos défenses planétaires derrière un champ de force régénérant."}
            </p>
            {currentLevel > 0 && effectiveCapacity !== undefined && effectiveCapacity > 0 && (
              <div className="mt-1.5 flex items-baseline gap-1.5 text-[11px]">
                <span className="text-muted-foreground">Capacité par round :</span>
                <span className="font-mono font-semibold text-cyan-300">{fmt(effectiveCapacity)}</span>
                {shieldingMultiplier !== undefined && shieldingMultiplier > 1 && (
                  <span className="text-[9px] text-emerald-500">+{Math.round((shieldingMultiplier - 1) * 100)}% rech.</span>
                )}
                {shieldPercent !== undefined && shieldPercent < 100 && (
                  <span className="text-[9px] text-muted-foreground">(à {shieldPercent}%)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Upgrade action */}
        {isUpgrading && upgradeEndTime ? (
          <div className="w-full sm:w-60 shrink-0 space-y-2">
            <Timer
              endTime={new Date(upgradeEndTime)}
              totalDuration={nextLevelTime}
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
          <div className="w-full sm:w-60 shrink-0 space-y-1.5">
            <ResourceCost
              minerai={nextLevelCost.minerai}
              silicium={nextLevelCost.silicium}
              hydrogene={nextLevelCost.hydrogene}
              currentMinerai={resources.minerai}
              currentSilicium={resources.silicium}
              currentHydrogene={resources.hydrogene}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {formatDuration(nextLevelTime)}
              </span>
              <Button
                variant="retro"
                size="sm"
                className={cn('h-7 text-xs px-3', !canAfford && 'opacity-80')}
                onClick={onUpgrade}
                disabled={!canAfford || isAnyUpgrading || upgradePending}
              >
                {isConstructing ? 'Construire' : 'Améliorer'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
