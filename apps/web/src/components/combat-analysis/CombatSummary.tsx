import { getUnitName, getDefenseName } from '@/lib/entity-names';
import type { RoundResult } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface SideStats {
  shieldAbsorbed: number;
  armorBlocked: number;
  overkillWasted: number;
  damageDealtByCategory: Record<string, number>;
}

interface CombatSummaryProps {
  outcome: 'attacker' | 'defender' | 'draw';
  perspective?: 'attacker' | 'defender';
  rounds: RoundResult[];
  attackerFleet: Record<string, number>;
  defenderFleet: Record<string, number>;
  defenderDefenses: Record<string, number>;
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
  debris?: { minerai: number; silicium: number };
  pillage?: Record<string, number>;
  repairedDefenses?: Record<string, number>;
  attackerStats?: SideStats;
  defenderStats?: SideStats;
  gameConfig: any;
}

function FleetSummaryColumn({
  label,
  color,
  fleet,
  losses,
  gameConfig,
  isDefense,
}: {
  label: string;
  color: string;
  fleet: Record<string, number>;
  losses: Record<string, number>;
  gameConfig: any;
  isDefense?: boolean;
}) {
  const types = Object.keys(fleet).filter((t) => fleet[t] > 0);
  if (types.length === 0) return null;

  const totalDeployed = types.reduce((s, t) => s + fleet[t], 0);
  const totalLost = types.reduce((s, t) => s + (losses[t] ?? 0), 0);
  const totalSurvived = totalDeployed - totalLost;
  const survivalPct = totalDeployed > 0 ? (totalSurvived / totalDeployed) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${color}`}>{label}</div>
      {/* Overall bar */}
      <div>
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-muted-foreground">{totalSurvived}/{totalDeployed} survivants</span>
          <span className={totalSurvived > 0 ? 'text-emerald-400' : 'text-red-400'}>
            {Math.round(survivalPct)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${survivalPct > 50 ? 'bg-emerald-500/70' : survivalPct > 0 ? 'bg-orange-500/70' : 'bg-red-500/70'}`}
            style={{ width: `${Math.max(survivalPct, 2)}%` }}
          />
        </div>
      </div>
      {/* Per type */}
      <div className="space-y-1.5">
        {types.map((type) => {
          const deployed = fleet[type];
          const lost = losses[type] ?? 0;
          const survived = deployed - lost;
          const pct = deployed > 0 ? (survived / deployed) * 100 : 0;
          const getName = isDefense ? getDefenseName : getUnitName;
          return (
            <div key={type}>
              <div className="flex items-center justify-between text-xs">
                <span className={survived === 0 ? 'text-muted-foreground/40 line-through' : 'text-foreground'}>
                  {getName(type, gameConfig)}
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">{deployed}</span>
                  {lost > 0 && (
                    <>
                      <svg width="10" height="10" viewBox="0 0 16 10" fill="none" className="text-muted-foreground/30">
                        <path d="M0 5h13M10 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-red-400">-{lost}</span>
                    </>
                  )}
                  <svg width="10" height="10" viewBox="0 0 16 10" fill="none" className="text-muted-foreground/30">
                    <path d="M0 5h13M10 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className={survived > 0 ? 'text-emerald-400 font-medium' : 'text-red-400'}>{survived}</span>
                </div>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden mt-0.5">
                <div
                  className={`h-full rounded-full ${pct > 50 ? 'bg-emerald-500/50' : pct > 0 ? 'bg-orange-500/50' : 'bg-red-500/50'}`}
                  style={{ width: `${Math.max(pct, survived > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CombatSummary({
  outcome,
  perspective,
  rounds,
  attackerFleet,
  defenderFleet,
  defenderDefenses,
  attackerLosses,
  defenderLosses,
  debris,
  pillage,
  repairedDefenses,
  attackerStats,
  defenderStats,
  gameConfig,
}: CombatSummaryProps) {
  const isPlayerVictory =
    outcome === 'draw' ? null : perspective === 'defender' ? outcome === 'defender' : outcome === 'attacker';
  const outcomeLabel = isPlayerVictory === null ? 'Match nul' : isPlayerVictory ? 'Victoire' : 'Defaite';
  const outcomeColor = isPlayerVictory === null ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : isPlayerVictory ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5';

  const isDefPerspective = perspective === 'defender';

  // Combine defender fleet + defenses for display, but show defenses separately
  const defShipTypes = Object.keys(defenderFleet).filter((t) => defenderFleet[t] > 0);
  const defDefenseTypes = Object.keys(defenderDefenses).filter((t) => defenderDefenses[t] > 0);

  // Total damage dealt by each side
  const attackerDamageDealt = attackerStats ? Object.values(attackerStats.damageDealtByCategory).reduce((a, b) => a + b, 0) : 0;
  const defenderDamageDealt = defenderStats ? Object.values(defenderStats.damageDealtByCategory).reduce((a, b) => a + b, 0) : 0;
  const totalDamage = attackerDamageDealt + defenderDamageDealt;

  return (
    <div className="space-y-4">
      {/* Outcome banner */}
      <div className={`glass-card border ${outcomeColor} p-4 text-center`}>
        <div className="text-lg font-bold">{outcomeLabel}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {rounds.length} round{rounds.length > 1 ? 's' : ''} de combat
        </div>
      </div>

      {/* Fleet comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <FleetSummaryColumn
            label={isDefPerspective ? 'Attaquant (ennemi)' : 'Attaquant (vous)'}
            color={isDefPerspective ? 'text-rose-400' : 'text-blue-400'}
            fleet={attackerFleet}
            losses={attackerLosses}
            gameConfig={gameConfig}
          />
        </div>
        <div className="glass-card p-4 space-y-4">
          {defShipTypes.length > 0 && (
            <FleetSummaryColumn
              label={isDefPerspective ? 'Defenseur (vous) — Flotte' : 'Defenseur — Flotte'}
              color={isDefPerspective ? 'text-blue-400' : 'text-rose-400'}
              fleet={defenderFleet}
              losses={defenderLosses}
              gameConfig={gameConfig}
            />
          )}
          {defDefenseTypes.length > 0 && (
            <FleetSummaryColumn
              label="Defenses"
              color={isDefPerspective ? 'text-blue-400' : 'text-rose-400'}
              fleet={defenderDefenses}
              losses={defenderLosses}
              gameConfig={gameConfig}
              isDefense
            />
          )}
        </div>
      </div>

      {/* Damage comparison bar */}
      {totalDamage > 0 && (
        <div className="glass-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Degats infliges (coque)
          </div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-blue-400 font-medium">{fmt(attackerDamageDealt)}</span>
            <span className="text-rose-400 font-medium">{fmt(defenderDamageDealt)}</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-blue-500/70 transition-all" style={{ width: `${(attackerDamageDealt / totalDamage) * 100}%` }} />
            <div className="bg-rose-500/70 transition-all" style={{ width: `${(defenderDamageDealt / totalDamage) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Stats grid */}
      {(attackerStats || defenderStats) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Bouclier absorbe</div>
            <div className="text-sm font-bold text-cyan-400">
              {fmt((attackerStats?.shieldAbsorbed ?? 0) + (defenderStats?.shieldAbsorbed ?? 0))}
            </div>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Armure bloquee</div>
            <div className="text-sm font-bold text-amber-400">
              {fmt((attackerStats?.armorBlocked ?? 0) + (defenderStats?.armorBlocked ?? 0))}
            </div>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Overkill gaspille</div>
            <div className="text-sm font-bold text-muted-foreground">
              {fmt((attackerStats?.overkillWasted ?? 0) + (defenderStats?.overkillWasted ?? 0))}
            </div>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rounds</div>
            <div className="text-sm font-bold text-foreground">{rounds.length}</div>
          </div>
        </div>
      )}

      {/* Loot + Debris */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pillage && Object.values(pillage).some((v) => v > 0) && (
          <div className="glass-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-2">Butin</div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(pillage).map(([res, amount]) =>
                amount > 0 ? (
                  <div key={res} className="flex items-center gap-1.5">
                    <span className={`text-sm font-bold ${res === 'minerai' ? 'text-orange-400' : res === 'silicium' ? 'text-emerald-400' : 'text-blue-400'}`}>
                      +{fmt(amount)}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">{res}</span>
                  </div>
                ) : null,
              )}
            </div>
          </div>
        )}
        {debris && (debris.minerai > 0 || debris.silicium > 0) && (
          <div className="glass-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Debris</div>
            <div className="flex flex-wrap gap-3">
              {debris.minerai > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-orange-400">{fmt(debris.minerai)}</span>
                  <span className="text-xs text-muted-foreground">Minerai</span>
                </div>
              )}
              {debris.silicium > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-emerald-400">{fmt(debris.silicium)}</span>
                  <span className="text-xs text-muted-foreground">Silicium</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Repaired defenses */}
      {repairedDefenses && Object.keys(repairedDefenses).length > 0 && (
        <div className="glass-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">Defenses reparees</div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(repairedDefenses).map(([def, count]) => (
              <span key={def} className="text-sm">
                <span className="text-emerald-400 font-medium">+{fmt(count as number)}</span>{' '}
                <span className="text-muted-foreground">{getDefenseName(def, gameConfig)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
