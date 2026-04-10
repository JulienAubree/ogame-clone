import { eq, and, inArray } from 'drizzle-orm';
import { planets, users, debrisFields, allianceMembers, alliances, planetBiomes, biomeDefinitions, discoveredBiomes, discoveredPositions } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { GameConfigService } from '../admin/game-config.service.js';
import { seededRandom, coordinateSeed, generateBiomeCount, pickBiomes, pickPlanetTypeForPosition, calculateMaxTemp } from '@exilium/game-engine';

export function createGalaxyService(db: Database, gameConfigService: GameConfigService) {
  return {
    async getSystem(galaxy: number, system: number, _currentUserId?: string) {
      const config = await gameConfigService.getFullConfig();
      const positions = Number(config.universe.positions) || 16;
      const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
      const biomeCatalogue = config.biomes;

      // Load player's discovered biomes for this system
      const playerDiscoveries = _currentUserId
        ? await db
            .select({ position: discoveredBiomes.position, biomeId: discoveredBiomes.biomeId })
            .from(discoveredBiomes)
            .where(
              and(
                eq(discoveredBiomes.userId, _currentUserId),
                eq(discoveredBiomes.galaxy, galaxy),
                eq(discoveredBiomes.system, system),
              ),
            )
        : [];

      const discoverySet = new Set(playerDiscoveries.map((d) => `${d.position}:${d.biomeId}`));

      // Load player's discovered positions for this system
      const discoveredPositionRows = _currentUserId
        ? await db
            .select({ position: discoveredPositions.position })
            .from(discoveredPositions)
            .where(
              and(
                eq(discoveredPositions.userId, _currentUserId),
                eq(discoveredPositions.galaxy, galaxy),
                eq(discoveredPositions.system, system),
              ),
            )
        : [];

      const discoveredPositionSet = new Set(discoveredPositionRows.map((r) => r.position));

      const systemPlanets = await db
        .select({
          position: planets.position,
          planetId: planets.id,
          planetName: planets.name,
          planetType: planets.planetType,
          userId: planets.userId,
          username: users.username,
          allianceId: allianceMembers.allianceId,
          allianceTag: alliances.tag,
          planetClassId: planets.planetClassId,
        })
        .from(planets)
        .leftJoin(users, eq(users.id, planets.userId))
        .leftJoin(allianceMembers, eq(allianceMembers.userId, planets.userId))
        .leftJoin(alliances, eq(alliances.id, allianceMembers.allianceId))
        .where(and(eq(planets.galaxy, galaxy), eq(planets.system, system)));

      // Load persisted biomes for colonized planets
      const planetIds = systemPlanets.map(p => p.planetId);
      const persistedBiomes = planetIds.length > 0
        ? await db
            .select({ planetId: planetBiomes.planetId, biomeId: planetBiomes.biomeId })
            .from(planetBiomes)
            .where(inArray(planetBiomes.planetId, planetIds))
        : [];

      // Also load biome details for persisted biomes
      const persistedBiomeIds = [...new Set(persistedBiomes.map(b => b.biomeId))];
      const persistedBiomeDetails = persistedBiomeIds.length > 0
        ? await db
            .select({
              id: biomeDefinitions.id,
              name: biomeDefinitions.name,
              rarity: biomeDefinitions.rarity,
              effects: biomeDefinitions.effects,
            })
            .from(biomeDefinitions)
            .where(inArray(biomeDefinitions.id, persistedBiomeIds))
        : [];

      // Index biome details by id
      const biomeDetailsById = new Map(persistedBiomeDetails.map(b => [b.id, b]));

      // Group persisted biomes by planet id
      const biomesByPlanetId = new Map<string, Array<{ id: string; name: string; rarity: string; effects: unknown }>>();
      for (const pb of persistedBiomes) {
        const detail = biomeDetailsById.get(pb.biomeId);
        if (!detail) continue;
        const arr = biomesByPlanetId.get(pb.planetId);
        const entry = { id: detail.id, name: detail.name, rarity: detail.rarity, effects: detail.effects };
        if (arr) arr.push(entry); else biomesByPlanetId.set(pb.planetId, [entry]);
      }

      type PlanetSlot = typeof systemPlanets[number] & { biomes: Array<{ id: string; name: string; rarity: string; effects: unknown }> };
      type BeltSlot = { type: 'belt'; position: number };
      type EmptySlot = {
        type: 'empty';
        position: number;
        planetClassId: string | null;
        isDiscovered: boolean;
        biomes: Array<{ id: string; name: string; rarity: string; effects: unknown }>;
        totalBiomeCount: number;
        undiscoveredCount: number;
      };

      const slots: (PlanetSlot | BeltSlot | EmptySlot | null)[] = Array(positions).fill(null);

      // Mark belt positions
      const beltSet = new Set(beltPositions);
      for (const pos of beltPositions) {
        slots[pos - 1] = { type: 'belt', position: pos };
      }

      // Place colonized planets with their persisted biomes
      const occupiedPositions = new Set<number>();
      for (const planet of systemPlanets) {
        occupiedPositions.add(planet.position);
        (slots[planet.position - 1] as PlanetSlot) = {
          ...planet,
          biomes: biomesByPlanetId.get(planet.planetId) ?? [],
        };
      }

      // Fill empty (non-belt, non-occupied) positions with deterministic biomes
      for (let i = 1; i <= positions; i++) {
        if (beltSet.has(i) || occupiedPositions.has(i)) continue;

        const isDiscovered = discoveredPositionSet.has(i);

        // Compute deterministic max temperature for the position (zero offset for stability)
        const maxTemp = calculateMaxTemp(i, 0);

        // Pick the planet type using a temperature-weighted distribution
        // Use a separate seed namespace from biomes (XOR with a constant)
        const typeRng = seededRandom(coordinateSeed(galaxy, system, i) ^ 0x9E3779B9);
        const planetClassId = pickPlanetTypeForPosition(maxTemp, typeRng);

        // Compute biomes deterministically
        const rng = seededRandom(coordinateSeed(galaxy, system, i));
        const count = generateBiomeCount(rng);
        const biomes = pickBiomes(biomeCatalogue, planetClassId, count, rng);

        const discoveredForPos = biomes.filter((b) =>
          discoverySet.has(`${i}:${b.id}`),
        );
        const totalBiomeCount = biomes.length;
        const undiscoveredCount = totalBiomeCount - discoveredForPos.length;

        slots[i - 1] = isDiscovered
          ? {
              type: 'empty',
              position: i,
              planetClassId,
              isDiscovered: true,
              biomes: discoveredForPos.map((b) => {
                const full = biomeCatalogue.find((bc: any) => bc.id === b.id);
                return { id: b.id, name: (full as any)?.name ?? b.id, rarity: b.rarity, effects: b.effects };
              }),
              totalBiomeCount,
              undiscoveredCount,
            }
          : {
              type: 'empty',
              position: i,
              planetClassId: null,
              isDiscovered: false,
              biomes: [],
              totalBiomeCount: 0,
              undiscoveredCount: 0,
            };
      }

      const debris = await db
        .select()
        .from(debrisFields)
        .where(
          and(
            eq(debrisFields.galaxy, galaxy),
            eq(debrisFields.system, system),
          ),
        );

      for (const d of debris) {
        const slot = slots[d.position - 1];
        if (slot) {
          (slot as any).debris = { minerai: Number(d.minerai), silicium: Number(d.silicium) };
        }
      }

      return { galaxy, system, slots };
    },
  };
}
