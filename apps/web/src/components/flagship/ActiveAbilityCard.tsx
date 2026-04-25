import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCountdownSeconds } from '@/hooks/useCountdown';
import { CoordinateInput } from '@/components/common/CoordinateInput';
import { TargetContactsDropdown } from '@/components/fleet/TargetContactsDropdown';
import { CooldownIcon } from './CooldownIcon';

export interface AbilityLite {
  id: string;
  name: string;
  description: string;
  cooldownSeconds?: number;
}

export interface HullCardStyle {
  badge: string;
  badgeText: string;
}

export interface ScanCoords {
  galaxy: number;
  system: number;
  position: number;
}

interface ActiveAbilityCardProps {
  ability: AbilityLite;
  cooldownData: { cooldownEnds: string } | undefined;
  styles: HullCardStyle;
  isActive: boolean;
  scanTarget: ScanCoords;
  setScanTarget: (coords: ScanCoords) => void;
  handleScan: () => void;
  scanMutation: { isPending: boolean; isSuccess: boolean };
  scanError: string;
}

export function ActiveAbilityCard({
  ability,
  cooldownData,
  styles,
  isActive,
  scanTarget,
  setScanTarget,
  handleScan,
  scanMutation,
  scanError,
}: ActiveAbilityCardProps) {
  const onCooldown = cooldownData ? new Date(cooldownData.cooldownEnds) > new Date() : false;
  const cooldownEnd = cooldownData ? new Date(cooldownData.cooldownEnds) : null;
  const secondsLeft = useCountdownSeconds(onCooldown ? cooldownEnd : null);
  const cooldownTotal = ability.cooldownSeconds ?? 1800;
  const isScan = ability.id === 'scan_mission';

  return (
    <div className={cn('retro-card relative overflow-hidden flex flex-col', onCooldown && 'opacity-80')}>
      {/* Hero zone */}
      <div className="relative h-[100px] overflow-hidden bg-gradient-to-br from-cyan-950/60 to-slate-900 flex items-center justify-center">
        <CooldownIcon
          secondsLeft={secondsLeft}
          totalSeconds={cooldownTotal}
          size={56}
          icon={
            <Search className={cn('h-7 w-7', styles.badgeText)} strokeWidth={1.5} />
          }
        />
        {onCooldown && (
          <div
            className="absolute inset-0 bg-slate-900/60 pointer-events-none"
            style={{ clipPath: `inset(0 ${(cooldownTotal - secondsLeft) / cooldownTotal * 100}% 0 0)` }}
          />
        )}
        {onCooldown ? (
          <span className="absolute top-2 right-2 bg-slate-800/90 text-slate-400 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-slate-700/50">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </span>
        ) : (
          <span className={cn('absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border', styles.badge, styles.badgeText)}>
            Pret
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 gap-2">
        <div className="text-[13px] font-semibold text-foreground">{ability.name}</div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{ability.description}</p>
        <div className="flex-1" />

        {/* Scan-specific UI */}
        {isScan && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <CoordinateInput
                galaxy={scanTarget.galaxy}
                system={scanTarget.system}
                position={scanTarget.position}
                onChange={setScanTarget}
                disabled={!isActive || onCooldown}
              />
              <TargetContactsDropdown
                onSelect={setScanTarget}
                disabled={!isActive || onCooldown}
              />
            </div>
            <button
              onClick={handleScan}
              disabled={!isActive || onCooldown || scanMutation.isPending || !scanTarget.galaxy || !scanTarget.system || !scanTarget.position}
              className="w-full rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scanMutation.isPending ? 'Scan en cours...' : 'Scanner'}
            </button>
            {scanError && <p className="text-[11px] text-red-400">{scanError}</p>}
            {scanMutation.isSuccess && <p className="text-[11px] text-emerald-400">Scan termine !</p>}
          </>
        )}
      </div>
    </div>
  );
}
