import { createDb } from '@ogame-clone/db';
import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { createGameConfigService } from '../modules/admin/game-config.service.js';
import { createAsteroidBeltService } from '../modules/pve/asteroid-belt.service.js';
import { createPirateService } from '../modules/pve/pirate.service.js';
import { createPveService } from '../modules/pve/pve.service.js';
import { startBuildingCompletionWorker } from './building-completion.worker.js';
import { startResearchCompletionWorker } from './research-completion.worker.js';
import { startShipyardCompletionWorker } from './shipyard-completion.worker.js';
import { startFleetArrivalWorker } from './fleet-arrival.worker.js';
import { startFleetReturnWorker } from './fleet-return.worker.js';
import { eventCatchup } from '../cron/event-catchup.js';
import { resourceTick } from '../cron/resource-tick.js';
import { rankingUpdate } from '../cron/ranking-update.js';
import { eventCleanup } from '../cron/event-cleanup.js';

const db = createDb(env.DATABASE_URL);
const gameConfigService = createGameConfigService(db);
const asteroidBeltService = createAsteroidBeltService(db);
const pirateService = createPirateService(db, gameConfigService);
const pveService = createPveService(db, asteroidBeltService, pirateService);

console.log('[worker] Starting workers...');
startBuildingCompletionWorker(db);
console.log('[worker] Building completion worker started');
startResearchCompletionWorker(db);
console.log('[worker] Research completion worker started');
startShipyardCompletionWorker(db);
console.log('[worker] Shipyard completion worker started');
startFleetArrivalWorker(db);
console.log('[worker] Fleet arrival worker started');
startFleetReturnWorker(db);
console.log('[worker] Fleet return worker started');

setInterval(async () => {
  try {
    await eventCatchup(db);
  } catch (err) {
    console.error('[event-catchup] Error:', err);
  }
}, 30_000);
console.log('[worker] Event catchup cron started (30s)');

setInterval(async () => {
  try {
    await resourceTick(db);
  } catch (err) {
    console.error('[resource-tick] Error:', err);
  }
}, 15 * 60_000);
console.log('[worker] Resource tick cron started (15min)');

setInterval(async () => {
  try {
    await rankingUpdate(db);
  } catch (err) {
    console.error('[ranking-update] Error:', err);
  }
}, 30 * 60_000);
console.log('[worker] Ranking update cron started (30min)');

setInterval(async () => {
  try {
    await eventCleanup(db);
  } catch (err) {
    console.error('[event-cleanup] Error:', err);
  }
}, 24 * 60 * 60_000);
console.log('[worker] Event cleanup cron started (24h)');

setInterval(async () => {
  try {
    const usersWithCenter = await db.execute(sql`
      SELECT DISTINCT p.user_id
      FROM planet_buildings pb
      JOIN planets p ON p.id = pb.planet_id
      WHERE pb.building_id = 'missionCenter' AND pb.level >= 1
      LIMIT 100
    `);

    for (const row of usersWithCenter) {
      await pveService.refreshPool(row.user_id as string);
    }

    await asteroidBeltService.regenerateDepletedDeposits();
  } catch (err) {
    console.error('[mission-refresh] Error:', err);
  }
}, 30 * 60_000);
console.log('[worker] Mission refresh cron started (30min)');

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
