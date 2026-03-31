// apps/web/src/components/combat-guide/RoundDisplay.tsx
import { useState, useEffect } from 'react';
import type { CombatResult } from '@exilium/game-engine';
import { getUnitName } from '@/lib/entity-names';
import { useGameConfig } from '@/hooks/useGameConfig';

interface RoundDisplayProps {
  result: CombatResult;
  /** Initial fleet counts before combat (for hull bar %) */
  initialAttacker: Record<string, number>;
  initialDefender: Record<string, number>;
  /** Auto-advance rounds with this delay (ms). 0 = manual. */
  autoPlayDelay?: number;
  /** Called when animation finishes all rounds */
  onComplete?: () => void;
  /** Player perspective — swaps left/right sides when 'defender' */
  perspective?: 'attacker' | 'defender';
}

export function RoundDisplay({
  result,
  initialAttacker,
  initialDefender,
  autoPlayDelay = 1500,
  onComplete,
  perspective,
}: RoundDisplayProps) {
  const { data: gameConfig } = useGameConfig();
  const [displayedRound, setDisplayedRound] = useState(0); // 0 = initial state
  const totalRounds = result.rounds.length;

  // Reset when result changes (defensive — consumers should also use key prop)
  useEffect(() => {
    setDisplayedRound(0);
  }, [result]);

  useEffect(() => {
    if (autoPlayDelay <= 0 || displayedRound > totalRounds) return;
    if (displayedRound === totalRounds) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => setDisplayedRound((r) => r + 1), autoPlayDelay);
    return () => clearTimeout(timer);
  }, [displayedRound, totalRounds, autoPlayDelay, onComplete]);

  // Current state to display
  const attackerShips =
    displayedRound === 0 ? initialAttacker : result.rounds[displayedRound - 1].attackerShips;
  const defenderShips =
    displayedRound === 0 ? initialDefender : result.rounds[displayedRound - 1].defenderShips;

  const allAttackerTypes = Object.keys(initialAttacker);
  const allDefenderTypes = Object.keys(initialDefender);

  const isFinished = displayedRound >= totalRounds;
  const isDefPerspective = perspective === 'defender';

  // Determine outcome label from player perspective
  const outcomeLabel = result.outcome === 'draw'
    ? 'Match nul'
    : (result.outcome === 'attacker') !== isDefPerspective
      ? 'Victoire'
      : 'Défaite';
  const outcomeColor = result.outcome === 'draw'
    ? 'text-yellow-400'
    : (result.outcome === 'attacker') !== isDefPerspective
      ? 'text-green-400'
      : 'text-red-400';

  return (
    <div className="space-y-3">
      {/* Round indicator */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {displayedRound === 0
            ? 'Déploiement'
            : isFinished
              ? `Round ${totalRounds}/${totalRounds} — Terminé`
              : `Round ${displayedRound}/${totalRounds}`}
        </span>
        {isFinished && (
          <span className={`font-bold ${outcomeColor}`}>
            {outcomeLabel}
          </span>
        )}
      </div>

      {/* Two columns — left = you (blue), right = enemy (rose) */}
      {(() => {
        const currentRound = displayedRound > 0 ? result.rounds[displayedRound - 1] : null;
        const defenderHP = currentRound?.defenderHPByType;
        const attackerHP = currentRound?.attackerHPByType;

        return (
          <div className="grid grid-cols-2 gap-4">
            <FleetColumn
              title={isDefPerspective ? 'Défenseur (vous)' : 'Attaquant (vous)'}
              types={isDefPerspective ? allDefenderTypes : allAttackerTypes}
              initial={isDefPerspective ? initialDefender : initialAttacker}
              current={isDefPerspective ? defenderShips : attackerShips}
              gameConfig={gameConfig}
              color="text-blue-400"
              hpByType={isDefPerspective ? defenderHP : attackerHP}
            />
            <FleetColumn
              title={isDefPerspective ? 'Attaquant' : 'Défenseur'}
              types={isDefPerspective ? allAttackerTypes : allDefenderTypes}
              initial={isDefPerspective ? initialAttacker : initialDefender}
              current={isDefPerspective ? attackerShips : defenderShips}
              gameConfig={gameConfig}
              color="text-rose-400"
              hpByType={isDefPerspective ? attackerHP : defenderHP}
            />
          </div>
        );
      })()}

      {/* Planetary shield — multi-round progression */}
      {(() => {
        const firstRoundShield = result.rounds[0]?.defenderHPByType?.['__planetaryShield__'];
        if (!firstRoundShield || firstRoundShield.shieldMax <= 0) return null;
        const shieldMax = firstRoundShield.shieldMax;

        return (
          <div className="rounded-lg border border-cyan-500/15 bg-cyan-950/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-cyan-400 font-semibold uppercase tracking-wider text-[10px]">Bouclier planétaire</span>
              <span className="text-muted-foreground font-mono text-[10px]">{Math.floor(shieldMax)} pts</span>
            </div>
            <div className="flex gap-1">
              {result.rounds.map((round, i) => {
                const hp = round.defenderHPByType?.['__planetaryShield__'];
                const remaining = hp?.shieldRemaining ?? shieldMax;
                const pct = (remaining / shieldMax) * 100;
                const pierced = remaining <= 0;
                const absorbed = round.shieldAbsorbed ?? 0;
                const isCurrentRound = displayedRound === i + 1;
                const isFutureRound = displayedRound > 0 && displayedRound <= i;
                const isDeployment = displayedRound === 0;

                return (
                  <div
                    key={i}
                    className={`flex-1 transition-opacity duration-300 ${isFutureRound ? 'opacity-30' : ''}`}
                    title={`Round ${i + 1}: ${absorbed > 0 ? `${Math.floor(absorbed)} absorbés` : 'aucun dégât'}${pierced ? ' — PERCÉ' : ''}`}
                  >
                    <div className="text-[9px] text-center text-muted-foreground mb-0.5">R{i + 1}</div>
                    <div className={`h-6 rounded bg-muted/20 overflow-hidden border transition-all duration-300 ${isCurrentRound ? 'border-white/30 ring-1 ring-cyan-500/30' : 'border-white/5'}`}>
                      <div
                        className={`h-full transition-all duration-1000 ease-in-out ${pierced ? 'bg-red-500/80' : 'bg-gradient-to-t from-cyan-600 to-cyan-400'}`}
                        style={{ width: '100%', height: isDeployment ? '100%' : `${Math.max(0, pct)}%` }}
                      />
                    </div>
                    <div className={`text-[8px] text-center mt-0.5 font-mono transition-colors duration-300 ${pierced ? 'text-red-400' : absorbed > 0 ? 'text-cyan-400' : 'text-muted-foreground/40'}`}>
                      {isDeployment ? '' : pierced ? 'PERCÉ' : absorbed > 0 ? `-${Math.floor(absorbed)}` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Per-unit-type damage summary for current round */}
      {displayedRound > 0 && (() => {
        const round = result.rounds[displayedRound - 1];
        const myDamage = isDefPerspective ? round.defenderDamageByType : round.attackerDamageByType;
        const enemyDamage = isDefPerspective ? round.attackerDamageByType : round.defenderDamageByType;

        return (
          <div className="grid grid-cols-2 gap-4 text-[11px]">
            <DamageRoundSummary title="Dégâts subis" damageByType={myDamage} gameConfig={gameConfig} />
            <DamageRoundSummary title="Dégâts infligés" damageByType={enemyDamage} gameConfig={gameConfig} />
          </div>
        );
      })()}

      {/* Manual controls if no auto-play */}
      {autoPlayDelay === 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={displayedRound === 0}
            onClick={() => setDisplayedRound((r) => Math.max(0, r - 1))}
          >
            ← Précédent
          </button>
          <button
            type="button"
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={isFinished}
            onClick={() => setDisplayedRound((r) => r + 1)}
          >
            Suivant →
          </button>
          <button
            type="button"
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setDisplayedRound(0)}
          >
            Réinitialiser
          </button>
        </div>
      )}

      {/* Losses summary when finished */}
      {isFinished && (
        <div className="grid grid-cols-2 gap-4 text-xs">
          <LossesSummary label="Vos pertes" losses={isDefPerspective ? result.defenderLosses : result.attackerLosses} gameConfig={gameConfig} />
          <LossesSummary label="Pertes ennemies" losses={isDefPerspective ? result.attackerLosses : result.defenderLosses} gameConfig={gameConfig} />
        </div>
      )}

      {/* Debris */}
      {isFinished && (result.debris.minerai > 0 || result.debris.silicium > 0) && (
        <div className="text-xs text-muted-foreground">
          Débris : {result.debris.minerai > 0 && <span className="text-minerai">M: {result.debris.minerai.toLocaleString('fr-FR')}</span>}
          {result.debris.minerai > 0 && result.debris.silicium > 0 && ' · '}
          {result.debris.silicium > 0 && <span className="text-silicium">S: {result.debris.silicium.toLocaleString('fr-FR')}</span>}
        </div>
      )}
    </div>
  );
}

function FleetColumn({
  title,
  types,
  initial,
  current,
  gameConfig,
  color,
  hpByType,
}: {
  title: string;
  types: string[];
  initial: Record<string, number>;
  current: Record<string, number>;
  gameConfig: any;
  color: string;
  hpByType?: Record<string, { shieldRemaining: number; shieldMax: number; hullRemaining: number; hullMax: number }>;
}) {
  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{title}</h4>
      {types.map((type) => {
        const init = initial[type] ?? 0;
        const curr = current[type] ?? 0;
        return (
          <div key={type} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className={curr === 0 ? 'text-muted-foreground/40 line-through' : 'text-foreground'}>
                {getUnitName(type, gameConfig)}
              </span>
              <span className={curr === 0 ? 'text-muted-foreground/40' : 'text-muted-foreground'}>
                {curr}/{init}
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000 ease-in-out bg-cyan-500"
                  style={{ width: `${hpByType?.[type] ? (hpByType[type].shieldMax > 0 ? (hpByType[type].shieldRemaining / hpByType[type].shieldMax) * 100 : 0) : 100}%` }} />
              </div>
              <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000 ease-in-out bg-orange-500"
                  style={{ width: `${hpByType?.[type] ? (hpByType[type].hullMax > 0 ? (hpByType[type].hullRemaining / hpByType[type].hullMax) * 100 : 0) : 100}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LossesSummary({
  label,
  losses,
  gameConfig,
}: {
  label: string;
  losses: Record<string, number>;
  gameConfig: any;
}) {
  const entries = Object.entries(losses).filter(([, n]) => n > 0);
  if (entries.length === 0) return <div className="text-xs text-muted-foreground">{label} : aucune</div>;
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label} :</span>{' '}
      {entries.map(([type, count], i) => (
        <span key={type}>
          {i > 0 && ', '}
          {count}× {getUnitName(type, gameConfig)}
        </span>
      ))}
    </div>
  );
}

function DamageRoundSummary({
  title,
  damageByType,
  gameConfig,
}: {
  title: string;
  damageByType?: Record<string, { shieldDamage: number; hullDamage: number; destroyed: number }>;
  gameConfig: any;
}) {
  if (!damageByType) return null;
  const entries = Object.entries(damageByType).filter(([, d]) => d.shieldDamage > 0 || d.hullDamage > 0);
  if (entries.length === 0) return <div className="text-muted-foreground/60">{title} : aucun</div>;

  const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{title}</div>
      {entries.map(([type, d]) => {
        const name = type === '__planetaryShield__' ? 'Bouclier planétaire' : getUnitName(type, gameConfig);
        const isShieldOnly = type === '__planetaryShield__';
        return (
          <div key={type} className="text-xs">
            <span className="text-foreground font-medium">{name}</span>
            <span className="text-muted-foreground">
              {isShieldOnly
                ? ` : ${fmt(d.shieldDamage)} absorbés`
                : ` : ${fmt(d.shieldDamage + d.hullDamage)} dégâts`}
              {!isShieldOnly && d.shieldDamage > 0 && (
                <span className="text-cyan-400"> ({fmt(d.shieldDamage)} bouclier</span>
              )}
              {!isShieldOnly && d.hullDamage > 0 && (
                <span className="text-orange-400">{d.shieldDamage > 0 ? ', ' : ' ('}{fmt(d.hullDamage)} coque</span>
              )}
              {!isShieldOnly && (d.shieldDamage > 0 || d.hullDamage > 0) && ')'}
            </span>
            {d.destroyed > 0 && (
              <span className="text-red-400"> — {d.destroyed} détruit{d.destroyed > 1 ? 's' : ''}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
