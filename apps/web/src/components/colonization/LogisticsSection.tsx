import {
  Package as IconPackage,
  Clock as IconClock,
  Truck as IconTruck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatHoursMinutes } from '@/lib/format';
import { BonusCountdown } from './Countdowns';
import { ExpandableInfo } from '@/components/common/ExpandableInfo';
import type { ColonizationStatus } from './types';

const formatNumber = (n: number) => n.toLocaleString('fr-FR');

type StockStatus = 'sufficient' | 'critical' | 'stockout';

interface LogisticsSectionProps {
  status: ColonizationStatus;
  onSendResources: () => void;
}

export function LogisticsSection({ status, onSendResources }: LogisticsSectionProps) {
  const stockStatus: StockStatus =
    !status.stockSufficient
      ? 'stockout'
      : status.hoursUntilStockout !== null && status.hoursUntilStockout < 2
        ? 'critical'
        : 'sufficient';

  return (
    <section className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-emerald-900/5 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
          <IconTruck className="w-4 h-4" />
          Logistique
        </h3>
        <div className="flex items-center gap-1.5">
          {stockStatus === 'sufficient' && (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-medium">Stock suffisant</span>
            </>
          )}
          {stockStatus === 'critical' && (
            <>
              <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-[11px] text-orange-400 font-medium">Stock critique — moins de 2h</span>
            </>
          )}
          {stockStatus === 'stockout' && (
            <>
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] text-red-400 font-medium">Rupture de stock — progression ralentie</span>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[11px] text-muted-foreground leading-tight">
          Envoyez des ressources pour prolonger l'autonomie et eviter la rupture de stock
          {!status.stockSufficient && <span className="text-red-300 font-medium"> (progression actuellement divisee par 2)</span>}.
        </p>
        {status.convoyBonusActive && status.convoyBonusEndsAt ? (
          <p className="mt-1 text-[11px] text-emerald-300">
            Convoi recent actif : <span className="font-bold">+{(status.convoyBonusValue * 100).toFixed(0)}%/h</span> encore <BonusCountdown target={new Date(status.convoyBonusEndsAt)} />.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Chaque livraison declenche <span className="text-emerald-300 font-medium">+{(status.convoyBonusValue * 100).toFixed(0)}%/h pendant {status.convoyWindowHours}h</span>.
          </p>
        )}
        <div className="mt-1.5">
          <ExpandableInfo label="Impact d'un convoi" accent="emerald">
            <p>
              Consommation : <span className="text-minerai font-medium">{formatNumber(status.consumptionMineraiPerHour)} minerai/h</span> +{' '}
              <span className="text-silicium font-medium">{formatNumber(status.consumptionSiliciumPerHour)} silicium/h</span>.
            </p>
            <p className="text-emerald-300">
              Bonus convoi : chaque livraison (meme symbolique) accorde <span className="font-bold">+{(status.convoyBonusValue * 100).toFixed(0)}%/h pendant {status.convoyWindowHours}h</span>. Le compteur se remet a zero a chaque nouveau convoi — enchainez les livraisons pour maintenir le bonus en continu.
            </p>
            <div className="rounded-md bg-card/60 border border-border/20 p-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prolongation d'autonomie</p>
              <p>
                1 000 minerai = +<span className="text-foreground font-medium">{formatHoursMinutes(1000 / Math.max(1, status.consumptionMineraiPerHour))}</span>
              </p>
              <p>
                10 000 minerai = +<span className="text-foreground font-medium">{formatHoursMinutes(10000 / Math.max(1, status.consumptionMineraiPerHour))}</span>
              </p>
              <p>
                1 000 silicium = +<span className="text-foreground font-medium">{formatHoursMinutes(1000 / Math.max(1, status.consumptionSiliciumPerHour))}</span>
              </p>
            </div>
            <p className="text-muted-foreground">
              Rupture = taux divise par 2 (vous perdez environ {((status.basePassiveRate * status.difficultyFactor * 0.5) * 100).toFixed(1)}%/h).
              L'autonomie la plus courte des deux ressources fait foi.
            </p>
          </ExpandableInfo>
        </div>
      </div>

      <div className="px-4 space-y-3 pb-3">
        {/* Minerai */}
        <div className="rounded-lg bg-card/60 border border-border/20 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-minerai">Minerai</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-foreground tabular-nums">{formatNumber(Math.floor(status.currentMinerai))}</span>
              <span className="text-red-400 tabular-nums">-{formatNumber(status.consumptionMineraiPerHour)}/h</span>
            </div>
          </div>
        </div>

        {/* Silicium */}
        <div className="rounded-lg bg-card/60 border border-border/20 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-silicium">Silicium</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-foreground tabular-nums">{formatNumber(Math.floor(status.currentSilicium))}</span>
              <span className="text-red-400 tabular-nums">-{formatNumber(status.consumptionSiliciumPerHour)}/h</span>
            </div>
          </div>
        </div>

        {/* Hydrogène (stored, not consumed during colonization) */}
        {status.currentHydrogene > 0 && (
          <div className="rounded-lg bg-card/60 border border-border/20 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-hydrogene">Hydrogène</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-foreground tabular-nums">{formatNumber(Math.floor(status.currentHydrogene))}</span>
              </div>
            </div>
          </div>
        )}

        {/* Stockout ETA */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <IconClock className="w-3.5 h-3.5" />
            <span>Autonomie restante</span>
          </div>
          <span className={cn(
            'font-medium tabular-nums',
            status.hoursUntilStockout === null
              ? 'text-emerald-400'
              : status.hoursUntilStockout < 2
                ? 'text-red-400'
                : status.hoursUntilStockout < 6
                  ? 'text-orange-400'
                  : 'text-emerald-400',
          )}>
            {status.hoursUntilStockout === null
              ? 'Illimite'
              : formatHoursMinutes(status.hoursUntilStockout)}
          </span>
        </div>
      </div>

      <div className="border-t border-emerald-500/10 px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          onClick={onSendResources}
        >
          <IconPackage className="w-4 h-4 mr-2" />
          Envoyer des ressources
        </Button>
      </div>
    </section>
  );
}
