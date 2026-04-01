import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships, planets, users, userExilium } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createTalentService } from './talent.service.js';
import type { createResourceService } from '../resource/resource.service.js';
import { listFlagshipImageIndexes, getRandomFlagshipImageIndex } from '../../lib/flagship-image.util.js';
import { computeBaseStatsFromShips, FLAGSHIP_EXCLUDED_SHIPS } from '@exilium/game-engine';

// Regex de validation du nom : lettres (toutes langues), chiffres, espaces, tirets, apostrophes
const NAME_REGEX = /^[\p{L}\p{N}\s\-']{2,32}$/u;

export function createFlagshipService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
  talentService?: ReturnType<typeof createTalentService>,
  assetsDir?: string,
  resourceService?: ReturnType<typeof createResourceService>,
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

      console.log(`[flagship] get: id=${flagship.id}, status=${flagship.status}, planetId=${flagship.planetId}, repairEndsAt=${flagship.repairEndsAt?.toISOString() ?? 'null'}`);

      // Verification lazy de la reparation
      if (flagship.status === 'incapacitated' && flagship.repairEndsAt) {
        const now = new Date();
        console.log(`[flagship] lazy-repair check: status=${flagship.status}, repairEndsAt=${flagship.repairEndsAt.toISOString()}, now=${now.toISOString()}, expired=${now >= flagship.repairEndsAt}`);
        if (now >= flagship.repairEndsAt) {
          // Ensure flagship returns to home planet after repair
          const [homePlanet] = await db
            .select({ id: planets.id })
            .from(planets)
            .where(eq(planets.userId, userId))
            .orderBy(asc(planets.createdAt))
            .limit(1);
          const repairedPlanetId = homePlanet?.id ?? flagship.planetId;
          console.log(`[flagship] lazy-repair: repairing flagship ${flagship.id}, planetId=${repairedPlanetId}`);
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

      // Appliquer les bonus de talents si le service est disponible
      if (talentService) {
        const config = await gameConfigService.getFullConfig();
        const talentData = await talentService.list(userId);
        const statBonuses = talentService.getStatBonuses(talentData.ranks, config.talents);

        const effectiveStats = {
          weapons: flagship.weapons + (statBonuses.weapons ?? 0),
          shield: flagship.shield + (statBonuses.shield ?? 0),
          hull: flagship.hull + (statBonuses.hull ?? 0),
          baseArmor: flagship.baseArmor + (statBonuses.baseArmor ?? 0),
          shotCount: flagship.shotCount + (statBonuses.shotCount ?? 0),
          cargoCapacity: flagship.cargoCapacity + (statBonuses.cargoCapacity ?? 0),
          fuelConsumption: Math.max(0, flagship.fuelConsumption + (statBonuses.fuelConsumption ?? 0)),
          baseSpeed: Math.round(flagship.baseSpeed * (1 + (statBonuses.speedPercent ?? 0))),
          driveType: flagship.driveType,
        };

        // Gestion des unlocks (propulsion)
        for (const [talentId, rank] of Object.entries(talentData.ranks)) {
          if (rank <= 0) continue;
          const def = config.talents[talentId];
          if (!def || def.effectType !== 'unlock') continue;
          const params = def.effectParams as { key: string };
          if (params.key === 'drive_impulse') {
            effectiveStats.driveType = 'impulsion';
          } else if (params.key === 'drive_hyperspace') {
            effectiveStats.driveType = 'hyperespace';
          }
        }

        return { ...flagship, talentBonuses: statBonuses, effectiveStats };
      }

      return flagship;
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
      const repairSeconds = Number(config.universe['flagship_repair_duration_seconds']) || 7200;

      // Recuperer la planete mere
      const [homePlanet] = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId))
        .orderBy(asc(planets.createdAt))
        .limit(1);

      if (!homePlanet) return;

      const repairEndsAt = new Date(Date.now() + repairSeconds * 1000);
      console.log(`[flagship] incapacitate: userId=${userId}, homePlanetId=${homePlanet.id}, repairEndsAt=${repairEndsAt.toISOString()}, repairSeconds=${repairSeconds}`);

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
      console.log(`[flagship] returnFromMission: userId=${userId}, planetId=${planetId}`);
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
      const isFirstChange = !flagship.hullChangedAt;

      if (!isFirstChange && flagship.hullChangeAvailableAt && now < flagship.hullChangeAvailableAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Changement de coque en cooldown' });
      }

      // Cost (skip if first change — free for migrated players)
      if (!isFirstChange && resourceService) {
        const [exiliumRecord] = await db.select({ totalEarned: userExilium.totalEarned })
          .from(userExilium).where(eq(userExilium.userId, userId)).limit(1);
        const totalEarned = Number(exiliumRecord?.totalEarned ?? 0);
        const totalCost = totalEarned * hullConfig.changeCost.baseMultiplier;
        const ratioSum = hullConfig.changeCost.resourceRatio.minerai + hullConfig.changeCost.resourceRatio.silicium + hullConfig.changeCost.resourceRatio.hydrogene;
        const cost = {
          minerai: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.minerai / ratioSum),
          silicium: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.silicium / ratioSum),
          hydrogene: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.hydrogene / ratioSum),
        };
        await resourceService.spendResources(flagship.planetId, userId, cost);
      }

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
  };
}
