import { ArrowRight, X, XCircle } from 'lucide-react';
import { getUnitName } from '@/lib/entity-names';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface CombatEvent {
  round: number;
  shooterId: string;
  shooterType: string;
  targetId: string;
  targetType: string;
  damage: number;
  shieldAbsorbed: number;
  armorBlocked: number;
  hullDamage: number;
  targetDestroyed: boolean;
}

interface UnitSnapshot {
  unitId: string;
  unitType: string;
  side: 'attacker' | 'defender';
  shield: number;
  hull: number;
  destroyed: boolean;
}

interface UnitTimelineProps {
  unitId: string;
  events: CombatEvent[];
  snapshots: UnitSnapshot[][];
  initialUnits: UnitSnapshot[];
  totalRounds: number;
  unitNumberMap: Map<string, number>;
  gameConfig: any;
  onClose: () => void;
  onSelectUnit: (unitId: string) => void;
}

function unitLabel(
  unitId: string,
  unitType: string,
  gameConfig: any,
  numberMap: Map<string, number>,
): string {
  return `${getUnitName(unitType, gameConfig)} #${numberMap.get(unitId) ?? 0}`;
}

export function UnitTimeline({
  unitId,
  events,
  snapshots,
  initialUnits,
  totalRounds,
  unitNumberMap,
  gameConfig,
  onClose,
  onSelectUnit,
}: UnitTimelineProps) {
  const initial = initialUnits.find((u) => u.unitId === unitId);
  if (!initial) return null;

  const label = unitLabel(unitId, initial.unitType, gameConfig, unitNumberMap);
  const sideLabel = initial.side === 'attacker' ? 'Attaquant' : 'Defenseur';
  const sideColor = initial.side === 'attacker' ? 'text-blue-400' : 'text-rose-400';

  // Build round-by-round data
  const roundData: {
    round: number;
    snapshot: UnitSnapshot | undefined;
    shotsFired: CombatEvent[];
    shotsReceived: CombatEvent[];
  }[] = [];

  for (let r = 1; r <= totalRounds; r++) {
    const snap = snapshots[r - 1]?.find((s) => s.unitId === unitId);
    const shotsFired = events.filter((e) => e.round === r && e.shooterId === unitId);
    const shotsReceived = events.filter((e) => e.round === r && e.targetId === unitId);
    roundData.push({ round: r, snapshot: snap, shotsFired, shotsReceived });
  }

  // Find round of death
  const deathRound = roundData.find((r) => r.snapshot?.destroyed)?.round;

  return (
    <div className="glass-card border-blue-500/15 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">{label}</h3>
          <div className="flex items-center gap-2 text-[10px] mt-0.5">
            <span className={sideColor}>{sideLabel}</span>
            <span className="text-muted-foreground">Coque : {fmt(initial.hull)}</span>
            <span className="text-muted-foreground">Bouclier : {fmt(initial.shield)}</span>
            {deathRound && (
              <span className="text-red-400">Detruit au round {deathRound}</span>
            )}
            {!deathRound && (
              <span className="text-emerald-400">Survit</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {roundData.map(({ round, snapshot, shotsFired, shotsReceived }) => {
          const isAlive = snapshot ? !snapshot.destroyed : true;
          const hullPct = snapshot && initial.hull > 0 ? (snapshot.hull / initial.hull) * 100 : 100;
          const shieldPct = snapshot && initial.shield > 0 ? (snapshot.shield / initial.shield) * 100 : 0;

          const totalDealt = shotsFired.reduce((s, e) => s + e.hullDamage + e.shieldAbsorbed, 0);
          const totalReceived = shotsReceived.reduce((s, e) => s + e.hullDamage + e.shieldAbsorbed, 0);
          const kills = shotsFired.filter((e) => e.targetDestroyed).length;

          // Skip rounds where the unit is already dead and did nothing
          const prevSnap = round > 1 ? snapshots[round - 2]?.find((s) => s.unitId === unitId) : undefined;
          const wasDead = prevSnap?.destroyed;
          if (wasDead && shotsFired.length === 0 && shotsReceived.length === 0) return null;

          return (
            <div key={round} className="relative pl-5 pb-3 border-l border-border/20 last:border-l-0">
              {/* Timeline dot */}
              <div className={`absolute left-0 top-1 w-2 h-2 rounded-full -translate-x-1/2 ${
                snapshot?.destroyed ? 'bg-red-500' : 'bg-emerald-500'
              }`} />

              {/* Round header */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-foreground">Round {round}</span>
                {isAlive && snapshot && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="text-cyan-400/70 font-mono">{fmt(snapshot.shield)}</span>
                    <span className="text-orange-400/70 font-mono">{fmt(snapshot.hull)}</span>
                  </div>
                )}
                {snapshot?.destroyed && (
                  <span className="text-[10px] text-red-400 font-bold">Detruit</span>
                )}
              </div>

              {/* HP bar */}
              {isAlive && snapshot && (
                <div className="flex gap-1 h-1 mb-1.5">
                  <div className="flex-1 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-cyan-500/50 transition-all" style={{ width: `${shieldPct}%` }} />
                  </div>
                  <div className="flex-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        hullPct > 75 ? 'bg-emerald-500/60' : hullPct > 50 ? 'bg-yellow-500/60' : hullPct > 25 ? 'bg-orange-500/60' : 'bg-red-500/60'
                      }`}
                      style={{ width: `${hullPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Shots fired */}
              {shotsFired.length > 0 && (
                <div className="mb-1">
                  <div className="text-[9px] uppercase tracking-wider text-emerald-400/60 font-semibold mb-0.5">
                    Tirs ({shotsFired.length}){totalDealt > 0 && ` — ${fmt(totalDealt)} degats`}{kills > 0 && ` — ${kills} kill${kills > 1 ? 's' : ''}`}
                  </div>
                  {shotsFired.map((e, i) => (
                    <button
                      key={i}
                      type="button"
                      className="flex items-center gap-1 text-[10px] py-0.5 w-full text-left hover:bg-white/5 rounded px-1 -mx-1 transition-colors"
                      onClick={() => onSelectUnit(e.targetId)}
                    >
                      <ArrowRight className="h-2 w-2 text-emerald-400/40 shrink-0" />
                      <span className="text-foreground/80 truncate underline decoration-border/30 underline-offset-2">
                        {unitLabel(e.targetId, e.targetType, gameConfig, unitNumberMap)}
                      </span>
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {e.shieldAbsorbed > 0 && <span className="text-cyan-400/70 font-mono">{fmt(e.shieldAbsorbed)}</span>}
                        {e.hullDamage > 0 && <span className="text-orange-400/70 font-mono">{fmt(e.hullDamage)}</span>}
                        {e.shieldAbsorbed === 0 && e.hullDamage === 0 && <span className="text-muted-foreground/30 font-mono">0</span>}
                        {e.targetDestroyed && (
                          <XCircle className="h-[9px] w-[9px] text-red-400" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Shots received */}
              {shotsReceived.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-red-400/60 font-semibold mb-0.5">
                    Impacts ({shotsReceived.length}){totalReceived > 0 && ` — ${fmt(totalReceived)} subis`}
                  </div>
                  {shotsReceived.map((e, i) => (
                    <button
                      key={i}
                      type="button"
                      className="flex items-center gap-1 text-[10px] py-0.5 w-full text-left hover:bg-white/5 rounded px-1 -mx-1 transition-colors"
                      onClick={() => onSelectUnit(e.shooterId)}
                    >
                      <ArrowRight className="h-2 w-2 text-red-400/40 shrink-0" />
                      <span className="text-foreground/80 truncate underline decoration-border/30 underline-offset-2">
                        {unitLabel(e.shooterId, e.shooterType, gameConfig, unitNumberMap)}
                      </span>
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        {e.shieldAbsorbed > 0 && <span className="text-cyan-400/70 font-mono">{fmt(e.shieldAbsorbed)}</span>}
                        {e.hullDamage > 0 && <span className="text-orange-400/70 font-mono">{fmt(e.hullDamage)}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* No activity */}
              {shotsFired.length === 0 && shotsReceived.length === 0 && isAlive && (
                <div className="text-[10px] text-muted-foreground/40">Aucune activite</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
