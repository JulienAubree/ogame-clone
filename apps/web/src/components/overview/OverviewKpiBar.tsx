import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';

type PanelId = 'minerai' | 'silicium' | 'hydrogene' | 'energy' | 'fleet' | null;

interface ResourceData {
  minerai: number;
  silicium: number;
  hydrogene: number;
  mineraiPerHour: number;
  siliciumPerHour: number;
  hydrogenePerHour: number;
  storageMineraiCapacity: number;
  storageSiliciumCapacity: number;
  storageHydrogeneCapacity: number;
  energyProduced: number;
  energyConsumed: number;
  protectedMinerai?: number;
  protectedSilicium?: number;
  protectedHydrogene?: number;
}

interface ShipCount {
  id: string;
  name: string;
  count: number;
}

interface OverviewKpiBarProps {
  resources: ResourceData | undefined;
  liveResources: { minerai: number; silicium: number; hydrogene: number } | undefined;
  ships: ShipCount[];
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

function Kpi({ iconNode, color, value, active, onClick }: {
  iconNode: React.ReactNode;
  color: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors shrink-0',
        active ? 'bg-accent/60 ring-1 ring-primary/30' : 'hover:bg-accent/30',
      )}
    >
      {iconNode}
      <span className={color}>{value}</span>
      <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', active && 'rotate-180')} />
    </button>
  );
}

function ResourceGauge({ current, capacity, rate, label, color, protectedAmount }: {
  current: number; capacity: number; rate: number; label: string; color: string; protectedAmount?: number;
}) {
  const pct = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="text-center">
      <div className="relative w-[66px] h-[66px] flex items-center justify-center mx-auto">
        <svg className="absolute top-0 left-0 -rotate-90" width={66} height={66}>
          <circle cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3} opacity={0.2} />
          <circle cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
          {protectedAmount != null && protectedAmount > 0 && (() => {
            const protPct = Math.min(100, (protectedAmount / capacity) * 100);
            const protOffset = circumference - (protPct / 100) * circumference;
            return <circle cx={33} cy={33} r={radius} fill="none" stroke="#22c55e" strokeWidth={2}
              strokeDasharray={circumference} strokeDashoffset={protOffset} strokeLinecap="round" opacity={0.4} />;
          })()}
        </svg>
        <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="text-[10px] mt-1 font-medium" style={{ color }}>{label}</div>
      <div className="text-[10px] text-muted-foreground">+{Math.floor(rate).toLocaleString('fr-FR')}/h</div>
      {protectedAmount != null && protectedAmount > 0 && (
        <div className="text-[9px] text-green-500/70 flex items-center justify-center gap-0.5">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          {Math.floor(protectedAmount).toLocaleString('fr-FR')}
        </div>
      )}
    </div>
  );
}

export function OverviewKpiBar({ resources, liveResources, ships }: OverviewKpiBarProps) {
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const toggle = (id: PanelId) => setOpenPanel((prev) => (prev === id ? null : id));

  const totalShips = ships.reduce((sum, s) => sum + s.count, 0);
  const energyBalance = (resources?.energyProduced ?? 0) - (resources?.energyConsumed ?? 0);
  const energyPositive = energyBalance >= 0;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      {/* KPI row */}
      <div className="flex items-center justify-between gap-1 px-2 py-2 lg:gap-3 lg:px-4 overflow-x-auto">
        <Kpi
          iconNode={<MineraiIcon size={14} className="text-minerai" />}
          color="text-minerai"
          value={`${formatRate(resources?.mineraiPerHour ?? 0)}/h`}
          active={openPanel === 'minerai'}
          onClick={() => toggle('minerai')}
        />
        <Kpi
          iconNode={<SiliciumIcon size={14} className="text-silicium" />}
          color="text-silicium"
          value={`${formatRate(resources?.siliciumPerHour ?? 0)}/h`}
          active={openPanel === 'silicium'}
          onClick={() => toggle('silicium')}
        />
        <Kpi
          iconNode={<HydrogeneIcon size={14} className="text-hydrogene" />}
          color="text-hydrogene"
          value={`${formatRate(resources?.hydrogenePerHour ?? 0)}/h`}
          active={openPanel === 'hydrogene'}
          onClick={() => toggle('hydrogene')}
        />
        <div className="hidden h-5 w-px bg-border/40 lg:block" />
        <Kpi
          iconNode={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={energyPositive ? 'text-yellow-400' : 'text-red-400'}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
          color={energyPositive ? 'text-yellow-400' : 'text-red-400'}
          value={`${energyPositive ? '+' : ''}${Math.floor(energyBalance)}`}
          active={openPanel === 'energy'}
          onClick={() => toggle('energy')}
        />
        <div className="hidden h-5 w-px bg-border/40 lg:block" />
        <Kpi
          iconNode={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><path d="M2 20h.01M7 20v-4M12 20V10M17 20V4M22 20h.01"/></svg>}
          color="text-cyan-400"
          value={`${totalShips} vsx`}
          active={openPanel === 'fleet'}
          onClick={() => toggle('fleet')}
        />
      </div>

      {/* Expandable panels */}
      {openPanel === 'minerai' && resources && (
        <div className="border-t border-border/30 px-4 py-3">
          <ResourceGauge
            current={liveResources?.minerai ?? 0}
            capacity={resources.storageMineraiCapacity}
            rate={resources.mineraiPerHour}
            label="Minerai"
            color="#fb923c"
            protectedAmount={resources.protectedMinerai}
          />
        </div>
      )}
      {openPanel === 'silicium' && resources && (
        <div className="border-t border-border/30 px-4 py-3">
          <ResourceGauge
            current={liveResources?.silicium ?? 0}
            capacity={resources.storageSiliciumCapacity}
            rate={resources.siliciumPerHour}
            label="Silicium"
            color="#34d399"
            protectedAmount={resources.protectedSilicium}
          />
        </div>
      )}
      {openPanel === 'hydrogene' && resources && (
        <div className="border-t border-border/30 px-4 py-3">
          <ResourceGauge
            current={liveResources?.hydrogene ?? 0}
            capacity={resources.storageHydrogeneCapacity}
            rate={resources.hydrogenePerHour}
            label="Hydrogene"
            color="#60a5fa"
            protectedAmount={resources.protectedHydrogene}
          />
        </div>
      )}
      {openPanel === 'energy' && resources && (
        <div className="border-t border-border/30 px-4 py-3">
          <div className="flex items-center justify-around text-center">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Produite</div>
              <div className="text-sm font-bold text-yellow-400">{Math.floor(resources.energyProduced).toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Consommee</div>
              <div className="text-sm font-bold text-orange-400">{Math.floor(resources.energyConsumed).toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</div>
              <div className={`text-sm font-bold ${energyPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {energyPositive ? '+' : ''}{Math.floor(energyBalance).toLocaleString('fr-FR')}
              </div>
            </div>
          </div>
          {/* Visual bar */}
          <div className="mt-2 h-2 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-yellow-400"
              style={{ width: `${Math.min(100, resources.energyProduced > 0 ? (resources.energyConsumed / resources.energyProduced) * 100 : 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
            <span>0</span>
            <span>{Math.floor(resources.energyProduced).toLocaleString('fr-FR')}</span>
          </div>
        </div>
      )}
      {openPanel === 'fleet' && (
        <div className="border-t border-border/30 px-4 py-3">
          {ships.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {ships.map((ship) => (
                <div key={ship.id} className="flex justify-between px-2 py-1.5 rounded bg-muted/30">
                  <span className="text-muted-foreground">{ship.name}</span>
                  <span className="text-foreground font-semibold">{ship.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Aucun vaisseau stationne</p>
          )}
        </div>
      )}
    </div>
  );
}
