import { useState } from 'react';
import { BarChart3, ChevronDown, Shield, Zap } from 'lucide-react';
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

interface BuildingLevels {
  mineraiMine: number;
  siliciumMine: number;
  hydrogeneSynth: number;
  solarPlant: number;
  solarSatelliteCount: number;
  storageMinerai?: number;
  storageSilicium?: number;
  storageHydrogene?: number;
}

interface OverviewKpiBarProps {
  resources: ResourceData | undefined;
  liveResources: { minerai: number; silicium: number; hydrogene: number } | undefined;
  ships: ShipCount[];
  levels?: BuildingLevels;
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


function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.floor(value).toLocaleString('fr-FR');
}

function ResourcePanel({ mineLevel, mineLabel, production, storageLevel, capacity, current, protectedAmount, color }: {
  mineLevel: number; mineLabel: string; production: number;
  storageLevel?: number; capacity: number; current: number;
  protectedAmount?: number; color: string;
}) {
  const pct = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
  return (
    <div className="border-t border-border/30 px-4 py-3">
      <div className="flex items-center gap-4 text-xs">
        {/* Mine */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-muted-foreground">{mineLabel}</div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold" style={{ color }}>Niv. {mineLevel}</span>
            <span className="text-muted-foreground">·</span>
            <span style={{ color }}>+{formatNumber(production)}/h</span>
          </div>
        </div>
        {/* Storage */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-muted-foreground">
            Hangar{storageLevel != null && <span> Niv. {storageLevel}</span>}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-foreground">{formatNumber(current)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{formatNumber(capacity)}</span>
          </div>
        </div>
        {/* Fill gauge */}
        <div className="w-16 text-right">
          <div className="text-sm font-bold" style={{ color }}>{pct}%</div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-0.5">
            <div className="h-full rounded-full" style={{ background: color, width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {protectedAmount != null && protectedAmount > 0 && (
        <div className="text-[9px] text-green-500/70 flex items-center gap-1 mt-1">
          <Shield className="h-2 w-2" />
          {formatNumber(protectedAmount)} protégé
        </div>
      )}
    </div>
  );
}

export function OverviewKpiBar({ resources, liveResources, ships, levels }: OverviewKpiBarProps) {
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
          iconNode={<Zap className={cn('h-3.5 w-3.5', energyPositive ? 'text-yellow-400' : 'text-red-400')} />}
          color={energyPositive ? 'text-yellow-400' : 'text-red-400'}
          value={`${energyPositive ? '+' : ''}${Math.floor(energyBalance)}`}
          active={openPanel === 'energy'}
          onClick={() => toggle('energy')}
        />
        <div className="hidden h-5 w-px bg-border/40 lg:block" />
        <Kpi
          iconNode={<BarChart3 className="h-3.5 w-3.5 text-cyan-400" />}
          color="text-cyan-400"
          value={`${totalShips} vsx`}
          active={openPanel === 'fleet'}
          onClick={() => toggle('fleet')}
        />
      </div>

      {/* Expandable panels */}
      {openPanel === 'minerai' && resources && (
        <ResourcePanel
          mineLevel={levels?.mineraiMine ?? 0}
          mineLabel="Mine de minerai"
          production={resources.mineraiPerHour}
          storageLevel={levels?.storageMinerai}
          capacity={resources.storageMineraiCapacity}
          current={liveResources?.minerai ?? 0}
          protectedAmount={resources.protectedMinerai}
          color="#fb923c"
        />
      )}
      {openPanel === 'silicium' && resources && (
        <ResourcePanel
          mineLevel={levels?.siliciumMine ?? 0}
          mineLabel="Mine de silicium"
          production={resources.siliciumPerHour}
          storageLevel={levels?.storageSilicium}
          capacity={resources.storageSiliciumCapacity}
          current={liveResources?.silicium ?? 0}
          protectedAmount={resources.protectedSilicium}
          color="#34d399"
        />
      )}
      {openPanel === 'hydrogene' && resources && (
        <ResourcePanel
          mineLevel={levels?.hydrogeneSynth ?? 0}
          mineLabel="Synthétiseur d'hydrogène"
          production={resources.hydrogenePerHour}
          storageLevel={levels?.storageHydrogene}
          capacity={resources.storageHydrogeneCapacity}
          current={liveResources?.hydrogene ?? 0}
          protectedAmount={resources.protectedHydrogene}
          color="#60a5fa"
        />
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
            <p className="text-xs text-muted-foreground italic">Aucun vaisseau stationné</p>
          )}
        </div>
      )}
    </div>
  );
}
