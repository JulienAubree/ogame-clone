import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { anomalies, planets, planetShips } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  anomalyLoot,
  anomalyEnemyRecoveryCount,
} from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { createFlagshipService } from '../flagship/flagship.service.js';
import { runAnomalyNode, type FleetEntry } from './anomaly.combat.js';

type AnomalyRow = typeof anomalies.$inferSelect;
type FleetMap = Record<string, FleetEntry>;
type LootShipsMap = Record<string, number>;

export function createAnomalyService(
  db: Database,
  gameConfigService: GameConfigService,
  exiliumService: ReturnType<typeof createExiliumService>,
  flagshipService: ReturnType<typeof createFlagshipService>,
) {
  async function loadActive(userId: string): Promise<AnomalyRow | null> {
    const [row] = await db.select().from(anomalies)
      .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
      .limit(1);
    return row ?? null;
  }

  async function getHomeworld(userId: string) {
    const [row] = await db.select({ id: planets.id })
      .from(planets)
      .where(and(eq(planets.userId, userId), eq(planets.planetClassId, 'homeworld')))
      .orderBy(asc(planets.createdAt))
      .limit(1);
    return row ?? null;
  }

  function nodeTravelMs(config: Awaited<ReturnType<GameConfigService['getFullConfig']>>): number {
    const seconds = Number(config.universe.anomaly_node_travel_seconds) || 600;
    return seconds * 1000;
  }

  return {
    /** Returns the user's active anomaly, or null. */
    async current(userId: string) {
      return loadActive(userId);
    },

    /**
     * Engage an anomaly: validate flagship + ships available, spend Exilium,
     * lock fleet, create the run row.
     */
    async engage(userId: string, input: { originPlanetId: string; ships: Record<string, number> }) {
      // 1. Already active?
      const active = await loadActive(userId);
      if (active) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Une anomalie est déjà en cours' });
      }

      // 2. Flagship validation
      const flagship = await flagshipService.get(userId);
      if (!flagship) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral requis' });
      }
      if (flagship.status !== 'active') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral indisponible' });
      }
      if (flagship.planetId !== input.originPlanetId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Le vaisseau amiral n'est pas sur cette planète" });
      }

      // 3. Origin must be a planet owned by the user
      const [origin] = await db.select({ id: planets.id, userId: planets.userId })
        .from(planets).where(eq(planets.id, input.originPlanetId)).limit(1);
      if (!origin || origin.userId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Planète invalide' });
      }

      // 4. Ships available
      const [shipsRow] = await db.select().from(planetShips)
        .where(eq(planetShips.planetId, input.originPlanetId)).limit(1);
      if (!shipsRow) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun vaisseau sur cette planète' });
      }
      // Ensure flagship is included exactly once (the player can't choose count for it)
      const shipsToEngage: Record<string, number> = { ...input.ships, flagship: 1 };
      for (const [shipId, count] of Object.entries(shipsToEngage)) {
        if (count <= 0) continue;
        if (shipId === 'flagship') continue; // counted via flagshipService
        const available = (shipsRow as Record<string, unknown>)[shipId];
        if (typeof available !== 'number' || available < count) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Vaisseaux insuffisants pour ${shipId} (${available ?? 0}/${count})`,
          });
        }
      }

      // 5. Spend Exilium
      const config = await gameConfigService.getFullConfig();
      const cost = Number(config.universe.anomaly_entry_cost_exilium) || 5;
      await exiliumService.spend(userId, cost, 'pve', { source: 'anomaly_engage' });

      // 6. Lock flagship
      await flagshipService.setInMission(userId);

      // 7. Decrement planet_ships (non-flagship)
      const shipUpdates: Record<string, unknown> = {};
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count > 0 && shipId !== 'flagship') {
          const col = (planetShips as unknown as Record<string, unknown>)[shipId];
          if (col) {
            shipUpdates[shipId] = sql`GREATEST(${col} - ${count}, 0)`;
          }
        }
      }
      if (Object.keys(shipUpdates).length > 0) {
        await db.update(planetShips).set(shipUpdates as never)
          .where(eq(planetShips.planetId, input.originPlanetId));
      }

      // 8. Build initial fleet (with flagship + selected ships, all hullPercent=1)
      const fleet: FleetMap = { flagship: { count: 1, hullPercent: 1 } };
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count > 0 && shipId !== 'flagship') {
          fleet[shipId] = { count, hullPercent: 1 };
        }
      }

      // 9. Insert anomaly row
      const nextNodeAt = new Date(Date.now() + nodeTravelMs(config));
      const [created] = await db.insert(anomalies).values({
        userId,
        originPlanetId: input.originPlanetId,
        status: 'active',
        currentDepth: 0,
        fleet,
        exiliumPaid: cost,
        nextNodeAt,
      }).returning();

      return created;
    },

    /**
     * Resolve the next combat node. Caller must wait until next_node_at has passed.
     */
    async advance(userId: string) {
      const row = await loadActive(userId);
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
      }
      if (row.nextNodeAt && row.nextNodeAt > new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Anomalie pas encore prête — attendez le prochain noeud' });
      }

      const fleet = row.fleet as FleetMap;
      const newDepth = row.currentDepth + 1;

      // Run combat
      const result = await runAnomalyNode(db, gameConfigService, {
        userId,
        fleet,
        depth: newDepth,
      });

      const config = await gameConfigService.getFullConfig();

      // Wipe conditions:
      // - flagship destroyed (no longer in survivors)
      // - or no surviving ships at all
      const flagshipSurvived = !!result.attackerSurvivors['flagship'];
      const anySurvivor = Object.keys(result.attackerSurvivors).length > 0;
      const wiped = !flagshipSurvived || !anySurvivor || result.outcome !== 'attacker';

      if (wiped) {
        await db.update(anomalies).set({
          status: 'wiped',
          fleet: result.attackerSurvivors,
          completedAt: new Date(),
          nextNodeAt: null,
        }).where(eq(anomalies.id, row.id));

        // Incapacitate flagship if it was destroyed in combat
        if (!flagshipSurvived) {
          await flagshipService.incapacitate(userId);
        } else {
          // Otherwise just release it back to home
          const home = await getHomeworld(userId);
          if (home) await flagshipService.returnFromMission(userId, home.id);
        }

        return {
          outcome: 'wiped' as const,
          fleet: result.attackerSurvivors,
          enemyFP: result.enemyFP,
          combatRounds: result.combatRounds,
        };
      }

      // Survived: ajouter loot + recovered enemy ships, push next_node_at
      const lootBase = Number(config.universe.anomaly_loot_base) || 5000;
      const lootGrowth = Number(config.universe.anomaly_loot_growth) || 1.4;
      const recoveryRatio = Number(config.universe.anomaly_enemy_recovery_ratio) || 0.15;

      const loot = anomalyLoot(newDepth, lootBase, lootGrowth);
      const recovered = anomalyEnemyRecoveryCount(result.enemyDestroyed, recoveryRatio);

      const currentLootShips = (row.lootShips ?? {}) as LootShipsMap;
      const mergedLootShips: LootShipsMap = { ...currentLootShips };
      for (const [shipId, count] of Object.entries(recovered)) {
        mergedLootShips[shipId] = (mergedLootShips[shipId] ?? 0) + count;
      }

      const nextNodeAt = new Date(Date.now() + nodeTravelMs(config));
      await db.update(anomalies).set({
        currentDepth: newDepth,
        fleet: result.attackerSurvivors,
        lootMinerai: sql`${anomalies.lootMinerai} + ${loot.minerai}`,
        lootSilicium: sql`${anomalies.lootSilicium} + ${loot.silicium}`,
        lootHydrogene: sql`${anomalies.lootHydrogene} + ${loot.hydrogene}`,
        lootShips: mergedLootShips,
        nextNodeAt,
      }).where(eq(anomalies.id, row.id));

      return {
        outcome: 'survived' as const,
        fleet: result.attackerSurvivors,
        enemyFP: result.enemyFP,
        combatRounds: result.combatRounds,
        nodeLoot: loot,
        recoveredShips: recovered,
        depth: newDepth,
        nextNodeAt: nextNodeAt.toISOString(),
      };
    },

    /**
     * Voluntarily abandon the run: refund Exilium, return ships + loot to homeworld.
     */
    async retreat(userId: string) {
      const row = await loadActive(userId);
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
      }

      const home = await getHomeworld(userId);
      if (!home) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Planète mère introuvable' });
      }

      const fleet = row.fleet as FleetMap;
      const lootShips = (row.lootShips ?? {}) as LootShipsMap;

      // Mark completed
      await db.update(anomalies).set({
        status: 'completed',
        completedAt: new Date(),
        nextNodeAt: null,
      }).where(eq(anomalies.id, row.id));

      // Refund Exilium
      if (row.exiliumPaid > 0) {
        await exiliumService.earn(userId, row.exiliumPaid, 'pve', { source: 'anomaly_retreat' });
      }

      // Credit resources to homeworld
      const lootMinerai = Number(row.lootMinerai);
      const lootSilicium = Number(row.lootSilicium);
      const lootHydrogene = Number(row.lootHydrogene);
      if (lootMinerai > 0 || lootSilicium > 0 || lootHydrogene > 0) {
        await db.update(planets).set({
          minerai: sql`${planets.minerai} + ${lootMinerai}`,
          silicium: sql`${planets.silicium} + ${lootSilicium}`,
          hydrogene: sql`${planets.hydrogene} + ${lootHydrogene}`,
        }).where(eq(planets.id, home.id));
      }

      // Reinject surviving ships (excluding flagship) + recovered enemy ships
      const shipIncrements: Record<string, unknown> = {};
      for (const [shipId, entry] of Object.entries(fleet)) {
        if (shipId === 'flagship') continue;
        if (entry.count > 0) {
          const col = (planetShips as unknown as Record<string, unknown>)[shipId];
          if (col) {
            shipIncrements[shipId] = sql`${col} + ${entry.count}`;
          }
        }
      }
      for (const [shipId, count] of Object.entries(lootShips)) {
        if (count > 0) {
          const col = (planetShips as unknown as Record<string, unknown>)[shipId];
          if (col) {
            const existing = shipIncrements[shipId];
            shipIncrements[shipId] = existing
              ? sql`${col} + ${(fleet[shipId]?.count ?? 0) + count}`
              : sql`${col} + ${count}`;
          }
        }
      }
      if (Object.keys(shipIncrements).length > 0) {
        await db.update(planetShips).set(shipIncrements as never)
          .where(eq(planetShips.planetId, home.id));
      }

      // Release flagship back to homeworld
      await flagshipService.returnFromMission(userId, home.id);

      return { ok: true };
    },

    /** Last N completed/wiped runs for the user. */
    async history(userId: string, limit = 10) {
      return db.select().from(anomalies)
        .where(and(eq(anomalies.userId, userId), inArray(anomalies.status, ['completed', 'wiped'])))
        .orderBy(desc(anomalies.completedAt))
        .limit(limit);
    },
  };
}

export type AnomalyService = ReturnType<typeof createAnomalyService>;
