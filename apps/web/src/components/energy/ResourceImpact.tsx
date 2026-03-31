interface ResourceRow {
  name: string;
  colorClass: string;
  current: number;
  perHour: number;
  capacity: number;
}

interface ResourceImpactProps {
  resources: ResourceRow[];
}

export function ResourceImpact({ resources }: ResourceImpactProps) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
        Impact sur les ressources
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {resources.map((r) => {
          const fillPercent = r.capacity > 0 ? Math.min(100, (r.current / r.capacity) * 100) : 0;
          return (
            <div key={r.name} className="glass-card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${r.colorClass}`}>{r.name}</span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  +{r.perHour.toLocaleString('fr-FR')}/h
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-1 rounded-full transition-[width] duration-1000 ease-linear ${
                    fillPercent > 90 ? 'bg-destructive' : fillPercent > 70 ? 'bg-energy' : 'bg-primary'
                  }`}
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">
                  {r.current.toLocaleString('fr-FR')}
                </span>
                <span>/ {r.capacity.toLocaleString('fr-FR')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
