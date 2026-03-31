import { Gauge } from './Gauge';
import type { ReactNode } from 'react';

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
  productionLabel: string;
}

interface EnergySource {
  name: string;
  icon: ReactNode;
  energy: number;
  detail: string;
}

interface FluxViewProps {
  sources: EnergySource[];
  consumers: Consumer[];
  onPercentChange: (key: string, value: number) => void;
  onPercentChangeEnd: (key: string, value: number) => void;
  disabled?: boolean;
}

export function FluxView({
  sources,
  consumers,
  onPercentChange,
  onPercentChangeEnd,
  disabled = false,
}: FluxViewProps) {
  const consumerCount = consumers.length;

  return (
    <div className="space-y-4">
      {/* CONSUMERS — Actionable, on top */}
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        Réglages de production
      </h3>
      <div className={`grid gap-3 ${consumerCount <= 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {consumers.map((c) => (
          <div
            key={c.key}
            className="glass-card p-3 relative overflow-hidden"
          >
            {/* Color accent top */}
            <div
              className="absolute inset-x-0 top-0 h-[3px]"
              style={{ background: `linear-gradient(90deg, transparent, ${c.colorHex}, transparent)` }}
            />

            {/* Header: icon + name */}
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 flex items-center justify-center rounded-lg bg-white/[0.04] shrink-0">
                <span className={c.colorClass}>{c.icon}</span>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">{c.name}</div>
                <div className="text-[10px] text-muted-foreground">Niv. {c.level}</div>
              </div>
            </div>

            {/* Gauge */}
            <Gauge
              value={c.percent}
              onChange={(v) => onPercentChange(c.key, v)}
              onChangeEnd={(v) => onPercentChangeEnd(c.key, v)}
              color={c.colorHex}
              disabled={disabled}
            />

            {/* Stats: production + energy */}
            <div className="flex justify-between items-center mt-2 text-[11px]">
              <span className={`font-mono font-semibold ${c.colorClass}`}>{c.production}</span>
              <span className="font-mono text-destructive">-{c.energyConsumption} <span className="text-energy">⚡</span></span>
            </div>
          </div>
        ))}
      </div>

      {/* SOURCES — Informational, at bottom */}
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest pt-2">
        Sources d'énergie
      </h3>
      <div className="flex flex-col sm:flex-row gap-3">
        {sources.map((s) => (
          <div
            key={s.name}
            className="glass-card flex items-center gap-3 p-3 flex-1"
          >
            <div className="size-9 flex items-center justify-center rounded-lg bg-energy/[0.06] shrink-0 text-energy">
              {s.icon}
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">{s.name}</div>
              <div className="text-base font-bold text-energy font-mono">+{s.energy}</div>
              <div className="text-[10px] text-muted-foreground">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
