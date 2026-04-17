import { useState } from 'react';
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

interface RoundShotDetailProps {
  events: CombatEvent[];
  round: number;
  unitSideMap: Map<string, 'attacker' | 'defender'>;
  unitNumberMap: Map<string, number>;
  gameConfig: any;
  perspective?: 'attacker' | 'defender';
}

/** Readable label: "Frégate #3" */
function unitLabel(
  unitId: string,
  unitType: string,
  gameConfig: any,
  numberMap: Map<string, number>,
): string {
  const num = numberMap.get(unitId) ?? 0;
  return `${getUnitName(unitType, gameConfig)} #${num}`;
}

// ── Aggregated view types ──

interface ShotGroup {
  shooterType: string;
  targetType: string;
  shotCount: number;
  shieldAbsorbed: number;
  hullDamage: number;
  kills: number;
}

function aggregateShots(
  events: CombatEvent[],
  round: number,
  unitSideMap: Map<string, 'attacker' | 'defender'>,
): { attacker: ShotGroup[]; defender: ShotGroup[] } {
  const roundEvents = events.filter((e) => e.round === round);
  const groups: Record<string, ShotGroup & { side: 'attacker' | 'defender' }> = {};

  for (const e of roundEvents) {
    const side = unitSideMap.get(e.shooterId) ?? 'attacker';
    const key = `${side}:${e.shooterType}:${e.targetType}`;
    if (!groups[key]) {
      groups[key] = {
        side,
        shooterType: e.shooterType,
        targetType: e.targetType,
        shotCount: 0,
        shieldAbsorbed: 0,
        hullDamage: 0,
        kills: 0,
      };
    }
    const g = groups[key];
    g.shotCount += 1;
    g.shieldAbsorbed += e.shieldAbsorbed;
    g.hullDamage += e.hullDamage;
    if (e.targetDestroyed) g.kills += 1;
  }

  const all = Object.values(groups);
  return {
    attacker: all.filter((g) => g.side === 'attacker').sort((a, b) => (b.shieldAbsorbed + b.hullDamage) - (a.shieldAbsorbed + a.hullDamage)),
    defender: all.filter((g) => g.side === 'defender').sort((a, b) => (b.shieldAbsorbed + b.hullDamage) - (a.shieldAbsorbed + a.hullDamage)),
  };
}

// ── Individual view types ──

interface ShooterGroup {
  shooterId: string;
  shooterType: string;
  shots: CombatEvent[];
}

function groupBySide(
  events: CombatEvent[],
  round: number,
  unitSideMap: Map<string, 'attacker' | 'defender'>,
): { attacker: ShooterGroup[]; defender: ShooterGroup[] } {
  const roundEvents = events.filter((e) => e.round === round);
  const shooterMap: Record<string, ShooterGroup & { side: 'attacker' | 'defender' }> = {};

  for (const e of roundEvents) {
    const side = unitSideMap.get(e.shooterId) ?? 'attacker';
    if (!shooterMap[e.shooterId]) {
      shooterMap[e.shooterId] = { shooterId: e.shooterId, shooterType: e.shooterType, shots: [], side };
    }
    shooterMap[e.shooterId].shots.push(e);
  }

  const all = Object.values(shooterMap);
  return {
    attacker: all.filter((g) => g.side === 'attacker'),
    defender: all.filter((g) => g.side === 'defender'),
  };
}

// ── Sub-components ──

function AggregatedRow({ group, gameConfig }: { group: ShotGroup; gameConfig: any }) {
  const shooterName = getUnitName(group.shooterType, gameConfig);
  const targetName = getUnitName(group.targetType, gameConfig);
  const maxDmg = Math.max(group.shieldAbsorbed, group.hullDamage, 1);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-foreground font-medium truncate">{shooterName}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
        <span className="text-foreground font-medium truncate">{targetName}</span>
        <span className="text-muted-foreground ml-auto shrink-0">{group.shotCount} tir{group.shotCount > 1 ? 's' : ''}</span>
      </div>
      <div className="flex gap-1 h-1.5">
        {group.shieldAbsorbed > 0 && (
          <div className="rounded-full bg-cyan-500/60" style={{ flex: group.shieldAbsorbed / maxDmg }} title={`Bouclier : ${fmt(group.shieldAbsorbed)}`} />
        )}
        {group.hullDamage > 0 && (
          <div className="rounded-full bg-orange-500/60" style={{ flex: group.hullDamage / maxDmg }} title={`Coque : ${fmt(group.hullDamage)}`} />
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {group.shieldAbsorbed > 0 && <span className="text-cyan-400/80">{fmt(group.shieldAbsorbed)} bouclier</span>}
        {group.hullDamage > 0 && <span className="text-orange-400/80">{fmt(group.hullDamage)} coque</span>}
        {group.kills > 0 && <span className="text-red-400">{group.kills} detruit{group.kills > 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}

function IndividualShotRow({
  event,
  gameConfig,
  numberMap,
}: {
  event: CombatEvent;
  gameConfig: any;
  numberMap: Map<string, number>;
}) {
  const targetLabel = unitLabel(event.targetId, event.targetType, gameConfig, numberMap);

  return (
    <div className="flex items-center gap-1.5 text-[10px] py-0.5">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40 shrink-0">
        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
      </svg>
      <span className="text-foreground truncate">{targetLabel}</span>
      <span className="ml-auto flex items-center gap-1.5 shrink-0">
        {event.shieldAbsorbed > 0 && <span className="text-cyan-400 font-mono">{fmt(event.shieldAbsorbed)}</span>}
        {event.hullDamage > 0 && <span className="text-orange-400 font-mono">{fmt(event.hullDamage)}</span>}
        {event.shieldAbsorbed === 0 && event.hullDamage === 0 && <span className="text-muted-foreground/40 font-mono">0</span>}
        {event.targetDestroyed && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
      </span>
    </div>
  );
}

function ShooterBlock({
  group,
  gameConfig,
  numberMap,
}: {
  group: ShooterGroup;
  gameConfig: any;
  numberMap: Map<string, number>;
}) {
  const label = unitLabel(group.shooterId, group.shooterType, gameConfig, numberMap);
  const totalShield = group.shots.reduce((s, e) => s + e.shieldAbsorbed, 0);
  const totalHull = group.shots.reduce((s, e) => s + e.hullDamage, 0);
  const kills = group.shots.filter((e) => e.targetDestroyed).length;

  return (
    <div className="rounded-md bg-white/[0.02] border border-border/10 px-2 py-1.5">
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {group.shots.length} tir{group.shots.length > 1 ? 's' : ''}
          {totalShield > 0 && <span className="text-cyan-400/70 ml-1">{fmt(totalShield)}</span>}
          {totalHull > 0 && <span className="text-orange-400/70 ml-1">{fmt(totalHull)}</span>}
          {kills > 0 && <span className="text-red-400 ml-1">{kills}K</span>}
        </span>
      </div>
      <div className="space-y-0">
        {group.shots.map((e, i) => (
          <IndividualShotRow key={i} event={e} gameConfig={gameConfig} numberMap={numberMap} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ──

export function RoundShotDetail({
  events,
  round,
  unitSideMap,
  unitNumberMap,
  gameConfig,
  perspective,
}: RoundShotDetailProps) {
  const [viewMode, setViewMode] = useState<'summary' | 'individual'>('summary');

  const isDefPerspective = perspective === 'defender';

  // Aggregated data
  const aggregated = aggregateShots(events, round, unitSideMap);
  const aggLeft = isDefPerspective ? aggregated.defender : aggregated.attacker;
  const aggRight = isDefPerspective ? aggregated.attacker : aggregated.defender;

  // Individual data
  const individual = groupBySide(events, round, unitSideMap);
  const indLeft = isDefPerspective ? individual.defender : individual.attacker;
  const indRight = isDefPerspective ? individual.attacker : individual.defender;

  const leftLabel = isDefPerspective ? 'Vos tirs' : 'Tirs attaquant';
  const rightLabel = isDefPerspective ? 'Tirs ennemi' : 'Tirs defenseur';

  if (aggLeft.length === 0 && aggRight.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* View toggle */}
      <div className="flex items-center gap-1 text-[10px]">
        <button
          type="button"
          className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'summary' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setViewMode('summary')}
        >
          Resume
        </button>
        <button
          type="button"
          className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'individual' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setViewMode('individual')}
        >
          Tir par tir
        </button>
        {viewMode === 'individual' && (
          <span className="text-muted-foreground/50 ml-1">
            <span className="text-cyan-400/50">bouclier</span>{' / '}
            <span className="text-orange-400/50">coque</span>
          </span>
        )}
      </div>

      {/* Summary view */}
      {viewMode === 'summary' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold">{leftLabel}</div>
            {aggLeft.length === 0
              ? <div className="text-[10px] text-muted-foreground/60">Aucun tir</div>
              : aggLeft.map((g) => <AggregatedRow key={`${g.shooterType}-${g.targetType}`} group={g} gameConfig={gameConfig} />)
            }
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">{rightLabel}</div>
            {aggRight.length === 0
              ? <div className="text-[10px] text-muted-foreground/60">Aucun tir</div>
              : aggRight.map((g) => <AggregatedRow key={`${g.shooterType}-${g.targetType}`} group={g} gameConfig={gameConfig} />)
            }
          </div>
        </div>
      )}

      {/* Individual view */}
      {viewMode === 'individual' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold">{leftLabel}</div>
            {indLeft.length === 0
              ? <div className="text-[10px] text-muted-foreground/60">Aucun tir</div>
              : indLeft.map((g) => <ShooterBlock key={g.shooterId} group={g} gameConfig={gameConfig} numberMap={unitNumberMap} />)
            }
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">{rightLabel}</div>
            {indRight.length === 0
              ? <div className="text-[10px] text-muted-foreground/60">Aucun tir</div>
              : indRight.map((g) => <ShooterBlock key={g.shooterId} group={g} gameConfig={gameConfig} numberMap={unitNumberMap} />)
            }
          </div>
        </div>
      )}
    </div>
  );
}
