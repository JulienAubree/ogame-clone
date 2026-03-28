import { cn } from '@/lib/utils';

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
};

interface RecycleReportDetailProps {
  result: Record<string, any>;
}

export function RecycleReportDetail({ result }: RecycleReportDetailProps) {
  const collected = result.collected ?? {};
  const available = result.debrisAvailable ?? {};
  const remaining = result.debrisRemaining;
  const totalCollected = (collected.minerai ?? 0) + (collected.silicium ?? 0);
  const totalAvailable = (available.minerai ?? 0) + (available.silicium ?? 0);
  const cargoCapacity = result.cargoCapacity ?? 0;
  const cargoPct = cargoCapacity > 0 ? Math.round((totalCollected / cargoCapacity) * 100) : 0;
  const collectionPct = totalAvailable > 0 ? Math.round((totalCollected / totalAvailable) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Debris available */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Champ de débris</h3>
        <div className="flex flex-wrap gap-4">
          {(['minerai', 'silicium'] as const).map((r) => {
            const val = available[r] ?? 0;
            if (val === 0) return null;
            return (
              <div key={r} className="flex items-center gap-2">
                <span className={cn('text-sm font-medium', RESOURCE_COLORS[r])}>
                  {val.toLocaleString('fr-FR')}
                </span>
                <span className="text-xs text-muted-foreground capitalize">{r}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collection summary */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recyclage</h3>

        {/* Cargo usage */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">
              Capacité cargo : {totalCollected.toLocaleString('fr-FR')} / {cargoCapacity.toLocaleString('fr-FR')}
            </span>
            <span className={cn('text-xs font-medium tabular-nums', cargoPct >= 90 ? 'text-emerald-400' : 'text-muted-foreground')}>
              {cargoPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${Math.min(100, cargoPct)}%` }} />
          </div>
        </div>

        {/* Collection rate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">
              Débris collectés : {collectionPct}%
            </span>
            <span className="text-xs text-muted-foreground">
              {result.recyclerCount} recycleur{result.recyclerCount > 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.min(100, collectionPct)}%` }} />
          </div>
        </div>

        {/* Collected resources */}
        <div className="border-t border-border pt-3">
          <div className="text-xs font-semibold text-foreground mb-2">Ressources collectées</div>
          <div className="flex flex-wrap gap-4">
            {(['minerai', 'silicium'] as const).map((r) => {
              const val = collected[r] ?? 0;
              if (val === 0) return null;
              return (
                <div key={r} className="flex items-center gap-2">
                  <span className={cn('text-lg font-bold', RESOURCE_COLORS[r])}>
                    +{val.toLocaleString('fr-FR')}
                  </span>
                  <span className="text-sm text-muted-foreground capitalize">{r}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Remaining debris */}
        {remaining && (
          <div className="border-t border-border pt-3">
            <div className="text-xs text-amber-400 mb-1">Débris restants</div>
            <div className="flex flex-wrap gap-3">
              {(['minerai', 'silicium'] as const).map((r) => {
                const val = remaining[r] ?? 0;
                if (val === 0) return null;
                return (
                  <span key={r} className="text-sm">
                    <span className={cn('font-medium', RESOURCE_COLORS[r])}>{val.toLocaleString('fr-FR')}</span>
                    <span className="text-muted-foreground ml-1 capitalize">{r}</span>
                  </span>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Envoyez plus de recycleurs pour collecter les débris restants.
            </p>
          </div>
        )}

        {!remaining && (
          <p className="text-xs text-emerald-400">Champ de débris entièrement recyclé !</p>
        )}
      </div>
    </div>
  );
}
