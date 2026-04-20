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
  // Resend / transactional email. When RESEND_API_KEY is empty, emails are logged to stdout instead.
  RESEND_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().default('onboarding@resend.dev'),
  MAIL_FROM_NAME: z.string().default('Exilium'),
  // Public URL of the web app, used to build links in emails (e.g. reset password).
  WEB_APP_URL: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);

// Fail fast when production uses a dev fallback for WEB_APP_URL. This powers
// CORS, email links, and verification flows; a localhost default in prod is
// almost certainly a missing .env entry.
if (env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(env.WEB_APP_URL)) {
  throw new Error(
    `WEB_APP_URL must be set to a public URL in production (got "${env.WEB_APP_URL}").`,
  );
}
