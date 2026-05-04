import { eq, asc, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships, planets, users, flagshipCooldowns, userResearch, planetShips, planetDefenses, planetBuildings, fleetEvents, anomalies } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createTalentService } from './talent.service.js';
import type { createResourceService } from '../resource/resource.service.js';
import type { createReportService } from '../report/report.service.js';
import { listFlagshipImageIndexes, getRandomFlagshipImageIndex } from '../../lib/flagship-image.util.js';
import { computeBaseStatsFromShips, FLAGSHIP_EXCLUDED_SHIPS, calculateSpyReport, xpToLevel, levelMultiplier } from '@exilium/game-engine';

// Regex de validation du nom : lettres (toutes langues), chiffres, espaces, tirets, apostrophes
const NAME_REGEX = /^[\p{L}\p{N}\s\-']{2,32}$/u;

export function createFlagshipService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
  talentService?: ReturnType<typeof createTalentService>,
  assetsDir?: string,
  resourceService?: ReturnType<typeof createResourceService>,
  reportService?: ReturnType<typeof createReportService>,
) {
  function validateName(name: string) {
    if (!NAME_REGEX.test(name)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Le nom doit contenir 2 a 32 caracteres (lettres, chiffres, espaces, tirets, apostrophes)',
      });
    }
  }

  function sanitizeText(text: string): string {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }

  return {
    async get(userId: string) {
      const [flagship] = await db
        .select()
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) return null;

      // Verification lazy de la reparation
      if (flagship.status === 'incapacitated' && flagship.repairEndsAt) {
        const now = new Date();
        if (now >= flagship.repairEndsAt) {
          // Ensure flagship returns to home planet after repair
          const [homePlanet] = await db
            .select({ id: planets.id })
            .from(planets)
            .where(eq(planets.userId, userId))
            .orderBy(asc(planets.createdAt))
            .limit(1);
          const repairedPlanetId = homePlanet?.id ?? flagship.planetId;
          await db
            .update(flagships)
            .set({ status: 'active', repairEndsAt: null, planetId: repairedPlanetId, updatedAt: new Date() })
            .where(eq(flagships.id, flagship.id));
          Object.assign(flagship, { status: 'active', repairEndsAt: null, planetId: repairedPlanetId });
        }
      }

      // Lazy refit completion
      if (flagship.status === 'hull_refit' && flagship.refitEndsAt && flagship.refitEndsAt <= new Date()) {
        await db
          .update(flagships)
          .set({
            status: 'active',
            refitEndsAt: null,
            updatedAt: new Date(),
          })
          .where(eq(flagships.id, flagship.id));
        Object.assign(flagship, { status: 'active', refitEndsAt: null });
      }

      // Lazy recovery: in_mission with no matching active fleet event AND no
      // active anomaly means the mission ended without resetting the flagship
      // (server crash, lost queue job, or unhandled exception). Snap back to
      // active so the player isn't permanently locked out.
      // The anomaly check is critical: anomalies don't create fleet events,
      // so without it the flagship would be silently freed mid-run.
      if (flagship.status === 'in_mission') {
        const [activeFleet] = await db
          .select({ id: fleetEvents.id })
          .from(fleetEvents)
          .where(and(
            eq(fleetEvents.userId, userId),
            eq(fleetEvents.status, 'active'),
            sql`COALESCE((${fleetEvents.ships}->>'flagship')::int, 0) > 0`,
          ))
          .limit(1);
        const [activeAnomaly] = await db
          .select({ id: anomalies.id })
          .from(anomalies)
          .where(and(
            eq(anomalies.userId, userId),
            eq(anomalies.status, 'active'),
          ))
          .limit(1);
        if (!activeFleet && !activeAnomaly) {
          await db
            .update(flagships)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(flagships.id, flagship.id));
          Object.assign(flagship, { status: 'active' });
        }
      }

      const config = await gameConfigService.getFullConfig();

      // Always return hull config + effective stats for display
      const hullConfig = flagship.hullId ? (config.hulls[flagship.hullId] ?? null) : null;

      // V4-XP : compute level multiplier from config + flagship.level
      const levelPct = Number(config.universe.flagship_xp_level_multiplier_pct) || 0.05;
      const levelMult = levelMultiplier(flagship.level, levelPct);

      const effectiveStats = {
        weapons:         Math.round(flagship.weapons * levelMult),
        shield:          Math.round(flagship.shield * levelMult),
        hull:            Math.round(flagship.hull * levelMult),
        baseArmor:       Math.round(flagship.baseArmor * levelMult),
        shotCount:       flagship.shotCount,        // pas multiplié (count entier)
        cargoCapacity:   flagship.cargoCapacity,    // pas multiplié (stat non-combat)
        fuelConsumption: flagship.fuelConsumption,  // pas multiplié
        baseSpeed:       flagship.baseSpeed,        // pas multiplié
        driveType:       flagship.driveType,
      };

      // Apply hull combat bonuses (only when stationed) — multiplied too
      if (hullConfig && flagship.status === 'active') {
        effectiveStats.weapons   += Math.round((hullConfig.passiveBonuses.bonus_weapons   ?? 0) * levelMult);
        effectiveStats.baseArmor += Math.round((hullConfig.passiveBonuses.bonus_armor     ?? 0) * levelMult);
        effectiveStats.shotCount += (hullConfig.passiveBonuses.bonus_shot_count ?? 0);  // pas multiplié
      }

      // Fetch active cooldowns for hull abilities (replaces the talent.list cooldowns
      // path used pre-removal). The flagship_cooldowns table is preserved — its
      // talent_id column now stores the ability id (e.g. 'scan_mission') rather
      // than a talent id.
      const cooldownRows = await db
        .select({
          abilityId: flagshipCooldowns.talentId,
          activatedAt: flagshipCooldowns.activatedAt,
          expiresAt: flagshipCooldowns.expiresAt,
          cooldownEnds: flagshipCooldowns.cooldownEnds,
        })
        .from(flagshipCooldowns)
        .where(eq(flagshipCooldowns.flagshipId, flagship.id));

      const cooldowns: Record<string, { activatedAt: string; expiresAt: string; cooldownEnds: string }> = {};
      for (const cd of cooldownRows) {
        cooldowns[cd.abilityId] = {
          activatedAt: cd.activatedAt.toISOString(),
          expiresAt: cd.expiresAt.toISOString(),
          cooldownEnds: cd.cooldownEnds.toISOString(),
        };
      }

      return { ...flagship, effectiveStats, hullConfig, cooldowns };
    },

    /**
     * V4-XP (2026-05-04) : grant XP to the flagship + recompute level.
     * No-op for amount <= 0.
     *
     * If `executor` is provided (typically a tx from a caller's transaction),
     * runs WITHOUT opening a new transaction or taking an advisory lock — assumes
     * the caller already holds them. Prevents two-connection deadlock when called
     * from within anomalyService.advance/retreat (which already lock on userId).
     *
     * If `executor` is omitted, opens its own transaction with advisory lock
     * (standalone usage).
     */
    async grantXp(userId: string, amount: number, executor?: Database): Promise<{
      newXp: number;
      oldLevel: number;
      newLevel: number;
      levelUp: boolean;
    }> {
      if (amount <= 0) return { newXp: 0, oldLevel: 1, newLevel: 1, levelUp: false };

      const config = await gameConfigService.getFullConfig();
      const maxLevel = Number(config.universe.flagship_max_level) || 60;

      // Inner work — same logic, just runs against either the provided executor
      // or a fresh transaction. The executor branch skips the advisory lock
      // (caller already holds it for the same userId).
      const work = async (tx: Database) => {
        const [flagship] = await tx.select({
          id: flagships.id,
          xp: flagships.xp,
          level: flagships.level,
        }).from(flagships).where(eq(flagships.userId, userId)).for('update').limit(1);
        if (!flagship) {
          return { newXp: 0, oldLevel: 1, newLevel: 1, levelUp: false };
        }

        const oldLevel = flagship.level;
        const newXp = flagship.xp + amount;
        const newLevel = xpToLevel(newXp, maxLevel);

        await tx.update(flagships).set({
          xp: newXp,
          level: newLevel,
          updatedAt: new Date(),
        }).where(eq(flagships.id, flagship.id));

        return { newXp, oldLevel, newLevel, levelUp: newLevel > oldLevel };
      };

      if (executor) {
        // Caller's transaction — skip new tx + advisory lock (caller holds it)
        return work(executor);
      }

      // Standalone — fresh transaction with advisory lock
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);
        return work(tx as unknown as Database);
      });
    },

    async create(userId: string, name: string, hullId: string, description?: string) {
      validateName(name);

      const config = await gameConfigService.getFullConfig();
      const hullConfig = config.hulls[hullId];
      if (!hullConfig) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coque inconnue' });
      }

      // Verifier qu'il n'y a pas deja un flagship
      const [existing] = await db
        .select({ id: flagships.id })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Vous avez deja un vaisseau amiral' });
      }

      // Recuperer la planete mere (premiere planete du joueur)
      const [homePlanet] = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId))
        .orderBy(asc(planets.createdAt))
        .limit(1);

      if (!homePlanet) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune planete trouvee' });
      }

      const sanitizedDesc = description ? sanitizeText(description).slice(0, 256) : '';

      const randomImage = assetsDir ? getRandomFlagshipImageIndex(hullId, assetsDir) : null;

      const [created] = await db
        .insert(flagships)
        .values({
          userId,
          planetId: homePlanet.id,
          name: sanitizeText(name),
          description: sanitizedDesc,
          flagshipImageIndex: randomImage,
          hullId,
        })
        .returning();

      await db.update(users).set({ playstyle: hullConfig.playstyle }).where(eq(users.id, userId));

      return created;
    },

    async rename(userId: string, name: string, description?: string) {
      validateName(name);

      const [flagship] = await db
        .select({ id: flagships.id })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun vaisseau amiral' });
      }

      const sanitizedDesc = description !== undefined
        ? sanitizeText(description).slice(0, 256)
        : undefined;

      const updateData: Record<string, unknown> = {
        name: sanitizeText(name),
        updatedAt: new Date(),
      };
      if (sanitizedDesc !== undefined) {
        updateData.description = sanitizedDesc;
      }

      const [updated] = await db
        .update(flagships)
        .set(updateData)
        .where(eq(flagships.id, flagship.id))
        .returning();

      return updated;
    },

    async repair(userId: string) {
      const [flagship] = await db
        .select()
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun vaisseau amiral' });
      }

      if (flagship.status !== 'incapacitated') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le vaisseau amiral n\'est pas incapacite' });
      }

      const config = await gameConfigService.getFullConfig();
      const cost = Number(config.universe['flagship_instant_repair_exilium_cost']) || 2;

      // Depenser l'Exilium (throw si solde insuffisant)
      await exiliumService.spend(userId, cost, 'flagship_repair', { flagshipId: flagship.id });

      const [updated] = await db
        .update(flagships)
        .set({ status: 'active', repairEndsAt: null, updatedAt: new Date() })
        .where(eq(flagships.id, flagship.id))
        .returning();

      return updated;
    },

    async incapacitate(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const baseRepairSeconds = Number(config.universe['flagship_repair_duration_seconds']) || 7200;

      // Talent: reduction du temps de reparation
      const talentCtx = talentService ? await talentService.computeTalentContext(userId) : {};
      const repairBonus = talentCtx['flagship_repair_time'] ?? 0;
      const repairSeconds = Math.round(baseRepairSeconds / (1 + repairBonus));

      // Recuperer la planete mere
      const [homePlanet] = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId))
        .orderBy(asc(planets.createdAt))
        .limit(1);

      if (!homePlanet) return;

      const repairEndsAt = new Date(Date.now() + repairSeconds * 1000);

      await db
        .update(flagships)
        .set({
          status: 'incapacitated',
          repairEndsAt,
          planetId: homePlanet.id,
          updatedAt: new Date(),
        })
        .where(eq(flagships.userId, userId));
    },

    // Helpers pour fleet integration
    async setInMission(userId: string) {
      await db
        .update(flagships)
        .set({ status: 'in_mission', updatedAt: new Date() })
        .where(eq(flagships.userId, userId));
    },

    async returnFromMission(userId: string, planetId: string) {
      await db
        .update(flagships)
        .set({ status: 'active', planetId, updatedAt: new Date() })
        .where(eq(flagships.userId, userId));
    },

    listImages(hullId: string): number[] {
      if (!assetsDir) return [];
      return listFlagshipImageIndexes(hullId, assetsDir);
    },

    async updateImage(userId: string, imageIndex: number) {
      const [flagship] = await db
        .select({ id: flagships.id, hullId: flagships.hullId })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Vaisseau amiral introuvable' });
      }

      if (flagship.hullId && assetsDir) {
        const available = listFlagshipImageIndexes(flagship.hullId, assetsDir);
        if (!available.includes(imageIndex)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Image non disponible pour cette coque' });
        }
      }

      const [updated] = await db
        .update(flagships)
        .set({ flagshipImageIndex: imageIndex, updatedAt: new Date() })
        .where(eq(flagships.userId, userId))
        .returning();

      return updated;
    },

    async changeHull(userId: string, newHullId: string) {
      const config = await gameConfigService.getFullConfig();
      const hullConfig = config.hulls[newHullId];
      if (!hullConfig) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coque inconnue' });

      const [flagship] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vaisseau amiral introuvable' });
      if (flagship.hullId === newHullId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous avez deja cette coque' });
      if (flagship.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le vaisseau amiral doit etre stationne' });

      const now = new Date();

      // TODO: re-enable cooldown and cost after testing
      // const isFirstChange = !flagship.hullChangedAt;
      // if (!isFirstChange && flagship.hullChangeAvailableAt && now < flagship.hullChangeAvailableAt) {
      //   throw new TRPCError({ code: 'BAD_REQUEST', message: 'Changement de coque en cooldown' });
      // }
      // if (!isFirstChange && resourceService) {
      //   const [exiliumRecord] = await db.select({ totalEarned: userExilium.totalEarned })
      //     .from(userExilium).where(eq(userExilium.userId, userId)).limit(1);
      //   const totalEarned = Number(exiliumRecord?.totalEarned ?? 0);
      //   const totalCost = totalEarned * hullConfig.changeCost.baseMultiplier;
      //   const ratioSum = hullConfig.changeCost.resourceRatio.minerai + hullConfig.changeCost.resourceRatio.silicium + hullConfig.changeCost.resourceRatio.hydrogene;
      //   const cost = {
      //     minerai: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.minerai / ratioSum),
      //     silicium: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.silicium / ratioSum),
      //     hydrogene: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.hydrogene / ratioSum),
      //   };
      //   await resourceService.spendResources(flagship.planetId, userId, cost);
      // }

      const refitEnd = new Date(now.getTime() + hullConfig.unavailabilitySeconds * 1000);
      const cooldownEnd = new Date(refitEnd.getTime() + hullConfig.cooldownSeconds * 1000);
      const newImage = assetsDir ? getRandomFlagshipImageIndex(newHullId, assetsDir) : null;

      await db.update(flagships).set({
        hullId: newHullId,
        status: 'hull_refit',
        refitEndsAt: refitEnd,
        hullChangedAt: now,
        hullChangeAvailableAt: cooldownEnd,
        flagshipImageIndex: newImage,
        updatedAt: now,
      }).where(eq(flagships.id, flagship.id));

      await db.update(users).set({ playstyle: hullConfig.playstyle }).where(eq(users.id, userId));

      return { newHullId, refitEndsAt: refitEnd, cooldownEndsAt: cooldownEnd };
    },

    async recalculateBaseStats(userId: string) {
      const [flagship] = await db
        .select({ id: flagships.id, unlockedShips: flagships.unlockedShips })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) return;

      const config = await gameConfigService.getFullConfig();
      const shipDefs: Record<string, { weapons: number; shield: number; hull: number; baseArmor: number; shotCount: number; baseSpeed: number; fuelConsumption: number; cargoCapacity: number }> = {};
      for (const [id, def] of Object.entries(config.ships)) {
        shipDefs[id] = {
          weapons: def.weapons,
          shield: def.shield,
          hull: def.hull,
          baseArmor: def.baseArmor,
          shotCount: def.shotCount,
          baseSpeed: def.baseSpeed,
          fuelConsumption: def.fuelConsumption,
          cargoCapacity: def.cargoCapacity,
        };
      }

      const stats = computeBaseStatsFromShips(flagship.unlockedShips, shipDefs);

      await db
        .update(flagships)
        .set({ ...stats, updatedAt: new Date() })
        .where(eq(flagships.id, flagship.id));
    },

    async addUnlockedShip(userId: string, shipId: string) {
      if ((FLAGSHIP_EXCLUDED_SHIPS as readonly string[]).includes(shipId)) return;

      const [flagship] = await db
        .select({ id: flagships.id, unlockedShips: flagships.unlockedShips })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) return;
      if (flagship.unlockedShips.includes(shipId)) return;

      const updatedList = [...flagship.unlockedShips, shipId];

      const config = await gameConfigService.getFullConfig();
      const shipDefs: Record<string, { weapons: number; shield: number; hull: number; baseArmor: number; shotCount: number; baseSpeed: number; fuelConsumption: number; cargoCapacity: number }> = {};
      for (const [id, def] of Object.entries(config.ships)) {
        shipDefs[id] = {
          weapons: def.weapons,
          shield: def.shield,
          hull: def.hull,
          baseArmor: def.baseArmor,
          shotCount: def.shotCount,
          baseSpeed: def.baseSpeed,
          fuelConsumption: def.fuelConsumption,
          cargoCapacity: def.cargoCapacity,
        };
      }

      const stats = computeBaseStatsFromShips(updatedList, shipDefs);

      await db
        .update(flagships)
        .set({ unlockedShips: updatedList, ...stats, updatedAt: new Date() })
        .where(eq(flagships.id, flagship.id));
    },

    async scan(userId: string, targetGalaxy: number, targetSystem: number, targetPosition: number) {
      // 1. Validate flagship
      const [flagship] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vaisseau amiral introuvable' });
      if (flagship.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le vaisseau amiral doit etre stationne' });

      // 1b. Check scan ability from hull config
      const config = await gameConfigService.getFullConfig();
      const hullConfig = flagship.hullId ? config.hulls[flagship.hullId] : null;
      const scanAbility = (hullConfig?.abilities ?? []).find((a) => a.id === 'scan_mission' && a.type === 'active');
      if (!scanAbility) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Votre coque ne dispose pas de la capacite de scan' });

      // 2. Check cooldown
      const SCAN_COOLDOWN_ID = 'scan_mission';
      const [cooldown] = await db.select().from(flagshipCooldowns)
        .where(and(eq(flagshipCooldowns.flagshipId, flagship.id), eq(flagshipCooldowns.talentId, SCAN_COOLDOWN_ID)))
        .limit(1);
      if (cooldown && cooldown.cooldownEnds && new Date() < cooldown.cooldownEnds) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Scan en cooldown' });
      }

      // 3. Get scan params from ability config
      const espionageBonus = Number((scanAbility as any).params?.espionageBonus ?? 5);

      // 4. Get attacker tech
      const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, userId)).limit(1);
      const attackerTech = (research?.espionageTech ?? 0) + espionageBonus;

      // 5. Find target planet
      const [targetPlanet] = await db.select().from(planets)
        .where(and(eq(planets.galaxy, targetGalaxy), eq(planets.system, targetSystem), eq(planets.position, targetPosition)))
        .limit(1);
      if (!targetPlanet) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune planete a ces coordonnees' });

      // 6. Defender tech
      const [defResearch] = await db.select().from(userResearch).where(eq(userResearch.userId, targetPlanet.userId)).limit(1);
      const defenderTech = defResearch?.espionageTech ?? 0;

      // 7. Calculate spy report (1 virtual probe, no detection)
      const spyThresholds = (config.universe['spy_visibility_thresholds'] as number[] | undefined) ?? [1, 3, 5, 7, 9];
      const visibility = calculateSpyReport(1, attackerTech, defenderTech, spyThresholds);

      // 8. Collect report data (same structure as SpyHandler)
      const reportResult: Record<string, unknown> = {
        visibility,
        probeCount: 1,
        attackerTech,
        defenderTech,
        detectionChance: 0,
        detected: false,
        scanMission: true,
      };

      if (visibility.resources) {
        if (resourceService) {
          await resourceService.materializeResources(targetPlanet.id, targetPlanet.userId);
        }
        const [planet] = await db.select().from(planets).where(eq(planets.id, targetPlanet.id)).limit(1);
        reportResult.resources = {
          minerai: Math.floor(Number(planet.minerai)),
          silicium: Math.floor(Number(planet.silicium)),
          hydrogene: Math.floor(Number(planet.hydrogene)),
        };
      }

      if (visibility.fleet) {
        const [targetShipsRow] = await db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
        if (targetShipsRow) {
          const fleetData: Record<string, number> = {};
          for (const [key, val] of Object.entries(targetShipsRow)) {
            if (key === 'planetId') continue;
            if (typeof val === 'number' && val > 0) fleetData[key] = val;
          }
          reportResult.fleet = fleetData;
        }
        // Check defender flagship
        const [defFlagship] = await db.select({ name: flagships.name, status: flagships.status, weapons: flagships.weapons, shield: flagships.shield, hull: flagships.hull, cargoCapacity: flagships.cargoCapacity })
          .from(flagships).where(and(eq(flagships.userId, targetPlanet.userId), eq(flagships.planetId, targetPlanet.id), eq(flagships.status, 'active'))).limit(1);
        if (defFlagship) {
          reportResult.flagship = { name: defFlagship.name, weapons: defFlagship.weapons, shield: defFlagship.shield, hull: defFlagship.hull, cargoCapacity: defFlagship.cargoCapacity };
        }
      }

      if (visibility.defenses) {
        const [targetDefsRow] = await db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);
        if (targetDefsRow) {
          const defensesData: Record<string, number> = {};
          for (const [key, val] of Object.entries(targetDefsRow)) {
            if (key === 'planetId') continue;
            if (typeof val === 'number' && val > 0) defensesData[key] = val;
          }
          reportResult.defenses = defensesData;
        }
      }

      if (visibility.buildings) {
        const bRows = await db.select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
          .from(planetBuildings).where(eq(planetBuildings.planetId, targetPlanet.id));
        const buildingsData: Record<string, number> = {};
        for (const row of bRows) {
          if (row.level > 0) buildingsData[row.buildingId] = row.level;
        }
        reportResult.buildings = buildingsData;
      }

      if (visibility.research) {
        if (defResearch) {
          const researchData: Record<string, number> = {};
          for (const [key, val] of Object.entries(defResearch)) {
            if (key === 'userId') continue;
            if (typeof val === 'number' && val > 0) researchData[key] = val;
          }
          reportResult.research = researchData;
        }
      }

      // 9. Attach scanner flagship info to report
      reportResult.scanner = {
        name: flagship.name,
        hullId: flagship.hullId,
        espionageBonus,
      };

      // 9b. Attach target planet name + owner for report title and detail
      const [targetOwner] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, targetPlanet.userId))
        .limit(1);
      const targetOwnerName = targetOwner?.username ?? 'Inconnu';
      reportResult.targetPlanetName = targetPlanet.name;
      reportResult.targetOwnerName = targetOwnerName;

      // 10. Create report
      let reportId: string | undefined;
      if (reportService) {
        const coords = `[${targetGalaxy}:${targetSystem}:${targetPosition}]`;
        const report = await reportService.create({
          userId,
          missionType: 'scan',
          title: `Rapport de scan — ${targetPlanet.name} ${coords} · ${targetOwnerName}`,
          coordinates: { galaxy: targetGalaxy, system: targetSystem, position: targetPosition },
          fleet: { ships: {}, totalCargo: 0 },
          departureTime: new Date(),
          completionTime: new Date(),
          result: reportResult,
        });
        reportId = report.id;
      }

      // 11. Set cooldown
      const now = new Date();
      const cooldownSeconds = (scanAbility as any).cooldownSeconds ?? 1800;
      const cooldownEnds = new Date(now.getTime() + cooldownSeconds * 1000);
      await db.insert(flagshipCooldowns).values({
        flagshipId: flagship.id,
        talentId: SCAN_COOLDOWN_ID,
        activatedAt: now,
        expiresAt: now,
        cooldownEnds,
      }).onConflictDoUpdate({
        target: [flagshipCooldowns.flagshipId, flagshipCooldowns.talentId],
        set: { activatedAt: now, expiresAt: now, cooldownEnds },
      });

      return { reportId, cooldownEnds: cooldownEnds.toISOString() };
    },
  };
}
