import { eq, sql } from 'drizzle-orm';
import { planetShips, planetDefenses, debrisFields, users } from '@exilium/db';
import { computeFleetFP, COMBAT_CATEGORIES, buildCombatConfig } from '@exilium/game-engine';
import type { RoundResult, UnitCombatStats, FPConfig, ShipCombatConfig } from '@exilium/game-engine';
import type { Database } from '@exilium/db';
import type { GameConfig, MissionHandlerContext } from './fleet.types.js';
import { buildShipCombatConfigs, buildShipCosts, getCombatMultipliers } from './fleet.types.js';

export { COMBAT_CATEGORIES, buildCombatConfig };

// ── Parse DB row to unit map (skip planetId, keep only positive numbers) ──

export function parseUnitRow(row: Record<string, unknown> | undefined): Record<string, number> {
  const result: Record<string, number> = {};
  if (!row) return result;
  for (const [key, val] of Object.entries(row)) {
    if (key === 'planetId') continue;
    if (typeof val === 'number' && val > 0) result[key] = val;
  }
  return result;
}

// ── Compute multipliers with defense bonus for both sides ──

export async function computeCombatMultipliers(
  ctx: MissionHandlerContext,
  config: GameConfig,
  attackerUserId: string,
  defenderUserId: string,
  defenderPlanetId?: string,
): Promise<{
  attackerMultipliers: { weapons: number; shielding: number; armor: number };
  defenderMultipliers: { weapons: number; shielding: number; armor: number };
  attackerTalentCtx: Record<string, number>;
  defenderTalentCtx: Record<string, number>;
}> {
  const attackerTalentCtx = ctx.talentService
    ? await ctx.talentService.computeTalentContext(attackerUserId)
    : {};
  const defenderTalentCtx = ctx.talentService
    ? await ctx.talentService.computeTalentContext(defenderUserId, defenderPlanetId)
    : {};

  const attackerMultipliers = await getCombatMultipliers(ctx.db, attackerUserId, config.bonuses, attackerTalentCtx);
  const defenderMultipliers = await getCombatMultipliers(ctx.db, defenderUserId, config.bonuses, defenderTalentCtx);

  // Additional defense strength bonus (planet_bonus — only when flagship stationed)
  const defenseBonus = 1 + (defenderTalentCtx['defense_strength'] ?? 0);
  defenderMultipliers.weapons *= defenseBonus;
  defenderMultipliers.shielding *= defenseBonus;
  defenderMultipliers.armor *= defenseBonus;

  return { attackerMultipliers, defenderMultipliers, attackerTalentCtx, defenderTalentCtx };
}

// ── Apply defender losses (ships + defenses with repair) to DB ──

export async function applyDefenderLosses(
  db: Database,
  planetId: string,
  defShipsRow: Record<string, unknown> | undefined,
  defDefsRow: Record<string, unknown> | undefined,
  defenderLosses: Record<string, number>,
  repairedDefenses: Record<string, number>,
): Promise<void> {
  if (defShipsRow) {
    const shipUpdates: Record<string, any> = {};
    for (const key of Object.keys(defShipsRow)) {
      if (key === 'planetId') continue;
      const lost = defenderLosses[key] ?? 0;
      if (lost > 0) {
        const col = planetShips[key as keyof typeof planetShips];
        shipUpdates[key] = sql`GREATEST(${col} - ${lost}, 0)`;
      }
    }
    if (Object.keys(shipUpdates).length > 0) {
      await db.update(planetShips).set(shipUpdates).where(eq(planetShips.planetId, planetId));
    }
  }

  if (defDefsRow) {
    const defUpdates: Record<string, any> = {};
    for (const key of Object.keys(defDefsRow)) {
      if (key === 'planetId') continue;
      const lost = defenderLosses[key] ?? 0;
      const repaired = repairedDefenses[key] ?? 0;
      const netLoss = lost - repaired;
      if (netLoss > 0) {
        const col = planetDefenses[key as keyof typeof planetDefenses];
        defUpdates[key] = sql`GREATEST(${col} - ${netLoss}, 0)`;
      }
    }
    if (Object.keys(defUpdates).length > 0) {
      await db.update(planetDefenses).set(defUpdates).where(eq(planetDefenses.planetId, planetId));
    }
  }
}

// ── Atomic debris upsert using onConflictDoUpdate ──

export async function upsertDebris(
  db: Database,
  galaxy: number,
  system: number,
  position: number,
  debris: { minerai: number; silicium: number },
): Promise<void> {
  if (debris.minerai <= 0 && debris.silicium <= 0) return;
  await db.insert(debrisFields).values({
    galaxy,
    system,
    position,
    minerai: String(debris.minerai),
    silicium: String(debris.silicium),
  }).onConflictDoUpdate({
    target: [debrisFields.galaxy, debrisFields.system, debrisFields.position],
    set: {
      minerai: sql`${debrisFields.minerai}::numeric + ${String(debris.minerai)}::numeric`,
      silicium: sql`${debrisFields.silicium}::numeric + ${String(debris.silicium)}::numeric`,
      updatedAt: new Date(),
    },
  });
}

// ── Compute FP for both sides ──

export function computeBothFP(
  config: GameConfig,
  attackerFleet: Record<string, number>,
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number>,
  shipCombatConfigs: Record<string, ShipCombatConfig>,
): { attackerFP: number; defenderFP: number } {
  const unitCombatStats: Record<string, UnitCombatStats> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    unitCombatStats[id] = {
      weapons: ship.weapons,
      shotCount: ship.shotCount ?? 1,
      shield: ship.shield,
      hull: ship.hull,
      weaponProfiles: ship.weaponProfiles,
    };
  }
  for (const [id, def] of Object.entries(config.defenses)) {
    unitCombatStats[id] = {
      weapons: def.weapons,
      shotCount: def.shotCount ?? 1,
      shield: def.shield,
      hull: def.hull,
      weaponProfiles: def.weaponProfiles,
    };
  }
  // Include flagship in FP calculation if present
  if (shipCombatConfigs['flagship']) {
    const fc = shipCombatConfigs['flagship'];
    unitCombatStats['flagship'] = {
      weapons: fc.baseWeaponDamage,
      shotCount: fc.baseShotCount,
      shield: fc.baseShield,
      hull: fc.baseHull,
      weaponProfiles: fc.weapons,
    };
  }
  const fpConfig: FPConfig = {
    shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
    divisor: Number(config.universe.fp_divisor) || 100,
  };
  const attackerFP = computeFleetFP(attackerFleet, unitCombatStats, fpConfig);
  const defenderCombined: Record<string, number> = { ...defenderFleet, ...defenderDefenses };
  const defenderFP = computeFleetFP(defenderCombined, unitCombatStats, fpConfig);
  return { attackerFP, defenderFP };
}

// ── Compute shots per round ──

export function computeShotsPerRound(
  config: GameConfig,
  attackerFleet: Record<string, number>,
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number>,
  rounds: RoundResult[],
): Array<{ attacker: number; defender: number }> {
  return rounds.map((_round, i) => {
    const attFleet = i === 0 ? attackerFleet : rounds[i - 1].attackerShips;
    const defFleetRound = i === 0 ? { ...defenderFleet, ...defenderDefenses } : rounds[i - 1].defenderShips;
    const attShots = Object.entries(attFleet).reduce((sum, [id, count]) => {
      const sc = config.ships[id]?.shotCount ?? config.defenses[id]?.shotCount ?? 1;
      return sum + count * sc;
    }, 0);
    const defShots = Object.entries(defFleetRound).reduce((sum, [id, count]) => {
      const sc = config.ships[id]?.shotCount ?? config.defenses[id]?.shotCount ?? 1;
      return sum + count * sc;
    }, 0);
    return { attacker: attShots, defender: defShots };
  });
}

// ── Compute attacker surviving ships ──

export function computeAttackerSurvivors(
  fleet: Record<string, number>,
  attackerLosses: Record<string, number>,
): Record<string, number> {
  const survivors: Record<string, number> = { ...fleet };
  for (const [type, lost] of Object.entries(attackerLosses)) {
    survivors[type] = (survivors[type] ?? 0) - lost;
    if (survivors[type] <= 0) delete survivors[type];
  }
  return survivors;
}

// ── Compute defender survivors ──

export function computeDefenderSurvivors(
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number>,
  defenderLosses: Record<string, number>,
  repairedDefenses: Record<string, number>,
): Record<string, number> {
  const combined: Record<string, number> = { ...defenderFleet, ...defenderDefenses };
  const survivors: Record<string, number> = {};
  for (const [type, count] of Object.entries(combined)) {
    const remaining = count - (defenderLosses[type] ?? 0) + (repairedDefenses[type] ?? 0);
    if (remaining > 0) survivors[type] = remaining;
  }
  return survivors;
}

// ── Fetch usernames for both players ──

export async function fetchUsernames(
  db: Database,
  attackerUserId: string,
  defenderUserId: string,
): Promise<{ attackerUsername: string; defenderUsername: string }> {
  const [[attackerUser], [defenderUser]] = await Promise.all([
    db.select({ username: users.username }).from(users).where(eq(users.id, attackerUserId)).limit(1),
    db.select({ username: users.username }).from(users).where(eq(users.id, defenderUserId)).limit(1),
  ]);
  return {
    attackerUsername: attackerUser?.username ?? 'Inconnu',
    defenderUsername: defenderUser?.username ?? 'Inconnu',
  };
}

// ── Build combat report data object ──

export function buildCombatReportData(params: {
  outcome: 'attacker' | 'defender' | 'draw';
  attackerUsername: string;
  defenderUsername: string;
  targetPlanetName: string;
  attackerFleet: Record<string, number>;
  defenderFleet: Record<string, number>;
  defenderDefenses: Record<string, number>;
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
  attackerSurvivors: Record<string, number>;
  repairedDefenses: Record<string, number>;
  debris: { minerai: number; silicium: number };
  rounds: RoundResult[];
  attackerStats?: unknown;
  defenderStats?: unknown;
  attackerFP: number;
  defenderFP: number;
  shotsPerRound: Array<{ attacker: number; defender: number }>;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const {
    outcome,
    attackerUsername,
    defenderUsername,
    targetPlanetName,
    attackerFleet,
    defenderFleet,
    defenderDefenses,
    attackerLosses,
    defenderLosses,
    attackerSurvivors,
    repairedDefenses,
    debris,
    rounds,
    attackerStats,
    defenderStats,
    attackerFP,
    defenderFP,
    shotsPerRound,
    extra,
  } = params;

  return {
    outcome,
    perspective: 'attacker' as const,
    attackerUsername,
    defenderUsername,
    targetPlanetName,
    roundCount: rounds.length,
    attackerFleet,
    attackerLosses,
    attackerSurvivors,
    defenderFleet,
    defenderDefenses,
    defenderLosses,
    defenderSurvivors: computeDefenderSurvivors(defenderFleet, defenderDefenses, defenderLosses, repairedDefenses),
    repairedDefenses,
    debris,
    rounds,
    attackerStats,
    defenderStats,
    attackerFP,
    defenderFP,
    shotsPerRound,
    ...extra,
  };
}

// ── Outcome text helpers ──

export function outcomeText(outcome: 'attacker' | 'defender' | 'draw'): string {
  if (outcome === 'attacker') return 'Victoire';
  if (outcome === 'defender') return 'Défaite';
  return 'Match nul';
}

export function defenderOutcome(outcome: 'attacker' | 'defender' | 'draw'): string {
  if (outcome === 'attacker') return 'Défaite';
  if (outcome === 'defender') return 'Victoire';
  return 'Match nul';
}

// Re-export helpers used by handlers to avoid changing import paths
export { buildShipCombatConfigs, buildShipCosts };
