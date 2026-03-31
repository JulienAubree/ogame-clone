interface EnergySegment {
  label: string;
  value: number;
  color: string; // hex
}

interface EnergyBarProps {
  totalProduced: number;
  totalConsumed: number;
  segments: EnergySegment[];
  productionFactor: number;
}

export function EnergyBar({ totalProduced, totalConsumed, segments, productionFactor }: EnergyBarProps) {
  const available = totalProduced - totalConsumed;
  const sufficient = available >= 0;

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold text-energy uppercase tracking-wider">
          Énergie disponible
        </span>
        <span className="font-mono text-sm font-bold text-energy">
          {available} <span className="text-muted-foreground font-normal">/ {totalProduced}</span>
        </span>
      </div>

      {/* Segmented bar */}
      <div className="relative h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.06]">
        <div className="absolute inset-y-0 left-0 flex">
          {segments.map((seg) => {
            const widthPct = totalProduced > 0 ? (seg.value / totalProduced) * 100 : 0;
            return (
              <div
                key={seg.label}
                className="h-full border-r border-black/30 last:border-r-0"
                style={{ width: `${widthPct}%`, backgroundColor: seg.color, opacity: 0.7, minWidth: widthPct > 0 ? 2 : 0 }}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-muted-foreground">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
            {seg.label} {seg.value}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-white/10" />
          Dispo. {available}
        </span>
      </div>

      {!sufficient && (
        <p className="mt-1.5 text-xs text-destructive">
          Facteur de production : {(productionFactor * 100).toFixed(0)}% — Construisez une centrale solaire ou des satellites !
        </p>
      )}
    </div>
  );
}
