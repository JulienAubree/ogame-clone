import { getUnitName } from '@/lib/entity-names';
import type { CombatEvent } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface DamagePanelProps {
  events: CombatEvent[];
  unitType: string;
  round: number;
  side: 'attacker' | 'defender';
  gameConfig: any;
}

interface DamageGroup {
  type: string;
  totalDamage: number;
  kills: number;
  shieldAbsorbed: number;
  hullDamage: number;
}

export function DamagePanel({ events, unitType, round, side, gameConfig }: DamagePanelProps) {
  // Damage dealt: events where shooterType matches and round matches
  const dealtEvents = events.filter(
    (e) => e.round === round && e.shooterType === unitType,
  );
  const dealtByTarget = new Map<string, DamageGroup>();
  for (const e of dealtEvents) {
    const g = dealtByTarget.get(e.targetType) ?? {
      type: e.targetType,
      totalDamage: 0,
      kills: 0,
      shieldAbsorbed: 0,
      hullDamage: 0,
    };
    g.totalDamage += e.damage;
    g.shieldAbsorbed += e.shieldAbsorbed;
    g.hullDamage += e.hullDamage;
    if (e.targetDestroyed) g.kills++;
    dealtByTarget.set(e.targetType, g);
  }

  // Damage received: events where targetType matches and round matches
  const receivedEvents = events.filter(
    (e) => e.round === round && e.targetType === unitType,
  );
  const receivedByShooter = new Map<string, DamageGroup>();
  for (const e of receivedEvents) {
    const g = receivedByShooter.get(e.shooterType) ?? {
      type: e.shooterType,
      totalDamage: 0,
      kills: 0,
      shieldAbsorbed: 0,
      hullDamage: 0,
    };
    g.totalDamage += e.damage;
    g.shieldAbsorbed += e.shieldAbsorbed;
    g.hullDamage += e.hullDamage;
    if (e.targetDestroyed) g.kills++;
    receivedByShooter.set(e.shooterType, g);
  }

  const dealtGroups = [...dealtByTarget.values()].sort((a, b) => b.totalDamage - a.totalDamage);
  const receivedGroups = [...receivedByShooter.values()].sort(
    (a, b) => b.totalDamage - a.totalDamage,
  );
  const maxDealt = dealtGroups[0]?.totalDamage || 1;
  const maxReceived = receivedGroups[0]?.totalDamage || 1;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Damage dealt */}
      <div className="glass-card p-3 border-emerald-500/10">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">
          Degats infliges
        </div>
        {dealtGroups.length === 0 ? (
          <div className="text-xs text-muted-foreground">Aucun tir ce round</div>
        ) : (
          <div className="space-y-2">
            {dealtGroups.map((g) => (
              <div key={g.type}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-foreground truncate">
                    {getUnitName(g.type, gameConfig)}
                  </span>
                  <span className="text-emerald-400 font-mono shrink-0 ml-2">
                    {fmt(g.totalDamage)}
                    {g.kills > 0 && (
                      <span className="text-red-400 ml-1">
                        ({g.kills} dest.)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/60 transition-all"
                    style={{ width: `${(g.totalDamage / maxDealt) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Damage received */}
      <div className="glass-card p-3 border-red-500/10">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-2">
          Degats recus
        </div>
        {receivedGroups.length === 0 ? (
          <div className="text-xs text-muted-foreground">Aucun impact ce round</div>
        ) : (
          <div className="space-y-2">
            {receivedGroups.map((g) => (
              <div key={g.type}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-foreground truncate">
                    {getUnitName(g.type, gameConfig)}
                  </span>
                  <span className="text-red-400 font-mono shrink-0 ml-2">
                    {fmt(g.totalDamage)}
                  </span>
                </div>
                <div className="flex gap-1 text-[10px] text-muted-foreground mb-0.5">
                  <span className="text-cyan-400/70">{fmt(g.shieldAbsorbed)} bouclier</span>
                  <span>-</span>
                  <span className="text-orange-400/70">{fmt(g.hullDamage)} coque</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500/60 transition-all"
                    style={{ width: `${(g.totalDamage / maxReceived) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
