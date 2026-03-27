// apps/web/src/components/reports/MineReportDetail.tsx
import { cn } from '@/lib/utils';

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

interface MineReportDetailProps {
  result: Record<string, any>;
  fleet: Record<string, any>;
  gameConfig: any;
}

export function MineReportDetail({ result, fleet, gameConfig }: MineReportDetailProps) {
  const rewards = result.rewards ?? {};
  const gross = result.grossMined ?? {};
  const slagPct = Math.round((result.slagRate ?? 0) * 100);
  const totalRewards = (rewards.minerai ?? 0) + (rewards.silicium ?? 0) + (rewards.hydrogene ?? 0);
  const totalGross = (gross.minerai ?? 0) + (gross.silicium ?? 0) + (gross.hydrogene ?? 0);
  const totalSlag = totalGross - totalRewards;
  const cargoCapacity = result.cargoCapacity ?? fleet?.totalCargo ?? 0;
  const cargoPct = cargoCapacity > 0 ? Math.round((totalRewards / cargoCapacity) * 100) : 0;
  const hasGross = totalGross > 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pipeline de minage</h3>
        <div className="glass-card p-4 space-y-4">

          {/* Step 1: Extraction brute */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">1</span>
              <span className="text-xs font-semibold text-foreground">Extraction du gisement</span>
              {result.fleetExtraction && (
                <span className="text-[10px] text-muted-foreground">(capacité d'extraction : {result.fleetExtraction.toLocaleString('fr-FR')}/cycle)</span>
              )}
            </div>
            {hasGross ? (
              <div className="ml-7 flex flex-wrap gap-3">
                {(['minerai', 'silicium', 'hydrogene'] as const).map((r) => {
                  const val = gross[r] ?? 0;
                  if (val === 0) return null;
                  return (
                    <span key={r} className="text-sm">
                      <span className={cn('font-bold', RESOURCE_COLORS[r])}>{val.toLocaleString('fr-FR')}</span>
                      <span className="text-muted-foreground ml-1 capitalize">{r}</span>
                    </span>
                  );
                })}
                <span className="text-xs text-muted-foreground">= {totalGross.toLocaleString('fr-FR')} total</span>
              </div>
            ) : (
              <div className="ml-7 flex flex-wrap gap-3">
                {(['minerai', 'silicium', 'hydrogene'] as const).map((r) => {
                  const val = rewards[r] ?? 0;
                  if (val === 0 && slagPct === 0) return null;
                  const approxGross = slagPct > 0 ? Math.round(val / (1 - result.slagRate)) : val;
                  if (approxGross === 0) return null;
                  return (
                    <span key={r} className="text-sm">
                      <span className={cn('font-bold', RESOURCE_COLORS[r])}>~{approxGross.toLocaleString('fr-FR')}</span>
                      <span className="text-muted-foreground ml-1 capitalize">{r}</span>
                    </span>
                  );
                })}
              </div>
            )}
            <p className="ml-7 mt-1 text-[10px] text-muted-foreground/70">
              Ressources brutes prélevées sur l'astéroïde, réparties proportionnellement aux réserves restantes.
            </p>
          </div>

          {/* Step 2: Scories */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">2</span>
              <span className="text-xs font-semibold text-foreground">Pertes en scories</span>
              <span className="text-[10px] text-muted-foreground">({slagPct}% du minerai brut)</span>
            </div>
            <div className="ml-7">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-red-500/60" style={{ width: `${slagPct}%` }} />
                </div>
                <span className="text-xs font-medium text-red-400 tabular-nums w-16 text-right">
                  -{totalSlag > 0 ? totalSlag.toLocaleString('fr-FR') : '~' + Math.round(totalRewards * result.slagRate / (1 - result.slagRate)).toLocaleString('fr-FR')}
                </span>
              </div>
            </div>
            <p className="ml-7 mt-1 text-[10px] text-muted-foreground/70">
              {slagPct > 0
                ? "Une partie des ressources est perdue lors du raffinage. Améliorez Raffinage spatial profond pour réduire ce taux."
                : 'Aucune perte ! Votre technologie de raffinage élimine toutes les scories.'}
            </p>
          </div>

          {/* Step 3: Chargement en soute */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">3</span>
              <span className="text-xs font-semibold text-foreground">Chargement en soute</span>
              <span className="text-[10px] text-muted-foreground">({totalRewards.toLocaleString('fr-FR')} / {cargoCapacity.toLocaleString('fr-FR')})</span>
            </div>
            <div className="ml-7">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.min(100, cargoPct)}%` }} />
                </div>
                <span className={cn('text-xs font-medium tabular-nums w-10 text-right', cargoPct >= 90 ? 'text-emerald-400' : 'text-muted-foreground')}>
                  {cargoPct}%
                </span>
              </div>
            </div>
            <p className="ml-7 mt-1 text-[10px] text-muted-foreground/70">
              {cargoPct >= 95
                ? 'Soute pleine ! Pour transporter plus, ajoutez des vaisseaux cargo ou améliorez la capacité de soute.'
                : cargoPct >= 50
                  ? "Soute partiellement remplie. Le gisement n'avait plus assez de ressources pour remplir toute la soute."
                  : "Soute faiblement remplie. Le gisement manquait de ressources ou la capacité d'extraction était limitée."}
            </p>
          </div>

          {/* Step 4: Résultat final */}
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">4</span>
              <span className="text-xs font-semibold text-foreground">Ressources rapportées</span>
            </div>
            <div className="ml-7 flex flex-wrap gap-4">
              {(['minerai', 'silicium', 'hydrogene'] as const).map((r) => {
                const val = rewards[r] ?? 0;
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
        </div>
      </div>

      {/* Technologies */}
      {result.technologies?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Technologies appliquées</h3>
          <div className="glass-card p-4 space-y-2">
            {result.technologies.map((tech: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">
                  {tech.name === 'deepSpaceRefining' ? 'Raffinage spatial profond' : 'Bonus de minage'}
                  {tech.level != null && <span className="text-primary ml-1">Niv. {tech.level}</span>}
                </span>
                <span className="text-muted-foreground">{tech.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
