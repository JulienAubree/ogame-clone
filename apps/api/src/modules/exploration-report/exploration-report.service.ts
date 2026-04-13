import { eq, and, ne, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { explorationReports, discoveredPositions, discoveredBiomes, biomeDefinitions, planets } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import {
  seededRandom,
  coordinateSeed,
  generateBiomeCount,
  pickBiomes,
  pickPlanetTypeForPosition,
  calculateMaxTemp,
} from '@exilium/game-engine';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

type Rarity = (typeof RARITY_ORDER)[number];

interface BiomeSnapshot {
  id: string;
  name: string;
  rarity: string;
  effects: unknown;
}

export function createExplorationReportService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  gameConfigService: GameConfigService,
) {
  /** Check that the player has discovered the given position. */
  async function assertPositionDiscovered(
    userId: string,
    galaxy: number,
    system: number,
    position: number,
  ): Promise<void> {
    const [row] = await db
      .select({ userId: discoveredPositions.userId })
      .from(discoveredPositions)
      .where(
        and(
          eq(discoveredPositions.userId, userId),
          eq(discoveredPositions.galaxy, galaxy),
          eq(discoveredPositions.system, system),
          eq(discoveredPositions.position, position),
        ),
      )
      .limit(1);

    if (!row) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Position non decouverte',
      });
    }
  }

  /** Check that no existing report (inventory or listed) already covers this position for the user. */
  async function assertNoDuplicateReport(
    userId: string,
    galaxy: number,
    system: number,
    position: number,
  ): Promise<void> {
    const [existing] = await db
      .select({ id: explorationReports.id })
      .from(explorationReports)
      .where(
        and(
          eq(explorationReports.ownerId, userId),
          eq(explorationReports.galaxy, galaxy),
          eq(explorationReports.system, system),
          eq(explorationReports.position, position),
          sql`${explorationReports.status} IN ('inventory', 'listed')`,
        ),
      )
      .limit(1);

    if (existing) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Un rapport existe deja pour cette position',
      });
    }
  }

  /** Snapshot the user's discovered biomes for a position, joined with definitions. */
  async function snapshotBiomes(
    userId: string,
    galaxy: number,
    system: number,
    position: number,
  ): Promise<BiomeSnapshot[]> {
    const rows = await db
      .select({
        id: biomeDefinitions.id,
        name: biomeDefinitions.name,
        rarity: biomeDefinitions.rarity,
        effects: biomeDefinitions.effects,
      })
      .from(discoveredBiomes)
      .innerJoin(biomeDefinitions, eq(discoveredBiomes.biomeId, biomeDefinitions.id))
      .where(
        and(
          eq(discoveredBiomes.userId, userId),
          eq(discoveredBiomes.galaxy, galaxy),
          eq(discoveredBiomes.system, system),
          eq(discoveredBiomes.position, position),
        ),
      );

    return rows;
  }

  /** Compute the deterministic planet class for a position. Must match galaxy.service.ts. */
  function computePlanetClassId(galaxy: number, system: number, position: number): string {
    const maxTemp = calculateMaxTemp(position, 0);
    const typeRng = seededRandom(coordinateSeed(galaxy, system, position) ^ 0x9E3779B9);
    return pickPlanetTypeForPosition(maxTemp, typeRng);
  }

  /** Compute the full biome count for a position (deterministic). */
  function computeFullBiomeCount(galaxy: number, system: number, position: number): number {
    const rng = seededRandom(coordinateSeed(galaxy, system, position));
    return generateBiomeCount(rng);
  }

  /** Compute the full biome set for a position (deterministic), using the game config catalogue. */
  function computeFullBiomes(
    galaxy: number,
    system: number,
    position: number,
    planetClassId: string,
    biomeCatalogue: Parameters<typeof pickBiomes>[0],
  ) {
    const rng = seededRandom(coordinateSeed(galaxy, system, position));
    const count = generateBiomeCount(rng);
    return pickBiomes(biomeCatalogue, planetClassId, count, rng);
  }

  /** Compute the highest rarity among a set of biomes. */
  function computeMaxRarity(biomes: BiomeSnapshot[]): Rarity {
    if (biomes.length === 0) return 'common';
    let maxIndex = 0;
    for (const b of biomes) {
      const idx = RARITY_ORDER.indexOf(b.rarity as Rarity);
      if (idx > maxIndex) maxIndex = idx;
    }
    return RARITY_ORDER[maxIndex];
  }

  return {
    async create(
      userId: string,
      planetId: string,
      input: { galaxy: number; system: number; position: number },
    ) {
      // 1. Check the position is not already colonized
      const [colonized] = await db
        .select({ id: planets.id })
        .from(planets)
        .where(
          and(
            eq(planets.galaxy, input.galaxy),
            eq(planets.system, input.system),
            eq(planets.position, input.position),
          ),
        )
        .limit(1);
      if (colonized) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cette position est deja colonisee — impossible de vendre un rapport' });
      }

      // 2. Check the user has discovered the position
      await assertPositionDiscovered(userId, input.galaxy, input.system, input.position);

      // 3. Check no duplicate report in inventory/listed
      await assertNoDuplicateReport(userId, input.galaxy, input.system, input.position);

      // 3. Snapshot biomes from discovered_biomes
      const biomes = await snapshotBiomes(userId, input.galaxy, input.system, input.position);

      // 4. Compute deterministic planetClassId
      const planetClassId = computePlanetClassId(input.galaxy, input.system, input.position);

      // 5. Determine isComplete — compare discovered count to full biome count
      const config = await gameConfigService.getFullConfig();
      const fullBiomes = computeFullBiomes(
        input.galaxy,
        input.system,
        input.position,
        planetClassId,
        config.biomes,
      );
      const isComplete = biomes.length >= fullBiomes.length;

      // 6. Compute maxRarity
      const maxRarity = computeMaxRarity(biomes);

      // 7. Insert into exploration_reports (no creation cost — free to create)
      const [report] = await db
        .insert(explorationReports)
        .values({
          ownerId: userId,
          creatorId: userId,
          galaxy: input.galaxy,
          system: input.system,
          position: input.position,
          planetClassId,
          biomes: biomes as any,
          biomeCount: biomes.length,
          maxRarity,
          isComplete,
          creationCost: '0',
          status: 'inventory',
        })
        .returning();

      // 10. Return the created report
      return report;
    },

    async list(userId: string) {
      const reports = await db
        .select({
          id: explorationReports.id,
          galaxy: explorationReports.galaxy,
          system: explorationReports.system,
          position: explorationReports.position,
          planetClassId: explorationReports.planetClassId,
          biomeCount: explorationReports.biomeCount,
          maxRarity: explorationReports.maxRarity,
          isComplete: explorationReports.isComplete,
          creationCost: explorationReports.creationCost,
          status: explorationReports.status,
          createdAt: explorationReports.createdAt,
        })
        .from(explorationReports)
        .where(
          and(
            eq(explorationReports.ownerId, userId),
            ne(explorationReports.status, 'consumed'),
          ),
        )
        .orderBy(desc(explorationReports.createdAt));

      return reports.map((r) => ({
        ...r,
        creationCost: Number(r.creationCost),
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async remove(reportId: string, userId: string) {
      const [report] = await db
        .select({ id: explorationReports.id, ownerId: explorationReports.ownerId, status: explorationReports.status })
        .from(explorationReports)
        .where(eq(explorationReports.id, reportId))
        .limit(1);

      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rapport non trouve' });
      }

      if (report.ownerId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Ce rapport ne vous appartient pas' });
      }

      if (report.status !== 'inventory') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Seuls les rapports en inventaire peuvent etre supprimes',
        });
      }

      await db
        .update(explorationReports)
        .set({ status: 'consumed' })
        .where(eq(explorationReports.id, reportId));

      return { success: true };
    },

    async canCreate(
      userId: string,
      input: { galaxy: number; system: number; position: number },
    ): Promise<{ canCreate: boolean; reason?: string; cost: number }> {
      // Check position is not colonized
      const [colonized] = await db
        .select({ id: planets.id })
        .from(planets)
        .where(
          and(
            eq(planets.galaxy, input.galaxy),
            eq(planets.system, input.system),
            eq(planets.position, input.position),
          ),
        )
        .limit(1);
      if (colonized) {
        return { canCreate: false, reason: 'Position deja colonisee', cost: 0 };
      }

      // Check position discovered
      const [discovered] = await db
        .select({ userId: discoveredPositions.userId })
        .from(discoveredPositions)
        .where(
          and(
            eq(discoveredPositions.userId, userId),
            eq(discoveredPositions.galaxy, input.galaxy),
            eq(discoveredPositions.system, input.system),
            eq(discoveredPositions.position, input.position),
          ),
        )
        .limit(1);

      if (!discovered) {
        return { canCreate: false, reason: 'Position non decouverte', cost: 0 };
      }

      // Check no existing report in inventory/listed
      const [existing] = await db
        .select({ id: explorationReports.id })
        .from(explorationReports)
        .where(
          and(
            eq(explorationReports.ownerId, userId),
            eq(explorationReports.galaxy, input.galaxy),
            eq(explorationReports.system, input.system),
            eq(explorationReports.position, input.position),
            sql`${explorationReports.status} IN ('inventory', 'listed')`,
          ),
        )
        .limit(1);

      if (existing) {
        return { canCreate: false, reason: 'Un rapport existe deja pour cette position', cost: 0 };
      }

      return { canCreate: true, cost: 0 };
    },
  };
}
