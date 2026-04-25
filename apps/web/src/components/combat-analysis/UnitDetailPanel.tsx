import { useState } from 'react';
import { ArrowRight, LineChart, Users } from 'lucide-react';
import { getUnitName } from '@/lib/entity-names';
import { DamagePanel } from './DamagePanel';
import { ShotLog } from './ShotLog';
import { DeathsList } from './DeathsList';
import { UnitGrid } from './UnitGrid';
import type { CombatEvent, UnitSnapshot, DetailedCombatLog, RoundResult, UnitTypeHP } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface UnitDetailPanelProps {
  selectedUnitType: string | null;
  selectedSide: 'attacker' | 'defender';
  selectedRound: number;
  detailedLog: DetailedCombatLog | null | undefined;
  roundResult: RoundResult | undefined;
  initialFleet: Record<string, number>;
  gameConfig: any;
  expandedUnitId: string | null;
  onExpandUnit: (unitId: string | null) => void;
}

export function UnitDetailPanel({
  selectedUnitType,
  selectedSide,
  selectedRound,
  detailedLog,
  roundResult,
  initialFleet,
  gameConfig,
  expandedUnitId,
  onExpandUnit,
}: UnitDetailPanelProps) {
  const [damageView, setDamageView] = useState<'summary' | 'shots'>('summary');
  if (!selectedUnitType) {
    return (
      <div className="glass-card flex items-center justify-center p-8 min-h-[300px]">
        <div className="text-center space-y-2">
          <LineChart
            className="mx-auto h-8 w-8 text-muted-foreground/40"
            strokeWidth={1.5}
          />
          <p className="text-sm text-muted-foreground">
            Selectionnez un type d'unite pour voir le detail
          </p>
        </div>
      </div>
    );
  }

  const unitName = getUnitName(selectedUnitType, gameConfig);
  const initialCount = initialFleet[selectedUnitType] ?? 0;

  // Get HP data from round result
  const hpByType: Record<string, UnitTypeHP> | undefined =
    selectedSide === 'attacker'
      ? roundResult?.attackerHPByType
      : roundResult?.defenderHPByType;
  const hp = hpByType?.[selectedUnitType];

  // Get current surviving count from round result
  const currentFleet =
    selectedSide === 'attacker'
      ? roundResult?.attackerShips
      : roundResult?.defenderShips;
  const survivingCount = currentFleet?.[selectedUnitType] ?? 0;

  // Events for this round
  const events: CombatEvent[] = detailedLog?.events ?? [];

  // Compute total damage dealt and received by this unit type this round
  const roundEvents = events.filter((e) => e.round === selectedRound);
  const losses = roundEvents.filter(
    (e) => e.targetType === selectedUnitType && e.targetDestroyed,
  ).length;

  // Snapshots for the selected round
  const snapshots: UnitSnapshot[] =
    detailedLog?.snapshots?.[selectedRound] ?? [];
  const sideSnapshots = snapshots.filter((s) => s.side === selectedSide);

  const roundLabel = selectedRound === 0 ? 'Deploiement' : `Round ${selectedRound}`;

  // Unit flow: engaged → start of round → losses → end of round
  const startOfRound = selectedRound > 0 ? survivingCount + losses : initialCount;
  const previousLosses = initialCount - startOfRound; // cumulated losses before this round

  return (
    <div className="glass-card p-4 space-y-4 min-h-[300px]">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-foreground">{unitName}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{roundLabel}</p>
      </div>

      {/* Unit flow visual */}
      {selectedRound === 0 ? (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="flex items-center gap-1.5 rounded-md bg-white/5 border border-border/20 px-3 py-2">
            <Users className="h-3.5 w-3.5 text-foreground/60" />
            <span className="text-lg font-bold text-foreground">{initialCount}</span>
            <span className="text-[10px] text-muted-foreground">deployes</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {/* Engaged */}
          <div className="text-center shrink-0">
            <div className="rounded-md bg-white/5 border border-border/20 px-2.5 py-1.5">
              <div className="text-sm font-bold text-foreground">{initialCount}</div>
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">Engages</div>
          </div>

          {/* Arrow with previous losses */}
          {previousLosses > 0 ? (
            <div className="flex flex-col items-center shrink-0">
              <div className="text-[9px] text-red-400/70">-{previousLosses}</div>
              <ArrowRight className="h-2.5 w-4 text-muted-foreground/30" strokeWidth={1.5} />
            </div>
          ) : (
            <ArrowRight className="h-2.5 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
          )}

          {/* Start of round */}
          <div className="text-center shrink-0">
            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5">
              <div className="text-sm font-bold text-blue-400">{startOfRound}</div>
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">Debut R{selectedRound}</div>
          </div>

          {/* Arrow */}
          <ArrowRight className="h-2.5 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />

          {/* Losses this round */}
          <div className="text-center shrink-0">
            <div className={`rounded-md px-2.5 py-1.5 ${losses > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5 border border-border/20'}`}>
              <div className={`text-sm font-bold ${losses > 0 ? 'text-red-400' : 'text-muted-foreground/40'}`}>
                {losses > 0 ? `-${losses}` : '0'}
              </div>
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">Pertes</div>
          </div>

          {/* Arrow */}
          <ArrowRight className="h-2.5 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />

          {/* Surviving */}
          <div className="text-center shrink-0">
            <div className={`rounded-md px-2.5 py-1.5 ${survivingCount > 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              <div className={`text-sm font-bold ${survivingCount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {survivingCount}
              </div>
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              {survivingCount > 0 ? 'Survivants' : 'Aneantis'}
            </div>
          </div>
        </div>
      )}

      {/* HP bars */}
      {hp && (
        <div className="grid grid-cols-2 gap-3">
          {/* Shield */}
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-cyan-400 font-semibold uppercase tracking-wider">
                Bouclier
              </span>
              <span className="text-muted-foreground font-mono">
                {fmt(hp.shieldRemaining)} / {fmt(hp.shieldMax)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-500/70 transition-all"
                style={{
                  width: `${hp.shieldMax > 0 ? (hp.shieldRemaining / hp.shieldMax) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          {/* Hull */}
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-orange-400 font-semibold uppercase tracking-wider">Coque</span>
              <span className="text-muted-foreground font-mono">
                {fmt(hp.hullRemaining)} / {fmt(hp.hullMax)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-500/70 transition-all"
                style={{
                  width: `${hp.hullMax > 0 ? (hp.hullRemaining / hp.hullMax) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Damage panels (only for rounds > 0) */}
      {selectedRound > 0 && events.length > 0 && (
        <div className="space-y-2">
          {/* View toggle */}
          {detailedLog?.initialUnits && (
            <div className="flex items-center gap-1 text-[10px]">
              <button
                type="button"
                className={`px-2.5 py-1 rounded transition-colors ${damageView === 'summary' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setDamageView('summary')}
              >
                Resume
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded transition-colors ${damageView === 'shots' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setDamageView('shots')}
              >
                Tir par tir
              </button>
              {damageView === 'shots' && (
                <span className="text-muted-foreground/50 ml-1">
                  <span className="text-cyan-400/50">bouclier</span>{' / '}
                  <span className="text-orange-400/50">coque</span>
                </span>
              )}
            </div>
          )}

          {damageView === 'summary' && (
            <DamagePanel
              events={events}
              unitType={selectedUnitType}
              round={selectedRound}
              side={selectedSide}
              gameConfig={gameConfig}
            />
          )}

          {damageView === 'shots' && detailedLog?.initialUnits && (
            <ShotLog
              events={events}
              initialUnits={detailedLog.initialUnits}
              unitType={selectedUnitType}
              side={selectedSide}
              round={selectedRound}
              gameConfig={gameConfig}
            />
          )}
        </div>
      )}

      {/* Deaths list */}
      {selectedRound > 0 && (
        <DeathsList
          events={events}
          unitType={selectedUnitType}
          round={selectedRound}
          gameConfig={gameConfig}
        />
      )}

      {/* Unit grid (individual units) */}
      {sideSnapshots.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Unites individuelles
          </div>
          <UnitGrid
            snapshots={sideSnapshots}
            events={events}
            unitType={selectedUnitType}
            round={selectedRound}
            expandedUnitId={expandedUnitId}
            onExpandUnit={onExpandUnit}
            gameConfig={gameConfig}
          />
        </div>
      )}
    </div>
  );
}
