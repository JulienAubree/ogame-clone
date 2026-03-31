/**
 * Migration: convert old smallShield/largeShield defenses to new planetaryShield building.
 * - Player with smallShield=1 → planetaryShield level 1
 * - Player with largeShield=1 → planetaryShield level 3
 * - Player with both → planetaryShield level 3 (highest)
 *
 * Run with: npx tsx packages/db/src/scripts/migrate-shields.ts
 *
 * NOTE: This script uses raw SQL since the smallShield/largeShield columns
 * have been removed from the Drizzle schema. Run BEFORE dropping the actual
 * columns from the database.
 */
import { sql } from 'drizzle-orm';
import { createDb } from '../connection.js';
import { planetBuildings } from '../schema/index.js';

async function main() {
  const db = createDb();

  // Find all planets with old shields using raw SQL (columns removed from schema)
  const planetsWithShields = await db.execute(sql`
    SELECT planet_id, small_shield, large_shield
    FROM planet_defenses
    WHERE small_shield > 0 OR large_shield > 0
  `);

  const rows = planetsWithShields.rows as { planet_id: string; small_shield: number; large_shield: number }[];
  console.log(`Found ${rows.length} planets with old shields`);

  let migrated = 0;
  for (const row of rows) {
    const level = row.large_shield > 0 ? 3 : 1;

    // Check if planetaryShield building already exists for this planet
    const existing = await db.execute(sql`
      SELECT id, level FROM planet_buildings
      WHERE planet_id = ${row.planet_id} AND building_id = 'planetaryShield'
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      const current = (existing.rows[0] as { id: string; level: number });
      if (current.level < level) {
        await db.execute(sql`
          UPDATE planet_buildings SET level = ${level}
          WHERE id = ${current.id}
        `);
        console.log(`  Updated planet ${row.planet_id}: level ${current.level} → ${level}`);
        migrated++;
      } else {
        console.log(`  Skipped planet ${row.planet_id}: already level ${current.level}`);
      }
    } else {
      await db.insert(planetBuildings).values({
        planetId: row.planet_id,
        buildingId: 'planetaryShield',
        level,
      });
      console.log(`  Created planet ${row.planet_id}: planetaryShield level ${level}`);
      migrated++;
    }
  }

  console.log(`Migration complete: ${migrated} planets updated`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
