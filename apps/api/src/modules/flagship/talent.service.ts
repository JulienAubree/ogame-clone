import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships, flagshipTalents, flagshipCooldowns } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { GameConfigService, TalentConfig } from '../admin/game-config.service.js';

export function createTalentService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
) {
  async function getFlagship(userId: string) {
    const [flagship] = await db
      .select({ id: flagships.id, userId: flagships.userId, planetId: flagships.planetId, status: flagships.status })
      .from(flagships)
      .where(eq(flagships.userId, userId))
      .limit(1);
    if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun vaisseau amiral' });
    return flagship;
  }

  async function getTalentRanks(flagshipId: string): Promise<Record<string, number>> {
    const rows = await db.select().from(flagshipTalents).where(eq(flagshipTalents.flagshipId, flagshipId));
    return Object.fromEntries(rows.map(r => [r.talentId, r.currentRank]));
  }

  function getTierCost(tier: number, config: Awaited<ReturnType<typeof gameConfigService.getFullConfig>>): number {
    const key = `talent_cost_tier_${tier}`;
    return Number(config.universe[key]) || tier;
  }

  function getTierThreshold(tier: number, config: Awaited<ReturnType<typeof gameConfigService.getFullConfig>>): number {
    if (tier <= 1) return 0;
    const key = `talent_tier_${tier}_threshold`;
    return Number(config.universe[key]) || (tier - 1) * 5;
  }

  function getPointsInBranch(branchId: string, ranks: Record<string, number>, talents: Record<string, TalentConfig>): number {
    let total = 0;
    for (const [talentId, rank] of Object.entries(ranks)) {
      const def = talents[talentId];
      if (def && def.branchId === branchId) total += rank;
    }
    return total;
  }

  return {
    // ── LIST ──

    async list(userId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const ranks = await getTalentRanks(flagship.id);

      // Cooldowns actifs
      const cooldownRows = await db.select().from(flagshipCooldowns).where(eq(flagshipCooldowns.flagshipId, flagship.id));
      const cooldowns: Record<string, { activatedAt: string; expiresAt: string; cooldownEnds: string }> = {};
      for (const c of cooldownRows) {
        cooldowns[c.talentId] = {
          activatedAt: c.activatedAt.toISOString(),
          expiresAt: c.expiresAt.toISOString(),
          cooldownEnds: c.cooldownEnds.toISOString(),
        };
      }

      return {
        branches: config.talentBranches,
        talents: config.talents,
        ranks,
        cooldowns,
      };
    },

    // ── INVEST ──

    async invest(userId: string, talentId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const talentDef = config.talents[talentId];
      if (!talentDef) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent inconnu' });

      const ranks = await getTalentRanks(flagship.id);
      const currentRank = ranks[talentId] ?? 0;

      // Verifier rang max
      if (currentRank >= talentDef.maxRanks) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rang maximum atteint' });
      }

      // Verifier seuil de tier
      const branchPoints = getPointsInBranch(talentDef.branchId, ranks, config.talents);
      const threshold = getTierThreshold(talentDef.tier, config);
      if (branchPoints < threshold) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Investissez ${threshold} points dans la branche pour débloquer le tier ${talentDef.tier}` });
      }

      // Verifier prerequis
      if (talentDef.prerequisiteId) {
        const prereqRank = ranks[talentDef.prerequisiteId] ?? 0;
        if (prereqRank < 1) {
          const prereqDef = config.talents[talentDef.prerequisiteId];
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Prérequis manquant : ${prereqDef?.name ?? talentDef.prerequisiteId}` });
        }
      }

      // Calculer le cout
      const cost = getTierCost(talentDef.tier, config);

      // Depenser l'Exilium
      await exiliumService.spend(userId, cost, 'talent_unlock', {
        talentId,
        branchId: talentDef.branchId,
        tier: talentDef.tier,
        newRank: currentRank + 1,
      });

      // Inserer ou mettre a jour le rang
      if (currentRank === 0) {
        await db.insert(flagshipTalents).values({
          flagshipId: flagship.id,
          talentId,
          currentRank: 1,
        });
      } else {
        await db.update(flagshipTalents)
          .set({ currentRank: sql`${flagshipTalents.currentRank} + 1` })
          .where(and(eq(flagshipTalents.flagshipId, flagship.id), eq(flagshipTalents.talentId, talentId)));
      }

      return { talentId, newRank: currentRank + 1, cost };
    },

    // ── STAT BONUSES ──

    getStatBonuses(ranks: Record<string, number>, talents: Record<string, TalentConfig>): Record<string, number> {
      const bonuses: Record<string, number> = {};
      for (const [talentId, rank] of Object.entries(ranks)) {
        if (rank <= 0) continue;
        const def = talents[talentId];
        if (!def || def.effectType !== 'modify_stat') continue;
        const params = def.effectParams as { stat: string; perRank: number };
        bonuses[params.stat] = (bonuses[params.stat] ?? 0) + params.perRank * rank;
      }
      return bonuses;
    },

    // ── GLOBAL BONUSES ──

    getGlobalBonuses(ranks: Record<string, number>, talents: Record<string, TalentConfig>): Record<string, number> {
      const bonuses: Record<string, number> = {};
      for (const [talentId, rank] of Object.entries(ranks)) {
        if (rank <= 0) continue;
        const def = talents[talentId];
        if (!def || def.effectType !== 'global_bonus') continue;
        const params = def.effectParams as { key: string; perRank: number };
        bonuses[params.key] = (bonuses[params.key] ?? 0) + params.perRank * rank;
      }
      return bonuses;
    },

    // ── PLANET BONUSES ──

    async getPlanetBonuses(userId: string, planetId: string): Promise<Record<string, number>> {
      const [flagship] = await db.select({ id: flagships.id, planetId: flagships.planetId, status: flagships.status })
        .from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship || flagship.status !== 'active' || flagship.planetId !== planetId) return {};

      const config = await gameConfigService.getFullConfig();
      const ranks = await getTalentRanks(flagship.id);

      const bonuses: Record<string, number> = {};
      for (const [talentId, rank] of Object.entries(ranks)) {
        if (rank <= 0) continue;
        const def = config.talents[talentId];
        if (!def || def.effectType !== 'planet_bonus') continue;
        const params = def.effectParams as { key: string; perRank: number };
        bonuses[params.key] = (bonuses[params.key] ?? 0) + params.perRank * rank;
      }
      return bonuses;
    },

    // ── RESPEC ──

    async respec(userId: string, talentId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const talentDef = config.talents[talentId];
      if (!talentDef) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent inconnu' });

      const ranks = await getTalentRanks(flagship.id);
      const currentRank = ranks[talentId] ?? 0;
      if (currentRank <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent non débloqué' });

      // Trouver les talents dependants (cascade)
      const dependants: string[] = [];
      function findDependants(parentId: string) {
        for (const [id, def] of Object.entries(config.talents)) {
          if (def.prerequisiteId === parentId && (ranks[id] ?? 0) > 0) {
            dependants.push(id);
            findDependants(id);
          }
        }
      }
      findDependants(talentId);

      // Calculer le cout total du respec (talent + dependants)
      const respecRatio = Number(config.universe['talent_respec_ratio']) || 0.5;
      let totalRespecCost = 0;
      const talentsToReset = [talentId, ...dependants];
      for (const id of talentsToReset) {
        const rank = ranks[id] ?? 0;
        const def = config.talents[id];
        if (!def || rank <= 0) continue;
        const tierCost = getTierCost(def.tier, config);
        const invested = tierCost * rank;
        totalRespecCost += Math.ceil(invested * respecRatio);
      }

      // Depenser l'Exilium pour le respec
      await exiliumService.spend(userId, totalRespecCost, 'respec', {
        talentId,
        cascade: dependants,
        cost: totalRespecCost,
      });

      // Supprimer les rangs (talent + cascade)
      for (const id of talentsToReset) {
        await db.delete(flagshipTalents)
          .where(and(eq(flagshipTalents.flagshipId, flagship.id), eq(flagshipTalents.talentId, id)));
      }

      return { reset: talentsToReset, cost: totalRespecCost };
    },

    // ── RESET ALL ──

    async resetAll(userId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const fullResetCost = Number(config.universe['talent_full_reset_cost']) || 50;

      // Verifier qu'il y a des talents a reset
      const ranks = await getTalentRanks(flagship.id);
      const investedCount = Object.values(ranks).filter(r => r > 0).length;
      if (investedCount === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun talent à réinitialiser' });

      // Depenser l'Exilium
      await exiliumService.spend(userId, fullResetCost, 'respec', { cost: fullResetCost });

      // Supprimer tous les rangs
      await db.delete(flagshipTalents).where(eq(flagshipTalents.flagshipId, flagship.id));

      // Supprimer tous les cooldowns
      await db.delete(flagshipCooldowns).where(eq(flagshipCooldowns.flagshipId, flagship.id));

      return { cost: fullResetCost };
    },

    // ── ACTIVATE BUFF ──

    async activate(userId: string, talentId: string) {
      const flagship = await getFlagship(userId);

      // Le flagship doit etre stationne (actif)
      if (flagship.status !== 'active') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le vaisseau amiral doit être stationné pour activer un talent' });
      }

      const config = await gameConfigService.getFullConfig();
      const talentDef = config.talents[talentId];
      if (!talentDef || talentDef.effectType !== 'timed_buff') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ce talent n\'est pas activable' });
      }

      // Verifier que le talent est debloque
      const ranks = await getTalentRanks(flagship.id);
      if ((ranks[talentId] ?? 0) < 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent non débloqué' });
      }

      // Verifier le cooldown
      const [existingCd] = await db.select().from(flagshipCooldowns)
        .where(and(eq(flagshipCooldowns.flagshipId, flagship.id), eq(flagshipCooldowns.talentId, talentId)))
        .limit(1);

      if (existingCd && new Date() < existingCd.cooldownEnds) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent en cooldown' });
      }

      const params = talentDef.effectParams as { key: string; multiplier: number; durationSeconds: number; cooldownSeconds: number };
      const now = new Date();
      const expiresAt = new Date(now.getTime() + params.durationSeconds * 1000);
      const cooldownEnds = new Date(now.getTime() + params.cooldownSeconds * 1000);

      // Upsert le cooldown
      if (existingCd) {
        await db.update(flagshipCooldowns)
          .set({ activatedAt: now, expiresAt, cooldownEnds })
          .where(and(eq(flagshipCooldowns.flagshipId, flagship.id), eq(flagshipCooldowns.talentId, talentId)));
      } else {
        await db.insert(flagshipCooldowns).values({
          flagshipId: flagship.id,
          talentId,
          activatedAt: now,
          expiresAt,
          cooldownEnds,
        });
      }

      return {
        talentId,
        activatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        cooldownEnds: cooldownEnds.toISOString(),
      };
    },

    // ── ACTIVE BUFFS ──

    async getActiveBuffs(userId: string, planetId?: string): Promise<Array<{ talentId: string; key: string; multiplier: number; expiresAt: string }>> {
      const [flagship] = await db.select({ id: flagships.id })
        .from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship) return [];

      const config = await gameConfigService.getFullConfig();
      const cooldownRows = await db.select().from(flagshipCooldowns)
        .where(eq(flagshipCooldowns.flagshipId, flagship.id));

      const now = new Date();
      const active: Array<{ talentId: string; key: string; multiplier: number; expiresAt: string }> = [];
      for (const cd of cooldownRows) {
        if (now >= cd.expiresAt) continue; // Buff expire
        const def = config.talents[cd.talentId];
        if (!def || def.effectType !== 'timed_buff') continue;
        const params = def.effectParams as { key: string; multiplier: number };
        active.push({
          talentId: cd.talentId,
          key: params.key,
          multiplier: params.multiplier,
          expiresAt: cd.expiresAt.toISOString(),
        });
      }
      return active;
    },

    // ── COMPUTE TALENT CONTEXT ──

    async computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> {
      // 1. Fetch flagship — return {} if none exists
      const [flagship] = await db
        .select({ id: flagships.id, planetId: flagships.planetId, status: flagships.status })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);
      if (!flagship) return {};

      // 2. Fetch talent ranks
      const ranks = await getTalentRanks(flagship.id);

      // 3. Fetch game config (cached)
      const config = await gameConfigService.getFullConfig();

      // 4. Fetch cooldown rows
      const cooldownRows = await db.select().from(flagshipCooldowns)
        .where(eq(flagshipCooldowns.flagshipId, flagship.id));

      // Index active cooldowns by talentId for quick lookup
      const now = new Date();
      const activeCooldowns = new Map<string, boolean>();
      for (const cd of cooldownRows) {
        if (now < cd.expiresAt) {
          activeCooldowns.set(cd.talentId, true);
        }
      }

      const isPlanetBonusActive = flagship.status === 'active' && flagship.planetId === planetId;

      // 5. Build context
      const ctx: Record<string, number> = {};

      for (const [talentId, rank] of Object.entries(ranks)) {
        if (rank <= 0) continue;

        const def = config.talents[talentId];
        if (!def) continue;

        switch (def.effectType) {
          case 'global_bonus': {
            const params = def.effectParams as { key: string; perRank: number };
            ctx[params.key] = (ctx[params.key] ?? 0) + params.perRank * rank;
            break;
          }

          case 'planet_bonus': {
            if (!isPlanetBonusActive) break;
            const params = def.effectParams as { key: string; perRank: number };
            ctx[params.key] = (ctx[params.key] ?? 0) + params.perRank * rank;
            break;
          }

          case 'timed_buff': {
            if (!activeCooldowns.has(talentId)) break;
            const params = def.effectParams as { key: string; perRank: number; durationSeconds: number; cooldownSeconds: number };
            ctx[params.key] = (ctx[params.key] ?? 0) + params.perRank * rank;
            break;
          }

          case 'unlock': {
            const params = def.effectParams as { key: string };
            ctx[params.key] = (ctx[params.key] ?? 0) + rank;
            break;
          }

          // modify_stat: skip — already handled by getStatBonuses()
        }
      }

      return ctx;
    },
  };
}
