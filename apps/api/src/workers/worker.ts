import Redis from 'ioredis';
import { createDb } from '@exilium/db';
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
import { createPushService } from '../modules/push/push.service.js';
import { createExiliumService } from '../modules/exilium/exilium.service.js';
import { createFlagshipService } from '../modules/flagship/flagship.service.js';
import { createTalentService } from '../modules/flagship/talent.service.js';
import { createDailyQuestService } from '../modules/daily-quest/daily-quest.service.js';
import { createGameEventService } from '../modules/game-event/game-event.service.js';
import { buildCompletionQueue, fleetQueue, marketQueue } from '../queues/queues.js';
import { startBuildCompletionWorker } from './build-completion.worker.js';
import { startFleetWorker } from './fleet.worker.js';
import { createMarketService } from '../modules/market/market.service.js';
import { startMarketWorker } from './market.worker.js';
import { createColonizationService } from '../modules/colonization/colonization.service.js';
import { startColonizationWorker } from './colonization.worker.js';
import { createAllianceLogService } from '../modules/alliance/alliance-log.service.js';
import { eventCatchup } from '../cron/event-catchup.js';
import { resourceTick } from '../cron/resource-tick.js';
import { rankingUpdate } from '../cron/ranking-update.js';
import { eventCleanup } from '../cron/event-cleanup.js';
import { allianceLogPurge } from '../cron/alliance-log-purge.js';
import { scheduleCron } from '../lib/cron-lock.js';

// Shared instances
const db = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
const gameConfigService = createGameConfigService(db, redis);
const exiliumService = createExiliumService(db, gameConfigService);
const dailyQuestService = createDailyQuestService(db, exiliumService, gameConfigService, redis);
const resourceService = createResourceService(db, gameConfigService, dailyQuestService);
const pushService = createPushService(db);
const messageService = createMessageService(db, redis, pushService);
const asteroidBeltService = createAsteroidBeltService(db);
const pirateService = createPirateService(db, gameConfigService);
const pveService = createPveService(db, asteroidBeltService, pirateService, gameConfigService);
const reportService = createReportService(db);
const tutorialService = createTutorialService(db, pveService);

// Talent & flagship services
const flagshipService = createFlagshipService(db, exiliumService, gameConfigService);
const talentService = createTalentService(db, exiliumService, gameConfigService);

// Build services (receive the unified build queue)
const buildingService = createBuildingService(db, resourceService, buildCompletionQueue, gameConfigService);
const researchService = createResearchService(db, resourceService, buildCompletionQueue, gameConfigService);
const shipyardService = createShipyardService(db, resourceService, buildCompletionQueue, gameConfigService, talentService, flagshipService);
const gameEventService = createGameEventService(db);

// Colonization service
const colonizationService = createColonizationService(db, gameConfigService);

const allianceLogService = createAllianceLogService(db, redis);

const fleetService = createFleetService(db, resourceService, fleetQueue, messageService, gameConfigService, redis, pveService, asteroidBeltService, pirateService, reportService, exiliumService, dailyQuestService, flagshipService, undefined, gameEventService, colonizationService, allianceLogService);

// Market service
const marketService = createMarketService(db, resourceService, gameConfigService, marketQueue, redis, dailyQuestService, exiliumService);

console.log('[worker] Starting workers...');

startBuildCompletionWorker(db, redis, { buildingService, researchService, shipyardService, tutorialService, pushService, dailyQuestService });
console.log('[worker] Build completion worker started');

startFleetWorker(db, redis, { fleetService, tutorialService, pushService });
console.log('[worker] Fleet worker started');

startMarketWorker(marketService);
console.log('[worker] Market worker started');

startColonizationWorker(db, redis, colonizationService, gameConfigService, fleetQueue);
console.log('[worker] Colonization worker started');

// Crons — wrapped with a Redis lock so at most one worker runs a given tick
// at a time. Safe for horizontal scaling and idempotent by design.
scheduleCron(redis, () => eventCatchup(db), { name: 'event-catchup', intervalMs: 30_000 });
console.log('[worker] Event catchup cron started (30s)');

scheduleCron(redis, () => resourceTick(db, gameConfigService), { name: 'resource-tick', intervalMs: 15 * 60_000 });
console.log('[worker] Resource tick cron started (15min)');

scheduleCron(redis, () => rankingUpdate(db, gameConfigService), { name: 'ranking-update', intervalMs: 30 * 60_000 });
console.log('[worker] Ranking update cron started (30min)');

scheduleCron(redis, () => eventCleanup(db), { name: 'event-cleanup', intervalMs: 24 * 60 * 60_000 });
console.log('[worker] Event cleanup cron started (24h)');

scheduleCron(redis, () => asteroidBeltService.regenerateDepletedDeposits(), {
  name: 'deposit-regen',
  intervalMs: 30 * 60_000,
});
console.log('[worker] Deposit regeneration cron started (30min)');

scheduleCron(
  redis,
  async () => {
    const res = await allianceLogPurge(db);
    if (res.deleted > 0) {
      console.log(`[alliance-log-purge] Deleted ${res.deleted} rows.`);
    }
  },
  { name: 'alliance-log-purge', intervalMs: 60 * 60_000 },
);
console.log('[worker] Alliance log purge cron started (1h)');

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
