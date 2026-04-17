// apps/web/src/components/reports/CombatReportDetail.tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { getUnitName, getDefenseName } from '@/lib/entity-names';
import { RoundDisplay } from '@/components/combat-guide/RoundDisplay';
import type { CombatResult } from '@exilium/game-engine';

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
  coordinates?: { galaxy: number; system: number; position: number };
  reportId?: string;
}

export function CombatReportDetail({ result, missionType, gameConfig, coordinates, reportId }: CombatReportDetailProps) {
  const [replayOpen, setReplayOpen] = useState(false);

  const outcome = result.outcome as string;
  const perspective = result.perspective as 'attacker' | 'defender' | undefined;
  const attackerUsername = result.attackerUsername as string | undefined;
  const defenderUsername = result.defenderUsername as string | undefined;

  const isPlayerVictory = outcome === 'draw'
    ? null
    : perspective === 'defender'
      ? outcome === 'defender'
      : outcome === 'attacker'; // attacker perspective or undefined (backward compat)
  const outcomeLabel = isPlayerVictory === null ? 'Match nul' : isPlayerVictory ? 'Victoire' : 'Défaite';
  const outcomeColor = isPlayerVictory === null ? 'text-amber-400' : isPlayerVictory ? 'text-emerald-400' : 'text-red-400';
  const outcomeBg = isPlayerVictory === null ? 'bg-amber-500/20' : isPlayerVictory ? 'bg-emerald-500/20' : 'bg-red-500/20';

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

  const isDefender = perspective === 'defender';
  const myLosses = isDefender ? result.defenderLosses : result.attackerLosses;
  const enemyLosses = isDefender ? result.attackerLosses : result.defenderLosses;
  const hasMyLosses = myLosses && Object.keys(myLosses).length > 0;
  const hasEnemyLosses = enemyLosses && Object.keys(enemyLosses).length > 0;

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
      {/* Perspective banner */}
      {perspective === 'attacker' && defenderUsername && (
        <div className="glass-card border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
          Vous avez attaqué la planète de <span className="font-bold text-blue-200">{defenderUsername}</span>
        </div>
      )}
      {perspective === 'defender' && attackerUsername && (
        <div className="glass-card border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          Vous avez été attaqué par <span className="font-bold text-rose-200">{attackerUsername}</span>
        </div>
      )}

      {/* FP Comparison Bar */}
      {attackerFP != null && defenderFP != null && (() => {
        const myFP = isDefender ? defenderFP : attackerFP;
        const enemyFP = isDefender ? attackerFP : defenderFP;
        const myLabel = isDefender
          ? `Défenseur${defenderUsername ? ` (${defenderUsername})` : ''}`
          : `Attaquant${attackerUsername ? ` (${attackerUsername})` : ''}`;
        const enemyLabel = isDefender
          ? `Attaquant${attackerUsername ? ` (${attackerUsername})` : ''}`
          : missionType === 'pirate' ? 'Pirates' : `Défenseur${defenderUsername ? ` (${defenderUsername})` : ''}`;
        const myPct = totalFP > 0 ? (myFP / totalFP) * 100 : 50;
        return (
          <div className="glass-card p-4">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-blue-400 font-semibold">{myLabel} : {fmt(myFP)} FP</span>
              <span className="text-rose-400 font-semibold">{enemyLabel} : {fmt(enemyFP)} FP</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden">
              <div className="bg-blue-500 transition-all" style={{ width: `${myPct}%` }} />
              <div className="bg-rose-500 transition-all" style={{ width: `${100 - myPct}%` }} />
            </div>
          </div>
        );
      })()}

      {/* Forces en présence */}
      {(() => {
        const attackerFleet = result.attackerFleet as Record<string, number> | undefined;
        const defenderFleet = result.defenderFleet as Record<string, number> | undefined;
        const defenderDefs = result.defenderDefenses as Record<string, number> | undefined;
        const ps = result.planetaryShield as { level: number; capacity: number } | undefined;
        if (!attackerFleet && !defenderFleet) return null;

        const myFleet = isDefender ? defenderFleet : attackerFleet;
        const enemyFleet = isDefender ? attackerFleet : defenderFleet;
        const myLabel = isDefender ? 'Vos forces' : 'Votre flotte';
        const enemyLabel = isDefender
          ? (missionType === 'pirate' ? 'Pirates' : 'Flotte attaquante')
          : 'Forces du défenseur';

        const renderForces = (fleet: Record<string, number> | undefined, defs?: Record<string, number> | undefined, shield?: { level: number; capacity: number } | undefined) => {
          const entries = Object.entries(fleet ?? {}).filter(([, n]) => n > 0);
          const defEntries = Object.entries(defs ?? {}).filter(([, n]) => n > 0);
          return (
            <div className="space-y-1">
              {entries.map(([id, count]) => (
                <div key={id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{getUnitName(id, gameConfig)}</span>
                  <span className="text-foreground font-mono">{fmt(count)}</span>
                </div>
              ))}
              {defEntries.length > 0 && (
                <>
                  <div className="border-t border-border/20 mt-1 pt-1" />
                  {defEntries.map(([id, count]) => (
                    <div key={id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{getDefenseName(id, gameConfig)}</span>
                      <span className="text-foreground font-mono">{fmt(count)}</span>
                    </div>
                  ))}
                </>
              )}
              {shield && shield.capacity > 0 && (
                <>
                  <div className="border-t border-cyan-500/20 mt-1 pt-1" />
                  <div className="flex justify-between text-xs">
                    <span className="text-cyan-400">Bouclier planétaire niv. {shield.level}</span>
                    <span className="text-cyan-400 font-mono">{fmt(shield.capacity)} pts</span>
                  </div>
                </>
              )}
              {entries.length === 0 && defEntries.length === 0 && !shield && (
                <div className="text-xs text-muted-foreground/60">Aucune</div>
              )}
            </div>
          );
        };

        return (
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">{myLabel}</h4>
              {isDefender
                ? renderForces(myFleet, defenderDefs, ps)
                : renderForces(myFleet)}
            </div>
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">{enemyLabel}</h4>
              {isDefender
                ? renderForces(enemyFleet)
                : renderForces(enemyFleet, defenderDefs, ps)}
            </div>
          </div>
        );
      })()}

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
      {(hasMyLosses || hasEnemyLosses) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Vos pertes</h4>
            {hasMyLosses ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(myLosses as Record<string, number>).map(([unit, count]) => (
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
            {hasEnemyLosses ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(enemyLosses as Record<string, number>).map(([unit, count]) => (
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
            {result.protectedResources && (
              result.protectedResources.minerai > 0 ||
              result.protectedResources.silicium > 0 ||
              result.protectedResources.hydrogene > 0
            ) && (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-green-500 mb-1.5 flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Ressources protégées
                </h4>
                <div className="flex gap-3">
                  {result.protectedResources.minerai > 0 && (
                    <span className={cn('text-xs', RESOURCE_COLORS.minerai)}>{fmt(result.protectedResources.minerai)} minerai</span>
                  )}
                  {result.protectedResources.silicium > 0 && (
                    <span className={cn('text-xs', RESOURCE_COLORS.silicium)}>{fmt(result.protectedResources.silicium)} silicium</span>
                  )}
                  {result.protectedResources.hydrogene > 0 && (
                    <span className={cn('text-xs', RESOURCE_COLORS.hydrogene)}>{fmt(result.protectedResources.hydrogene)} hydrogène</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {result.debris && (result.debris.minerai > 0 || result.debris.silicium > 0) && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Débris</h4>
              {coordinates && (
                <Link
                  to={`/fleet/send?mission=recycle&galaxy=${coordinates.galaxy}&system=${coordinates.system}&position=${coordinates.position}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-400 transition-colors hover:bg-cyan-500/30"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Envoyer des recycleurs
                </Link>
              )}
            </div>
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

      {/* Combat stats detail */}
      {(attStats || defStats) && (() => {
        const myStats = isDefender ? defStats : attStats;
        const enemyStats = isDefender ? attStats : defStats;
        const myLabel = isDefender ? `Défenseur${defenderUsername ? ` (${defenderUsername})` : ''}` : `Attaquant${attackerUsername ? ` (${attackerUsername})` : ''}`;
        const enemyLabel = isDefender ? `Attaquant${attackerUsername ? ` (${attackerUsername})` : ''}` : `Défenseur${defenderUsername ? ` (${defenderUsername})` : ''}`;
        return (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Statistiques détaillées</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myStats && (
                <div className="glass-card p-4">
                  <div className="text-xs font-medium text-blue-400 mb-2">{myLabel}</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Bouclier absorbé</span><span className="text-cyan-400 font-medium">{fmt(myStats.shieldAbsorbed)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Armure bloquée</span><span className="text-amber-400 font-medium">{fmt(myStats.armorBlocked)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Dégâts gaspillés</span><span className="text-red-400/60 font-medium">{fmt(myStats.overkillWasted)}</span></div>
                    {myStats.damageDealtByCategory && Object.keys(myStats.damageDealtByCategory).length > 0 && (
                      <div className="pt-1 border-t border-border/30">
                        <div className="text-xs text-muted-foreground mb-1">Dégâts par catégorie</div>
                        {Object.entries(myStats.damageDealtByCategory).map(([cat, dmg]) => (
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
              {enemyStats && (
                <div className="glass-card p-4">
                  <div className="text-xs font-medium text-rose-400 mb-2">{enemyLabel}</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Bouclier absorbé</span><span className="text-cyan-400 font-medium">{fmt(enemyStats.shieldAbsorbed)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Armure bloquée</span><span className="text-amber-400 font-medium">{fmt(enemyStats.armorBlocked)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Dégâts gaspillés</span><span className="text-red-400/60 font-medium">{fmt(enemyStats.overkillWasted)}</span></div>
                    {enemyStats.damageDealtByCategory && Object.keys(enemyStats.damageDealtByCategory).length > 0 && (
                      <div className="pt-1 border-t border-border/30">
                        <div className="text-xs text-muted-foreground mb-1">Dégâts par catégorie</div>
                        {Object.entries(enemyStats.damageDealtByCategory).map(([cat, dmg]) => (
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
        );
      })()}

      {/* Analyse button (attack only) */}
      {missionType === 'attack' && reportId && (
        <div className="flex justify-center">
          <Link
            to={`/reports/${reportId}/analysis`}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-500/20 px-4 py-2.5 text-sm font-semibold text-blue-400 transition-colors hover:bg-blue-500/30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21H4.6c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C3 20.24 3 19.96 3 19.4V3" />
              <path d="m7 14 4-4 4 4 6-6" />
            </svg>
            Analyser le combat
          </Link>
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
                perspective={perspective}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
