import { Queue } from 'bullmq';
import { env } from '../config/env.js';

const connection = { url: env.REDIS_URL };

export const buildingCompletionQueue = new Queue('building-completion', { connection });
export const researchCompletionQueue = new Queue('research-completion', { connection });
export const shipyardCompletionQueue = new Queue('shipyard-completion', { connection });
