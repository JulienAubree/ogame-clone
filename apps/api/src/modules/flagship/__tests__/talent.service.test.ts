import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTalentService } from '../talent.service.js';

const HULLS_FIXTURE = {
  combat: {
    passiveBonuses: {
      combat_build_time_reduction: 0.20,
      repair_time_reduction: 0.45,
      bonus_weapons: 8,
      bonus_armor: 6,
      bonus_shot_count: 2,
    },
  },
  industrial: {
    passiveBonuses: {
      industrial_build_time_reduction: 0.20,
      mining_speed_bonus: 0.45,
      prospection_speed_bonus: 0.45,
    },
  },
  scientific: {
    passiveBonuses: {
      research_time_reduction: 0.20,
    },
  },
};

/**
 * Queue-based mock: each select() call consumes the next result from the queue.
 * Order matters — for computeTalentContext, the order is :
 *   1. flagship select (always)
 *   2. planetBuildings select (only when planetId provided AND planetId === flagship.planetId)
 */
function createMockDb(selectResults: unknown[][]) {
  const queue = [...selectResults];
  return {
    select: vi.fn().mockImplementation(() => {
      const chain: any = {};
      const result = queue.shift() ?? [];
      chain.from = vi.fn().mockImplementation(() => chain);
      chain.where = vi.fn().mockImplementation(() => {
        chain.then = (resolve: any) => resolve(result);
        return chain;
      });
      chain.limit = vi.fn().mockImplementation(() => {
        chain.then = (resolve: any) => resolve(result);
        return chain;
      });
      chain.then = (resolve: any) => resolve(result);
      return chain;
    }),
  } as unknown as Parameters<typeof createTalentService>[0];
}

const mockGameConfig = {
  getFullConfig: async () => ({ hulls: HULLS_FIXTURE }),
} as unknown as Parameters<typeof createTalentService>[1];

describe('talentService.computeTalentContext (post-talents-removal)', () => {
  function makeService(flagshipRow: object | null, pbRows: object[] = []) {
    const flagshipResult = flagshipRow ? [flagshipRow] : [];
    const queue = pbRows.length > 0 ? [flagshipResult, pbRows] : [flagshipResult];
    return createTalentService(createMockDb(queue), mockGameConfig);
  }

  describe('hull passives', () => {
    it('industrial hull returns mining_speed = 0.45', async () => {
      const svc = makeService({ id: 'f1', planetId: 'p1', status: 'active', hullId: 'industrial' });
      const ctx = await svc.computeTalentContext('user1');
      expect(ctx.mining_speed).toBe(0.45);
      expect(ctx.prospection_speed).toBe(0.45);
      expect(ctx.flagship_repair_time).toBeUndefined();
    });

    it('combat hull returns flagship_repair_time = 0.45', async () => {
      const svc = makeService({ id: 'f1', planetId: 'p1', status: 'active', hullId: 'combat' });
      const ctx = await svc.computeTalentContext('user1');
      expect(ctx.flagship_repair_time).toBe(0.45);
      expect(ctx.mining_speed).toBeUndefined();
    });

    it('combat hull returns hull_combat_build_time_reduction', async () => {
      const svc = makeService({ id: 'f1', planetId: 'p1', status: 'active', hullId: 'combat' });
      const ctx = await svc.computeTalentContext('user1');
      expect(ctx.hull_combat_build_time_reduction).toBe(0.20);
    });

    it('returns {} when no flagship', async () => {
      const svc = makeService(null);
      const ctx = await svc.computeTalentContext('user1');
      expect(ctx).toEqual({});
    });

    it('handles flagship with null hullId', async () => {
      const svc = makeService({ id: 'f1', planetId: 'p1', status: 'active', hullId: null });
      const ctx = await svc.computeTalentContext('user1');
      expect(ctx).toEqual({});
    });
  });

  describe('parallel_build via buildings', () => {
    it('returns +1 mil slot when commandCenter ≥10 and flagship attached', async () => {
      const svc = makeService(
        { id: 'f1', planetId: 'p1', status: 'active', hullId: 'industrial' },
        [{ buildingId: 'commandCenter', level: 10 }, { buildingId: 'shipyard', level: 5 }],
      );
      const ctx = await svc.computeTalentContext('user1', 'p1');
      expect(ctx.military_parallel_build).toBe(1);
      expect(ctx.industrial_parallel_build).toBeUndefined();
    });

    it('returns +1 ind slot when shipyard ≥10 and flagship attached', async () => {
      const svc = makeService(
        { id: 'f1', planetId: 'p1', status: 'active', hullId: 'industrial' },
        [{ buildingId: 'shipyard', level: 12 }, { buildingId: 'commandCenter', level: 9 }],
      );
      const ctx = await svc.computeTalentContext('user1', 'p1');
      expect(ctx.industrial_parallel_build).toBe(1);
      expect(ctx.military_parallel_build).toBeUndefined();
    });

    it('returns no slot bonus when commandCenter <10', async () => {
      const svc = makeService(
        { id: 'f1', planetId: 'p1', status: 'active', hullId: 'industrial' },
        [{ buildingId: 'commandCenter', level: 9 }],
      );
      const ctx = await svc.computeTalentContext('user1', 'p1');
      expect(ctx.military_parallel_build).toBeUndefined();
    });

    it('returns no slot bonus when flagship on a different planet', async () => {
      // pbRows not queried because planetId !== flagship.planetId
      const svc = makeService({ id: 'f1', planetId: 'p_other', status: 'active', hullId: 'industrial' });
      const ctx = await svc.computeTalentContext('user1', 'p1');
      expect(ctx.military_parallel_build).toBeUndefined();
    });

    it('returns no slot bonus when planetId not provided', async () => {
      const svc = makeService({ id: 'f1', planetId: 'p1', status: 'active', hullId: 'industrial' });
      const ctx = await svc.computeTalentContext('user1');
      expect(ctx.military_parallel_build).toBeUndefined();
      expect(ctx.industrial_parallel_build).toBeUndefined();
    });

    it('combines both slot bonuses when both buildings ≥10', async () => {
      const svc = makeService(
        { id: 'f1', planetId: 'p1', status: 'active', hullId: 'industrial' },
        [{ buildingId: 'commandCenter', level: 10 }, { buildingId: 'shipyard', level: 11 }],
      );
      const ctx = await svc.computeTalentContext('user1', 'p1');
      expect(ctx.military_parallel_build).toBe(1);
      expect(ctx.industrial_parallel_build).toBe(1);
    });
  });

  describe('combined output', () => {
    it('industrial hull on its own planet with both buildings ≥10', async () => {
      const svc = makeService(
        { id: 'f1', planetId: 'p1', status: 'active', hullId: 'industrial' },
        [{ buildingId: 'commandCenter', level: 10 }, { buildingId: 'shipyard', level: 10 }],
      );
      const ctx = await svc.computeTalentContext('user1', 'p1');
      expect(ctx).toEqual({
        hull_industrial_build_time_reduction: 0.20,
        mining_speed: 0.45,
        prospection_speed: 0.45,
        military_parallel_build: 1,
        industrial_parallel_build: 1,
      });
    });
  });
});
