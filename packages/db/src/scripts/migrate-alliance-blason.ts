/**
 * Migration: backfill blason columns for existing alliances using generateDefaultBlason(tag).
 *
 * Usage: DATABASE_URL="..." npx tsx packages/db/src/scripts/migrate-alliance-blason.ts
 *
 * Run between migrations 0052 (add nullable columns) and 0053 (enforce NOT NULL).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, isNull } from 'drizzle-orm';
import { alliances } from '../schema/alliances.js';
import { generateDefaultBlason } from '@exilium/shared';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required. Run: DATABASE_URL="..." npx tsx packages/db/src/scripts/migrate-alliance-blason.ts',
  );
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function main() {
  const rows = await db
    .select({ id: alliances.id, tag: alliances.tag })
    .from(alliances)
    .where(isNull(alliances.blasonShape));

  console.log(`Backfilling ${rows.length} alliances…`);
  for (const row of rows) {
    const b = generateDefaultBlason(row.tag);
    await db
      .update(alliances)
      .set({
        blasonShape: b.shape,
        blasonIcon: b.icon,
        blasonColor1: b.color1,
        blasonColor2: b.color2,
      })
      .where(eq(alliances.id, row.id));
  }
  console.log('Backfill done.');
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
