import { useMemo } from 'react';
import { ArrowRight, XCircle } from 'lucide-react';
import { getUnitName } from '@/lib/entity-names';
import type { CombatEvent, UnitSnapshot } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface ShotLogProps {
  events: CombatEvent[];
  initialUnits: UnitSnapshot[];
  unitType: string;
  side: 'attacker' | 'defender';
  round: number;
  gameConfig: any;
}

function buildNumberMap(initialUnits: UnitSnapshot[]): Map<string, number> {
  const map = new Map<string, number>();
  const counters: Record<string, number> = {};
  for (const u of initialUnits) {
    const key = `${u.side}:${u.unitType}`;
    counters[key] = (counters[key] ?? 0) + 1;
    map.set(u.unitId, counters[key]);
  }
  return map;
}

function label(
  unitId: string,
  unitType: string,
  gameConfig: any,
  numberMap: Map<string, number>,
): string {
  return `${getUnitName(unitType, gameConfig)} #${numberMap.get(unitId) ?? 0}`;
}

export function ShotLog({ events, initialUnits, unitType, side, round, gameConfig }: ShotLogProps) {
  const numberMap = useMemo(() => buildNumberMap(initialUnits), [initialUnits]);

  // Filter events for this round involving units of the selected type on the selected side
  const roundEvents = events.filter((e) => e.round === round);

  // Units of this type on this side
  const unitIds = new Set(
    initialUnits
      .filter((u) => u.unitType === unitType && u.side === side)
      .map((u) => u.unitId),
  );

  // Group shots by shooter (for units of this type)
  const shotsByShooter: { shooterId: string; shots: CombatEvent[] }[] = [];
  const shooterMap = new Map<string, CombatEvent[]>();
  for (const e of roundEvents) {
    if (!unitIds.has(e.shooterId)) continue;
    if (!shooterMap.has(e.shooterId)) shooterMap.set(e.shooterId, []);
    shooterMap.get(e.shooterId)!.push(e);
  }
  for (const [shooterId, shots] of shooterMap) {
    shotsByShooter.push({ shooterId, shots });
  }

  // Group impacts by target (for units of this type)
  const impactsByTarget: { targetId: string; impacts: CombatEvent[] }[] = [];
  const targetMap = new Map<string, CombatEvent[]>();
  for (const e of roundEvents) {
    if (!unitIds.has(e.targetId)) continue;
    if (!targetMap.has(e.targetId)) targetMap.set(e.targetId, []);
    targetMap.get(e.targetId)!.push(e);
  }
  for (const [targetId, impacts] of targetMap) {
    impactsByTarget.push({ targetId, impacts });
  }

  if (shotsByShooter.length === 0 && impactsByTarget.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Shots fired by each unit */}
      <div className="glass-card p-3 border-emerald-500/10">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">
          Tirs individuels
        </div>
        {shotsByShooter.length === 0 ? (
          <div className="text-[10px] text-muted-foreground/60">Aucun tir</div>
        ) : (
          <div className="space-y-2">
            {shotsByShooter.map(({ shooterId, shots }) => {
              const shooterLabel = label(shooterId, unitType, gameConfig, numberMap);
              const totalDmg = shots.reduce((s, e) => s + e.shieldAbsorbed + e.hullDamage, 0);
              const kills = shots.filter((e) => e.targetDestroyed).length;
              return (
                <div key={shooterId}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium text-foreground">{shooterLabel}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {fmt(totalDmg)} dmg{kills > 0 && <span className="text-red-400 ml-1">{kills}K</span>}
                    </span>
                  </div>
                  {shots.map((e, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px] py-0.5 pl-2">
                      <ArrowRight className="h-2 w-2 text-emerald-400/40 shrink-0" />
                      <span className="text-foreground/80 truncate">
                        {label(e.targetId, e.targetType, gameConfig, numberMap)}
                      </span>
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {e.shieldAbsorbed > 0 && <span className="text-cyan-400/70 font-mono">{fmt(e.shieldAbsorbed)}</span>}
                        {e.hullDamage > 0 && <span className="text-orange-400/70 font-mono">{fmt(e.hullDamage)}</span>}
                        {e.shieldAbsorbed === 0 && e.hullDamage === 0 && <span className="text-muted-foreground/30 font-mono">0</span>}
                        {e.targetDestroyed && (
                          <XCircle className="h-[9px] w-[9px] text-red-400" />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Impacts received by each unit */}
      <div className="glass-card p-3 border-red-500/10">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-2">
          Impacts individuels
        </div>
        {impactsByTarget.length === 0 ? (
          <div className="text-[10px] text-muted-foreground/60">Aucun impact</div>
        ) : (
          <div className="space-y-2">
            {impactsByTarget.map(({ targetId, impacts }) => {
              const targetLabel = label(targetId, unitType, gameConfig, numberMap);
              const totalShield = impacts.reduce((s, e) => s + e.shieldAbsorbed, 0);
              const totalHull = impacts.reduce((s, e) => s + e.hullDamage, 0);
              const destroyed = impacts.some((e) => e.targetDestroyed);
              return (
                <div key={targetId}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className={`font-medium ${destroyed ? 'text-red-400 line-through' : 'text-foreground'}`}>
                      {targetLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {totalShield > 0 && <span className="text-cyan-400/70">{fmt(totalShield)}</span>}
                      {totalShield > 0 && totalHull > 0 && ' '}
                      {totalHull > 0 && <span className="text-orange-400/70">{fmt(totalHull)}</span>}
                      {destroyed && <span className="text-red-400 ml-1">detruit</span>}
                    </span>
                  </div>
                  {impacts.map((e, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px] py-0.5 pl-2">
                      <ArrowRight className="h-2 w-2 text-red-400/40 shrink-0" />
                      <span className="text-foreground/80 truncate">
                        {label(e.shooterId, e.shooterType, gameConfig, numberMap)}
                      </span>
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {e.shieldAbsorbed > 0 && <span className="text-cyan-400/70 font-mono">{fmt(e.shieldAbsorbed)}</span>}
                        {e.hullDamage > 0 && <span className="text-orange-400/70 font-mono">{fmt(e.hullDamage)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
