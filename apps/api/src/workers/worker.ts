import Redis from 'ioredis';
import { createDb } from '@ogame-clone/db';
import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createBuildingService } from '../modules/building/building.service.js';
import { createResearchService } from '../modules/research/research.service.js';
import { createShipyardService } from '../modules/shipyard/shipyard.service.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { createGameConfigService } from '../modules/admin/game-config.service.js';
import { createTutorialService } from '../modules/tutorial/tutorial.service.js';
import { createMessageService } from '../modules/message/message.service.js';
import { createAsteroidBeltService } from '../modules/pve/asteroid-belt.service.js';
import { createPirateService } from '../modules/pve/pirate.service.js';
import { createPveService } from '../modules/pve/pve.service.js';
import { createReportService } from '../modules/report/report.service.js';
import { buildCompletionQueue, fleetQueue } from '../queues/queues.js';
import { UNIVERSE_CONFIG } from '../modules/universe/universe.config.js';
import { startBuildCompletionWorker } from './build-completion.worker.js';
import { startFleetWorker } from './fleet.worker.js';
import { eventCatchup } from '../cron/event-catchup.js';
import { resourceTick } from '../cron/resource-tick.js';
import { rankingUpdate } from '../cron/ranking-update.js';
import { eventCleanup } from '../cron/event-cleanup.js';

// Shared instances
const db = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
const gameConfigService = createGameConfigService(db);
const resourceService = createResourceService(db);
const messageService = createMessageService(db, redis);
const asteroidBeltService = createAsteroidBeltService(db);
const pirateService = createPirateService(db, gameConfigService);
const pveService = createPveService(db, asteroidBeltService, pirateService);
const reportService = createReportService(db);
const tutorialService = createTutorialService(db, pveService);

// Build services (receive the unified build queue)
const buildingService = createBuildingService(db, resourceService, buildCompletionQueue, gameConfigService);
const researchService = createResearchService(db, resourceService, buildCompletionQueue, gameConfigService);
const shipyardService = createShipyardService(db, resourceService, buildCompletionQueue, gameConfigService);

// Fleet service (receives the unified fleet queue)
const fleetService = createFleetService(db, resourceService, fleetQueue, UNIVERSE_CONFIG.speed, messageService, gameConfigService, pveService, asteroidBeltService, pirateService, reportService);

console.log('[worker] Starting workers...');

startBuildCompletionWorker(db, redis, { buildingService, researchService, shipyardService, tutorialService });
console.log('[worker] Build completion worker started');

startFleetWorker(db, redis, { fleetService, tutorialService });
console.log('[worker] Fleet worker started');

// Crons (unchanged)
setInterval(async () => {
  try { await eventCatchup(db); } catch (err) { console.error('[event-catchup] Error:', err); }
}, 30_000);
console.log('[worker] Event catchup cron started (30s)');

setInterval(async () => {
  try { await resourceTick(db); } catch (err) { console.error('[resource-tick] Error:', err); }
}, 15 * 60_000);
console.log('[worker] Resource tick cron started (15min)');

setInterval(async () => {
  try { await rankingUpdate(db); } catch (err) { console.error('[ranking-update] Error:', err); }
}, 30 * 60_000);
console.log('[worker] Ranking update cron started (30min)');

setInterval(async () => {
  try { await eventCleanup(db); } catch (err) { console.error('[event-cleanup] Error:', err); }
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
  } catch (err) { console.error('[mission-refresh] Error:', err); }
}, 30 * 60_000);
console.log('[worker] Mission refresh cron started (30min)');

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
