// apps/web/src/components/reports/CombatReportDetail.tsx
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getUnitName, getDefenseName } from '@/lib/entity-names';
import { RoundDisplay } from '@/components/combat-guide/RoundDisplay';
import type { CombatResult } from '@ogame-clone/game-engine';

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface CombatReportDetailProps {
  result: Record<string, any>;
  missionType: 'attack' | 'pirate';
  gameConfig: any;
}

export function CombatReportDetail({ result, missionType, gameConfig }: CombatReportDetailProps) {
  const [replayOpen, setReplayOpen] = useState(false);

  const outcome = result.outcome as string;
  const outcomeLabel = outcome === 'attacker' ? 'Victoire' : outcome === 'defender' ? 'Défaite' : 'Match nul';
  const outcomeColor = outcome === 'attacker' ? 'text-emerald-400' : outcome === 'defender' ? 'text-red-400' : 'text-amber-400';
  const outcomeBg = outcome === 'attacker' ? 'bg-emerald-500/20' : outcome === 'defender' ? 'bg-red-500/20' : 'bg-amber-500/20';

  const attackerFP = result.attackerFP as number | undefined;
  const defenderFP = result.defenderFP as number | undefined;
  const totalFP = (attackerFP ?? 0) + (defenderFP ?? 0);
  const attackerFPPct = totalFP > 0 ? ((attackerFP ?? 0) / totalFP) * 100 : 50;

  const roundCount = result.roundCount as number ?? 0;
  const shotsPerRound = result.shotsPerRound as { attacker: number; defender: number }[] | undefined;
  const totalShots = shotsPerRound?.reduce((sum, r) => sum + r.attacker + r.defender, 0) ?? 0;

  const attStats = result.attackerStats as { shieldAbsorbed: number; armorBlocked: number; overkillWasted: number; damageDealtByCategory: Record<string, number> } | undefined;
  const defStats = result.defenderStats as typeof attStats | undefined;
  const totalShield = (attStats?.shieldAbsorbed ?? 0) + (defStats?.shieldAbsorbed ?? 0);
  const totalArmor = (attStats?.armorBlocked ?? 0) + (defStats?.armorBlocked ?? 0);

  const hasAttackerLosses = result.attackerLosses && Object.keys(result.attackerLosses).length > 0;
  const hasDefenderLosses = result.defenderLosses && Object.keys(result.defenderLosses).length > 0;

  // Build CombatResult-like object for RoundDisplay
  const combatResultForReplay: CombatResult | null = result.rounds ? {
    rounds: result.rounds,
    outcome: result.outcome,
    attackerLosses: result.attackerLosses ?? {},
    defenderLosses: result.defenderLosses ?? {},
    debris: result.debris ?? { minerai: 0, silicium: 0 },
    repairedDefenses: result.repairedDefenses ?? {},
    attackerStats: result.attackerStats ?? { shieldAbsorbed: 0, armorBlocked: 0, overkillWasted: 0, damageDealtByCategory: {}, damageReceivedByCategory: {} },
    defenderStats: result.defenderStats ?? { shieldAbsorbed: 0, armorBlocked: 0, overkillWasted: 0, damageDealtByCategory: {}, damageReceivedByCategory: {} },
  } : null;

  return (
    <div className="space-y-4">
      {/* FP Comparison Bar */}
      {attackerFP != null && defenderFP != null && (
        <div className="glass-card p-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-blue-400 font-semibold">Votre flotte : {fmt(attackerFP)} FP</span>
            <span className="text-rose-400 font-semibold">{missionType === 'pirate' ? 'Pirates' : 'Défenseur'} : {fmt(defenderFP)} FP</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-blue-500 transition-all" style={{ width: `${attackerFPPct}%` }} />
            <div className="bg-rose-500 transition-all" style={{ width: `${100 - attackerFPPct}%` }} />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-3 text-center">
          <div className="text-xs text-muted-foreground">Rounds</div>
          <div className="text-xl font-bold text-foreground">{roundCount}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-xs text-muted-foreground">Tirs</div>
          <div className="text-xl font-bold text-foreground">{fmt(totalShots)}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-xs text-muted-foreground">Bouclier absorbé</div>
          <div className="text-xl font-bold text-cyan-400">{fmt(totalShield)}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-xs text-muted-foreground">Armure bloquée</div>
          <div className="text-xl font-bold text-amber-400">{fmt(totalArmor)}</div>
        </div>
      </div>

      {/* Losses */}
      {(hasAttackerLosses || hasDefenderLosses) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Vos pertes</h4>
            {hasAttackerLosses ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.attackerLosses as Record<string, number>).map(([unit, count]) => (
                  <span key={unit} className="text-sm">
                    <span className="text-red-400 font-medium">-{fmt(count)}</span>{' '}
                    <span className="text-muted-foreground">{getUnitName(unit, gameConfig)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Aucune</div>
            )}
          </div>
          <div className="glass-card p-4">
            <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Pertes ennemies</h4>
            {hasDefenderLosses ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.defenderLosses as Record<string, number>).map(([unit, count]) => (
                  <span key={unit} className="text-sm">
                    <span className="text-red-400 font-medium">-{fmt(count)}</span>{' '}
                    <span className="text-muted-foreground">{getUnitName(unit, gameConfig)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Aucune</div>
            )}
          </div>
        </div>
      )}

      {/* Loot + Debris */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {result.pillage && (
          <div className="glass-card p-4">
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Butin</h4>
            <div className="flex flex-wrap gap-3">
              {Object.entries(result.pillage as Record<string, number>).map(([resource, amount]) => (
                amount > 0 && (
                  <div key={resource} className="flex items-center gap-1.5">
                    <span className={cn('text-sm font-bold', RESOURCE_COLORS[resource])}>+{fmt(amount)}</span>
                    <span className="text-xs text-muted-foreground capitalize">{resource}</span>
                  </div>
                )
              ))}
            </div>
          </div>
        )}
        {result.debris && (result.debris.minerai > 0 || result.debris.silicium > 0) && (
          <div className="glass-card p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Débris</h4>
            <div className="flex flex-wrap gap-3">
              {result.debris.minerai > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-sm font-bold', RESOURCE_COLORS.minerai)}>{fmt(result.debris.minerai)}</span>
                  <span className="text-xs text-muted-foreground">Minerai</span>
                </div>
              )}
              {result.debris.silicium > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-sm font-bold', RESOURCE_COLORS.silicium)}>{fmt(result.debris.silicium)}</span>
                  <span className="text-xs text-muted-foreground">Silicium</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bonus ships (pirate only) */}
      {result.bonusShips && Object.keys(result.bonusShips).length > 0 && (
        <div className="glass-card border-emerald-500/20 bg-emerald-500/5 p-4">
          <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20" /></svg>
            Vaisseaux capturés
          </h4>
          <div className="flex flex-wrap gap-3">
            {Object.entries(result.bonusShips as Record<string, number>).map(([ship, count]) => (
              <span key={ship} className="text-sm">
                <span className="text-emerald-400 font-medium">+{count}</span>{' '}
                <span className="text-foreground">{getUnitName(ship, gameConfig)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Repaired defenses */}
      {result.repairedDefenses && Object.keys(result.repairedDefenses).length > 0 && (
        <div className="glass-card p-4">
          <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Défenses réparées</h4>
          <div className="flex flex-wrap gap-3">
            {Object.entries(result.repairedDefenses as Record<string, number>).map(([def, count]) => (
              <span key={def} className="text-sm">
                <span className="text-emerald-400 font-medium">+{fmt(count as number)}</span>{' '}
                <span className="text-muted-foreground">{getDefenseName(def, gameConfig)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Combat stats detail (attacker/defender) */}
      {(attStats || defStats) && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Statistiques détaillées</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {attStats && (
              <div className="glass-card p-4">
                <div className="text-xs font-medium text-blue-400 mb-2">Attaquant</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bouclier absorbé</span><span className="text-cyan-400 font-medium">{fmt(attStats.shieldAbsorbed)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Armure bloquée</span><span className="text-amber-400 font-medium">{fmt(attStats.armorBlocked)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Dégâts gaspillés</span><span className="text-red-400/60 font-medium">{fmt(attStats.overkillWasted)}</span></div>
                  {attStats.damageDealtByCategory && Object.keys(attStats.damageDealtByCategory).length > 0 && (
                    <div className="pt-1 border-t border-border/30">
                      <div className="text-xs text-muted-foreground mb-1">Dégâts par catégorie</div>
                      {Object.entries(attStats.damageDealtByCategory).map(([cat, dmg]) => (
                        <div key={cat} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{cat}</span>
                          <span className="text-foreground">{fmt(dmg)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {defStats && (
              <div className="glass-card p-4">
                <div className="text-xs font-medium text-rose-400 mb-2">Défenseur</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bouclier absorbé</span><span className="text-cyan-400 font-medium">{fmt(defStats.shieldAbsorbed)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Armure bloquée</span><span className="text-amber-400 font-medium">{fmt(defStats.armorBlocked)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Dégâts gaspillés</span><span className="text-red-400/60 font-medium">{fmt(defStats.overkillWasted)}</span></div>
                  {defStats.damageDealtByCategory && Object.keys(defStats.damageDealtByCategory).length > 0 && (
                    <div className="pt-1 border-t border-border/30">
                      <div className="text-xs text-muted-foreground mb-1">Dégâts par catégorie</div>
                      {Object.entries(defStats.damageDealtByCategory).map(([cat, dmg]) => (
                        <div key={cat} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{cat}</span>
                          <span className="text-foreground">{fmt(dmg)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Replay section (collapsible) */}
      {combatResultForReplay && combatResultForReplay.rounds.length > 0 && (
        <div className="glass-card border-blue-500/20 overflow-hidden">
          <button
            type="button"
            className="w-full p-4 flex items-center justify-center gap-2 text-sm font-medium text-blue-400 hover:bg-blue-500/5 transition-colors"
            onClick={() => setReplayOpen(!replayOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={replayOpen ? 'rotate-90 transition-transform' : 'transition-transform'}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {replayOpen ? 'Masquer le replay' : `Voir le replay du combat (${roundCount} rounds)`}
          </button>
          {replayOpen && (
            <div className="p-4 pt-0 border-t border-border/30">
              <RoundDisplay
                key={`replay-${result.outcome}`}
                result={combatResultForReplay}
                initialAttacker={result.attackerFleet ?? {}}
                initialDefender={{ ...(result.defenderFleet ?? {}), ...(result.defenderDefenses ?? {}) }}
                autoPlayDelay={0}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
