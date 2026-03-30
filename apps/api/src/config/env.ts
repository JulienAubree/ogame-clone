import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://exilium:exilium@localhost:5432/exilium'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('2h'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  API_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ASSETS_DIR: z.string().default(path.resolve(__dirname, '../../../../apps/web/public/assets')),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@exilium.app'),
});

export const env = envSchema.parse(process.env);
