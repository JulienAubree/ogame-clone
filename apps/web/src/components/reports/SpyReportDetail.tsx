// apps/web/src/components/reports/SpyReportDetail.tsx
import { cn } from '@/lib/utils';
import { getShipName, getDefenseName, getBuildingName, getResearchName } from '@/lib/entity-names';

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

interface SpyReportDetailProps {
  result: Record<string, any>;
  gameConfig: any;
}

export function SpyReportDetail({ result, gameConfig }: SpyReportDetailProps) {
  const visibility = result.visibility ?? {};
  const visibilityKeys = ['resources', 'fleet', 'defenses', 'buildings', 'research'] as const;
  const probeCount: number = result.probeCount ?? 0;
  const attackerTech: number = result.attackerTech ?? 0;
  const defenderTech: number = result.defenderTech ?? 0;
  const detectionChance: number = result.detectionChance ?? 0;
  const techDiff = defenderTech - attackerTech;
  const effectiveInfo = probeCount - techDiff;
  const thresholds = [1, 3, 5, 7, 9];
  const thresholdLabels = ['Ressources', 'Flotte', 'Défenses', 'Bâtiments', 'Recherches'];

  return (
    <div className="space-y-4">
      {/* Visibility & Detection */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Informations obtenues</h3>
        <div className="glass-card p-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {visibilityKeys.map((key) => (
              <span
                key={key}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  visibility[key]
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-white/5 text-muted-foreground',
                )}
              >
                {visibility[key] ? '\u2713' : '\u2717'} {gameConfig?.labels[`spy_visibility.${key}`] ?? key}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Sondes : <span className="text-foreground font-medium">{probeCount}</span></span>
            <span>Tech espionnage : <span className="text-foreground font-medium">{attackerTech}</span> vs <span className="text-foreground font-medium">{defenderTech}</span></span>
            <span>Chance de détection : <span className={cn('font-medium', detectionChance > 50 ? 'text-red-400' : 'text-foreground')}>{detectionChance}%</span></span>
            {result.detected && <span className="text-red-400 font-medium">Sondes détruites</span>}
          </div>
        </div>
      </div>

      {/* Pipeline explanation */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Comment ce rapport a été calculé</h3>
        <div className="space-y-3">
          {/* Step 1: Effective info */}
          <div className="glass-card p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">1</div>
              <div className="flex-1 space-y-1.5">
                <div className="text-xs font-medium text-foreground">Calcul de l'info effective</div>
                <div className="text-[11px] text-muted-foreground">
                  <span className="text-violet-400 font-mono">{probeCount}</span> sondes
                  {techDiff !== 0 && (
                    <> − (<span className="text-red-400 font-mono">{defenderTech}</span> tech ennemi − <span className="text-emerald-400 font-mono">{attackerTech}</span> votre tech) </>
                  )}
                  {techDiff === 0 && <> (tech égale : pas de malus) </>}
                  = <span className="text-foreground font-bold font-mono">{effectiveInfo}</span> info effective
                </div>
                {techDiff > 0 && (
                  <div className="text-[10px] text-amber-400/80">
                    L'ennemi a {techDiff} niveau{techDiff > 1 ? 'x' : ''} d'avance en espionnage, ce qui réduit vos informations de {techDiff} point{techDiff > 1 ? 's' : ''}.
                  </div>
                )}
                {techDiff < 0 && (
                  <div className="text-[10px] text-emerald-400/80">
                    Vous avez {-techDiff} niveau{-techDiff > 1 ? 'x' : ''} d'avance en espionnage, ce qui augmente vos informations de {-techDiff} point{-techDiff > 1 ? 's' : ''}.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 2: Visibility thresholds */}
          <div className="glass-card p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">2</div>
              <div className="flex-1 space-y-1.5">
                <div className="text-xs font-medium text-foreground">Seuils de visibilité</div>
                <div className="text-[11px] text-muted-foreground mb-1">
                  Votre score de <span className="text-foreground font-bold">{effectiveInfo}</span> débloque les catégories dont le seuil est inférieur ou égal.
                </div>
                <div className="space-y-0.5">
                  {thresholds.map((t, i) => {
                    const unlocked = effectiveInfo >= t;
                    return (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <div className={cn('w-14 text-right font-mono', unlocked ? 'text-emerald-400' : 'text-muted-foreground/50')}>
                          ≥ {t}
                        </div>
                        <div className={cn('h-1.5 flex-1 rounded-full', unlocked ? 'bg-emerald-500/30' : 'bg-white/5')}>
                          <div
                            className={cn('h-full rounded-full', unlocked ? 'bg-emerald-500' : 'bg-transparent')}
                            style={{ width: unlocked ? '100%' : '0%' }}
                          />
                        </div>
                        <span className={cn('w-24 text-[10px]', unlocked ? 'text-emerald-400' : 'text-muted-foreground/50')}>
                          {unlocked ? '\u2713' : '\u2717'} {thresholdLabels[i]}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {effectiveInfo < 9 && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    Pour tout voir : envoyez {9 + techDiff} sonde{9 + techDiff > 1 ? 's' : ''}{techDiff > 0 ? ` (ou montez votre tech espionnage pour réduire l'écart)` : ''}.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 3: Detection */}
          <div className="glass-card p-4">
            <div className="flex items-start gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-400">3</div>
              <div className="flex-1 space-y-1.5">
                <div className="text-xs font-medium text-foreground">Risque de détection</div>
                <div className="text-[11px] text-muted-foreground">
                  <span className="text-violet-400 font-mono">{probeCount}</span> × 2
                  {attackerTech !== defenderTech && (
                    <> − (<span className="text-emerald-400 font-mono">{attackerTech}</span> − <span className="text-red-400 font-mono">{defenderTech}</span>) × 4</>
                  )}
                  {' '}= <span className={cn('font-bold font-mono', detectionChance >= 50 ? 'text-red-400' : detectionChance > 0 ? 'text-amber-400' : 'text-emerald-400')}>{detectionChance}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', detectionChance >= 50 ? 'bg-red-500' : detectionChance > 0 ? 'bg-amber-500' : 'bg-emerald-500')}
                      style={{ width: `${Math.min(100, detectionChance)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-8 text-right">{detectionChance}%</span>
                </div>
                {result.detected ? (
                  <div className="text-[10px] text-red-400">Vos sondes ont été détectées et détruites par l'ennemi.</div>
                ) : detectionChance > 0 ? (
                  <div className="text-[10px] text-emerald-400/80">Vos sondes n'ont pas été détectées cette fois-ci.</div>
                ) : (
                  <div className="text-[10px] text-emerald-400/80">Aucun risque de détection grâce à votre avance technologique.</div>
                )}
                <div className="text-[10px] text-slate-500">
                  Chaque niveau d'avance en tech espionnage réduit la détection de 4%. Chaque sonde supplémentaire augmente le risque de 2%.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spy data sections */}
      {result.resources && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ressources</h3>
          <div className="glass-card p-4">
            <div className="flex flex-wrap gap-4">
              {Object.entries(result.resources as Record<string, number>).map(([resource, amount]) => (
                <div key={resource} className="flex items-center gap-2">
                  <span className={cn('text-lg font-bold', RESOURCE_COLORS[resource])}>{amount.toLocaleString('fr-FR')}</span>
                  <span className="text-sm text-muted-foreground capitalize">{resource}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {result.fleet && Object.keys(result.fleet).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte ennemie</h3>
          <div className="glass-card p-4">
            <div className="flex flex-wrap gap-3">
              {Object.entries(result.fleet as Record<string, number>).map(([ship, count]) => (
                <span key={ship} className="text-sm">
                  <span className="text-foreground font-medium">{count.toLocaleString('fr-FR')}x</span>{' '}
                  <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {result.defenses && Object.keys(result.defenses).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Défenses</h3>
          <div className="glass-card p-4">
            <div className="flex flex-wrap gap-3">
              {Object.entries(result.defenses as Record<string, number>).map(([def, count]) => (
                <span key={def} className="text-sm">
                  <span className="text-foreground font-medium">{count.toLocaleString('fr-FR')}x</span>{' '}
                  <span className="text-muted-foreground">{getDefenseName(def, gameConfig)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {result.buildings && Object.keys(result.buildings).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bâtiments</h3>
          <div className="glass-card p-4 space-y-1">
            {Object.entries(result.buildings as Record<string, number>).map(([building, level]) => (
              <div key={building} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{getBuildingName(building, gameConfig)}</span>
                <span className="text-foreground font-medium">Niv. {level}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.research && Object.keys(result.research).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recherches</h3>
          <div className="glass-card p-4 space-y-1">
            {Object.entries(result.research as Record<string, number>).map(([tech, level]) => (
              <div key={tech} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{getResearchName(tech, gameConfig)}</span>
                <span className="text-foreground font-medium">Niv. {level}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
