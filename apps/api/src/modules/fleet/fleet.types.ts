import { eq } from 'drizzle-orm';
import { userResearch } from '@exilium/db';
import type { Database } from '@exilium/db';
import { resolveBonus } from '@exilium/game-engine';
import type { BonusDefinition, CombatMultipliers, ShipStats, ShipCombatConfig } from '@exilium/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { createMessageService } from '../message/message.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createPveService } from '../pve/pve.service.js';
import type { createAsteroidBeltService } from '../pve/asteroid-belt.service.js';
import type { createPirateService } from '../pve/pirate.service.js';
import type { createReportService } from '../report/report.service.js';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { createDailyQuestService } from '../daily-quest/daily-quest.service.js';
import type { createFlagshipService } from '../flagship/flagship.service.js';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';

// ── Input types ──

export interface SendFleetInput {
  userId?: string;
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: string;
  ships: Record<string, number>;
  mineraiCargo?: number;
  siliciumCargo?: number;
  hydrogeneCargo?: number;
  pveMissionId?: string;
  tradeId?: string;
  targetPriority?: string;  // combat category ID for target priority
}

export interface ResourceCargo {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

// ── Fleet event type (matches DB row) ──

export type FleetEvent = {
  id: string;
  userId: string;
  originPlanetId: string;
  targetPlanetId: string | null;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: string;
  phase: string;
  status: string;
  departureTime: Date;
  arrivalTime: Date;
  mineraiCargo: string;
  siliciumCargo: string;
  hydrogeneCargo: string;
  ships: Record<string, number>;
  metadata: unknown;
  pveMissionId: string | null;
  tradeId: string | null;
  targetPriority: string | null;
};

// ── Handler context ──

export type GameConfig = Awaited<ReturnType<GameConfigService['getFullConfig']>>;

export interface MissionHandlerContext {
  db: Database;
  resourceService: ReturnType<typeof createResourceService>;
  gameConfigService: GameConfigService;
  messageService?: ReturnType<typeof createMessageService>;
  pveService?: ReturnType<typeof createPveService>;
  asteroidBeltService?: ReturnType<typeof createAsteroidBeltService>;
  pirateService?: ReturnType<typeof createPirateService>;
  reportService?: ReturnType<typeof createReportService>;
  exiliumService?: ReturnType<typeof createExiliumService>;
  dailyQuestService?: ReturnType<typeof createDailyQuestService>;
  flagshipService?: ReturnType<typeof createFlagshipService>;
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> };
  fleetQueue: Queue;
  assetsDir: string;
  redis?: Redis;
}

// ── Result types ──

export interface ArrivalResult {
  scheduleReturn: boolean;
  schedulePhase?: {
    jobName: string;
    delayMs: number;
  };
  cargo?: ResourceCargo;
  shipsAfterArrival?: Record<string, number>;
  completePveMission?: boolean;
  createReturnEvent?: Record<string, unknown>;
  reportId?: string;
}

export interface PhaseResult {
  scheduleNextPhase?: {
    jobName: string;
    delayMs: number;
  };
  scheduleReturn?: boolean;
  cargo?: ResourceCargo;
  updateFleet?: Record<string, unknown>;
  completePveMission?: boolean;
  reportId?: string;
}

// ── Handler interfaces ──
// NOTE: No processReturn — return logic is 100% common (restore ships, deposit cargo, mark completed).
// Handlers own mission-specific logic via processArrival (and processPhase for mine).
// Handlers CAN do DB reads/writes for their mission logic but NEVER touch queues or notifications.

export interface MissionHandler {
  validateFleet(input: SendFleetInput, config: GameConfig, ctx: MissionHandlerContext): Promise<void>;
  processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult>;
}

export interface PhasedMissionHandler extends MissionHandler {
  processPhase(phase: string, fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<PhaseResult>;
}

// ── Duration formatting ──

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

// ── Shared helpers (moved from fleet.service.ts) ──

export function buildShipStatsMap(config: GameConfig): Record<string, ShipStats> {
  const map: Record<string, ShipStats> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    map[id] = {
      baseSpeed: ship.baseSpeed,
      fuelConsumption: ship.fuelConsumption,
      cargoCapacity: ship.cargoCapacity,
      driveType: ship.driveType as ShipStats['driveType'],
      miningExtraction: ship.miningExtraction ?? 0,
    };
  }
  return map;
}

/** @deprecated Use buildShipCombatConfigs instead — kept for backward compatibility with handlers not yet migrated. */
export function buildCombatStats(config: GameConfig) {
  const stats: Record<string, { weapons: number; shield: number; hull: number }> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    stats[id] = { weapons: ship.weapons, shield: ship.shield, hull: ship.hull };
  }
  for (const [id, def] of Object.entries(config.defenses)) {
    stats[id] = { weapons: def.weapons, shield: def.shield, hull: def.hull };
  }
  return stats;
}

export function buildShipCombatConfigs(config: GameConfig): Record<string, ShipCombatConfig> {
  const configs: Record<string, ShipCombatConfig> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    configs[id] = {
      shipType: id,
      categoryId: ship.combatCategoryId ?? 'support',
      baseShield: ship.shield,
      baseArmor: ship.baseArmor ?? 0,
      baseHull: ship.hull,
      baseWeaponDamage: ship.weapons,
      baseShotCount: ship.shotCount ?? 1,
    };
  }
  for (const [id, def] of Object.entries(config.defenses)) {
    configs[id] = {
      shipType: id,
      categoryId: def.combatCategoryId ?? 'heavy',
      baseShield: def.shield,
      baseArmor: def.baseArmor ?? 0,
      baseHull: def.hull,
      baseWeaponDamage: def.weapons,
      baseShotCount: def.shotCount ?? 1,
    };
  }
  return configs;
}

export function buildShipCosts(config: GameConfig) {
  const costs: Record<string, { minerai: number; silicium: number }> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    costs[id] = { minerai: ship.cost.minerai, silicium: ship.cost.silicium };
  }
  return costs;
}

export async function getCombatMultipliers(
  db: Database,
  userId: string,
  bonusDefs: BonusDefinition[],
  talentCtx?: Record<string, number>,
): Promise<CombatMultipliers> {
  const [research] = await db
    .select()
    .from(userResearch)
    .where(eq(userResearch.userId, userId))
    .limit(1);

  const { userId: _, ...levels } = research ?? {};

  return {
    weapons: resolveBonus('weapons', null, levels as Record<string, number>, bonusDefs) * (1 + (talentCtx?.['combat_weapons'] ?? 0)),
    shielding: resolveBonus('shielding', null, levels as Record<string, number>, bonusDefs) * (1 + (talentCtx?.['combat_shield'] ?? 0)),
    armor: resolveBonus('armor', null, levels as Record<string, number>, bonusDefs) * (1 + (talentCtx?.['combat_armor'] ?? 0)),
  };
}
