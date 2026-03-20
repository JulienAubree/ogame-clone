import { eq } from 'drizzle-orm';
import { userResearch } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { resolveBonus } from '@ogame-clone/game-engine';
import type { BonusDefinition, CombatMultipliers, ShipStats } from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { createMessageService } from '../message/message.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createPveService } from '../pve/pve.service.js';
import type { createAsteroidBeltService } from '../pve/asteroid-belt.service.js';
import type { createPirateService } from '../pve/pirate.service.js';
import type { createReportService } from '../report/report.service.js';
import type { Queue } from 'bullmq';

// ── Input types ──

export interface SendFleetInput {
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: 'transport' | 'station' | 'spy' | 'attack' | 'colonize' | 'recycle' | 'mine' | 'pirate';
  ships: Record<string, number>;
  mineraiCargo?: number;
  siliciumCargo?: number;
  hydrogeneCargo?: number;
  pveMissionId?: string;
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
  fleetQueue: Queue;
  universeSpeed: number;
  assetsDir: string;
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
    };
  }
  return map;
}

export function buildCombatStats(config: GameConfig) {
  const stats: Record<string, { weapons: number; shield: number; armor: number }> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    stats[id] = { weapons: ship.weapons, shield: ship.shield, armor: ship.armor };
  }
  for (const [id, def] of Object.entries(config.defenses)) {
    stats[id] = { weapons: def.weapons, shield: def.shield, armor: def.armor };
  }
  return stats;
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
): Promise<CombatMultipliers> {
  const [research] = await db
    .select({
      weapons: userResearch.weapons,
      shielding: userResearch.shielding,
      armor: userResearch.armor,
    })
    .from(userResearch)
    .where(eq(userResearch.userId, userId))
    .limit(1);

  const levels: Record<string, number> = {
    weapons: research?.weapons ?? 0,
    shielding: research?.shielding ?? 0,
    armor: research?.armor ?? 0,
  };

  return {
    weapons: resolveBonus('weapons', null, levels, bonusDefs),
    shielding: resolveBonus('shielding', null, levels, bonusDefs),
    armor: resolveBonus('armor', null, levels, bonusDefs),
  };
}
