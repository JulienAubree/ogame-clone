import { bossEntrySchema, type BossEntry, tierForBossDepth, BOSS_DEPTHS } from './anomaly-bosses.types.js';
import { DEFAULT_ANOMALY_BOSSES } from './anomaly-bosses.seed.js';

/**
 * V9 Boss — service singleton qui expose la pool de boss seedée + helpers
 * de tirage (par tier / depth, anti-répétition intra-run).
 *
 * Pour V1, la pool est statique (lue depuis le seed). Une future version
 * pourra synchroniser la pool avec une row admin (anomaly_content extended)
 * sans changer la signature de pickBossForDepth.
 */
export function createAnomalyBossesService() {
  // Parse-once à l'init pour appliquer les defaults zod.
  const parsed: BossEntry[] = DEFAULT_ANOMALY_BOSSES
    .map(b => bossEntrySchema.parse(b));

  function getPool(): BossEntry[] {
    return parsed;
  }

  /**
   * True si la depth donnée est une "boss depth" (1, 5, 10, 15, 20).
   */
  function isBossDepth(depth: number): boolean {
    return (BOSS_DEPTHS as readonly number[]).includes(depth);
  }

  /**
   * Tire un boss éligible pour la depth demandée, en excluant ceux déjà
   * vaincus dans la run en cours. Retourne null si la pool est épuisée
   * pour ce tier (cas extrême — ne doit jamais arriver vu qu'il y a 5 boss/run
   * et 15+ par tier). Le caller fallback sur un combat normal.
   */
  function pickBossForDepth(
    depth: number,
    defeatedIds: string[],
    rng: () => number = Math.random,
  ): BossEntry | null {
    const tier = tierForBossDepth(depth);
    const seen = new Set(defeatedIds);
    const eligible = parsed.filter(b => b.enabled && b.tier === tier && !seen.has(b.id));
    if (eligible.length === 0) {
      // Fallback : si tous les boss du tier ont été vaincus (test E2E,
      // future feature avec 30+ boss/run), reprendre un boss du tier
      // déjà vaincu (autorise répétition plutôt que combat normal).
      const fallback = parsed.filter(b => b.enabled && b.tier === tier);
      if (fallback.length === 0) return null;
      return fallback[Math.floor(rng() * fallback.length)];
    }
    return eligible[Math.floor(rng() * eligible.length)];
  }

  return {
    getPool,
    isBossDepth,
    pickBossForDepth,
  };
}

export type AnomalyBossesService = ReturnType<typeof createAnomalyBossesService>;
