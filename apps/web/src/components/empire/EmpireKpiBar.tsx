import { Pickaxe, Gem, Droplets, Globe, Rocket, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmpireKpiBarProps {
  totalRates: { mineraiPerHour: number; siliciumPerHour: number; hydrogenePerHour: number };
  planetCount: number;
  activeFleetCount: number;
  inboundAttackCount: number;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpireKpiBar({ totalRates, planetCount, activeFleetCount, inboundAttackCount }: EmpireKpiBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/30 bg-card/60 p-3 lg:gap-6 lg:p-4">
      <Kpi icon={Pickaxe} iconBg="bg-minerai/10" color="text-minerai" value={`${formatRate(totalRates.mineraiPerHour)}/h`} label="Minerai total" />
      <Kpi icon={Gem} iconBg="bg-silicium/10" color="text-silicium" value={`${formatRate(totalRates.siliciumPerHour)}/h`} label="Silicium total" />
      <Kpi icon={Droplets} iconBg="bg-hydrogene/10" color="text-hydrogene" value={`${formatRate(totalRates.hydrogenePerHour)}/h`} label="Hydrogène total" />
      <div className="hidden h-7 w-px bg-border/50 lg:block" />
      <Kpi icon={Globe} iconBg="bg-muted" color="text-foreground" value={String(planetCount)} label="Planètes" />
      <Kpi icon={Rocket} iconBg="bg-primary/10" color="text-primary" value={String(activeFleetCount)} label="Flottes en vol" />
      {inboundAttackCount > 0 && (
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive animate-pulse">
          <ShieldAlert className="h-4 w-4" />
          {inboundAttackCount} attaque{inboundAttackCount > 1 ? 's' : ''} en cours
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, iconBg, color, value, label }: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBg)}>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <div>
        <div className={cn('text-sm font-bold', color)}>{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
