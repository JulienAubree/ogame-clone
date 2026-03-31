import { Gauge } from './Gauge';
import type { ReactNode } from 'react';

interface EnergySource {
  name: string;
  icon: ReactNode;
  energy: number;
  detail: string;
}

interface Consumer {
  key: string;
  name: string;
  icon: ReactNode;
  level: number;
  colorHex: string;
  colorClass: string;
  percent: number;
  energyConsumption: number;
  production: string;
  productionUnit: string;
}

interface TableViewProps {
  sources: EnergySource[];
  consumers: Consumer[];
  energySurplus: number;
  productionFactor: number;
  energyProduced: number;
  energyConsumed: number;
  onPercentChange: (key: string, value: number) => void;
  onPercentChangeEnd: (key: string, value: number) => void;
  disabled?: boolean;
}

export function TableView({
  sources,
  consumers,
  energySurplus,
  productionFactor,
  energyProduced,
  energyConsumed,
  onPercentChange,
  onPercentChangeEnd,
  disabled = false,
}: TableViewProps) {
  const sufficient = energySurplus >= 0;

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2fr_minmax(100px,1.5fr)_1fr_1fr] items-center px-4 py-2.5 bg-black/20 border-b border-border/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <span>Bâtiment</span>
        <span className="text-center">Allocation</span>
        <span className="text-center">Prod.</span>
        <span className="text-center">Énergie</span>
      </div>

      {/* Consumers first — actionable */}
      <div className="px-4 py-1.5 border-b border-border/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Consommateurs
      </div>
      {consumers.map((c) => (
        <div
          key={c.key}
          className="grid grid-cols-[2fr_minmax(100px,1.5fr)_1fr_1fr] items-center px-4 py-3 border-b border-border/10 hover:bg-accent/5 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="size-7 flex items-center justify-center rounded-md bg-white/[0.04] shrink-0">
              <span className={c.colorClass}>{c.icon}</span>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">{c.name}</div>
              <div className="text-[11px] text-muted-foreground">Niv. {c.level}</div>
            </div>
          </div>
          <div className="px-1">
            <Gauge
              value={c.percent}
              onChange={(v) => onPercentChange(c.key, v)}
              onChangeEnd={(v) => onPercentChangeEnd(c.key, v)}
              color={c.colorHex}
              disabled={disabled}
            />
          </div>
          <div className="text-center">
            <div className={`text-sm font-mono font-semibold ${c.colorClass}`}>{c.production}</div>
            <div className="text-[10px] text-muted-foreground">{c.productionUnit}</div>
          </div>
          <div className="text-center text-sm font-mono font-semibold text-destructive">
            -{c.energyConsumption}
          </div>
        </div>
      ))}

      {/* Sources — informational */}
      <div className="px-4 py-1.5 bg-energy/5 border-b border-border/20 text-[10px] font-semibold text-energy uppercase tracking-wider">
        Sources
      </div>
      {sources.map((s) => (
        <div
          key={s.name}
          className="grid grid-cols-[2fr_minmax(100px,1.5fr)_1fr_1fr] items-center px-4 py-3 border-b border-border/10 bg-energy/[0.02]"
        >
          <div className="flex items-center gap-2.5">
            <div className="size-7 flex items-center justify-center rounded-md bg-energy/[0.06] shrink-0 text-energy">
              {s.icon}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">{s.name}</div>
              <div className="text-[11px] text-muted-foreground">{s.detail}</div>
            </div>
          </div>
          <div className="text-center">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-energy/10 text-energy border border-energy/20 font-semibold uppercase">
              source
            </span>
          </div>
          <div className="text-center text-muted-foreground">—</div>
          <div className="text-center text-sm font-mono font-semibold text-energy">+{s.energy}</div>
        </div>
      ))}

      {/* Balance row */}
      <div className="grid grid-cols-[2fr_minmax(100px,1.5fr)_1fr_1fr] items-center px-4 py-3 bg-energy/5 border-t border-energy/20">
        <span className="text-sm font-bold text-energy tracking-wide">BILAN</span>
        <div />
        <div className="text-center">
          <div className={`text-base font-mono font-bold ${sufficient ? 'text-energy' : 'text-destructive'}`}>
            {(productionFactor * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">facteur</div>
        </div>
        <div className={`text-center text-lg font-mono font-bold ${sufficient ? 'text-energy' : 'text-destructive'}`}>
          {energySurplus >= 0 ? '+' : ''}{energySurplus}
        </div>
      </div>
    </div>
  );
}
