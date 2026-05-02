import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { anomalies, planets, planetShips, users, userExilium, exiliumLog } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  anomalyLoot,
  anomalyEnemyRecoveryCount,
  applyOutcomeToFleet,
  pickEventForTier,
  pickEventGap,
  tierForDepth,
} from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { createFlagshipService } from '../flagship/flagship.service.js';
import type { createReportService } from '../report/report.service.js';
import type { createAnomalyContentService } from '../anomaly-content/anomaly-content.service.js';
import { buildCombatReportData } from '../fleet/combat.helpers.js';
import { runAnomalyNode, generateAnomalyEnemy, type FleetEntry } from './anomaly.combat.js';

type AnomalyRow = typeof anomalies.$inferSelect;
type FleetMap = Record<string, FleetEntry>;
type LootShipsMap = Record<string, number>;

export function createAnomalyService(
  db: Database,
  gameConfigService: GameConfigService,
  exiliumService: ReturnType<typeof createExiliumService>,
  flagshipService: ReturnType<typeof createFlagshipService>,
  reportService: ReturnType<typeof createReportService>,
  anomalyContentService: ReturnType<typeof createAnomalyContentService>,
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

  /** True if a ship id corresponds to an actual column in planet_ships. */
  function validShipColumn(shipId: string): boolean {
    return shipId in (planetShips as unknown as Record<string, unknown>);
  }

  return {
    /** Returns the user's active anomaly, or null. */
    async current(userId: string) {
      return loadActive(userId);
    },

    /**
     * Engage an anomaly. Wrapped in a transaction with a per-user advisory lock
     * so concurrent engage / advance / retreat from the same user are serialized.
     * All resource mutations (Exilium spend, planet_ships decrement, flagship
     * setInMission, anomaly row insert) commit atomically — no partial state
     * if one of them fails.
     */
    async engage(userId: string, input: { ships: Record<string, number> }) {
      // Sanitize input outside the transaction (no DB calls needed)
      const config = await gameConfigService.getFullConfig();
      const validShipIds = new Set(Object.keys(config.ships));
      const sanitizedShips: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (shipId === 'flagship') continue;
        if (count <= 0) continue;
        if (!validShipIds.has(shipId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Type de vaisseau invalide : ${shipId}` });
        }
        const def = config.ships[shipId];
        if (!def || def.role !== 'combat') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Seuls les vaisseaux de combat sont autorisés dans une anomalie (refusé : ${shipId})`,
          });
        }
        sanitizedShips[shipId] = count;
      }

      const cost = Number(config.universe.anomaly_entry_cost_exilium) || 5;

      return await db.transaction(async (tx) => {
        // 1. Per-user advisory lock — serializes engage / advance / retreat
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        // 2. No active anomaly
        const [active] = await tx.select({ id: anomalies.id }).from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .limit(1);
        if (active) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Une anomalie est déjà en cours' });
        }

        // 3. Flagship validation (read directly from DB to avoid lazy-revert side effects)
        const flagship = await flagshipService.get(userId);
        if (!flagship) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral requis' });
        }
        if (flagship.status !== 'active') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral indisponible' });
        }
        const originPlanetId = flagship.planetId;

        // 4. Origin planet ownership
        const [origin] = await tx.select({ id: planets.id, userId: planets.userId })
          .from(planets).where(eq(planets.id, originPlanetId)).limit(1);
        if (!origin || origin.userId !== userId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Planète invalide' });
        }

        // 5. Lock planet_ships row, validate availability
        const [shipsRow] = await tx.select().from(planetShips)
          .where(eq(planetShips.planetId, originPlanetId))
          .for('update')
          .limit(1);
        if (!shipsRow) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun vaisseau sur cette planète' });
        }
        for (const [shipId, count] of Object.entries(sanitizedShips)) {
          const available = (shipsRow as Record<string, unknown>)[shipId];
          if (typeof available !== 'number' || available < count) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Vaisseaux insuffisants pour ${shipId} (${available ?? 0}/${count})`,
            });
          }
        }

        // 6. Spend Exilium inline (with lock-for-update on the balance row)
        const [exRecord] = await tx.select({ balance: userExilium.balance })
          .from(userExilium)
          .where(eq(userExilium.userId, userId))
          .for('update')
          .limit(1);
        if (!exRecord || exRecord.balance < cost) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Solde Exilium insuffisant (${exRecord?.balance ?? 0} disponible, ${cost} requis)`,
          });
        }
        await tx.update(userExilium).set({
          balance: sql`${userExilium.balance} - ${cost}`,
          totalSpent: sql`${userExilium.totalSpent} + ${cost}`,
          updatedAt: new Date(),
        }).where(eq(userExilium.userId, userId));
        await tx.insert(exiliumLog).values({
          userId, amount: -cost, source: 'pve', details: { source: 'anomaly_engage' },
        });

        // 7. Flagship → in_mission
        await flagshipService.setInMission(userId);

        // 8. Decrement planet_ships
        const shipUpdates: Record<string, unknown> = {};
        for (const [shipId, count] of Object.entries(sanitizedShips)) {
          const col = (planetShips as unknown as Record<string, unknown>)[shipId];
          if (col) {
            shipUpdates[shipId] = sql`${col} - ${count}`;
          }
        }
        if (Object.keys(shipUpdates).length > 0) {
          await tx.update(planetShips).set(shipUpdates as never)
            .where(eq(planetShips.planetId, originPlanetId));
        }

        // 9. Build fleet + pre-generate first enemy
        const fleet: FleetMap = { flagship: { count: 1, hullPercent: 1 } };
        for (const [shipId, count] of Object.entries(sanitizedShips)) {
          fleet[shipId] = { count, hullPercent: 1 };
        }
        const firstEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, {
          userId,
          fleet,
          depth: 1,
        });

        // 10. Insert anomaly row — first node is always combat; pre-roll the
        // gap to the first event (uniform {2,3,4} → ~6-7 events on a 20-deep run).
        const nextNodeAt = new Date(Date.now() + nodeTravelMs(config));
        const [created] = await tx.insert(anomalies).values({
          userId,
          originPlanetId,
          status: 'active',
          currentDepth: 0,
          fleet,
          exiliumPaid: cost,
          nextNodeAt,
          nextEnemyFleet: firstEnemy.enemyFleet,
          nextEnemyFp: Math.round(firstEnemy.enemyFP),
          nextNodeType: 'combat',
          combatsUntilNextEvent: pickEventGap(Math.random),
        }).returning();

        return created;
      });
    },

    /**
     * Resolve the next combat node. Wrapped in a transaction with a per-user
     * advisory lock + SELECT FOR UPDATE on the anomaly row, so concurrent
     * advance / retreat from the same user are serialized.
     */
    async advance(userId: string) {
      return await db.transaction(async (tx) => {
        // Advisory lock per user — serializes advance / retreat / engage
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        const [row] = await tx.select().from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .for('update')
          .limit(1);
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
        }
        if (row.nextNodeType === 'event') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Un événement est en attente — résolvez-le avant de combattre',
          });
        }
        if (row.nextNodeAt && row.nextNodeAt > new Date()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Anomalie pas encore prête — attendez le prochain noeud' });
        }

        const fleet = row.fleet as FleetMap;
        const newDepth = row.currentDepth + 1;

      // Use the pre-generated enemy that the player has been previewing.
      // Fallback: regenerate one (legacy rows without next_enemy_fleet).
      let predefinedEnemy: { fleet: Record<string, number>; fp: number };
      if (row.nextEnemyFleet && row.nextEnemyFp != null) {
        predefinedEnemy = {
          fleet: row.nextEnemyFleet as Record<string, number>,
          fp: row.nextEnemyFp,
        };
      } else {
        const generated = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, {
          userId,
          fleet,
          depth: newDepth,
        });
        predefinedEnemy = { fleet: generated.enemyFleet, fp: Math.round(generated.enemyFP) };
      }

      // Run combat with the locked-in enemy
      const result = await runAnomalyNode(tx as unknown as Database, gameConfigService, {
        userId,
        fleet,
        depth: newDepth,
        predefinedEnemy,
      });

      const config = await gameConfigService.getFullConfig();

      // Outcome taxonomy:
      //   - totalWipe   : aucun survivant côté joueur → tout perdu
      //   - forcedRetreat : flagship détruit OU combat perdu, mais des ships
      //                     survivent → retour forcé avec ce qui reste +
      //                     loot rendu + Exilium remboursé. Le flagship est
      //                     incapacité s'il a été détruit.
      //   - survived     : flagship vivant + combat gagné → on peut continuer
      const flagshipSurvived = !!result.attackerSurvivors['flagship'];
      const anySurvivor = Object.keys(result.attackerSurvivors).length > 0;
      const totalWipe = !anySurvivor;
      const forcedRetreat = !totalWipe && (!flagshipSurvived || result.outcome !== 'attacker');

      // ── Build a combat report so the player can review what happened ──
      const [user] = await tx.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
      const attackerUsername = user?.username ?? 'Joueur';
      const reportResult = buildCombatReportData({
        outcome: result.outcome,
        attackerUsername,
        defenderUsername: 'Drones xenotechs',
        targetPlanetName: 'Anomalie gravitationnelle',
        attackerFleet: result.playerInitialFleet,
        defenderFleet: result.enemyInitialFleet,
        defenderDefenses: {},
        attackerLosses: result.attackerLosses,
        defenderLosses: result.defenderLosses,
        attackerSurvivors: Object.fromEntries(
          Object.entries(result.attackerSurvivors).map(([id, e]) => [id, e.count]),
        ),
        repairedDefenses: {},
        debris: result.debris,
        rounds: result.rounds,
        attackerStats: result.attackerStats,
        defenderStats: result.defenderStats,
        attackerFP: result.playerFP,
        defenderFP: result.enemyFP,
        shotsPerRound: result.shotsPerRound,
        extra: { anomalyDepth: newDepth, anomalyId: row.id },
      });
      const outcomeLabel = totalWipe
        ? 'Défaite totale'
        : !flagshipSurvived
          ? 'Vaisseau mère perdu'
          : result.outcome === 'draw'
            ? 'Combat indécis'
            : result.outcome === 'defender'
              ? 'Combat perdu'
              : 'Victoire';
      const report = await reportService.create({
        userId,
        missionType: 'anomaly',
        title: `Anomalie — Profondeur ${newDepth} — ${outcomeLabel}`,
        coordinates: { galaxy: 0, system: 0, position: 0 },
        fleet: {
          ships: result.playerInitialFleet,
          totalCargo: 0,
        },
        departureTime: new Date(),
        completionTime: new Date(),
        result: reportResult,
      });
      const existingReportIds = (row.reportIds ?? []) as string[];
      const updatedReportIds = [...existingReportIds, report.id];

      if (totalWipe) {
        // Tout est mort : pas de retour, Exilium perdu, flagship incapacité.
        // WHERE guards : status='active' AND current_depth=oldDepth → guard
        // contre une advance/retreat parallèle qui aurait déjà transitionné
        // l'état (en pratique impossible grâce au advisory lock, mais
        // ceinture-bretelles).
        const wipedRows = await tx.update(anomalies).set({
          status: 'wiped',
          fleet: result.attackerSurvivors,
          reportIds: updatedReportIds,
          completedAt: new Date(),
          nextNodeAt: null,
          nextEnemyFleet: null,
          nextEnemyFp: null,
        }).where(and(
          eq(anomalies.id, row.id),
          eq(anomalies.status, 'active'),
          eq(anomalies.currentDepth, row.currentDepth),
        )).returning({ id: anomalies.id });
        if (wipedRows.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
        }
        // Note: incapacitate() opens its own context but the advisory lock
        // is per-user, not on flagship row. It's safe.
        await flagshipService.incapacitate(userId);

        return {
          outcome: 'wiped' as const,
          fleet: result.attackerSurvivors,
          enemyFP: result.enemyFP,
          combatRounds: result.combatRounds,
          reportId: report.id,
        };
      }

      if (forcedRetreat) {
        const home = await getHomeworld(userId);
        if (!home) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Planète mère introuvable' });
        }

        const updatedRows = await tx.update(anomalies).set({
          status: 'completed',
          fleet: result.attackerSurvivors,
          reportIds: updatedReportIds,
          completedAt: new Date(),
          nextNodeAt: null,
          nextEnemyFleet: null,
          nextEnemyFp: null,
        }).where(and(
          eq(anomalies.id, row.id),
          eq(anomalies.status, 'active'),
          eq(anomalies.currentDepth, row.currentDepth),
        )).returning({ id: anomalies.id });
        if (updatedRows.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
        }

        // Refund Exilium inline (transaction-safe)
        if (row.exiliumPaid > 0) {
          await tx.update(userExilium).set({
            balance: sql`${userExilium.balance} + ${row.exiliumPaid}`,
            totalEarned: sql`${userExilium.totalEarned} + ${row.exiliumPaid}`,
            updatedAt: new Date(),
          }).where(eq(userExilium.userId, userId));
          await tx.insert(exiliumLog).values({
            userId, amount: row.exiliumPaid, source: 'pve',
            details: { source: 'anomaly_forced_retreat' },
          });
        }

        const lootMinerai = Number(row.lootMinerai);
        const lootSilicium = Number(row.lootSilicium);
        const lootHydrogene = Number(row.lootHydrogene);
        if (lootMinerai > 0 || lootSilicium > 0 || lootHydrogene > 0) {
          await tx.update(planets).set({
            minerai: sql`${planets.minerai} + ${lootMinerai}`,
            silicium: sql`${planets.silicium} + ${lootSilicium}`,
            hydrogene: sql`${planets.hydrogene} + ${lootHydrogene}`,
          }).where(eq(planets.id, home.id));
        }

        // Réinjecte ships survivants (sauf flagship) + recovered ships en 1 update
        const lootShipsMap = (row.lootShips ?? {}) as LootShipsMap;
        const totalToInject: Record<string, number> = {};
        for (const [shipId, entry] of Object.entries(result.attackerSurvivors)) {
          if (shipId === 'flagship') continue;
          if (!validShipColumn(shipId)) continue;
          if (entry.count > 0) totalToInject[shipId] = (totalToInject[shipId] ?? 0) + entry.count;
        }
        for (const [shipId, count] of Object.entries(lootShipsMap)) {
          if (!validShipColumn(shipId)) continue;
          if (count > 0) totalToInject[shipId] = (totalToInject[shipId] ?? 0) + count;
        }
        if (Object.keys(totalToInject).length > 0) {
          const incrementUpdate: Record<string, unknown> = {};
          for (const [shipId, count] of Object.entries(totalToInject)) {
            const col = (planetShips as unknown as Record<string, unknown>)[shipId];
            if (col) incrementUpdate[shipId] = sql`${col} + ${count}`;
          }
          await tx.update(planetShips).set(incrementUpdate as never)
            .where(eq(planetShips.planetId, home.id));
        }

        if (!flagshipSurvived) {
          await flagshipService.incapacitate(userId);
        } else {
          await flagshipService.returnFromMission(userId, home.id);
        }

        return {
          outcome: 'forced_retreat' as const,
          fleet: result.attackerSurvivors,
          enemyFP: result.enemyFP,
          combatRounds: result.combatRounds,
          reportId: report.id,
          flagshipLost: !flagshipSurvived,
          combatOutcome: result.outcome, // 'attacker' | 'defender' | 'draw'
        };
      }

      // Survived
      const lootBase = Number(config.universe.anomaly_loot_base) || 5000;
      const lootGrowth = Number(config.universe.anomaly_loot_growth) || 1.4;
      // Default 0.08 (down from 0.15) + per-type cap = depth — see
      // packages/game-engine/src/formulas/anomaly.ts for rationale.
      const recoveryRatio = Number(config.universe.anomaly_enemy_recovery_ratio) || 0.08;

      const loot = anomalyLoot(newDepth, lootBase, lootGrowth);
      const recovered = anomalyEnemyRecoveryCount(result.enemyDestroyed, newDepth, recoveryRatio);

      const currentLootShips = (row.lootShips ?? {}) as LootShipsMap;
      const mergedLootShips: LootShipsMap = { ...currentLootShips };
      for (const [shipId, count] of Object.entries(recovered)) {
        if (!validShipColumn(shipId)) continue;
        mergedLootShips[shipId] = (mergedLootShips[shipId] ?? 0) + count;
      }

      // ── Decide next node : event vs combat ───────────────────────────────
      // Decrement counter; when it hits 0 try to pick an event of the upcoming
      // tier. If pool is exhausted for that tier, fallback to combat (no error).
      const newCounter = Math.max(0, row.combatsUntilNextEvent - 1);
      const seenEventIds = new Set((row.seenEventIds ?? []) as string[]);
      let nextNodeType: 'combat' | 'event' = 'combat';
      let nextEventId: string | null = null;
      let nextEnemyFleet: Record<string, number> | null = null;
      let nextEnemyFp: number | null = null;
      let nextCounter = newCounter;

      if (newCounter === 0) {
        const content = await anomalyContentService.getContent();
        const tier = tierForDepth(newDepth + 1);
        const pickedEvent = pickEventForTier(content.events, tier, seenEventIds, Math.random);
        if (pickedEvent) {
          nextNodeType = 'event';
          nextEventId = pickedEvent.id;
          // Re-roll the spacing to the *next* event after this one resolves.
          nextCounter = pickEventGap(Math.random);
        }
      }

      // Generate the combat preview only when the next node is a combat.
      if (nextNodeType === 'combat') {
        const nextEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, {
          userId,
          fleet: result.attackerSurvivors,
          depth: newDepth + 1,
        });
        nextEnemyFleet = nextEnemy.enemyFleet;
        nextEnemyFp = Math.round(nextEnemy.enemyFP);
      }

      const nextNodeAt = new Date(Date.now() + nodeTravelMs(config));
      const survivedRows = await tx.update(anomalies).set({
        currentDepth: newDepth,
        fleet: result.attackerSurvivors,
        lootMinerai: sql`${anomalies.lootMinerai} + ${loot.minerai}`,
        lootSilicium: sql`${anomalies.lootSilicium} + ${loot.silicium}`,
        lootHydrogene: sql`${anomalies.lootHydrogene} + ${loot.hydrogene}`,
        lootShips: mergedLootShips,
        reportIds: updatedReportIds,
        nextNodeAt,
        nextEnemyFleet,
        nextEnemyFp,
        nextNodeType,
        nextEventId,
        combatsUntilNextEvent: nextCounter,
      }).where(and(
        eq(anomalies.id, row.id),
        eq(anomalies.status, 'active'),
        eq(anomalies.currentDepth, row.currentDepth),
      )).returning({ id: anomalies.id });
      if (survivedRows.length === 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
      }

      return {
        outcome: 'survived' as const,
        fleet: result.attackerSurvivors,
        enemyFP: result.enemyFP,
        combatRounds: result.combatRounds,
        nodeLoot: loot,
        recoveredShips: recovered,
        depth: newDepth,
        nextNodeAt: nextNodeAt.toISOString(),
        nextNodeType,
        nextEventId,
        reportId: report.id,
      };
      });
    },


    /**
     * Resolve a narrative event by clicking one of its choices. Pure outcomes
     * (resources, hull, ships, exilium) — no combat. Wrapped in a transaction
     * with advisory lock + SELECT FOR UPDATE + WHERE-guards so a concurrent
     * resolve / advance / retreat from the same user is serialized and rejected.
     *
     * Fallback : if the event id has been removed from anomalyContent (admin
     * action mid-run), we silently switch the run to a combat node and surface
     * an explicit error so the UI can refresh.
     */
    async resolveEvent(userId: string, input: { choiceIndex: number }) {
      const choiceIndex = Math.floor(input.choiceIndex);
      if (choiceIndex < 0 || choiceIndex > 2) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Indice de choix invalide' });
      }

      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        const [row] = await tx.select().from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .for('update')
          .limit(1);
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
        }
        if (row.nextNodeType !== 'event' || !row.nextEventId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun événement à résoudre' });
        }
        if (row.nextNodeAt && row.nextNodeAt > new Date()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Anomalie pas encore prête — attendez la fin du transit' });
        }

        const content = await anomalyContentService.getContent();
        const event = content.events.find((e) => e.id === row.nextEventId);

        // Admin removed/disabled the event mid-run → fallback to a combat node
        // so the player isn't stuck. Surface an error to trigger a UI refresh.
        if (!event || !event.enabled) {
          const enemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, {
            userId,
            fleet: row.fleet as FleetMap,
            depth: row.currentDepth + 1,
          });
          const config = await gameConfigService.getFullConfig();
          const newNextAt = new Date(Date.now() + nodeTravelMs(config));
          await tx.update(anomalies).set({
            nextNodeType: 'combat',
            nextEventId: null,
            nextEnemyFleet: enemy.enemyFleet,
            nextEnemyFp: Math.round(enemy.enemyFP),
            nextNodeAt: newNextAt,
          }).where(and(
            eq(anomalies.id, row.id),
            eq(anomalies.status, 'active'),
            eq(anomalies.nextNodeType, 'event'),
          ));
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cet événement n\'est plus disponible — un combat l\'a remplacé',
          });
        }

        if (choiceIndex >= event.choices.length) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choix inexistant pour cet événement' });
        }

        const choice = event.choices[choiceIndex];
        const outcome = choice.outcome;

        // Apply outcome (pure) on the fleet snapshot.
        const fleetBefore = row.fleet as FleetMap;
        const applied = applyOutcomeToFleet(fleetBefore, outcome);

        // Clamp loot at 0 (the run loot can't go negative even with negative deltas).
        const lootMinerai = Math.max(0, Number(row.lootMinerai) + applied.lootDeltas.minerai);
        const lootSilicium = Math.max(0, Number(row.lootSilicium) + applied.lootDeltas.silicium);
        const lootHydrogene = Math.max(0, Number(row.lootHydrogene) + applied.lootDeltas.hydrogene);

        // Apply exilium delta on the user balance (clamp at 0 for negative).
        let exiliumApplied = 0;
        if (applied.exiliumDelta !== 0) {
          const [exRecord] = await tx.select({ balance: userExilium.balance })
            .from(userExilium)
            .where(eq(userExilium.userId, userId))
            .for('update')
            .limit(1);
          const currentBalance = exRecord?.balance ?? 0;
          if (applied.exiliumDelta > 0) {
            await tx.update(userExilium).set({
              balance: sql`${userExilium.balance} + ${applied.exiliumDelta}`,
              totalEarned: sql`${userExilium.totalEarned} + ${applied.exiliumDelta}`,
              updatedAt: new Date(),
            }).where(eq(userExilium.userId, userId));
            exiliumApplied = applied.exiliumDelta;
          } else {
            // Spend — clamp to current balance so we never go negative.
            const toSpend = Math.min(currentBalance, -applied.exiliumDelta);
            if (toSpend > 0) {
              await tx.update(userExilium).set({
                balance: sql`${userExilium.balance} - ${toSpend}`,
                totalSpent: sql`${userExilium.totalSpent} + ${toSpend}`,
                updatedAt: new Date(),
              }).where(eq(userExilium.userId, userId));
              exiliumApplied = -toSpend;
            }
          }
          if (exiliumApplied !== 0) {
            await tx.insert(exiliumLog).values({
              userId,
              amount: exiliumApplied,
              source: 'pve',
              details: { source: 'anomaly_event', eventId: event.id, choiceIndex },
            });
          }
        }

        // Generate the next combat preview based on the *updated* fleet.
        const nextEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, {
          userId,
          fleet: applied.fleet,
          depth: row.currentDepth + 1,
        });

        const config = await gameConfigService.getFullConfig();
        const nextNodeAt = new Date(Date.now() + nodeTravelMs(config));

        const seenSet = new Set((row.seenEventIds ?? []) as string[]);
        seenSet.add(event.id);
        const eventLog = (row.eventLog ?? []) as Array<Record<string, unknown>>;
        const newLogEntry = {
          depth: row.currentDepth,
          eventId: event.id,
          choiceIndex,
          outcomeApplied: {
            minerai: applied.lootDeltas.minerai,
            silicium: applied.lootDeltas.silicium,
            hydrogene: applied.lootDeltas.hydrogene,
            exilium: exiliumApplied,
            hullDelta: outcome.hullDelta ?? 0,
            shipsGain: outcome.shipsGain ?? {},
            shipsLoss: outcome.shipsLoss ?? {},
          },
          resolvedAt: new Date().toISOString(),
        };

        // WHERE-guards: status='active' AND nextNodeType='event' AND
        // nextEventId=row.nextEventId — guard against a parallel resolve
        // that would have already advanced the state.
        const updatedRows = await tx.update(anomalies).set({
          fleet: applied.fleet,
          lootMinerai: String(lootMinerai),
          lootSilicium: String(lootSilicium),
          lootHydrogene: String(lootHydrogene),
          nextNodeType: 'combat',
          nextEventId: null,
          nextEnemyFleet: nextEnemy.enemyFleet,
          nextEnemyFp: Math.round(nextEnemy.enemyFP),
          nextNodeAt,
          seenEventIds: Array.from(seenSet),
          eventLog: [...eventLog, newLogEntry],
        }).where(and(
          eq(anomalies.id, row.id),
          eq(anomalies.status, 'active'),
          eq(anomalies.nextNodeType, 'event'),
          eq(anomalies.nextEventId, row.nextEventId),
        )).returning({ id: anomalies.id });
        if (updatedRows.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
        }

        return {
          outcome: 'event_resolved' as const,
          eventId: event.id,
          choiceIndex,
          resolutionText: choice.resolutionText,
          outcomeApplied: newLogEntry.outcomeApplied,
          nextNodeAt: nextNodeAt.toISOString(),
          nextEnemyFp: Math.round(nextEnemy.enemyFP),
        };
      });
    },

    /**
     * Voluntarily abandon the run: refund Exilium, return ships + loot to homeworld.
     * Wrapped in a transaction with advisory lock + WHERE status='active' guard
     * so concurrent retreat / advance / engage from the same user are serialized.
     */
    async retreat(userId: string) {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        const [row] = await tx.select().from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .for('update')
          .limit(1);
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
        }

        const home = await getHomeworld(userId);
        if (!home) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Planète mère introuvable' });
        }

        const fleet = row.fleet as FleetMap;
        const lootShips = (row.lootShips ?? {}) as LootShipsMap;

        // Mark completed with status guard
        const updatedRows = await tx.update(anomalies).set({
          status: 'completed',
          completedAt: new Date(),
          nextNodeAt: null,
          nextEnemyFleet: null,
          nextEnemyFp: null,
        }).where(and(
          eq(anomalies.id, row.id),
          eq(anomalies.status, 'active'),
        )).returning({ id: anomalies.id });
        if (updatedRows.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
        }

        // Refund Exilium inline
        if (row.exiliumPaid > 0) {
          await tx.update(userExilium).set({
            balance: sql`${userExilium.balance} + ${row.exiliumPaid}`,
            totalEarned: sql`${userExilium.totalEarned} + ${row.exiliumPaid}`,
            updatedAt: new Date(),
          }).where(eq(userExilium.userId, userId));
          await tx.insert(exiliumLog).values({
            userId, amount: row.exiliumPaid, source: 'pve',
            details: { source: 'anomaly_retreat' },
          });
        }

        // Credit resources to homeworld
        const lootMinerai = Number(row.lootMinerai);
        const lootSilicium = Number(row.lootSilicium);
        const lootHydrogene = Number(row.lootHydrogene);
        if (lootMinerai > 0 || lootSilicium > 0 || lootHydrogene > 0) {
          await tx.update(planets).set({
            minerai: sql`${planets.minerai} + ${lootMinerai}`,
            silicium: sql`${planets.silicium} + ${lootSilicium}`,
            hydrogene: sql`${planets.hydrogene} + ${lootHydrogene}`,
          }).where(eq(planets.id, home.id));
        }

        // Reinject surviving ships (excluding flagship) + recovered enemy ships in 1 update
        const totalToInject: Record<string, number> = {};
        for (const [shipId, entry] of Object.entries(fleet)) {
          if (shipId === 'flagship') continue;
          if (!validShipColumn(shipId)) continue;
          if (entry.count > 0) totalToInject[shipId] = (totalToInject[shipId] ?? 0) + entry.count;
        }
        for (const [shipId, count] of Object.entries(lootShips)) {
          if (!validShipColumn(shipId)) continue;
          if (count > 0) totalToInject[shipId] = (totalToInject[shipId] ?? 0) + count;
        }
        if (Object.keys(totalToInject).length > 0) {
          const incrementUpdate: Record<string, unknown> = {};
          for (const [shipId, count] of Object.entries(totalToInject)) {
            const col = (planetShips as unknown as Record<string, unknown>)[shipId];
            if (col) incrementUpdate[shipId] = sql`${col} + ${count}`;
          }
          await tx.update(planetShips).set(incrementUpdate as never)
            .where(eq(planetShips.planetId, home.id));
        }

        await flagshipService.returnFromMission(userId, home.id);

        return { ok: true };
      });
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
