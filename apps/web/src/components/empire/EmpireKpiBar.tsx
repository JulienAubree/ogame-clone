import { Globe, Rocket, ShieldAlert, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';

interface GovernanceData {
  colonyCount: number;
  capacity: number;
  overextend: number;
  harvestMalus: number;
  constructionMalus: number;
}

interface EmpireKpiBarProps {
  totalRates: { mineraiPerHour: number; siliciumPerHour: number; hydrogenePerHour: number };
  planetCount: number;
  activeFleetCount: number;
  inboundAttackCount: number;
  governance?: GovernanceData | null;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpireKpiBar({ totalRates, planetCount, activeFleetCount, inboundAttackCount, governance }: EmpireKpiBarProps) {
  const govColor = governance
    ? governance.colonyCount > governance.capacity
      ? 'text-destructive'
      : governance.colonyCount === governance.capacity
        ? 'text-amber-400'
        : 'text-emerald-400'
    : 'text-foreground';

  const govIconBg = governance
    ? governance.colonyCount > governance.capacity
      ? 'bg-destructive/10'
      : governance.colonyCount === governance.capacity
        ? 'bg-amber-400/10'
        : 'bg-emerald-400/10'
    : 'bg-muted';

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/30 bg-card/60 p-3 lg:gap-6 lg:p-4">
      <Kpi iconNode={<MineraiIcon size={16} className="text-minerai" />} iconBg="bg-minerai/10" color="text-minerai" value={`${formatRate(totalRates.mineraiPerHour)}/h`} label="Minerai total" />
      <Kpi iconNode={<SiliciumIcon size={16} className="text-silicium" />} iconBg="bg-silicium/10" color="text-silicium" value={`${formatRate(totalRates.siliciumPerHour)}/h`} label="Silicium total" />
      <Kpi iconNode={<HydrogeneIcon size={16} className="text-hydrogene" />} iconBg="bg-hydrogene/10" color="text-hydrogene" value={`${formatRate(totalRates.hydrogenePerHour)}/h`} label="Hydrogène total" />
      <div className="hidden h-7 w-px bg-border/50 lg:block" />
      <Kpi iconNode={<Globe className="h-4 w-4 text-foreground" />} iconBg="bg-muted" color="text-foreground" value={String(planetCount)} label="Planetes" />
      {governance && (
        <div className="flex items-center gap-2">
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', govIconBg)}>
            <Landmark className={cn('h-4 w-4', govColor)} />
          </div>
          <div>
            <div className={cn('text-sm font-bold', govColor)}>
              {governance.colonyCount}/{governance.capacity}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gouvernance</div>
            {governance.overextend > 0 && (
              <div className="text-[10px] font-medium text-destructive">
                {`\u2212${Math.round(governance.harvestMalus * 100)}% recolte, +${Math.round(governance.constructionMalus * 100)}% construction`}
              </div>
            )}
          </div>
        </div>
      )}
      <Kpi iconNode={<Rocket className="h-4 w-4 text-primary" />} iconBg="bg-primary/10" color="text-primary" value={String(activeFleetCount)} label="Flottes en vol" />
      {inboundAttackCount > 0 && (
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive animate-pulse">
          <ShieldAlert className="h-4 w-4" />
          {inboundAttackCount} attaque{inboundAttackCount > 1 ? 's' : ''} en cours
        </div>
      )}
    </div>
  );
}

function Kpi({ iconNode, iconBg, color, value, label }: {
  iconNode: React.ReactNode;
  iconBg: string;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBg)}>
        {iconNode}
      </div>
      <div>
        <div className={cn('text-sm font-bold', color)}>{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
