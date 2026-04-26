import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ── Fake DB state ────────────────────────────────────────────────────

interface FakeProcess {
  id: string;
  planetId: string;
  userId: string;
  colonyShipOriginPlanetId: string;
  progress: number;
  difficultyFactor: number;
  outpostEstablished: boolean;
  status: 'active' | 'completed' | 'failed';
  lastTickAt: Date;
  lastRaidAt: Date | null;
  raidCount: number;
  lastConvoySupplyAt: Date | null;
  startedAt: Date;
  createdAt: Date;
}

interface FakePlanet {
  id: string;
  userId: string;
  planetClassId: string;
  galaxy: number;
  system: number;
  position: number;
  status: 'active' | 'colonizing';
  minerai: number;
  silicium: number;
  hydrogene: number;
}

interface FakePlanetBuilding {
  planetId: string;
  buildingId: string;
  level: number;
}

interface FakePlanetShip {
  planetId: string;
  fighter?: number;
  cruiser?: number;
}

interface FakePlanetBiome {
  planetId: string;
  biomeId: string;
  active: boolean;
}

interface FakeDiscoveredBiome {
  userId: string;
  galaxy: number;
  system: number;
  position: number;
  biomeId: string;
}

interface FakeState {
  processes: FakeProcess[];
  planets: FakePlanet[];
  planetBuildings: FakePlanetBuilding[];
  planetShips: FakePlanetShip[];
  planetBiomes: FakePlanetBiome[];
  discoveredBiomes: FakeDiscoveredBiome[];
}

let state: FakeState;

function makeProcess(overrides: Partial<FakeProcess> = {}): FakeProcess {
  const now = new Date();
  return {
    id: 'proc-1',
    planetId: 'planet-1',
    userId: 'user-1',
    colonyShipOriginPlanetId: 'origin-1',
    progress: 0,
    difficultyFactor: 1,
    outpostEstablished: false,
    status: 'active',
    lastTickAt: now,
    lastRaidAt: null,
    raidCount: 0,
    lastConvoySupplyAt: null,
    startedAt: now,
    createdAt: now,
    ...overrides,
  };
}

function makePlanet(overrides: Partial<FakePlanet> = {}): FakePlanet {
  return {
    id: 'planet-1',
    userId: 'user-1',
    planetClassId: 'oceanic',
    galaxy: 1,
    system: 10,
    position: 3,
    status: 'colonizing',
    minerai: 1000,
    silicium: 500,
    hydrogene: 200,
    ...overrides,
  };
}

function resetState() {
  state = {
    processes: [],
    planets: [],
    planetBuildings: [],
    planetShips: [],
    planetBiomes: [],
    discoveredBiomes: [],
  };
}

// ── Fake Drizzle DB ───────────────────────────────────────────────────
//
// On simule juste ce dont le service a besoin :
// - select().from(table).where(...).limit(...) => ligne(s) en memoire
// - select().from(table).innerJoin(...).where(...).limit(...) (pour getIpcLevel)
// - update(table).set(values).where(...) => mute le state
// - delete(table).where(...) => supprime de l'etat
// - insert(table).values(...).returning() => insere et retourne
//
// On utilise une heuristique simple : la fonction passee a where() est appelee,
// mais on extrait pas vraiment la condition. A la place, chaque chaine d'appel
// se souvient quelle table est interrogee et applique un filtre minimal
// determine par le contexte du test (via les "spies" exposes plus bas).

type TableMarker =
  | 'colonizationProcesses'
  | 'planets'
  | 'planetBuildings'
  | 'planetShips'
  | 'planetBiomes'
  | 'discoveredBiomes';

function tableOf(token: unknown): TableMarker | null {
  // Drizzle table objects sont remplaces par des marqueurs identifiables via
  // la propriete __t (cf. mock '@exilium/db').
  if (!token || typeof token !== 'object') return null;
  const marker = (token as { __t?: string }).__t;
  if (marker === 'colonizationProcesses') return 'colonizationProcesses';
  if (marker === 'planets') return 'planets';
  if (marker === 'planetBuildings') return 'planetBuildings';
  if (marker === 'planetShips') return 'planetShips';
  if (marker === 'planetBiomes') return 'planetBiomes';
  if (marker === 'discoveredBiomes') return 'discoveredBiomes';
  return null;
}

// Mock des imports schema avant d'importer le service.
// IMPORTANT: vi.mock est hoiste -- pas de reference a une variable externe
// (sinon "Cannot access X before initialization"). On declare les tables a
// l'interieur de la factory et on les retrouve via la propriete __t.
vi.mock('@exilium/db', () => ({
  colonizationProcesses: { __t: 'colonizationProcesses' },
  planets: { __t: 'planets' },
  planetBuildings: { __t: 'planetBuildings' },
  planetShips: { __t: 'planetShips' },
  planetBiomes: { __t: 'planetBiomes' },
  discoveredBiomes: { __t: 'discoveredBiomes' },
}));

// Mock drizzle-orm helpers : on ne se sert pas de la valeur retournee
vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ __op: 'and', conds }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    __op: 'sql',
    strings,
    vals,
  }),
}));

// ── Mock select() chain ─────────────────────────────────────────────

interface SelectContext {
  table: TableMarker | null;
  joinedWith: TableMarker | null;
}

function buildSelectChain(projection?: Record<string, unknown>) {
  const ctx: SelectContext = { table: null, joinedWith: null };

  function results(): unknown[] {
    if (ctx.table === 'colonizationProcesses') {
      return state.processes.map(p => ({ ...p }));
    }
    if (ctx.table === 'planets') {
      // Si jointure planetBuildings : on retourne (level + planet)
      if (ctx.joinedWith === 'planetBuildings') {
        const rows: Array<{ level: number }> = [];
        for (const pb of state.planetBuildings) {
          const planet = state.planets.find(p => p.id === pb.planetId);
          if (!planet) continue;
          if (planet.planetClassId !== 'homeworld') continue;
          if (pb.buildingId !== 'imperialPowerCenter') continue;
          rows.push({ level: pb.level });
        }
        return rows;
      }
      return state.planets.map(p => ({ ...p }));
    }
    if (ctx.table === 'planetBuildings') {
      // Cas inverse : select.from(planetBuildings).innerJoin(planets, ...)
      if (ctx.joinedWith === 'planets') {
        const rows: Array<{ level: number }> = [];
        for (const pb of state.planetBuildings) {
          const planet = state.planets.find(p => p.id === pb.planetId);
          if (!planet) continue;
          if (planet.planetClassId !== 'homeworld') continue;
          if (pb.buildingId !== 'imperialPowerCenter') continue;
          rows.push({ level: pb.level });
        }
        return rows;
      }
      return state.planetBuildings.map(pb => ({ ...pb }));
    }
    if (ctx.table === 'planetShips') {
      return state.planetShips.map(s => ({ ...s }));
    }
    if (ctx.table === 'planetBiomes') {
      return state.planetBiomes.map(b => ({ ...b }));
    }
    if (ctx.table === 'discoveredBiomes') {
      return state.discoveredBiomes.map(b => ({ ...b }));
    }
    return [];
  }

  const chain: any = {
    from(table: unknown) {
      ctx.table = tableOf(table);
      return chain;
    },
    innerJoin(table: unknown) {
      ctx.joinedWith = tableOf(table);
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      // Async iteration via await => Thenable
      return chain;
    },
    then(resolve: (v: unknown[]) => void) {
      resolve(results());
    },
  };
  return chain;
}

// ── Mock update() chain ─────────────────────────────────────────────

function buildUpdateChain(table: unknown) {
  const marker = tableOf(table);
  let pendingValues: Record<string, unknown> = {};

  const chain: any = {
    set(values: Record<string, unknown>) {
      pendingValues = values;
      return chain;
    },
    where() {
      // Apply mutation now (we don't extract the where clause, but the test
      // sets up state so the update is unambiguous)
      if (marker === 'colonizationProcesses') {
        for (const p of state.processes) {
          for (const [k, v] of Object.entries(pendingValues)) {
            // Skip sql() expressions for now (raid_count + 1, GREATEST...)
            if (v && typeof v === 'object' && (v as { __op?: string }).__op === 'sql') {
              if (k === 'raidCount') p.raidCount += 1;
              continue;
            }
            (p as any)[k] = v;
          }
        }
      } else if (marker === 'planets') {
        for (const planet of state.planets) {
          for (const [k, v] of Object.entries(pendingValues)) {
            if (v && typeof v === 'object' && (v as { __op?: string }).__op === 'sql') {
              // GREATEST(planets.X - amount, 0) — best-effort.
              // L'amount est dans v.vals (drizzle template literal interpolates non-strings)
              const sqlExpr = v as { vals: unknown[] };
              const amount = sqlExpr.vals.find(x => typeof x === 'number') as number | undefined;
              if (typeof amount === 'number' && (k === 'minerai' || k === 'silicium')) {
                planet[k] = Math.max(planet[k] - amount, 0);
              }
              continue;
            }
            (planet as any)[k] = v;
          }
        }
      } else if (marker === 'planetBiomes') {
        // For finalize: set active=true (we treat it as activating one biome
        // — tests assert via final state)
        for (const b of state.planetBiomes) {
          for (const [k, v] of Object.entries(pendingValues)) {
            (b as any)[k] = v;
          }
        }
      }
      return Promise.resolve();
    },
  };
  return chain;
}

// ── Mock insert() chain ─────────────────────────────────────────────

function buildInsertChain(table: unknown) {
  const marker = tableOf(table);
  let inserted: Record<string, unknown> = {};

  const chain: any = {
    values(values: Record<string, unknown>) {
      inserted = values;
      return chain;
    },
    returning() {
      if (marker === 'colonizationProcesses') {
        const proc = makeProcess({
          id: `proc-${state.processes.length + 1}`,
          planetId: inserted.planetId as string,
          userId: inserted.userId as string,
          colonyShipOriginPlanetId: inserted.colonyShipOriginPlanetId as string,
          difficultyFactor: (inserted.difficultyFactor as number) ?? 1,
          outpostEstablished: (inserted.outpostEstablished as boolean) ?? false,
        });
        state.processes.push(proc);
        return Promise.resolve([{ ...proc }]);
      }
      return Promise.resolve([]);
    },
  };
  return chain;
}

// ── Mock delete() chain ─────────────────────────────────────────────

function buildDeleteChain(table: unknown) {
  const marker = tableOf(table);
  const chain: any = {
    where() {
      if (marker === 'planets') {
        // Delete all planets in state (test always sets up a single planet)
        state.planets = [];
      }
      return Promise.resolve();
    },
  };
  return chain;
}

// ── DB Mock ──────────────────────────────────────────────────────────

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
  update: vi.fn((table: unknown) => buildUpdateChain(table)),
  insert: vi.fn((table: unknown) => buildInsertChain(table)),
  delete: vi.fn((table: unknown) => buildDeleteChain(table)),
} as unknown;

// ── Mock GameConfigService ───────────────────────────────────────────

const baseConfig = {
  universe: {
    colonization_passive_rate: 0.10,
    colonization_cost_scaling_factor: 0.5,
    colonization_consumption_minerai: 200,
    colonization_consumption_silicium: 100,
    colonization_outpost_threshold_minerai: 500,
    colonization_outpost_threshold_silicium: 250,
    colonization_grace_period_hours: 0,
    colonization_outpost_timeout_hours: 24,
    colonization_rate_garrison_fp_threshold: 50,
    colonization_rate_garrison_bonus: 0.05,
    colonization_rate_convoy_bonus: 0.05,
    colonization_rate_convoy_window_hours: 2,
    colonization_rate_bonus_cap: 0.30,
    colonization_raid_interval_min: 3600,
    colonization_raid_interval_max: 5400,
    colonization_raid_travel_min: 1800,
    colonization_raid_travel_max: 3600,
    colonization_raid_base_start_fp: 10,
    colonization_raid_ipc_start_exponent: 1.4,
    colonization_raid_base_cap_fp: 35,
    colonization_raid_ipc_cap_exponent: 1.8,
    colonization_raid_wave_growth: 2.0,
    colonization_raid_stationed_fp_ratio: 0.001,
    colonization_raid_stationed_max_bonus: 0.5,
    fp_shotcount_exponent: 1.5,
    fp_divisor: 100,
    governance_penalty_harvest: [0.15, 0.35, 0.60],
    governance_penalty_construction: [0.15, 0.35, 0.60],
  } as Record<string, unknown>,
  ships: {
    fighter: { weapons: 10, shotCount: 1, shield: 5, hull: 20 },
    cruiser: { weapons: 50, shotCount: 2, shield: 30, hull: 100 },
  },
};

const mockGameConfigService = {
  getFullConfig: vi.fn().mockResolvedValue(baseConfig),
  invalidateCache: vi.fn(),
};

// ── Import du service apres mocks ───────────────────────────────────

import { createColonizationService } from '../colonization.service.js';

describe('colonization.service', () => {
  let service: ReturnType<typeof createColonizationService>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    // Re-stub config car clearAllMocks vide aussi les implementations
    mockGameConfigService.getFullConfig.mockResolvedValue(baseConfig);
    service = createColonizationService(mockDb as any, mockGameConfigService as any);
  });

  // ── scaleCost (fonction pure) ───────────────────────────────────

  describe('scaleCost()', () => {
    it('retourne le cout de base quand ipcLevel=0', () => {
      expect(service.scaleCost(100, 0, 0.5)).toBe(100);
    });

    it('applique la formule baseCost * (1 + scalingFactor * ipcLevel)', () => {
      // 100 * (1 + 0.5 * 2) = 100 * 2 = 200
      expect(service.scaleCost(100, 2, 0.5)).toBe(200);
      // 200 * (1 + 0.5 * 1) = 300
      expect(service.scaleCost(200, 1, 0.5)).toBe(300);
      // 500 * (1 + 0.3 * 5) = 500 * 2.5 = 1250
      expect(service.scaleCost(500, 5, 0.3)).toBe(1250);
    });
  });

  // ── getIpcLevel ─────────────────────────────────────────────────

  describe('getIpcLevel()', () => {
    it('retourne 0 si le joueur n\'a pas de homeworld avec IPC', async () => {
      const level = await service.getIpcLevel('user-1');
      expect(level).toBe(0);
    });

    it('retourne le niveau IPC du homeworld', async () => {
      state.planets.push(makePlanet({ id: 'hw-1', planetClassId: 'homeworld' }));
      state.planetBuildings.push({
        planetId: 'hw-1',
        buildingId: 'imperialPowerCenter',
        level: 3,
      });

      const level = await service.getIpcLevel('user-1');
      expect(level).toBe(3);
    });
  });

  // ── getProcess ──────────────────────────────────────────────────

  describe('getProcess()', () => {
    it('retourne null si pas de process actif', async () => {
      const result = await service.getProcess('planet-1');
      expect(result).toBeNull();
    });

    it('retourne le process actif si present', async () => {
      state.processes.push(makeProcess({ id: 'proc-1', planetId: 'planet-1' }));

      const result = await service.getProcess('planet-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('proc-1');
    });
  });

  // ── getStatus ───────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('retourne null si pas de process', async () => {
      const result = await service.getStatus('user-1', 'planet-1');
      expect(result).toBeNull();
    });

    it('retourne null si le process appartient a un autre user', async () => {
      state.processes.push(makeProcess({ userId: 'user-2' }));
      state.planets.push(makePlanet());

      const result = await service.getStatus('user-1', 'planet-1');
      expect(result).toBeNull();
    });

    it('retourne un objet complet avec progress, rate, bonuses', async () => {
      state.processes.push(makeProcess({
        outpostEstablished: true,
        progress: 0.5,
        difficultyFactor: 0.9,
      }));
      state.planets.push(makePlanet({ minerai: 1000, silicium: 500, hydrogene: 200 }));

      const result = await service.getStatus('user-1', 'planet-1');

      expect(result).not.toBeNull();
      expect(result?.progress).toBe(0.5);
      expect(result?.basePassiveRate).toBe(0.10);
      // base * difficulty * stockMult = 0.10 * 0.9 * 1 = 0.09
      expect(result?.effectivePassiveRate).toBeCloseTo(0.09, 5);
      expect(result?.consumptionMineraiPerHour).toBe(200); // ipc=0, sf=0.5 => baseline
      expect(result?.consumptionSiliciumPerHour).toBe(100);
      expect(result?.currentMinerai).toBe(1000);
      expect(result?.currentSilicium).toBe(500);
      expect(result?.stockSufficient).toBe(true);
      expect(result?.totalRateBonus).toBe(0);
      expect(result?.bonusCap).toBe(0.30);
    });

    it('marque stockSufficient=false si minerai ou silicium epuise', async () => {
      state.processes.push(makeProcess({ outpostEstablished: true }));
      state.planets.push(makePlanet({ minerai: 0, silicium: 500 }));

      const result = await service.getStatus('user-1', 'planet-1');
      expect(result?.stockSufficient).toBe(false);
      // base * difficulty * 0.5 = 0.10 * 1 * 0.5 = 0.05
      expect(result?.effectivePassiveRate).toBeCloseTo(0.05, 5);
    });

    it('plafonne le bonus garrison + convoy au bonusCap', async () => {
      // Garrison bonus = 0.05, convoy bonus = 0.05 => total = 0.10 (sous le cap 0.30)
      // On force des valeurs qui depassent le cap.
      const cfg = structuredClone(baseConfig);
      (cfg.universe as any).colonization_rate_garrison_bonus = 0.20;
      (cfg.universe as any).colonization_rate_convoy_bonus = 0.20;
      (cfg.universe as any).colonization_rate_bonus_cap = 0.25;
      mockGameConfigService.getFullConfig.mockResolvedValueOnce(cfg);

      state.processes.push(makeProcess({
        outpostEstablished: true,
        lastConvoySupplyAt: new Date(),
      }));
      state.planets.push(makePlanet());
      // Garrison FP au-dessus du seuil 50
      state.planetShips.push({ planetId: 'planet-1', cruiser: 5 });

      const result = await service.getStatus('user-1', 'planet-1');
      expect(result?.totalRateBonus).toBe(0.25); // capped
      expect(result?.garrisonBonusActive).toBe(true);
      expect(result?.convoyBonusActive).toBe(true);
    });

    it('rate effectif = 0 tant que l\'outpost n\'est pas etabli', async () => {
      state.processes.push(makeProcess({ outpostEstablished: false }));
      state.planets.push(makePlanet());

      const result = await service.getStatus('user-1', 'planet-1');
      expect(result?.effectivePassiveRate).toBe(0);
      expect(result?.estimatedCompletionHours).toBe(Infinity);
    });
  });

  // ── startProcess ────────────────────────────────────────────────

  describe('startProcess()', () => {
    it('cree un process et le retourne', async () => {
      const proc = await service.startProcess('planet-1', 'user-1', 'origin-1', 0.85, false);
      expect(proc.planetId).toBe('planet-1');
      expect(proc.userId).toBe('user-1');
      expect(proc.colonyShipOriginPlanetId).toBe('origin-1');
      expect(proc.difficultyFactor).toBe(0.85);
      expect(state.processes).toHaveLength(1);
    });
  });

  // ── getOutpostThresholds ───────────────────────────────────────

  describe('getOutpostThresholds()', () => {
    it('retourne les seuils de base si IPC=0', async () => {
      const thresholds = await service.getOutpostThresholds('user-1');
      expect(thresholds).toEqual({ minerai: 500, silicium: 250 });
    });

    it('scale les seuils avec le niveau IPC', async () => {
      state.planets.push(makePlanet({ id: 'hw-1', planetClassId: 'homeworld' }));
      state.planetBuildings.push({
        planetId: 'hw-1',
        buildingId: 'imperialPowerCenter',
        level: 2,
      });

      const thresholds = await service.getOutpostThresholds('user-1');
      // 500 * (1 + 0.5 * 2) = 1000
      expect(thresholds.minerai).toBe(1000);
      // 250 * (1 + 0.5 * 2) = 500
      expect(thresholds.silicium).toBe(500);
    });
  });

  // ── consumeResources ───────────────────────────────────────────

  describe('consumeResources()', () => {
    it('retourne stockSufficient=true si pas de process', async () => {
      const result = await service.consumeResources('proc-1');
      expect(result).toEqual({ stockSufficient: true });
    });

    it('ne consomme rien tant que l\'outpost n\'est pas etabli', async () => {
      state.processes.push(makeProcess({ outpostEstablished: false }));
      state.planets.push(makePlanet({ minerai: 1000, silicium: 500 }));

      const result = await service.consumeResources('proc-1');
      expect(result).toEqual({ stockSufficient: true });
      expect(state.planets[0].minerai).toBe(1000); // unchanged
      expect(state.planets[0].silicium).toBe(500);
    });

    it('decremente le stock au tick suivant l\'etablissement de l\'outpost', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: true,
        startedAt: oneHourAgo,
        lastTickAt: oneHourAgo,
      }));
      state.planets.push(makePlanet({ minerai: 1000, silicium: 500 }));

      const result = await service.consumeResources('proc-1');
      // ~1h écoulée, conso = 200/h minerai, 100/h silicium
      expect(state.planets[0].minerai).toBeLessThan(1000);
      expect(state.planets[0].minerai).toBeGreaterThan(700);
      expect(state.planets[0].silicium).toBeLessThan(500);
      expect(result.stockSufficient).toBe(true);
    });

    it('marque stockSufficient=false si le stock tombe a 0', async () => {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: true,
        startedAt: tenHoursAgo,
        lastTickAt: tenHoursAgo,
      }));
      // Stock minimal => apres 10h de conso (200*10=2000) il reste 0.
      state.planets.push(makePlanet({ minerai: 100, silicium: 50 }));

      const result = await service.consumeResources('proc-1');
      expect(state.planets[0].minerai).toBe(0);
      expect(state.planets[0].silicium).toBe(0);
      expect(result.stockSufficient).toBe(false);
    });

    it('respecte la grace period (pas de consommation pendant N heures)', async () => {
      const cfg = structuredClone(baseConfig);
      (cfg.universe as any).colonization_grace_period_hours = 24;
      mockGameConfigService.getFullConfig.mockResolvedValueOnce(cfg);

      state.processes.push(makeProcess({
        outpostEstablished: true,
        startedAt: new Date(), // started just now => still in grace
        lastTickAt: new Date(),
      }));
      state.planets.push(makePlanet({ minerai: 1000, silicium: 500 }));

      const result = await service.consumeResources('proc-1');
      expect(result.stockSufficient).toBe(true);
      expect(state.planets[0].minerai).toBe(1000); // unchanged
    });
  });

  // ── tick ──────────────────────────────────────────────────────

  describe('tick()', () => {
    it('retourne null si pas de process', async () => {
      const result = await service.tick('proc-1', true);
      expect(result).toBeNull();
    });

    it('avance la progression linearment (sans bonus)', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: true,
        progress: 0.0,
        difficultyFactor: 1.0,
        lastTickAt: oneHourAgo,
      }));

      const result = await service.tick('proc-1', true);
      // rate = 0.10 * 1 * 1 + 0 = 0.10/h, sur 1h => +0.10
      expect(result?.progress).toBeCloseTo(0.10, 2);
    });

    it('reduit le rate de moitie quand stockSufficient=false', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: true,
        progress: 0.0,
        difficultyFactor: 1.0,
        lastTickAt: oneHourAgo,
      }));

      const result = await service.tick('proc-1', false);
      // rate = 0.10 * 1 * 0.5 = 0.05/h => +0.05
      expect(result?.progress).toBeCloseTo(0.05, 2);
    });

    it('ne progresse pas tant que l\'outpost n\'est pas etabli mais maj lastTickAt', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: false,
        progress: 0.2,
        lastTickAt: oneHourAgo,
      }));

      const result = await service.tick('proc-1', true);
      expect(result?.progress).toBe(0.2);
    });

    it('plafonne la progression a 1', async () => {
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: true,
        progress: 0.95,
        difficultyFactor: 1.0,
        lastTickAt: tenHoursAgo,
      }));

      const result = await service.tick('proc-1', true);
      expect(result?.progress).toBe(1);
    });

    it('applique le bonus garrison si FP >= seuil', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: true,
        progress: 0.0,
        difficultyFactor: 1.0,
        lastTickAt: oneHourAgo,
      }));
      state.planetShips.push({ planetId: 'planet-1', cruiser: 5 });
      // cruiser FP = round((50 * 2^1.5) * (30 + 100) / 100)
      //           = round(141.42... * 1.3) = ~184/u, x5 = 920 >> 50 (seuil)

      const result = await service.tick('proc-1', true);
      // base = 0.10, bonus garrison = +0.05 => +0.15 / h => +0.15 sur 1h
      expect(result?.progress).toBeCloseTo(0.15, 2);
    });
  });

  // ── maybeGenerateRaid ──────────────────────────────────────────

  describe('maybeGenerateRaid()', () => {
    it('retourne null si pas de process', async () => {
      const result = await service.maybeGenerateRaid('proc-1');
      expect(result).toBeNull();
    });

    it('retourne null tant que l\'outpost n\'est pas etabli', async () => {
      state.processes.push(makeProcess({ outpostEstablished: false }));
      const result = await service.maybeGenerateRaid('proc-1');
      expect(result).toBeNull();
    });

    it('retourne null si l\'intervalle min n\'est pas ecoule', async () => {
      state.processes.push(makeProcess({
        outpostEstablished: true,
        // startedAt il y a 1 minute => bien en-dessous du min interval (3600s)
        startedAt: new Date(Date.now() - 60 * 1000),
        lastRaidAt: null,
      }));
      state.planets.push(makePlanet());

      // On force Math.random a renvoyer 0 => interval = intervalMin = 3600s
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = await service.maybeGenerateRaid('proc-1');
      spy.mockRestore();

      expect(result).toBeNull();
    });

    it('declenche un raid si l\'intervalle est ecoule', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      state.processes.push(makeProcess({
        outpostEstablished: true,
        startedAt: twoHoursAgo,
        lastRaidAt: twoHoursAgo,
        raidCount: 0,
      }));
      state.planets.push(makePlanet({ galaxy: 1, system: 10, position: 3 }));

      // random = 0 => interval = min, et 2h > 3600s donc raid declenche
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      const result = await service.maybeGenerateRaid('proc-1');
      spy.mockRestore();

      expect(result).not.toBeNull();
      expect(result?.targetFP).toBeGreaterThan(0);
      expect(result?.travelTime).toBeGreaterThanOrEqual(1800);
      expect(result?.coordinates).toEqual({ galaxy: 1, system: 10, position: 3 });
      expect(state.processes[0].raidCount).toBe(1);
    });
  });

  // ── updateLastConvoySupplyAt ──────────────────────────────────

  describe('updateLastConvoySupplyAt()', () => {
    it('met a jour la timestamp lastConvoySupplyAt du process actif', async () => {
      state.processes.push(makeProcess({
        planetId: 'planet-1',
        lastConvoySupplyAt: null,
      }));

      await service.updateLastConvoySupplyAt('planet-1');
      expect(state.processes[0].lastConvoySupplyAt).toBeInstanceOf(Date);
    });
  });

  // ── completeFromPlayer ─────────────────────────────────────────

  describe('completeFromPlayer()', () => {
    it('throw NOT_FOUND si pas de process', async () => {
      await expect(service.completeFromPlayer('user-1', 'planet-1'))
        .rejects.toThrow(TRPCError);
    });

    it('throw BAD_REQUEST si progression < 0.995', async () => {
      state.processes.push(makeProcess({ progress: 0.8 }));

      await expect(service.completeFromPlayer('user-1', 'planet-1'))
        .rejects.toThrow(/pas encore terminee/);
    });

    it('throw NOT_FOUND si le process appartient a un autre user', async () => {
      state.processes.push(makeProcess({ userId: 'user-2', progress: 1.0 }));

      await expect(service.completeFromPlayer('user-1', 'planet-1'))
        .rejects.toThrow(TRPCError);
    });

    it('finalise la colonisation si progress >= 0.995', async () => {
      state.processes.push(makeProcess({ progress: 0.995 }));
      state.planets.push(makePlanet({ status: 'colonizing' }));

      const result = await service.completeFromPlayer('user-1', 'planet-1');
      expect(result).toEqual({ completed: true, planetId: 'planet-1' });
      expect(state.processes[0].status).toBe('completed');
      expect(state.planets[0].status).toBe('active');
    });
  });

  // ── fail ──────────────────────────────────────────────────────

  describe('fail()', () => {
    it('retourne null si pas de process', async () => {
      const result = await service.fail('proc-1');
      expect(result).toBeNull();
    });

    it('marque le process failed et supprime la planete', async () => {
      state.processes.push(makeProcess({ id: 'proc-1', planetId: 'planet-1' }));
      state.planets.push(makePlanet({ id: 'planet-1' }));

      const result = await service.fail('proc-1');
      expect(result).toEqual({ originPlanetId: 'origin-1', userId: 'user-1' });
      expect(state.processes[0].status).toBe('failed');
      expect(state.planets).toHaveLength(0);
    });
  });
});
