import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { anomalies, flagships, moduleDefinitions, planets, planetShips, users, userExilium, exiliumLog, userResearch } from '@exilium/db';
import type { Database } from '@exilium/db';
import { DEFAULT_HULL_ID } from '@exilium/shared';
import {
  anomalyLoot,
  anomalyEnemyRecoveryCount,
  applyOutcomeToFleet,
  pickEventForTier,
  pickEventGap,
  resolveActiveAbility,
  tierForDepth,
  xpFromCombat,
  xpFromRunDepth,
  type UnitCombatStats,
  type XpConfig,
} from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';
import { buildShipCombatConfigs } from '../fleet/fleet.types.js';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { createFlagshipService } from '../flagship/flagship.service.js';
import type { createReportService } from '../report/report.service.js';
import type { createAnomalyContentService } from '../anomaly-content/anomaly-content.service.js';
import type { createModulesService } from '../modules/modules.service.js';
import { buildCombatReportData } from '../fleet/combat.helpers.js';
import { ANOMALY_MAX_DEPTH } from '../anomaly-content/anomaly-content.types.js';
import { runAnomalyNode, generateAnomalyEnemy, type FleetEntry } from './anomaly.combat.js';

type AnomalyRow = typeof anomalies.$inferSelect;
type FleetMap = Record<string, FleetEntry>;
type LootShipsMap = Record<string, number>;

/**
 * Robust parser for game-config numbers : preserves intentional 0 values
 * (kill-switch). `Number(x) || default` would clobber 0 with `default`.
 */
function parseConfigNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function createAnomalyService(
  db: Database,
  gameConfigService: GameConfigService,
  exiliumService: ReturnType<typeof createExiliumService>,
  flagshipService: ReturnType<typeof createFlagshipService>,
  reportService: ReturnType<typeof createReportService>,
  anomalyContentService: ReturnType<typeof createAnomalyContentService>,
  modulesService: ReturnType<typeof createModulesService>,
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

  /**
   * Roll the per-run final module drops for a given run depth, grant them
   * to the flagship's inventory and resolve their definitions for the API
   * response. Uses the passed transactional executor for the def fetch so
   * the result is consistent with the same snapshot.
   */
  async function rollFinalDropsForRun(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    userId: string,
    depth: number,
  ): Promise<Array<{ id: string; name: string; rarity: string; image: string; isFinal: true }>> {
    const [flagshipForFinal] = await tx.select({ id: flagships.id, hullId: flagships.hullId })
      .from(flagships).where(eq(flagships.userId, userId)).limit(1);
    if (!flagshipForFinal) return [];

    const finalDropIds = await modulesService.rollPerRunFinalDrop({
      flagshipHullId: flagshipForFinal.hullId ?? DEFAULT_HULL_ID,
      depth,
      executor: tx as unknown as Database,
    });
    const finalDropDefs: Array<{ id: string; name: string; rarity: string; image: string; isFinal: true }> = [];
    for (const moduleId of finalDropIds) {
      await modulesService.grantModule(flagshipForFinal.id, moduleId, tx as unknown as Database);
      const [def] = await tx.select({
        id: moduleDefinitions.id,
        name: moduleDefinitions.name,
        rarity: moduleDefinitions.rarity,
        image: moduleDefinitions.image,
      }).from(moduleDefinitions).where(eq(moduleDefinitions.id, moduleId)).limit(1);
      if (def) finalDropDefs.push({ ...def, isFinal: true });
    }
    return finalDropDefs;
  }

  return {
    /** Returns the user's active anomaly, or null. */
    async current(userId: string) {
      return loadActive(userId);
    },

    /**
     * V4 (2026-05-03) : use 1 repair charge — restores +N% hull on the flagship
     * (clamped at 1.0). Refused if no charges left, no active anomaly, or hull
     * already at 1.0.
     */
    async useRepairCharge(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const repairPct = Number(config.universe.anomaly_repair_charge_hull_pct) || 0.30;

      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        const [active] = await tx.select().from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .for('update').limit(1);
        if (!active) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
        }
        if (active.repairChargesCurrent <= 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune charge de réparation' });
        }

        const fleet = (active.fleet ?? {}) as Record<string, { count: number; hullPercent: number }>;
        const currentHp = fleet.flagship?.hullPercent ?? 1.0;
        if (currentHp >= 1.0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Flagship à pleine santé' });
        }

        const newHp = Math.min(1.0, currentHp + repairPct);
        const newFleet = {
          ...fleet,
          flagship: { count: 1, hullPercent: newHp },
        };

        await tx.update(anomalies).set({
          fleet: newFleet,
          repairChargesCurrent: sql`${anomalies.repairChargesCurrent} - 1`,
        }).where(eq(anomalies.id, active.id));

        return {
          newHullPercent: newHp,
          remainingCharges: active.repairChargesCurrent - 1,
        };
      });
    },

    /**
     * V4 (2026-05-03) : flagship-only engagement.
     *
     * No more escort selection — the flagship is the only ship engaged.
     * The `input.ships` argument is accepted for back-compat but ignored
     * (the router still passes an empty object).
     *
     * Wrapped in a transaction with a per-user advisory lock so concurrent
     * engage / advance / retreat from the same user are serialized.
     */
    async engage(userId: string, input: { ships: Record<string, number>; tier: number }) {
      const config = await gameConfigService.getFullConfig();
      const baseCost = Number(config.universe.anomaly_entry_cost_exilium) || 5;
      // V5-Tiers : cost scales with tier
      const costFactor = parseConfigNumber(config.universe.anomaly_tier_engage_cost_factor, 1.0);
      // Clamp at 0 — guards against admin setting a negative cost factor that
      // would otherwise *credit* the player Exilium on engage.
      const cost = Math.max(0, Math.round(baseCost * (1 + (input.tier - 1) * costFactor)));
      const repairChargesMax = Number(config.universe.anomaly_repair_charges_per_run) || 3;

      return await db.transaction(async (tx) => {
        // 1. Per-user advisory lock
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        // 2. No active anomaly
        const [active] = await tx.select({ id: anomalies.id }).from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .limit(1);
        if (active) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Une anomalie est déjà en cours' });
        }

        // 3. Flagship validation
        const flagship = await flagshipService.get(userId);
        if (!flagship) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral requis' });
        }
        if (flagship.status !== 'active') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral indisponible' });
        }

        // V5-Tiers : validate tier ≤ max_tier_unlocked
        const maxTierUnlocked = (flagship as { maxTierUnlocked?: number }).maxTierUnlocked ?? 1;
        if (input.tier > maxTierUnlocked) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Palier ${input.tier} non débloqué (max disponible : ${maxTierUnlocked})`,
          });
        }

        const originPlanetId = flagship.planetId;

        // 4. Origin planet ownership
        const [origin] = await tx.select({ id: planets.id, userId: planets.userId })
          .from(planets).where(eq(planets.id, originPlanetId)).limit(1);
        if (!origin || origin.userId !== userId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Planète invalide' });
        }

        // 5. Spend Exilium
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

        // 6. Flagship → in_mission
        await flagshipService.setInMission(userId);

        // 7. Snapshot module loadout (sprint 1 logic)
        const [flagshipRow] = await tx.select({
          loadout: flagships.moduleLoadout,
          chargesMax: flagships.epicChargesMax,
        }).from(flagships).where(eq(flagships.userId, userId)).limit(1);
        const equippedSnapshot = flagshipRow?.loadout ?? {};
        await tx.update(flagships).set({
          epicChargesCurrent: flagshipRow?.chargesMax ?? 1,
        }).where(eq(flagships.userId, userId));

        // 8. Build fleet (flagship only) + first enemy
        const fleet: FleetMap = { flagship: { count: 1, hullPercent: 1.0 } };
        const firstEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
          userId,
          fleet,
          depth: 1,
          tier: input.tier,  // V5-Tiers
          equippedModules: equippedSnapshot,
        });

        // 9. Insert anomaly row — V4 flagship-only with repair charges
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
          equippedModules: equippedSnapshot,
          pendingEpicEffect: null,
          repairChargesCurrent: repairChargesMax,
          repairChargesMax,
          tier: input.tier,  // V5-Tiers
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
        const generated = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
          userId,
          fleet,
          depth: newDepth,
          tier: row.tier ?? 1,  // V5-Tiers
          equippedModules: row.equippedModules,
        });
        predefinedEnemy = { fleet: generated.enemyFleet, fp: Math.round(generated.enemyFP) };
      }

      // Run combat with the locked-in enemy + apply equipped modules to flagship stats
      const pendingEpicEffect = row.pendingEpicEffect as
        | { ability: string; magnitude: number }
        | null;
      const result = await runAnomalyNode(tx as unknown as Database, gameConfigService, modulesService, {
        userId,
        fleet,
        depth: newDepth,
        predefinedEnemy,
        tier: row.tier ?? 1,  // V5-Tiers
        equippedModules: row.equippedModules,
        pendingEpicEffect,
      });

      const config = await gameConfigService.getFullConfig();

      // V4 : flagship-only. Pas de "forced_retreat" partiel — flagship détruit = wipe radical.
      const flagshipSurvived = !!result.attackerSurvivors['flagship'];
      const wipe = !flagshipSurvived;

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
        extra: { anomalyDepth: newDepth, anomalyId: row.id, tier: row.tier ?? 1 },
      });
      const outcomeLabel = wipe
        ? 'Défaite totale'
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

      if (wipe) {
        // V4 wipe semantics :
        //  - status 'wiped'
        //  - Exilium engagé : non remboursé (perdu)
        //  - Loot ressources accumulé : non rendu à la planète (perdu)
        //  - Modules drops déjà obtenus : restent en inventaire (committed à chaque grant)
        //  - Pas de drop sur ce combat fatal (pas de roll dans le wipe branch)
        //  - Pas de per-run final drop (réservé à retreat/runComplete)
        //  - Flagship → incapacitated (30 min de réparation)
        const wipedRows = await tx.update(anomalies).set({
          status: 'wiped',
          fleet: result.attackerSurvivors,  // = {} (flagship détruit)
          reportIds: updatedReportIds,
          completedAt: new Date(),
          nextNodeAt: null,
          nextEnemyFleet: null,
          nextEnemyFp: null,
          ...(row.pendingEpicEffect ? { pendingEpicEffect: null } : {}),
        }).where(and(
          eq(anomalies.id, row.id),
          eq(anomalies.status, 'active'),
          eq(anomalies.currentDepth, row.currentDepth),
        )).returning({ id: anomalies.id });
        if (wipedRows.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
        }
        await flagshipService.incapacitate(userId);

        return {
          outcome: 'wiped' as const,
          fleet: result.attackerSurvivors,
          enemyFP: result.enemyFP,
          combatRounds: result.combatRounds,
          reportId: report.id,
          droppedModule: null,
          finalDrops: [],
          // V4-XP : wipe ne rapporte pas d'XP, mais on remonte les champs pour
          // que le front puisse afficher uniformément (xpGained=0, levelUp=null).
          xpGained: 0,
          levelUp: null as { newLevel: number; oldLevel: number } | null,
          // V5-Tiers : pas de complétion sur un wipe.
          tierCompleted: null as number | null,
          newTierUnlocked: null as number | null,
        };
      }

      // Survived
      const lootBase = Number(config.universe.anomaly_loot_base) || 5000;
      const lootGrowth = Number(config.universe.anomaly_loot_growth) || 1.4;

      // V5-Tiers : loot scales linearly with the run's tier, capped to
      // anomaly_loot_tier_cap (default 10) so re-running tier 50 doesn't
      // print resources. Tunable via universe_config without redeploy.
      const lootTierCap = parseConfigNumber(config.universe.anomaly_loot_tier_cap, 10);
      // Defensive Number() on row.tier: it's an int column but a corrupted
      // jsonb leak could feed a string here — `Number(x) || 1` falls back to 1
      // for NaN/0/undefined.
      const effectiveTierForLoot = Math.min(Number(row.tier) || 1, lootTierCap);
      const scaledLootBase = lootBase * effectiveTierForLoot;

      const loot = anomalyLoot(newDepth, scaledLootBase, lootGrowth);

      // Recovery now scales with each ship's FP (heavier = better salvage),
      // capped at 25%. Build the same shipStats as the FP calc so the
      // formula sees the V2 traits (rafale, capital, etc.).
      const baseShipConfigs = buildShipCombatConfigs(config);
      const recoveryStats: Record<string, UnitCombatStats> = {};
      for (const [id, ship] of Object.entries(config.ships)) {
        const baseSc = baseShipConfigs[id];
        recoveryStats[id] = {
          weapons: ship.weapons,
          shotCount: ship.shotCount ?? 1,
          shield: ship.shield,
          hull: ship.hull,
          armor: baseSc?.baseArmor ?? 0,
          weaponProfiles: ship.weaponProfiles,
          categoryId: baseSc?.categoryId,
        };
      }
      const fpConfigForRecovery = {
        shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
        divisor: Number(config.universe.fp_divisor) || 100,
      };
      // Tunable via universe_config — use defaults from the engine if absent.
      const recoveryOptions = {
        baseRatio: Number(config.universe.anomaly_recovery_base_ratio) || undefined,
        fpFactor: Number(config.universe.anomaly_recovery_fp_factor) || undefined,
        maxRatio: Number(config.universe.anomaly_recovery_max_ratio) || undefined,
      };
      const recovered = anomalyEnemyRecoveryCount(
        result.enemyDestroyed,
        recoveryStats,
        fpConfigForRecovery,
        recoveryOptions,
      );

      const currentLootShips = (row.lootShips ?? {}) as LootShipsMap;
      const mergedLootShips: LootShipsMap = { ...currentLootShips };
      for (const [shipId, count] of Object.entries(recovered)) {
        if (!validShipColumn(shipId)) continue;
        mergedLootShips[shipId] = (mergedLootShips[shipId] ?? 0) + count;
      }

      // ── Per-combat module drop ────────────────────────────────────────────
      // 30% common from the flagship's hull + 5% common from another hull.
      // Pool read + grant both run inside the tx so they roll back together
      // with the anomaly state if the WHERE-guard later fails.
      const [flagshipForDrop] = await tx.select({ id: flagships.id, hullId: flagships.hullId })
        .from(flagships).where(eq(flagships.userId, userId)).limit(1);
      const dropHullId = flagshipForDrop?.hullId ?? DEFAULT_HULL_ID;
      const droppedModuleId = await modulesService.rollPerCombatDrop({
        flagshipHullId: dropHullId,
        executor: tx as unknown as Database,
      });
      let droppedModule: { id: string; name: string; rarity: string; image: string } | null = null;
      if (droppedModuleId && flagshipForDrop) {
        await modulesService.grantModule(flagshipForDrop.id, droppedModuleId, tx as unknown as Database);
        const [def] = await tx.select({
          id: moduleDefinitions.id,
          name: moduleDefinitions.name,
          rarity: moduleDefinitions.rarity,
          image: moduleDefinitions.image,
        }).from(moduleDefinitions).where(eq(moduleDefinitions.id, droppedModuleId)).limit(1);
        if (def) droppedModule = def;
      }

      // ── Run-completion check : the player has reached the bottom ─────────
      // V1 anomaly is a 20-deep run. If the player just cleared the deepest
      // node, the run auto-completes : roll the per-run final drops, mark
      // the row as completed, refund nothing (loot stays), and return the
      // resources/ships to the homeworld via the same path as `retreat`.
      const runComplete = newDepth >= ANOMALY_MAX_DEPTH;

      // V4-XP : grant XP per-combat (+ bonus per-run depth si runComplete).
      // Mutualisé entre la branche runComplete et la branche survived classique
      // car les deux branches surviennent au même point (combat gagné).
      const xpConfig: XpConfig = {
        perKillFpFactor: parseConfigNumber(config.universe.flagship_xp_per_kill_fp_factor, 0.10),
        perDepthBonus: parseConfigNumber(config.universe.flagship_xp_per_depth_bonus, 100),
        levelMultiplierPct: parseConfigNumber(config.universe.flagship_xp_level_multiplier_pct, 0.05),
        maxLevel: parseConfigNumber(config.universe.flagship_max_level, 60),
      };
      const xpGainedCombat = xpFromCombat(result.enemyFP, xpConfig);
      const xpGainedDepthBonus = runComplete ? xpFromRunDepth(newDepth, xpConfig) : 0;
      const xpGainedTotal = xpGainedCombat + xpGainedDepthBonus;
      const xpResult = await flagshipService.grantXp(userId, xpGainedTotal, tx as unknown as Database);
      const levelUpPayload = xpResult.levelUp
        ? { newLevel: xpResult.newLevel, oldLevel: xpResult.oldLevel }
        : null;

      if (runComplete) {
        const home = await getHomeworld(userId);
        if (!home) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Planète mère introuvable' });
        }

        const finalDrops = await rollFinalDropsForRun(tx, userId, newDepth);

        const completedRows = await tx.update(anomalies).set({
          status: 'completed',
          fleet: result.attackerSurvivors,
          lootMinerai: sql`${anomalies.lootMinerai} + ${loot.minerai}`,
          lootSilicium: sql`${anomalies.lootSilicium} + ${loot.silicium}`,
          lootHydrogene: sql`${anomalies.lootHydrogene} + ${loot.hydrogene}`,
          lootShips: mergedLootShips,
          reportIds: updatedReportIds,
          completedAt: new Date(),
          currentDepth: newDepth,
          nextNodeAt: null,
          nextEnemyFleet: null,
          nextEnemyFp: null,
          // Clear pending epic effect (consumed by this combat)
          ...(row.pendingEpicEffect ? { pendingEpicEffect: null } : {}),
        }).where(and(
          eq(anomalies.id, row.id),
          eq(anomalies.status, 'active'),
          eq(anomalies.currentDepth, row.currentDepth),
        )).returning({ id: anomalies.id });
        if (completedRows.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
        }

        // Credit total resources (loot stays on completion, no Exilium refund).
        const finalMinerai = Number(row.lootMinerai) + loot.minerai;
        const finalSilicium = Number(row.lootSilicium) + loot.silicium;
        const finalHydrogene = Number(row.lootHydrogene) + loot.hydrogene;
        if (finalMinerai > 0 || finalSilicium > 0 || finalHydrogene > 0) {
          await tx.update(planets).set({
            minerai: sql`${planets.minerai} + ${finalMinerai}`,
            silicium: sql`${planets.silicium} + ${finalSilicium}`,
            hydrogene: sql`${planets.hydrogene} + ${finalHydrogene}`,
          }).where(eq(planets.id, home.id));
        }

        // Reinject surviving ships + recovered enemy ships to the homeworld
        const totalToInject: Record<string, number> = {};
        for (const [shipId, entry] of Object.entries(result.attackerSurvivors)) {
          if (shipId === 'flagship') continue;
          if (!validShipColumn(shipId)) continue;
          if (entry.count > 0) totalToInject[shipId] = (totalToInject[shipId] ?? 0) + entry.count;
        }
        for (const [shipId, count] of Object.entries(mergedLootShips)) {
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

        // V5-Tiers : unlock next tier if this run cleared a tier never completed before.
        // Le flagship n'est pas en scope ici — on fetch les colonnes tier dans la même tx
        // pour garantir la cohérence avec l'écriture qui suit.
        const [flagshipTierRow] = await tx.select({
          maxTierUnlocked: flagships.maxTierUnlocked,
          maxTierCompleted: flagships.maxTierCompleted,
        }).from(flagships).where(eq(flagships.userId, userId)).limit(1);
        const oldMaxUnlocked = flagshipTierRow?.maxTierUnlocked ?? 1;
        const oldMaxCompleted = flagshipTierRow?.maxTierCompleted ?? 0;
        const runTier = row.tier ?? 1;
        const newMaxCompleted = Math.max(oldMaxCompleted, runTier);
        const newMaxUnlocked = Math.max(oldMaxUnlocked, runTier + 1);
        if (newMaxCompleted > oldMaxCompleted || newMaxUnlocked > oldMaxUnlocked) {
          await tx.update(flagships).set({
            maxTierCompleted: newMaxCompleted,
            maxTierUnlocked: newMaxUnlocked,
            updatedAt: new Date(),
          }).where(eq(flagships.userId, userId));
        }
        const newTierUnlocked = newMaxUnlocked > oldMaxUnlocked ? newMaxUnlocked : null;
        // Audit trail: log every new tier unlock so we can correlate run
        // performance with progression in production logs.
        if (newTierUnlocked !== null) {
          console.info('[anomaly] tier unlocked', {
            userId,
            runTier,
            newMaxUnlocked,
          });
        }

        return {
          outcome: 'survived' as const,
          fleet: result.attackerSurvivors,
          enemyFP: result.enemyFP,
          combatRounds: result.combatRounds,
          nodeLoot: loot,
          recoveredShips: recovered,
          depth: newDepth,
          nextNodeAt: new Date().toISOString(),
          nextNodeType: 'combat' as const,
          nextEventId: null,
          reportId: report.id,
          droppedModule,
          finalDrops,
          runComplete: true,
          xpGained: xpGainedTotal,
          levelUp: levelUpPayload,
          tierCompleted: runTier,
          newTierUnlocked,  // null if no new unlock (re-run lower tier)
        };
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
        const nextEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
          userId,
          fleet: result.attackerSurvivors,
          depth: newDepth + 1,
          tier: row.tier ?? 1,  // V5-Tiers
          equippedModules: row.equippedModules,
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
        // Clear pending epic effect (consumed by this combat)
        ...(row.pendingEpicEffect ? { pendingEpicEffect: null } : {}),
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
        droppedModule,
        finalDrops: [] as Array<{ id: string; name: string; rarity: string; image: string; isFinal: true }>,
        runComplete: false,
        xpGained: xpGainedTotal,
        levelUp: levelUpPayload,
        // V5-Tiers : pas de complétion sur un noeud intermédiaire.
        tierCompleted: null as number | null,
        newTierUnlocked: null as number | null,
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
          const enemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
            userId,
            fleet: row.fleet as FleetMap,
            depth: row.currentDepth + 1,
            tier: row.tier ?? 1,  // V5-Tiers
            equippedModules: row.equippedModules,
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

        // V4 : gating par hull
        if (choice.requiredHull) {
          const [flagshipHull] = await tx.select({ hullId: flagships.hullId })
            .from(flagships).where(eq(flagships.userId, userId)).limit(1);
          if (flagshipHull?.hullId !== choice.requiredHull) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Choix réservé à la coque ${choice.requiredHull}`,
            });
          }
        }

        // V4 : gating par recherche — `researchId` correspond à un nom de
        // colonne camelCase sur la table user_research (ex: 'weapons',
        // 'energyTech'). On lit la ligne complète puis on extrait dynamiquement.
        if (choice.requiredResearch) {
          const researchKey = choice.requiredResearch.researchId as keyof typeof userResearch;
          const column = userResearch[researchKey];
          if (!column || typeof column !== 'object' || !('name' in column)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Recherche inconnue : ${choice.requiredResearch.researchId}`,
            });
          }
          const [research] = await tx.select().from(userResearch)
            .where(eq(userResearch.userId, userId)).limit(1);
          const level = (research?.[researchKey as keyof typeof research] as number | undefined) ?? 0;
          if (level < choice.requiredResearch.minLevel) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Recherche ${choice.requiredResearch.researchId} niveau ${choice.requiredResearch.minLevel} requis`,
            });
          }
        }

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
        const nextEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
          userId,
          fleet: applied.fleet,
          depth: row.currentDepth + 1,
          tier: row.tier ?? 1,  // V5-Tiers
          equippedModules: row.equippedModules,
        });

        const config = await gameConfigService.getFullConfig();
        const nextNodeAt = new Date(Date.now() + nodeTravelMs(config));

        const seenSet = new Set((row.seenEventIds ?? []) as string[]);
        seenSet.add(event.id);
        const eventLog = (row.eventLog ?? []) as Array<Record<string, unknown>>;

        // V4 : moduleDrop outcome — grant 1 module of requested rarity
        // Doit être calculé AVANT newLogEntry pour persister le drop dans eventLog (audit/replay).
        let droppedEventModule: { id: string; name: string; rarity: string; image: string } | null = null;
        if (choice.outcome.moduleDrop) {
          const [flagshipForDrop] = await tx.select({ id: flagships.id, hullId: flagships.hullId })
            .from(flagships).where(eq(flagships.userId, userId)).limit(1);
          if (flagshipForDrop && flagshipForDrop.hullId) {
            const moduleId = await modulesService.rollByRarity({
              flagshipHullId: flagshipForDrop.hullId,
              rarity: choice.outcome.moduleDrop,
              executor: tx as unknown as Database,
            });
            if (moduleId) {
              await modulesService.grantModule(flagshipForDrop.id, moduleId, tx as unknown as Database);
              const [def] = await tx.select({
                id: moduleDefinitions.id, name: moduleDefinitions.name,
                rarity: moduleDefinitions.rarity, image: moduleDefinitions.image,
              }).from(moduleDefinitions).where(eq(moduleDefinitions.id, moduleId)).limit(1);
              if (def) droppedEventModule = def;
            }
          }
        }

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
            moduleDropId: droppedEventModule?.id ?? null,  // V4 : trace du drop pour audit
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
          droppedModule: droppedEventModule,  // V4
        };
      });
    },

    /**
     * Voluntarily abandon the run: return ships + loot to homeworld + roll
     * per-run final drops. V4 : Exilium engagé est NON remboursé (le run est
     * considéré comme consommé). Wrapped in a transaction with advisory lock
     * + WHERE status='active' guard so concurrent retreat / advance / engage
     * from the same user are serialized.
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

        // Roll the per-run final drops based on the depth reached. Granted
        // before the row update so any failure surfaces through the tx.
        const finalDrops = await rollFinalDropsForRun(tx, userId, row.currentDepth);

        // Mark completed with status guard
        const updatedRows = await tx.update(anomalies).set({
          status: 'completed',
          completedAt: new Date(),
          nextNodeAt: null,
          nextEnemyFleet: null,
          nextEnemyFp: null,
          // Clear any unconsumed pending epic effect — the run is over.
          ...(row.pendingEpicEffect ? { pendingEpicEffect: null } : {}),
        }).where(and(
          eq(anomalies.id, row.id),
          eq(anomalies.status, 'active'),
        )).returning({ id: anomalies.id });
        if (updatedRows.length === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
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

        // V4-XP : grant XP bonus per-run (depth atteinte au moment du retreat).
        // Pas de combat ici, donc seulement le bonus de profondeur.
        const config = await gameConfigService.getFullConfig();
        const xpConfig: XpConfig = {
          perKillFpFactor: parseConfigNumber(config.universe.flagship_xp_per_kill_fp_factor, 0.10),
          perDepthBonus: parseConfigNumber(config.universe.flagship_xp_per_depth_bonus, 100),
          levelMultiplierPct: parseConfigNumber(config.universe.flagship_xp_level_multiplier_pct, 0.05),
          maxLevel: parseConfigNumber(config.universe.flagship_max_level, 60),
        };
        const xpGainedDepth = xpFromRunDepth(row.currentDepth, xpConfig);
        const xpResult = await flagshipService.grantXp(userId, xpGainedDepth, tx as unknown as Database);

        return {
          ok: true,
          finalDrops,
          xpGained: xpGainedDepth,
          levelUp: xpResult.levelUp
            ? { newLevel: xpResult.newLevel, oldLevel: xpResult.oldLevel }
            : null,
        };
      });
    },

    /**
     * Activate the epic ability of the equipped module on the active anomaly.
     * Consumes 1 charge from `flagships.epic_charges_current`. Routes to
     * immediate effect (mutates fleet for repair / advances depth for skip /
     * scan = UI hint only) or pending effect (overcharge, shield_burst,
     * damage_burst → persisted on `anomalies.pending_epic_effect`, applied
     * to the next combat).
     */
    async activateEpic(userId: string, hullId: string) {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        const [flagship] = await tx.select().from(flagships)
          .where(eq(flagships.userId, userId)).for('update').limit(1);
        if (!flagship) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Flagship introuvable' });
        }
        if (flagship.epicChargesCurrent <= 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune charge épique disponible' });
        }

        const [active] = await tx.select().from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .for('update').limit(1);
        if (!active) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pas d\'anomalie active' });
        }

        // Read the loadout from the run *snapshot* (taken at engage), not
        // from the live flagship — this preserves snapshot semantics so a
        // future feature that allows mid-run loadout changes doesn't break
        // module charges. `equippedModules` is JSONB → cast through the
        // same shape `resolveEquippedModules` expects.
        const snapshot = (active.equippedModules ?? {}) as Record<
          string,
          { epic?: string | null; rare?: (string | null)[]; common?: (string | null)[] }
        >;
        const epicId = snapshot[hullId]?.epic ?? null;
        if (!epicId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun module épique équipé' });
        }

        const pool = await modulesService._getPool(tx as unknown as Database);
        const epicMod = pool.find((m) => m.id === epicId);
        if (!epicMod || epicMod.effect.type !== 'active') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Module épique invalide' });
        }

        const resolved = resolveActiveAbility(epicMod.effect.ability, epicMod.effect.magnitude);

        // C3c : refuse `skip` at the last possible depth — would otherwise
        // bump to MAX_DEPTH without rolling final drops, granting a free
        // skip of the deepest fight. Check BEFORE consuming the charge so
        // the player keeps the resource.
        if (
          resolved.applied === 'immediate' &&
          resolved.ability === 'skip' &&
          active.currentDepth + 1 >= ANOMALY_MAX_DEPTH
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Impossible d\'utiliser Skip au dernier saut',
          });
        }

        // Consume 1 charge — guarded by status and charge balance via the
        // for('update') above.
        await tx.update(flagships).set({
          epicChargesCurrent: sql`${flagships.epicChargesCurrent} - 1`,
        }).where(eq(flagships.id, flagship.id));

        if (resolved.applied === 'immediate') {
          if (resolved.ability === 'repair') {
            // Repair = boost hullPercent of every ship in the active fleet
            // by `magnitude` (fraction 0..1), capped at 1.
            const fleet = (active.fleet ?? {}) as FleetMap;
            const newFleet: FleetMap = { ...fleet };
            for (const [shipId, entry] of Object.entries(fleet)) {
              newFleet[shipId] = {
                ...entry,
                hullPercent: Math.min(1, entry.hullPercent + resolved.magnitude),
              };
            }
            await tx.update(anomalies).set({
              fleet: newFleet,
              pendingEpicEffect: null,
            }).where(eq(anomalies.id, active.id));
          } else if (resolved.ability === 'skip') {
            // Skip = mark next combat as auto-cleared by advancing depth.
            // V1 implementation : bump currentDepth, clear the next enemy
            // preview, force back to a combat node (clears any pending
            // event so we don't wedge the run state — see C3a), and set
            // nextNodeAt to "now" so the player can immediately request
            // the next node. The next `advance()` will regenerate the
            // enemy preview on the fly (front shows a brief "loading"
            // state until then — acceptable for V1, see C3b note). Loot
            // is not granted for a skipped node — it's a strategic
            // emergency button.
            await tx.update(anomalies).set({
              currentDepth: active.currentDepth + 1,
              nextNodeType: 'combat',
              nextEventId: null,
              nextEnemyFleet: null,
              nextEnemyFp: null,
              nextNodeAt: new Date(),
              pendingEpicEffect: null,
            }).where(eq(anomalies.id, active.id));
          } else {
            // 'scan' = pure UI hint in V1 (would reveal hidden event outcomes).
            await tx.update(anomalies).set({
              pendingEpicEffect: null,
            }).where(eq(anomalies.id, active.id));
          }
        } else {
          // Persist for next combat (overcharge, shield_burst, damage_burst).
          await tx.update(anomalies).set({
            pendingEpicEffect: { ability: resolved.ability, magnitude: resolved.magnitude },
          }).where(eq(anomalies.id, active.id));
        }

        return {
          ability: resolved.ability,
          magnitude: resolved.magnitude,
          applied: resolved.applied,
          remainingCharges: flagship.epicChargesCurrent - 1,
        };
      });
    },

    /** Last N completed/wiped runs for the user. */
    async history(userId: string, limit = 10) {
      return db.select().from(anomalies)
        .where(and(eq(anomalies.userId, userId), inArray(anomalies.status, ['completed', 'wiped'])))
        .orderBy(desc(anomalies.completedAt))
        .limit(limit);
    },

    /**
     * V5-Tiers (2026-05-04) : leaderboard PvE basé sur le palier max complété.
     * Tiebreakers : level pilote DESC, puis xp DESC.
     */
    async getLeaderboard(limit: number) {
      const rows = await db.select({
        username: users.username,
        maxTierCompleted: flagships.maxTierCompleted,
        maxTierUnlocked: flagships.maxTierUnlocked,
        level: flagships.level,
        xp: flagships.xp,
        hullId: flagships.hullId,
      })
        .from(flagships)
        .innerJoin(users, eq(users.id, flagships.userId))
        .where(gt(flagships.maxTierCompleted, 0))
        .orderBy(
          desc(flagships.maxTierCompleted),
          desc(flagships.level),
          desc(flagships.xp),
        )
        .limit(limit);
      return { entries: rows };
    },
  };
}

export type AnomalyService = ReturnType<typeof createAnomalyService>;
