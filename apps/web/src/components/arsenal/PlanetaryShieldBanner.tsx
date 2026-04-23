import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PlanetaryShieldBannerProps {
  currentLevel: number;
  levelBonus: number;
  nextLevelCost: { minerai: number; silicium: number; hydrogene: number };
  nextLevelTime: number;
  isUpgrading: boolean;
  upgradeEndTime: string | null;
  resources: { minerai: number; silicium: number; hydrogene: number };
  isAnyUpgrading: boolean;
  upgradePending: boolean;
  cancelPending: boolean;
  onUpgrade: () => void;
  onCancel: () => void;
  onTimerComplete: () => void;
}

export function PlanetaryShieldBanner({
  currentLevel,
  levelBonus,
  nextLevelCost,
  nextLevelTime,
  isUpgrading,
  upgradeEndTime,
  resources,
  isAnyUpgrading,
  upgradePending,
  cancelPending,
  onUpgrade,
  onCancel,
  onTimerComplete,
}: PlanetaryShieldBannerProps) {
  const effectiveLevel = currentLevel + (levelBonus > 0 ? levelBonus : 0);
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
        {/* Shield icon */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="relative shrink-0 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <path d="M12 2L3 6v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V6l-9-4z" />
            </svg>
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
