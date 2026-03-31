import { Knob } from './Knob';

interface EnergySource {
  name: string;
  icon: string;
  energy: number;
  detail: string;
}

interface Consumer {
  key: string;
  name: string;
  icon: string;
  level: number;
  colorHex: string;
  colorClass: string;
  percent: number;
  energyConsumption: number;
  production: string;
  productionUnit: string;
  stock?: { current: number; capacity: number };
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
      <div className="grid grid-cols-[2fr_56px_1fr_1fr] sm:grid-cols-[2fr_64px_1fr_1fr_1fr] items-center px-4 py-2.5 bg-black/20 border-b border-border/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <span>Bâtiment</span>
        <span className="text-center">Alloc.</span>
        <span className="text-center">Énergie</span>
        <span className="text-center">Prod.</span>
        <span className="text-center hidden sm:block">Stock</span>
      </div>

      {/* Sources section */}
      <div className="px-4 py-1.5 bg-energy/5 border-b border-border/20 text-[10px] font-semibold text-energy uppercase tracking-wider">
        ▸ Sources
      </div>
      {sources.map((s) => (
        <div
          key={s.name}
          className="grid grid-cols-[2fr_56px_1fr_1fr] sm:grid-cols-[2fr_64px_1fr_1fr_1fr] items-center px-4 py-3 border-b border-border/10 bg-energy/[0.02]"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{s.icon}</span>
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
          <div className="text-center text-sm font-mono font-semibold text-energy">+{s.energy}</div>
          <div className="text-center text-muted-foreground">—</div>
          <div className="text-center text-muted-foreground hidden sm:block">—</div>
        </div>
      ))}

      {/* Consumers section */}
      <div className="px-4 py-1.5 border-b border-border/20 text-[10px] font-semibold text-destructive uppercase tracking-wider">
        ▸ Consommateurs
      </div>
      {consumers.map((c) => (
        <div
          key={c.key}
          className="grid grid-cols-[2fr_56px_1fr_1fr] sm:grid-cols-[2fr_64px_1fr_1fr_1fr] items-center px-4 py-3 border-b border-border/10 hover:bg-accent/5 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{c.icon}</span>
            <div>
              <div className="text-sm font-medium text-foreground">{c.name}</div>
              <div className="text-[11px] text-muted-foreground">Niveau {c.level}</div>
            </div>
          </div>
          <div className="flex justify-center">
            <Knob
              value={c.percent}
              onChange={(v) => onPercentChange(c.key, v)}
              onChangeEnd={(v) => onPercentChangeEnd(c.key, v)}
              color={c.colorHex}
              size="sm"
              disabled={disabled}
            />
          </div>
          <div className="text-center text-sm font-mono font-semibold text-destructive">
            −{c.energyConsumption}
          </div>
          <div className="text-center">
            <div className={`text-sm font-mono font-semibold ${c.colorClass}`}>
              {c.production}
            </div>
            <div className="text-[10px] text-muted-foreground">{c.productionUnit}</div>
          </div>
          <div className="text-center hidden sm:block">
            {c.stock ? (
              <div>
                <div className="text-xs font-mono text-foreground">
                  {c.stock.current.toLocaleString('fr-FR')}
                </div>
                <div className="w-12 h-0.5 bg-muted rounded mx-auto mt-1 overflow-hidden">
                  <div
                    className="h-0.5 rounded"
                    style={{
                      width: `${Math.min(100, (c.stock.current / Math.max(1, c.stock.capacity)) * 100)}%`,
                      backgroundColor: c.colorHex,
                    }}
                  />
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  / {c.stock.capacity.toLocaleString('fr-FR')}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
      ))}

      {/* Balance row */}
      <div className="grid grid-cols-[2fr_56px_1fr_1fr] sm:grid-cols-[2fr_64px_1fr_1fr_1fr] items-center px-4 py-3 bg-energy/5 border-t border-energy/20">
        <span className="text-sm font-bold text-energy tracking-wide">⚡ BILAN</span>
        <div />
        <div className={`text-center text-lg font-mono font-bold ${sufficient ? 'text-energy' : 'text-destructive'}`}>
          {energySurplus >= 0 ? '+' : ''}{energySurplus}
        </div>
        <div className="text-center">
          <div className={`text-base font-mono font-bold ${sufficient ? 'text-energy' : 'text-destructive'}`}>
            {(productionFactor * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">facteur</div>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${sufficient ? 'bg-energy' : 'bg-destructive'}`}
              style={{
                width: `${Math.min(100, (energyProduced / Math.max(1, energyConsumed)) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
            {energyProduced}/{energyConsumed}
          </span>
        </div>
      </div>
    </div>
  );
}
