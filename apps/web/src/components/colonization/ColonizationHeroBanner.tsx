import { Rocket as IconRocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { BonusCountdown } from './Countdowns';
import { ExpandableInfo } from '@/components/common/ExpandableInfo';
import type { ColonizationStatus, PlanetSummary, PlanetCoords } from './types';

interface ColonizationHeroBannerProps {
  status: ColonizationStatus;
  planet: PlanetSummary | undefined;
  coords: PlanetCoords | null;
  outpostNotEstablished: boolean;
  progressPct: number;
  passiveRatePct: string;
  etaDisplay: string;
}

export function ColonizationHeroBanner({
  status,
  planet,
  coords,
  outpostNotEstablished,
  progressPct,
  passiveRatePct,
  etaDisplay,
}: ColonizationHeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-b-2xl lg:rounded-2xl lg:mx-6">
      {/* Planet image background */}
      <div className="absolute inset-0">
        {planet?.planetClassId && planet.planetImageIndex != null ? (
          <img
            src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'full')}
            alt=""
            className="h-full w-full object-cover opacity-40 blur-sm scale-110"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-amber-900/30 to-primary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-12 lg:pb-8">
        <div className="flex items-start gap-5">
          {/* Planet thumbnail */}
          {planet?.planetClassId && planet.planetImageIndex != null ? (
            <div className="relative shrink-0">
              <img
                src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
                alt={planet.name}
                className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/40 object-cover shadow-lg shadow-amber-500/20"
              />
              <div className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 p-1.5 shadow-lg">
                <IconRocket className="h-3.5 w-3.5 text-background" />
              </div>
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-500/40 bg-card text-2xl font-bold text-amber-400 shadow-lg shadow-amber-500/20">
              {planet?.name?.charAt(0) ?? '?'}
            </div>
          )}

          {/* Title + info */}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                {outpostNotEstablished ? 'En attente' : 'Colonisation en cours'}
              </span>
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground truncate">
              {planet?.name ?? 'Colonie'}
            </h1>
            <p className="text-sm text-muted-foreground">
              [{coords?.galaxy}:{coords?.system}:{coords?.position}]
              {' '} · Difficulte x{status.difficultyFactor.toFixed(2)}
            </p>
          </div>

          {/* Big percentage */}
          <div className="hidden sm:block text-right">
            <div className="text-4xl lg:text-5xl font-black tabular-nums text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600">
              {progressPct}%
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="relative h-5 w-full rounded-full bg-card/80 border border-border/30 overflow-hidden">
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear',
                outpostNotEstablished
                  ? 'bg-gradient-to-r from-amber-600/50 to-amber-500/30'
                  : 'bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]',
              )}
              style={{ width: outpostNotEstablished ? '0%' : `${progressPct}%` }}
            />
            {/* Shimmer effect */}
            {!outpostNotEstablished && (
              <div
                className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
                style={{ width: `${progressPct}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite] -translate-x-full" />
              </div>
            )}
            {/* Percentage inside bar on mobile */}
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white sm:hidden drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {outpostNotEstablished ? 'En attente' : `${progressPct}%`}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            {outpostNotEstablished ? (
              <span className="text-amber-400 font-medium">En attente de l'avant-poste</span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  Progression : <span className="text-amber-400 font-medium">{passiveRatePct}%/h</span>
                </span>
                {status.totalRateBonus > 0 && (
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0 text-[10px] font-bold text-emerald-300">
                    +{(status.totalRateBonus * 100).toFixed(0)}%/h bonus
                  </span>
                )}
                {!status.stockSufficient && (
                  <span className="text-red-400">(ralentie — rupture de stock)</span>
                )}
              </span>
            )}
            {!outpostNotEstablished && (
              <span>Estimation : <span className="text-foreground font-medium">{etaDisplay}</span></span>
            )}
          </div>
          {!outpostNotEstablished && (
            <div className="mt-2">
              <ExpandableInfo label="Decomposition du taux" accent="amber">
                {(() => {
                  const baseRow = status.basePassiveRate * status.difficultyFactor * (status.stockSufficient ? 1 : 0.5);
                  return (
                    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
                      <span className="text-muted-foreground">Taux de base</span>
                      <span className="tabular-nums font-medium">{(status.basePassiveRate * 100).toFixed(1)}%/h</span>
                      <span className="text-muted-foreground">× Difficulte</span>
                      <span className="tabular-nums font-medium">×{status.difficultyFactor.toFixed(2)}</span>
                      <span className="text-muted-foreground">× Multiplicateur stock</span>
                      <span className={cn('tabular-nums font-medium', status.stockSufficient ? 'text-emerald-300' : 'text-red-300')}>
                        ×{status.stockSufficient ? '1.00' : '0.50'}
                      </span>
                      <span className="text-muted-foreground border-t border-border/30 pt-1">Sous-total</span>
                      <span className="tabular-nums font-medium border-t border-border/30 pt-1">{(baseRow * 100).toFixed(1)}%/h</span>
                      <span className={cn('text-muted-foreground', !status.garrisonBonusActive && 'opacity-60')}>
                        {status.garrisonBonusActive ? '+ Bonus garnison' : `Bonus garnison (>=${status.garrisonFpThreshold} FP)`}
                      </span>
                      <span className={cn('tabular-nums font-medium', status.garrisonBonusActive ? 'text-emerald-300' : 'text-muted-foreground opacity-60')}>
                        +{(status.garrisonBonusValue * 100).toFixed(0)}%/h
                      </span>
                      <span className={cn('text-muted-foreground', !status.convoyBonusActive && 'opacity-60')}>
                        {status.convoyBonusActive ? '+ Bonus convoi recent' : `Bonus convoi (${status.convoyWindowHours}h apres livraison)`}
                      </span>
                      <span className={cn('tabular-nums font-medium', status.convoyBonusActive ? 'text-emerald-300' : 'text-muted-foreground opacity-60')}>
                        +{(status.convoyBonusValue * 100).toFixed(0)}%/h
                      </span>
                      {status.totalRateBonus > 0 && (
                        <>
                          <span className="text-muted-foreground">Total bonus</span>
                          <span className="tabular-nums font-medium text-emerald-300">
                            +{(status.totalRateBonus * 100).toFixed(0)}%/h
                            {status.totalRateBonus >= status.bonusCap && (
                              <span className="ml-1 text-[10px] text-muted-foreground">(plafond)</span>
                            )}
                          </span>
                        </>
                      )}
                      <span className="text-muted-foreground border-t border-border/30 pt-1">Taux effectif</span>
                      <span className="tabular-nums font-bold text-amber-300 border-t border-border/30 pt-1">{passiveRatePct}%/h</span>
                    </div>
                  );
                })()}
                {status.convoyBonusActive && status.convoyBonusEndsAt && (
                  <p className="text-emerald-300">
                    Bonus convoi actif encore <BonusCountdown target={new Date(status.convoyBonusEndsAt)} />. Chaque nouveau convoi remet le compteur a zero.
                  </p>
                )}
                <p className="text-muted-foreground">
                  A ce rythme, {Math.round((1 - status.progress) * 100)}% restants arrivent dans ~<span className="text-foreground font-medium">{etaDisplay.replace('~', '')}</span>.
                </p>
                <p className="text-muted-foreground">
                  Bonus cumulables jusqu'a +{(status.bonusCap * 100).toFixed(0)}%/h : stationner au moins <span className="text-foreground font-medium">{status.garrisonFpThreshold} FP</span> (+{(status.garrisonBonusValue * 100).toFixed(0)}%/h) et livrer regulierement des ressources (+{(status.convoyBonusValue * 100).toFixed(0)}%/h pendant {status.convoyWindowHours}h).
                </p>
                {!status.stockSufficient && (
                  <p className="text-red-300">
                    Stock epuise : envoyez des ressources pour retrouver le plein rendement ({(status.basePassiveRate * status.difficultyFactor * 100).toFixed(1)}%/h).
                  </p>
                )}
              </ExpandableInfo>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
