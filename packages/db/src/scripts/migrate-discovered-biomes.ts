/**
 * Migration script: fix orphaned discovered_biomes after the planet type
 * derivation change (commit 877e899).
 *
 * For each explored position, regenerates the correct biome pool with the
 * current algorithm, then transfers orphaned discoveries 1-for-1 to
 * undiscovered biomes in the new pool so players keep their progress.
 *
 * Usage: npx tsx src/scripts/migrate-discovered-biomes.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, inArray } from 'drizzle-orm';
import { discoveredBiomes, discoveredPositions, biomeDefinitions } from '../schema/biomes.js';

// ── Inlined deterministic functions (same as @exilium/game-engine) ──

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

function calculateMaxTemp(position: number): number {
  return 40 + (8 - position) * 30;
}

type PlanetTypeId = 'volcanic' | 'arid' | 'temperate' | 'glacial' | 'gaseous';

const TEMP_BRACKETS = [
  { maxTemp: -100, weights: [['volcanic', 0], ['arid', 0], ['temperate', 0.05], ['glacial', 0.60], ['gaseous', 0.35]] as [string, number][] },
  { maxTemp: -20,  weights: [['volcanic', 0], ['arid', 0.05], ['temperate', 0.20], ['glacial', 0.55], ['gaseous', 0.20]] as [string, number][] },
  { maxTemp: 50,   weights: [['volcanic', 0.05], ['arid', 0.20], ['temperate', 0.50], ['glacial', 0.10], ['gaseous', 0.15]] as [string, number][] },
  { maxTemp: 150,  weights: [['volcanic', 0.25], ['arid', 0.45], ['temperate', 0.20], ['glacial', 0], ['gaseous', 0.10]] as [string, number][] },
  { maxTemp: Infinity, weights: [['volcanic', 0.60], ['arid', 0.25], ['temperate', 0.10], ['glacial', 0], ['gaseous', 0.05]] as [string, number][] },
];

function pickPlanetTypeForPosition(maxTemp: number, rng: () => number): PlanetTypeId {
  const bracket = TEMP_BRACKETS.find((b) => maxTemp <= b.maxTemp) ?? TEMP_BRACKETS[TEMP_BRACKETS.length - 1];
  const totalWeight = bracket.weights.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight <= 0) return 'temperate';
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const [type, weight] of bracket.weights) {
    cumulative += weight;
    if (roll < cumulative) return type as PlanetTypeId;
  }
  return bracket.weights[bracket.weights.length - 1][0] as PlanetTypeId;
}

const BIOME_COUNT_WEIGHTS: [number, number][] = [
  [1, 0.15], [2, 0.30], [3, 0.30], [4, 0.20], [5, 0.05],
];

const RARITY_WEIGHTS: Record<string, number> = {
  common: 0.40, uncommon: 0.30, rare: 0.18, epic: 0.09, legendary: 0.03,
};

interface BiomeDef {
  id: string;
  rarity: string;
  compatiblePlanetTypes: string[];
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

function pickBiomes(catalogue: BiomeDef[], planetTypeId: string, count: number, rng: () => number): BiomeDef[] {
  const compatible = catalogue.filter(
    (b) => b.compatiblePlanetTypes.length === 0 || b.compatiblePlanetTypes.includes(planetTypeId),
  );
  const picked: BiomeDef[] = [];
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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function main() {
  // Load biome catalogue from DB
  const biomeCatalogue: BiomeDef[] = (await db.select().from(biomeDefinitions)).map((b) => ({
    id: b.id,
    rarity: b.rarity,
    compatiblePlanetTypes: (b.compatiblePlanetTypes ?? []) as string[],
  }));

  if (biomeCatalogue.length === 0) {
    console.log('No biome definitions found, nothing to do.');
    await client.end();
    return;
  }

  // Get all discovered positions
  const positions = await db.select().from(discoveredPositions);
  console.log(`Found ${positions.length} discovered positions to check.`);

  let totalOrphans = 0;
  let totalTransferred = 0;
  let totalDeleted = 0;

  for (const pos of positions) {
    const { userId, galaxy, system, position } = pos;

    // Regenerate the correct biome pool for this position
    const maxTemp = calculateMaxTemp(position);
    const typeRng = seededRandom(coordinateSeed(galaxy, system, position) ^ 0x9E3779B9);
    const planetClassId = pickPlanetTypeForPosition(maxTemp, typeRng);
    const rng = seededRandom(coordinateSeed(galaxy, system, position));
    const count = generateBiomeCount(rng);
    const correctBiomes = pickBiomes(biomeCatalogue, planetClassId, count, rng);
    const correctBiomeIds = new Set(correctBiomes.map((b) => b.id));

    // Get player's current discoveries for this position
    const discoveries = await db
      .select({ biomeId: discoveredBiomes.biomeId })
      .from(discoveredBiomes)
      .where(and(
        eq(discoveredBiomes.userId, userId),
        eq(discoveredBiomes.galaxy, galaxy),
        eq(discoveredBiomes.system, system),
        eq(discoveredBiomes.position, position),
      ));

    const discoveredIds = discoveries.map((d) => d.biomeId);
    const orphanIds = discoveredIds.filter((id) => !correctBiomeIds.has(id));
    const validIds = new Set(discoveredIds.filter((id) => correctBiomeIds.has(id)));
    const undiscoveredNew = correctBiomes.filter((b) => !validIds.has(b.id));

    if (orphanIds.length === 0) continue;

    totalOrphans += orphanIds.length;

    // Transfer orphans 1:1 to undiscovered biomes in the new pool
    const toTransfer = Math.min(orphanIds.length, undiscoveredNew.length);
    if (toTransfer > 0) {
      const newBiomes = undiscoveredNew.slice(0, toTransfer);
      await db.insert(discoveredBiomes).values(
        newBiomes.map((b) => ({
          userId,
          galaxy,
          system,
          position,
          biomeId: b.id,
        })),
      ).onConflictDoNothing();
      totalTransferred += toTransfer;
    }

    // Delete orphaned entries
    await db.delete(discoveredBiomes).where(and(
      eq(discoveredBiomes.userId, userId),
      eq(discoveredBiomes.galaxy, galaxy),
      eq(discoveredBiomes.system, system),
      eq(discoveredBiomes.position, position),
      inArray(discoveredBiomes.biomeId, orphanIds),
    ));
    totalDeleted += orphanIds.length;

    const coords = `[${galaxy}:${system}:${position}]`;
    console.log(`  ${coords} — ${orphanIds.length} orphan(s), ${toTransfer} transferred, valid: ${validIds.size}/${correctBiomes.length}`);
  }

  console.log(`\nDone. Orphans found: ${totalOrphans}, transferred: ${totalTransferred}, deleted: ${totalDeleted}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
