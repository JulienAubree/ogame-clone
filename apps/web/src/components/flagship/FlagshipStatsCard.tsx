import { Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ShieldIcon, ArmorIcon, HullIcon, WeaponsIcon, ShotsIcon,
  SpeedIcon, PropulsionIcon, FuelIcon, CargoIcon,
  SectionHeader,
} from '@/components/entity-details/stat-components';
import { FlagshipStat } from './FlagshipStat';
import { getHullCardStyles } from './hullCardStyles';

const fmt = (n: number) => n.toLocaleString('fr-FR');

const DRIVE_LABELS: Record<string, string> = {
  combustion: 'Combustion',
  impulse: 'Impulsion',
  impulsion: 'Impulsion',
  hyperespace: 'Hyperespace',
};

interface FlagshipBaseStats {
  shield: number;
  baseArmor: number;
  hull: number;
  weapons: number;
  shotCount: number;
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
  driveType: string;
}

interface EffectiveStats {
  shield?: number;
  baseArmor?: number;
  hull?: number;
  weapons?: number;
  shotCount?: number;
  baseSpeed?: number;
  fuelConsumption?: number;
  cargoCapacity?: number;
  driveType?: string;
}

interface FlagshipStatsCardProps {
  flagship: FlagshipBaseStats & { hullId: string | null };
  effectiveStats: EffectiveStats | null;
  talentBonuses: Record<string, number>;
  driveType: string;
}

export function FlagshipStatsCard({
  flagship,
  effectiveStats,
  talentBonuses,
  driveType,
}: FlagshipStatsCardProps) {
  const styles = getHullCardStyles(flagship.hullId);

  return (
    <div className={cn('glass-card p-4 lg:p-5 space-y-4 border', styles.border)}>
      {/* Defense */}
      <div>
        <SectionHeader icon={<ShieldIcon size={14} className="text-sky-400" />} label="Defense" color="text-sky-400" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          <FlagshipStat
            icon={<ShieldIcon />}
            label="Bouclier"
            value={effectiveStats?.shield ?? flagship.shield}
            base={flagship.shield}
            bonus={talentBonuses.shield}
            variant="shield"
          />
          <FlagshipStat
            icon={<ArmorIcon />}
            label="Blindage"
            value={effectiveStats?.baseArmor ?? flagship.baseArmor}
            base={flagship.baseArmor}
            bonus={talentBonuses.baseArmor}
            variant="armor"
          />
          <FlagshipStat
            icon={<HullIcon />}
            label="Coque"
            value={effectiveStats?.hull ?? flagship.hull}
            base={flagship.hull}
            bonus={talentBonuses.hull}
            variant="hull"
          />
        </div>
      </div>

      <div className="h-px bg-[#334155]" />

      {/* Attaque */}
      <div>
        <SectionHeader icon={<WeaponsIcon size={14} className="text-red-400" />} label="Attaque" color="text-red-400" />
        <div className="grid grid-cols-2 gap-1.5">
          <FlagshipStat
            icon={<WeaponsIcon />}
            label="Armement"
            value={effectiveStats?.weapons ?? flagship.weapons}
            base={flagship.weapons}
            bonus={talentBonuses.weapons}
            variant="weapons"
          />
          <FlagshipStat
            icon={<ShotsIcon />}
            label="Tirs / round"
            value={effectiveStats?.shotCount ?? flagship.shotCount}
            base={flagship.shotCount}
            bonus={talentBonuses.shotCount}
            variant="shots"
          />
        </div>
      </div>

      <div className="h-px bg-[#334155]" />

      {/* Deplacement */}
      <div>
        <SectionHeader
          icon={<Navigation className="h-3.5 w-3.5 text-slate-500" />}
          label="Deplacement"
          color="text-slate-500"
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <SpeedIcon size={14} className="text-slate-500 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Vitesse</div>
              <div className="text-xs text-slate-200 font-mono font-semibold">
                {fmt(effectiveStats?.baseSpeed ?? flagship.baseSpeed)}
                {talentBonuses.speedPercent ? (
                  <span className="text-[9px] text-emerald-500 ml-1">
                    base {fmt(flagship.baseSpeed)} · +{fmt(Math.round(flagship.baseSpeed * talentBonuses.speedPercent))}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PropulsionIcon size={14} className="text-slate-500 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Propulsion</div>
              <div className="text-xs text-purple-400 font-mono font-semibold">
                {DRIVE_LABELS[driveType] ?? driveType}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FuelIcon size={14} className="text-slate-500 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Consommation</div>
              <div className="text-xs text-slate-200 font-mono font-semibold">
                {fmt(effectiveStats?.fuelConsumption ?? flagship.fuelConsumption)}
                {talentBonuses.fuelConsumption ? (
                  <span className="text-[9px] text-emerald-500 ml-1">
                    base {fmt(flagship.fuelConsumption)} · {talentBonuses.fuelConsumption > 0 ? '+' : ''}{fmt(talentBonuses.fuelConsumption)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CargoIcon size={14} className="text-slate-500 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Soute</div>
              <div className="text-xs text-slate-200 font-mono font-semibold">
                {fmt(effectiveStats?.cargoCapacity ?? flagship.cargoCapacity)}
                {talentBonuses.cargoCapacity ? (
                  <span className="text-[9px] text-emerald-500 ml-1">
                    base {fmt(flagship.cargoCapacity)} · +{fmt(talentBonuses.cargoCapacity)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
