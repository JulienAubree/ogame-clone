import { Button } from '@/components/ui/button';
import type { Mission } from '@/config/mission-config';
import { MISSION_CONFIG } from '@/config/mission-config';

interface MiningStats {
  fleetExtraction: number;
  extractionBonus: number;
  slagRate: number;
  effectiveCargo?: number;
  maxPerCycle: number;
  mineDuration: number;
}

interface FleetSummaryBarProps {
  mission: Mission | null;
  selectedShips: Record<string, number>;
  totalCargo: number;
  cargoCapacity: number;
  miningStats?: MiningStats;
  fuel: number | null;
  duration: number | null;
  disabled: boolean;
  sending: boolean;
  onSend: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

export function FleetSummaryBar({ mission, selectedShips, totalCargo, cargoCapacity, miningStats, fuel, duration, disabled, sending, onSend }: FleetSummaryBarProps) {
  const shipCount = Object.values(selectedShips).reduce((sum, n) => sum + n, 0);
  const config = mission ? MISSION_CONFIG[mission] : null;
  const buttonLabel = config?.buttonLabel ?? 'Envoyer';
  const isMine = mission === 'mine';

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header: ship count + send button */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {shipCount > 0
            ? `${shipCount} vaisseau${shipCount > 1 ? 'x' : ''}`
            : 'Aucun vaisseau selectionne'}
        </div>
        <Button
          size="sm"
          disabled={disabled || sending}
          onClick={onSend}
          variant={config?.dangerous ? 'destructive' : 'default'}
        >
          {sending ? 'Envoi...' : buttonLabel}
        </Button>
      </div>

      {shipCount > 0 && (
        <div className="space-y-1.5 text-xs">
          {/* Mining-specific details */}
          {isMine && miningStats && (
            <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extraction flotte</span>
                <span className="text-foreground font-medium">
                  {fmt(miningStats.fleetExtraction)}
                  {miningStats.extractionBonus > 0 && (
                    <span className="text-emerald-400 ml-1">(+{miningStats.extractionBonus}%)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Soute totale</span>
                <span className="text-foreground font-medium">{fmt(cargoCapacity)}</span>
              </div>
              {miningStats.slagRate > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scories</span>
                  <span className="text-amber-400 font-medium">-{Math.round(miningStats.slagRate * 100)}%</span>
                </div>
              )}
              {miningStats.effectiveCargo != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Soute utile (apres scories)</span>
                  <span className="text-foreground font-medium">{fmt(miningStats.effectiveCargo)}</span>
                </div>
              )}
              <div className="border-t border-amber-500/20 pt-1 mt-1 flex justify-between">
                <span className="text-muted-foreground font-semibold">Gain par cycle</span>
                <span className="text-amber-300 font-bold">{fmt(miningStats.maxPerCycle)}</span>
              </div>
              {miningStats.maxPerCycle < cargoCapacity * 0.9 && miningStats.fleetExtraction < (miningStats.effectiveCargo ?? cargoCapacity) && (
                <div className="text-[10px] text-amber-400/80 mt-0.5">
                  Extraction limitee par les prospecteurs — ajoutez-en ou retirez des transporteurs
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Duree minage</span>
                <span>{miningStats.mineDuration} min</span>
              </div>
            </div>
          )}

          {/* Standard cargo line (non-mining) */}
          {!isMine && (
            <div className="text-muted-foreground">
              Cargo : {fmt(totalCargo)} / {fmt(cargoCapacity)}
            </div>
          )}

          {/* Fuel + travel duration */}
          {fuel != null && duration != null && (
            <div className="flex gap-4 text-muted-foreground">
              <span>{fmt(fuel)} hydrogene</span>
              <span>{formatDuration(duration)} (aller)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
