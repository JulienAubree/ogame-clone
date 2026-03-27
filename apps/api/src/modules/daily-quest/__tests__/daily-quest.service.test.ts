import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUEST_IDS } from '../quest-registry.js';

// ── Mocks ────────────────────────────────────────────────────────────

/** Simule l'enregistrement userExilium en base */
let fakeRecord: {
  userId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  lastDailyAt: Date | null;
  dailyQuests: unknown;
};

function resetRecord(userId = 'user-1') {
  fakeRecord = {
    userId,
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    lastDailyAt: null,
    dailyQuests: null,
  };
}

/** Mini chainable query builder pour simuler drizzle */
function chainable(returnValue: unknown = []) {
  const chain: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') return undefined; // pas thenable
      return (..._args: unknown[]) => proxy;
    },
  });
  return proxy;
}

const mockTxUpdate = vi.fn().mockImplementation(() => {
  const obj = {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
  return obj;
});

const mockTxSelect = vi.fn().mockImplementation(() => ({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      for: vi.fn().mockResolvedValue([{ lastDailyAt: fakeRecord.lastDailyAt }]),
    }),
  }),
}));

const mockTransaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
  const tx = { update: mockTxUpdate, select: mockTxSelect };
  await cb(tx);
});

const mockDbUpdate = vi.fn().mockImplementation(() => ({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockImplementation(async () => {
      // Simuler la mise a jour du record
    }),
  }),
}));

const mockDb = {
  update: mockDbUpdate,
  transaction: mockTransaction,
} as unknown;

const mockGetOrCreate = vi.fn().mockImplementation(async () => fakeRecord);
const mockEarn = vi.fn().mockResolvedValue(undefined);

const mockExiliumService = {
  getOrCreate: mockGetOrCreate,
  earn: mockEarn,
  getBalance: vi.fn(),
  spend: vi.fn(),
  tryDrop: vi.fn(),
  getLog: vi.fn(),
};

const mockGameConfigService = {
  getFullConfig: vi.fn().mockResolvedValue({
    universe: {
      daily_quest_count: 3,
      exilium_daily_quest_reward: 1,
      daily_quest_miner_threshold: 5000,
    },
    buildings: [],
    researches: [],
    ships: [],
    defenses: [],
    categories: [],
    productions: [],
    buildingPrereqs: {},
    researchPrereqs: {},
    shipPrereqs: {},
    defensePrereqs: {},
  }),
  invalidateCache: vi.fn(),
};

const mockRedisPublish = vi.fn().mockResolvedValue(1);
const mockRedis = { publish: mockRedisPublish } as unknown;

// ── Import dynamique du service (apres mocks) ───────────────────────

// On importe directement car le service prend ses deps en parametre (injection)
import { createDailyQuestService } from '../daily-quest.service.js';

describe('daily-quest.service', () => {
  let service: ReturnType<typeof createDailyQuestService>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRecord();
    service = createDailyQuestService(
      mockDb as any,
      mockExiliumService as any,
      mockGameConfigService as any,
      mockRedis as any,
    );
  });

  describe('getQuests()', () => {
    it('genere 3 quetes si aucune n\'existe', async () => {
      const result = await service.getQuests('user-1');

      expect(result.quests).toHaveLength(3);
      expect(result.generated_at).toBeDefined();
      for (const q of result.quests) {
        expect(q.status).toBe('pending');
        expect(QUEST_IDS).toContain(q.id);
      }
      // Les 3 quetes doivent etre uniques
      const ids = result.quests.map(q => q.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('retourne les memes quetes pour le meme jour', async () => {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);

      const existingState = {
        generated_at: dayStart.toISOString(),
        quests: [
          { id: 'builder', status: 'pending' as const },
          { id: 'navigator', status: 'pending' as const },
          { id: 'warrior', status: 'pending' as const },
        ],
      };
      fakeRecord.dailyQuests = existingState;

      const result = await service.getQuests('user-1');

      expect(result).toEqual(existingState);
      // Pas d'update en base car on retourne l'existant
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('regenere le lendemain en excluant les quetes de la veille', async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      const yesterdayQuests = {
        generated_at: yesterday.toISOString(),
        quests: [
          { id: 'builder', status: 'completed' as const },
          { id: 'navigator', status: 'expired' as const },
          { id: 'warrior', status: 'expired' as const },
        ],
      };
      fakeRecord.dailyQuests = yesterdayQuests;

      const result = await service.getQuests('user-1');

      expect(result.quests).toHaveLength(3);
      // Les nouvelles quetes ne doivent pas contenir celles de la veille
      const newIds = result.quests.map(q => q.id);
      expect(newIds).not.toContain('builder');
      expect(newIds).not.toContain('navigator');
      expect(newIds).not.toContain('warrior');
      // Elles doivent etre en pending
      for (const q of result.quests) {
        expect(q.status).toBe('pending');
      }
    });
  });

  describe('processEvent()', () => {
    function setupTodayQuests(quests: Array<{ id: string; status: string }>) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      fakeRecord.dailyQuests = {
        generated_at: dayStart.toISOString(),
        quests,
      };
      fakeRecord.lastDailyAt = null;
    }

    it('complete une quete et credite 1 Exilium', async () => {
      setupTodayQuests([
        { id: 'builder', status: 'pending' },
        { id: 'navigator', status: 'pending' },
        { id: 'warrior', status: 'pending' },
      ]);

      const result = await service.processEvent({
        type: 'construction:started',
        userId: 'user-1',
        payload: {},
      });

      expect(result).toEqual({
        questId: 'builder',
        questName: 'Constructeur',
        reward: 1,
      });
      expect(mockEarn).toHaveBeenCalledWith('user-1', 1, 'daily_quest', { questId: 'builder' });
      expect(mockRedisPublish).toHaveBeenCalled();
    });

    it('ne credite pas si deja complete aujourd\'hui (idempotent)', async () => {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);

      setupTodayQuests([
        { id: 'builder', status: 'completed' },
        { id: 'navigator', status: 'expired' },
        { id: 'warrior', status: 'expired' },
      ]);
      // Marquer comme deja complete aujourd'hui
      fakeRecord.lastDailyAt = new Date();

      const result = await service.processEvent({
        type: 'construction:started',
        userId: 'user-1',
        payload: {},
      });

      expect(result).toBeNull();
      expect(mockEarn).not.toHaveBeenCalled();
    });

    it('ne matche pas un evenement non pertinent', async () => {
      setupTodayQuests([
        { id: 'builder', status: 'pending' },
        { id: 'navigator', status: 'pending' },
        { id: 'warrior', status: 'pending' },
      ]);

      const result = await service.processEvent({
        type: 'market:transaction_completed',
        userId: 'user-1',
        payload: {},
      });

      expect(result).toBeNull();
      expect(mockEarn).not.toHaveBeenCalled();
    });

    it('verifie la condition de la quete (miner threshold)', async () => {
      setupTodayQuests([
        { id: 'miner', status: 'pending' },
        { id: 'navigator', status: 'pending' },
        { id: 'warrior', status: 'pending' },
      ]);

      // Sous le seuil : pas de completion
      const resultBelow = await service.processEvent({
        type: 'resources:collected',
        userId: 'user-1',
        payload: { totalCollected: 3000 },
      });
      expect(resultBelow).toBeNull();

      // Au-dessus du seuil : completion
      const resultAbove = await service.processEvent({
        type: 'resources:collected',
        userId: 'user-1',
        payload: { totalCollected: 5000 },
      });
      expect(resultAbove).toEqual({
        questId: 'miner',
        questName: 'Mineur assidu',
        reward: 1,
      });
    });

    it('retourne null si pas de quetes generees pour aujourd\'hui', async () => {
      // dailyQuests est null
      fakeRecord.dailyQuests = null;

      const result = await service.processEvent({
        type: 'construction:started',
        userId: 'user-1',
        payload: {},
      });

      expect(result).toBeNull();
    });

    it('retourne null si les quetes sont d\'un jour precedent', async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      fakeRecord.dailyQuests = {
        generated_at: yesterday.toISOString(),
        quests: [
          { id: 'builder', status: 'pending' },
        ],
      };

      const result = await service.processEvent({
        type: 'construction:started',
        userId: 'user-1',
        payload: {},
      });

      expect(result).toBeNull();
    });
  });
});
