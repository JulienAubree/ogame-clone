import { Queue } from 'bullmq';
import { env } from '../config/env.js';

const connection = { url: env.REDIS_URL };

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
};

export const buildCompletionQueue = new Queue('build-completion', { connection, defaultJobOptions });
export const fleetQueue = new Queue('fleet', { connection, defaultJobOptions });
export const marketQueue = new Queue('market', { connection, defaultJobOptions });
