/**
 * Migration script: assign biomes to existing colonized planets.
 * Skips homeworlds and planets that already have biomes.
 * Uses the same seeded random as the galaxy view for consistency.
 *
 * Usage: npx tsx src/migrate-existing-planet-biomes.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, sql } from 'drizzle-orm';
import { planets } from './schema/planets.js';
import { planetTypes } from './schema/game-config.js';
import { biomeDefinitions, planetBiomes } from './schema/biomes.js';

// ── Inlined biome generation (same logic as @exilium/game-engine) ──

interface BiomeDefinition {
  id: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  compatiblePlanetTypes: string[];
  effects: Array<{ stat: string; modifier: number }>;
}

const BIOME_COUNT_WEIGHTS: [number, number][] = [
  [1, 0.15], [2, 0.30], [3, 0.30], [4, 0.20], [5, 0.05],
];

const RARITY_WEIGHTS: Record<string, number> = {
  common: 0.40, uncommon: 0.30, rare: 0.18, epic: 0.09, legendary: 0.03,
};

function seededRandom(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function coordinateSeed(galaxy: number, system: number, position: number): number {
  return galaxy * 1_000_000 + system * 1_000 + position;
}

function generateBiomeCount(rng: () => number): number {
  const roll = rng();
  let cumulative = 0;
  for (const [count, weight] of BIOME_COUNT_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return count;
  }
  return 3;
}

function pickBiomes(catalogue: BiomeDefinition[], planetTypeId: string, count: number, rng: () => number): BiomeDefinition[] {
  const compatible = catalogue.filter(
    (b) => b.compatiblePlanetTypes.length === 0 || b.compatiblePlanetTypes.includes(planetTypeId),
  );
  const picked: BiomeDefinition[] = [];
  const remaining = [...compatible];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, b) => sum + (RARITY_WEIGHTS[b.rarity] ?? 0), 0);
    if (totalWeight <= 0) break;
    const roll = rng() * totalWeight;
    let cumulative = 0;
    let pickedIndex = 0;
    for (let j = 0; j < remaining.length; j++) {
      cumulative += RARITY_WEIGHTS[remaining[j].rarity] ?? 0;
      if (roll < cumulative) { pickedIndex = j; break; }
    }
    picked.push(remaining[pickedIndex]);
    remaining.splice(pickedIndex, 1);
  }
  return picked;
}

// ── Migration ──

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://exilium:exilium@localhost:5432/exilium';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function main() {
  console.log('Migrating existing planets: assigning biomes...\n');

  const biomeRows = await db.select().from(biomeDefinitions);
  const catalogue: BiomeDefinition[] = biomeRows.map((b) => ({
    id: b.id,
    rarity: b.rarity,
    compatiblePlanetTypes: b.compatiblePlanetTypes as string[],
    effects: b.effects as Array<{ stat: string; modifier: number }>,
  }));

  if (catalogue.length === 0) {
    console.log('No biome definitions found. Run the seed first.');
    await client.end();
    return;
  }

  const ptRows = await db.select().from(planetTypes);
  const homeworldType = ptRows.find((pt) => pt.role === 'homeworld');
  const homeworldId = homeworldType?.id ?? 'homeworld';

  const allPlanets = await db
    .select({
      id: planets.id,
      galaxy: planets.galaxy,
      system: planets.system,
      position: planets.position,
      planetClassId: planets.planetClassId,
    })
    .from(planets)
    .where(
      and(
        sql`${planets.planetClassId} IS NOT NULL`,
        sql`${planets.planetClassId} != ${homeworldId}`,
      ),
    );

  const existingBiomes = await db
    .select({ planetId: planetBiomes.planetId })
    .from(planetBiomes);
  const planetsWithBiomes = new Set(existingBiomes.map((r: { planetId: string }) => r.planetId));

  const planetsToMigrate = allPlanets.filter((p) => !planetsWithBiomes.has(p.id));

  if (planetsToMigrate.length === 0) {
    console.log('All planets already have biomes. Nothing to do.');
    await client.end();
    return;
  }

  console.log(`Found ${planetsToMigrate.length} planets to assign biomes to.\n`);

  let totalBiomes = 0;

  for (const planet of planetsToMigrate) {
    const planetTypeId = planet.planetClassId!;
    const seed = coordinateSeed(planet.galaxy, planet.system, planet.position);
    const rng = seededRandom(seed);
    const biomeCount = generateBiomeCount(rng);
    const picked = pickBiomes(catalogue, planetTypeId, biomeCount, rng);

    if (picked.length > 0) {
      await db.insert(planetBiomes).values(
        picked.map((b: BiomeDefinition) => ({ planetId: planet.id, biomeId: b.id })),
      );
      totalBiomes += picked.length;
    }

    const biomeNames = picked.map((b: BiomeDefinition) => b.id).join(', ');
    console.log(`  [${planet.galaxy}:${planet.system}:${planet.position}] ${planetTypeId} -> ${picked.length} biomes (${biomeNames})`);
  }

  console.log(`\nDone! Assigned ${totalBiomes} biomes to ${planetsToMigrate.length} planets.`);
  await client.end();
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err);
});
