import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createFlagshipService } from '../flagship.service.js';

// --- Helpers ---

function createMockFlagshipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flagship-1',
    userId: 'user-1',
    planetId: 'planet-1',
    name: 'Vaisseau amiral',
    description: '',
    baseSpeed: 80000,
    fuelConsumption: 1,
    cargoCapacity: 150,
    driveType: 'combustion',
    weapons: 2,
    shield: 4,
    hull: 8,
    baseArmor: 0,
    shotCount: 1,
    combatCategoryId: 'support',
    status: 'active',
    repairEndsAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Mock DB using a queue-based approach: each select() call consumes the next
 * result from selectResults. This avoids relying on drizzle internal structure.
 */
function createMockDb() {
  let flagshipRow: ReturnType<typeof createMockFlagshipRow> | null = null;
  const _planetRow = { id: 'planet-1' };

  // Queue of results for successive select().from().where().limit() chains
  let selectResults: unknown[][] = [];

  const db: any = {
    _getFlagship: () => flagshipRow,
    _setFlagship: (row: ReturnType<typeof createMockFlagshipRow> | null) => { flagshipRow = row; },
    _setSelectResults: (results: unknown[][]) => { selectResults = [...results]; },

    select: vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.from = vi.fn().mockImplementation(() => chain);
      chain.where = vi.fn().mockImplementation(() => chain);
      chain.orderBy = vi.fn().mockImplementation(() => chain);
      chain.limit = vi.fn().mockImplementation(() => {
        const result = selectResults.shift() ?? [];
        chain.then = (resolve: any) => resolve(result);
        return chain;
      });
      chain.then = (resolve: any) => resolve([]);
      return chain;
    }),

    insert: vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.values = vi.fn().mockImplementation((val: any) => {
        chain._values = val;
        return chain;
      });
      chain.returning = vi.fn().mockImplementation(() => {
        const val = chain._values;
        const row = createMockFlagshipRow({
          userId: val.userId,
          planetId: val.planetId,
          name: val.name,
          description: val.description ?? '',
        });
        flagshipRow = row;
        chain.then = (resolve: any) => resolve([row]);
        return chain;
      });
      chain.then = (resolve: any) => resolve(undefined);
      return chain;
    }),

    update: vi.fn().mockImplementation(() => {
      const chain: any = {};
      let updateData: Record<string, unknown> = {};
      chain.set = vi.fn().mockImplementation((data: Record<string, unknown>) => {
        updateData = data;
        return chain;
      });
      chain.where = vi.fn().mockImplementation(() => chain);
      chain.returning = vi.fn().mockImplementation(() => {
        if (flagshipRow) {
          flagshipRow = { ...flagshipRow, ...updateData } as any;
        }
        chain.then = (resolve: any) => resolve(flagshipRow ? [flagshipRow] : []);
        return chain;
      });
      chain.then = (resolve: any) => {
        if (flagshipRow && Object.keys(updateData).length > 0) {
          flagshipRow = { ...flagshipRow, ...updateData } as any;
        }
        resolve(undefined);
      };
      return chain;
    }),
  };

  return db;
}

function createMockExiliumService(opts: { shouldThrow?: boolean } = {}) {
  return {
    spend: vi.fn().mockImplementation(async () => {
      if (opts.shouldThrow) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Solde Exilium insuffisant (0 disponible, 2 requis)',
        });
      }
    }),
  } as any;
}

function createMockGameConfigService(overrides: Record<string, unknown> = {}) {
  return {
    getFullConfig: vi.fn().mockResolvedValue({
      universe: {
        flagship_instant_repair_exilium_cost: 2,
        flagship_repair_duration_seconds: 7200,
        ...overrides,
      },
      categories: [],
      buildings: {},
      research: {},
      ships: {},
      defenses: {},
      production: {},
      planetTypes: [],
      pirateTemplates: [],
      tutorialQuests: [],
      bonuses: [],
      missions: {},
      labels: {},
      hulls: {
        combat: { id: 'combat', name: 'Combat', playstyle: 'warrior', changeCost: { baseMultiplier: 0.1, resourceRatio: { minerai: 1, silicium: 1, hydrogene: 1 } }, unavailabilitySeconds: 3600, cooldownSeconds: 86400 },
        industrial: { id: 'industrial', name: 'Industrial', playstyle: 'miner', changeCost: { baseMultiplier: 0.1, resourceRatio: { minerai: 1, silicium: 1, hydrogene: 1 } }, unavailabilitySeconds: 3600, cooldownSeconds: 86400 },
        scientific: { id: 'scientific', name: 'Scientific', playstyle: 'explorer', changeCost: { baseMultiplier: 0.1, resourceRatio: { minerai: 1, silicium: 1, hydrogene: 1 } }, unavailabilitySeconds: 3600, cooldownSeconds: 86400 },
      },
    }),
  } as any;
}

describe('FlagshipService', () => {
  let db: ReturnType<typeof createMockDb>;
  let exiliumService: ReturnType<typeof createMockExiliumService>;
  let gameConfigService: ReturnType<typeof createMockGameConfigService>;
  let service: ReturnType<typeof createFlagshipService>;

  beforeEach(() => {
    db = createMockDb();
    exiliumService = createMockExiliumService();
    gameConfigService = createMockGameConfigService();
    service = createFlagshipService(db, exiliumService, gameConfigService);
  });

  describe('get', () => {
    it('retourne null si pas de flagship', async () => {
      // get() does 1 select: flagships
      db._setSelectResults([[]]);
      const result = await service.get('user-1');
      expect(result).toBeNull();
    });

    it('retourne le flagship existant', async () => {
      const row = createMockFlagshipRow();
      db._setFlagship(row);
      // get() does 1 select: flagships
      db._setSelectResults([[row]]);

      const result = await service.get('user-1');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Vaisseau amiral');
      expect(result!.status).toBe('active');
    });

    it('auto-repare si repairEndsAt est depasse', async () => {
      const pastDate = new Date(Date.now() - 10000);
      const row = createMockFlagshipRow({ status: 'incapacitated', repairEndsAt: pastDate });
      db._setFlagship(row);
      // get() does 1 select: flagships
      db._setSelectResults([[row]]);

      const result = await service.get('user-1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
      expect(result!.repairEndsAt).toBeNull();
    });

    it('ne repare pas si repairEndsAt est dans le futur', async () => {
      const futureDate = new Date(Date.now() + 60000);
      const row = createMockFlagshipRow({ status: 'incapacitated', repairEndsAt: futureDate });
      db._setFlagship(row);
      db._setSelectResults([[row]]);

      const result = await service.get('user-1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('incapacitated');
    });
  });

  describe('create', () => {
    it('cree un flagship avec les bonnes valeurs par defaut', async () => {
      // create() does 2 selects: flagships (existing check), planets (home planet)
      db._setSelectResults([[], [{ id: 'planet-1' }]]);

      const result = await service.create('user-1', 'Mon Vaisseau', 'combat');
      expect(result).not.toBeNull();
      expect(result.name).toBe('Mon Vaisseau');
      expect(result.planetId).toBe('planet-1');
      expect(result.status).toBe('active');
    });

    it('cree un flagship avec une description', async () => {
      db._setSelectResults([[], [{ id: 'planet-1' }]]);

      const result = await service.create('user-1', 'Mon Vaisseau', 'combat', 'Un vaisseau puissant');
      expect(result.description).toBe('Un vaisseau puissant');
    });

    it('throw CONFLICT si un flagship existe deja', async () => {
      // create() 1st select returns existing flagship
      db._setSelectResults([[{ id: 'flagship-1' }]]);

      await expect(service.create('user-1', 'Nouveau', 'combat')).rejects.toThrow('Vous avez deja un vaisseau amiral');
    });

    it('throw BAD_REQUEST avec un nom invalide (trop court)', async () => {
      await expect(service.create('user-1', 'A', 'combat')).rejects.toThrow(TRPCError);
    });

    it('throw BAD_REQUEST avec un nom contenant des caracteres speciaux', async () => {
      await expect(service.create('user-1', '<script>', 'combat')).rejects.toThrow(TRPCError);
    });

    it('accepte les noms avec accents et tirets', async () => {
      db._setSelectResults([[], [{ id: 'planet-1' }]]);

      const result = await service.create('user-1', "L'Etoile-Noire", 'combat');
      expect(result.name).toBe("L&#x27;Etoile-Noire");
    });

    it('throw NOT_FOUND si aucune planete', async () => {
      // 1st select: no existing flagship, 2nd select: no planet
      db._setSelectResults([[], []]);

      await expect(service.create('user-1', 'Mon Vaisseau', 'combat')).rejects.toThrow('Aucune planete trouvee');
    });
  });

  describe('rename', () => {
    it('modifie le nom du flagship', async () => {
      const row = createMockFlagshipRow();
      db._setFlagship(row);
      // rename() does 1 select: flagships
      db._setSelectResults([[{ id: 'flagship-1' }]]);

      const result = await service.rename('user-1', 'Nouveau Nom');
      expect(result.name).toBe('Nouveau Nom');
    });

    it('modifie le nom et la description', async () => {
      const row = createMockFlagshipRow();
      db._setFlagship(row);
      db._setSelectResults([[{ id: 'flagship-1' }]]);

      const result = await service.rename('user-1', 'Nouveau Nom', 'Nouvelle description');
      expect(result.name).toBe('Nouveau Nom');
      expect(result.description).toBe('Nouvelle description');
    });

    it('throw NOT_FOUND si aucun flagship', async () => {
      db._setSelectResults([[]]);
      await expect(service.rename('user-1', 'Test')).rejects.toThrow('Aucun vaisseau amiral');
    });

    it('throw BAD_REQUEST avec un nom invalide', async () => {
      await expect(service.rename('user-1', 'X')).rejects.toThrow(TRPCError);
    });
  });

  describe('repair', () => {
    it('depense l\'Exilium et remet le status a active', async () => {
      const row = createMockFlagshipRow({ status: 'incapacitated', repairEndsAt: new Date(Date.now() + 60000) });
      db._setFlagship(row);
      // repair() does 1 select: flagships
      db._setSelectResults([[row]]);

      const result = await service.repair('user-1');
      expect(result.status).toBe('active');
      expect(result.repairEndsAt).toBeNull();
      expect(exiliumService.spend).toHaveBeenCalledWith('user-1', 2, 'flagship_repair', { flagshipId: 'flagship-1' });
    });

    it('throw NOT_FOUND si aucun flagship', async () => {
      db._setSelectResults([[]]);
      await expect(service.repair('user-1')).rejects.toThrow('Aucun vaisseau amiral');
    });

    it('throw BAD_REQUEST si le flagship n\'est pas incapacite', async () => {
      const row = createMockFlagshipRow({ status: 'active' });
      db._setFlagship(row);
      db._setSelectResults([[row]]);

      await expect(service.repair('user-1')).rejects.toThrow('Le vaisseau amiral n\'est pas incapacite');
    });

    it('throw si le solde Exilium est insuffisant', async () => {
      const row = createMockFlagshipRow({ status: 'incapacitated', repairEndsAt: new Date(Date.now() + 60000) });
      db._setFlagship(row);
      db._setSelectResults([[row]]);
      exiliumService = createMockExiliumService({ shouldThrow: true });
      service = createFlagshipService(db, exiliumService, gameConfigService);

      await expect(service.repair('user-1')).rejects.toThrow('Solde Exilium insuffisant');
    });
  });

  describe('incapacitate', () => {
    it('met le status a incapacitated et calcule repairEndsAt', async () => {
      db._setFlagship(createMockFlagshipRow());
      // incapacitate() does 1 select: planets
      db._setSelectResults([[{ id: 'planet-1' }]]);
      const before = Date.now();

      await service.incapacitate('user-1');

      const flagship = db._getFlagship();
      expect(flagship).not.toBeNull();
      expect(flagship!.status).toBe('incapacitated');
      expect(flagship!.repairEndsAt).toBeInstanceOf(Date);
      // 7200 seconds = 2 hours
      const expectedEnd = before + 7200 * 1000;
      expect(flagship!.repairEndsAt!.getTime()).toBeGreaterThanOrEqual(expectedEnd - 1000);
      expect(flagship!.repairEndsAt!.getTime()).toBeLessThanOrEqual(expectedEnd + 1000);
    });

    it('teleporte le flagship a la planete mere', async () => {
      db._setFlagship(createMockFlagshipRow({ planetId: 'other-planet' }));
      db._setSelectResults([[{ id: 'planet-1' }]]);

      await service.incapacitate('user-1');

      const flagship = db._getFlagship();
      expect(flagship!.planetId).toBe('planet-1');
    });
  });

  describe('setInMission', () => {
    it('met le status a in_mission', async () => {
      db._setFlagship(createMockFlagshipRow());

      await service.setInMission('user-1');

      const flagship = db._getFlagship();
      expect(flagship!.status).toBe('in_mission');
    });
  });

  describe('returnFromMission', () => {
    it('remet le status a active avec la bonne planete', async () => {
      db._setFlagship(createMockFlagshipRow({ status: 'in_mission' }));

      await service.returnFromMission('user-1', 'planet-2');

      const flagship = db._getFlagship();
      expect(flagship!.status).toBe('active');
      expect(flagship!.planetId).toBe('planet-2');
    });
  });
});
