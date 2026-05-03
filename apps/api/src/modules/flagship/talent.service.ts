import { eq } from 'drizzle-orm';
import { flagships, planetBuildings } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { GameConfigService } from '../admin/game-config.service.js';

/**
 * Thin wrapper post-talents-removal (2026-05-03). The talent system was
 * archived; only the `computeTalentContext` API is preserved to avoid
 * touching the 30 call sites that consume it. The implementation now
 * returns only hull passive bonuses + parallel_build slot bonuses
 * (commandCenter ≥10 / shipyard ≥10 on the flagship's planet).
 *
 * The other methods (list / invest / respec / resetAll / activate /
 * getStatBonuses / getActiveBuffs / getGlobalBonuses / getPlanetBonuses)
 * have been removed — their UI / mutations no longer exist.
 *
 * Cosmetic rename to `flagshipBonusService` is deferred to a later PR.
 */
export function createTalentService(
  db: Database,
  gameConfigService: GameConfigService,
) {
  return {
    /**
     * Returns a Record of bonus keys → values for the given user/planet.
     * Kept identical in shape to the pre-removal API so all 30 consumers
     * keep working without modification.
     */
    async computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> {
      const [flagship] = await db
        .select({
          id: flagships.id,
          planetId: flagships.planetId,
          status: flagships.status,
          hullId: flagships.hullId,
        })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);
      if (!flagship) return {};

      const config = await gameConfigService.getFullConfig();
      const ctx: Record<string, number> = {};

      // 1. Passifs coque (toujours actifs, indépendants de la planète)
      if (flagship.hullId) {
        const hullConfig = config.hulls[flagship.hullId];
        if (hullConfig) {
          for (const [key, value] of Object.entries(hullConfig.passiveBonuses)) {
            // Conserver le préfixe `hull_` pour les bonus de réduction temps
            // (utilisés par les consumers existants comme `hull_combat_build_time_reduction`)
            if (key.endsWith('_time_reduction') || key.endsWith('_build_time_reduction')) {
              ctx[`hull_${key}`] = value as number;
            }
            // Bonus mining/prospection/repair NEW : exposés sans préfixe pour
            // remplacer les anciennes clés talent (mining_speed, prospection_speed,
            // flagship_repair_time).
            if (key === 'mining_speed_bonus')      ctx['mining_speed']         = value as number;
            if (key === 'prospection_speed_bonus') ctx['prospection_speed']    = value as number;
            if (key === 'repair_time_reduction')   ctx['flagship_repair_time'] = value as number;
          }
        }
      }

      // 2. Parallel build via bâtiments (planète flagship uniquement)
      if (planetId && flagship.planetId === planetId) {
        const pbRows = await db
          .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
          .from(planetBuildings)
          .where(eq(planetBuildings.planetId, planetId));
        const cmdLevel = pbRows.find((pb) => pb.buildingId === 'commandCenter')?.level ?? 0;
        const shyLevel = pbRows.find((pb) => pb.buildingId === 'shipyard')?.level ?? 0;
        if (cmdLevel >= 10) ctx['military_parallel_build']   = (ctx['military_parallel_build']   ?? 0) + 1;
        if (shyLevel >= 10) ctx['industrial_parallel_build'] = (ctx['industrial_parallel_build'] ?? 0) + 1;
      }

      return ctx;
    },
  };
}
