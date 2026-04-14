/**
 * Migration: give existing players an Imperial Power Center matching their colony count.
 * This ensures zero governance overextend for all current players.
 *
 * Usage: DATABASE_URL="..." npx tsx packages/db/src/scripts/migrate-colonization.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, isNull } from 'drizzle-orm';
import { planets } from '../schema/planets.js';
import { planetBuildings } from '../schema/planet-buildings.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required. Run: DATABASE_URL="..." npx tsx packages/db/src/scripts/migrate-colonization.ts',
  );
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function main() {
  // 1. Ensure all planets have status 'active' (for pre-migration planets with NULL status)
  const statusResult = await db
    .update(planets)
    .set({ status: 'active' })
    .where(isNull(planets.status));
  console.log('Set NULL planet statuses to active');

  // 2. Get distinct user IDs that own planets
  const userPlanets = await db
    .select({ userId: planets.userId })
    .from(planets)
    .groupBy(planets.userId);

  console.log(`Found ${userPlanets.length} users with planets`);

  let updated = 0;
  for (const { userId } of userPlanets) {
    // Get all active planets for this user
    const playerPlanets = await db
      .select({
        id: planets.id,
        planetClassId: planets.planetClassId,
        createdAt: planets.createdAt,
      })
      .from(planets)
      .where(eq(planets.userId, userId));

    const colonyCount = Math.max(0, playerPlanets.length - 1);
    if (colonyCount === 0) continue;

    // Find homeworld by planetClassId, fallback to earliest planet
    const homeworld =
      playerPlanets.find((p) => p.planetClassId === 'homeworld') ??
      playerPlanets.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];

    if (!homeworld) continue;

    // Upsert Imperial Power Center (idempotent)
    await db
      .insert(planetBuildings)
      .values({
        planetId: homeworld.id,
        buildingId: 'imperialPowerCenter',
        level: colonyCount,
      })
      .onConflictDoUpdate({
        target: [planetBuildings.planetId, planetBuildings.buildingId],
        set: { level: colonyCount },
      });

    updated++;
    console.log(
      `  User ${userId}: ${colonyCount} colonies -> IPC level ${colonyCount} on ${homeworld.id}`,
    );
  }

  console.log(`\nDone. Updated ${updated} users.`);
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
