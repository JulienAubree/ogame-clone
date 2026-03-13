import { createDb } from '@ogame-clone/db';
import { env } from '../config/env.js';
import { startBuildingCompletionWorker } from './building-completion.worker.js';
import { startResearchCompletionWorker } from './research-completion.worker.js';
import { startShipyardCompletionWorker } from './shipyard-completion.worker.js';
import { startFleetArrivalWorker } from './fleet-arrival.worker.js';
import { startFleetReturnWorker } from './fleet-return.worker.js';
import { eventCatchup } from '../cron/event-catchup.js';
import { resourceTick } from '../cron/resource-tick.js';

const db = createDb(env.DATABASE_URL);

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

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
