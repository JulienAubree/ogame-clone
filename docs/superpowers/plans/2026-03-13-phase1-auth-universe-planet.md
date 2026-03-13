# Phase 1 : Auth + Univers + Planète — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can register, login, and get a home planet with correct OGame properties (diameter, temperature, fields). Protected routes reject unauthenticated requests.

**Architecture:** Auth module (Argon2 hashing, JWT access 15min + refresh token 7j in DB). Universe config as constants. Planet creation on registration with random coordinates, diameter based on position, temperature formula from spec. tRPC `protectedProcedure` middleware extracts userId from JWT. Frontend has Login/Register pages and an Overview page showing planet info.

**Tech Stack:** Fastify, tRPC, Drizzle ORM, Argon2, jose (JWT), Zod, React, React Router, TailwindCSS

**Constraints:** No Docker available on dev machine — DB connection code must handle missing DB gracefully (env validation allows defaults). Tests are unit tests only (no DB required) for game-engine formulas; API module tests will be added when DB is available.

---

## File Structure

```
packages/game-engine/src/
  formulas/planet.ts              — CREATE: diameter, temperature, maxFields formulas
  formulas/planet.test.ts         — CREATE: tests for planet formulas

packages/db/src/
  schema/user-research.ts         — CREATE: user_research table schema
  schema/index.ts                 — MODIFY: add user_research export
  connection.ts                   — CREATE: Drizzle DB connection factory

apps/api/src/
  trpc/context.ts                 — MODIFY: extract userId from JWT in request headers
  trpc/router.ts                  — MODIFY: merge auth + planet routers, add protectedProcedure
  config/env.ts                   — MODIFY: add JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN
  modules/auth/auth.router.ts     — CREATE: register, login, refresh, logout procedures
  modules/auth/auth.service.ts    — CREATE: business logic (hash, verify, tokens)
  modules/universe/universe.config.ts — CREATE: universe constants (speed, galaxies, systems, positions)
  modules/planet/planet.router.ts — CREATE: tRPC router (list, get)
  modules/planet/planet.service.ts — CREATE: createHomePlanet, listPlanets, getPlanet

apps/web/src/
  stores/auth.store.ts            — CREATE: Zustand store for auth state (token, user)
  hooks/useAuth.ts                — CREATE: login/register/logout hooks
  pages/Login.tsx                 — CREATE: login form page
  pages/Register.tsx              — CREATE: registration form page
  pages/Overview.tsx              — MODIFY: show planet info when authenticated
  router.tsx                      — MODIFY: add login/register routes, auth guard
  trpc.ts                         — MODIFY: attach JWT to requests
  App.tsx                         — MODIFY: check auth on mount
```

---

## Chunk 1: Game Engine — Planet Formulas

### Task 1: Planet formulas + tests

**Files:**
- Create: `packages/game-engine/src/formulas/planet.ts`
- Create: `packages/game-engine/src/formulas/planet.test.ts`
- Modify: `packages/game-engine/src/index.ts`

- [ ] **Step 1: Write planet.test.ts**

```typescript
// packages/game-engine/src/formulas/planet.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateMaxTemp,
  calculateMinTemp,
  calculateDiameter,
  calculateMaxFields,
} from './planet.js';

describe('calculateMaxTemp', () => {
  it('position 1 (closest to sun) has high temp around 220-260', () => {
    // max_temp = 40 + (8 - 1) * 30 + random(-20, 20) = 250 ± 20
    // Without randomSeed, test range
    const temp = calculateMaxTemp(1, 0); // randomOffset = 0
    expect(temp).toBe(250);
  });
  it('position 8 (middle) has temp around 40', () => {
    const temp = calculateMaxTemp(8, 0);
    expect(temp).toBe(40);
  });
  it('position 15 (farthest) has low temp around -170', () => {
    // 40 + (8 - 15) * 30 + 0 = 40 - 210 = -170
    const temp = calculateMaxTemp(15, 0);
    expect(temp).toBe(-170);
  });
  it('applies random offset', () => {
    const temp = calculateMaxTemp(8, 15);
    expect(temp).toBe(55);
  });
});

describe('calculateMinTemp', () => {
  it('is maxTemp - 40', () => {
    expect(calculateMinTemp(250)).toBe(210);
    expect(calculateMinTemp(-170)).toBe(-210);
  });
});

describe('calculateDiameter', () => {
  it('returns a value based on position with randomFactor', () => {
    // Position 8 (middle) has largest base range
    const d = calculateDiameter(8, 0.5);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(20000);
  });
  it('position 1 has smaller diameter range', () => {
    const d1 = calculateDiameter(1, 0.5);
    const d8 = calculateDiameter(8, 0.5);
    expect(d1).toBeLessThan(d8);
  });
});

describe('calculateMaxFields', () => {
  it('diameter 12800 gives 163 fields', () => {
    // floor((12800/1000)^2) = floor(163.84) = 163
    expect(calculateMaxFields(12800)).toBe(163);
  });
  it('diameter 5000 gives 25 fields', () => {
    expect(calculateMaxFields(5000)).toBe(25);
  });
  it('diameter 15000 gives 225 fields', () => {
    expect(calculateMaxFields(15000)).toBe(225);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/game-engine && npx vitest run src/formulas/planet.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write planet.ts**

```typescript
// packages/game-engine/src/formulas/planet.ts

/**
 * OGame planet temperature formula.
 * max_temp = 40 + (8 - position) * 30 + randomOffset
 * randomOffset should be in range [-20, 20]
 */
export function calculateMaxTemp(position: number, randomOffset: number = 0): number {
  return 40 + (8 - position) * 30 + randomOffset;
}

/**
 * Min temperature is always maxTemp - 40.
 */
export function calculateMinTemp(maxTemp: number): number {
  return maxTemp - 40;
}

/**
 * Planet diameter based on position.
 * Middle positions (4-8) get larger planets.
 * randomFactor: 0-1, used to vary within the range.
 *
 * OGame-like diameter ranges by position:
 * - Pos 1-3:  5800 - 9800
 * - Pos 4-6:  9000 - 14400
 * - Pos 7-9:  10000 - 15600
 * - Pos 10-12: 7500 - 12200
 * - Pos 13-15: 5000 - 9400
 */
export function calculateDiameter(position: number, randomFactor: number): number {
  const ranges: Record<number, [number, number]> = {
    1: [5800, 9800], 2: [5800, 9800], 3: [5800, 9800],
    4: [9000, 14400], 5: [9000, 14400], 6: [9000, 14400],
    7: [10000, 15600], 8: [10000, 15600], 9: [10000, 15600],
    10: [7500, 12200], 11: [7500, 12200], 12: [7500, 12200],
    13: [5000, 9400], 14: [5000, 9400], 15: [5000, 9400],
  };
  const [min, max] = ranges[position] ?? [5000, 9400];
  return Math.floor(min + (max - min) * randomFactor);
}

/**
 * Max fields (building slots) from diameter.
 * max_fields = floor((diameter / 1000)^2)
 */
export function calculateMaxFields(diameter: number): number {
  return Math.floor(Math.pow(diameter / 1000, 2));
}
```

- [ ] **Step 4: Export from index.ts**

Add to `packages/game-engine/src/index.ts`:
```typescript
export * from './formulas/planet.js';
```

- [ ] **Step 5: Run tests**

Run: `cd packages/game-engine && npx vitest run`
Expected: All tests pass (planet + production)

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/
git commit -m "feat(game-engine): add planet formulas (diameter, temperature, maxFields)"
```

---

## Chunk 2: DB Schema + Connection

### Task 2: user_research schema + DB connection

**Files:**
- Create: `packages/db/src/schema/user-research.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/connection.ts`

- [ ] **Step 1: Create user_research schema**

```typescript
// packages/db/src/schema/user-research.ts
import { pgTable, uuid, smallint } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const userResearch = pgTable('user_research', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  espionageTech: smallint('espionage_tech').notNull().default(0),
  computerTech: smallint('computer_tech').notNull().default(0),
  energyTech: smallint('energy_tech').notNull().default(0),
  combustion: smallint('combustion').notNull().default(0),
  impulse: smallint('impulse').notNull().default(0),
  hyperspaceDrive: smallint('hyperspace_drive').notNull().default(0),
  weapons: smallint('weapons').notNull().default(0),
  shielding: smallint('shielding').notNull().default(0),
  armor: smallint('armor').notNull().default(0),
});
```

- [ ] **Step 2: Update schema/index.ts**

```typescript
// packages/db/src/schema/index.ts
export * from './users.js';
export * from './planets.js';
export * from './user-research.js';
```

- [ ] **Step 3: Create connection.ts**

```typescript
// packages/db/src/connection.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

- [ ] **Step 4: Update packages/db/src/index.ts**

```typescript
export * from './schema/index.js';
export { createDb, type Database } from './connection.js';
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/db && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add user_research schema + DB connection factory"
```

---

## Chunk 3: Auth Module (Backend)

### Task 3: Universe config

**Files:**
- Create: `apps/api/src/modules/universe/universe.config.ts`

- [ ] **Step 1: Create universe config**

```typescript
// apps/api/src/modules/universe/universe.config.ts
export const UNIVERSE_CONFIG = {
  name: 'Universe 1',
  speed: 1,
  galaxies: 9,
  systems: 499,
  positions: 15,
  maxPlanetsPerPlayer: 9,
  debrisRatio: 0.3,
  lootRatio: 0.5,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/universe/
git commit -m "feat(api): add universe config constants"
```

### Task 4: Auth service

**Files:**
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/package.json` (add argon2, jose deps)

- [ ] **Step 1: Add dependencies**

Add to `apps/api/package.json` dependencies:
```json
"argon2": "^0.41.1",
"jose": "^6.0.8"
```

Run: `pnpm install`

- [ ] **Step 2: Update env.ts**

```typescript
// apps/api/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://ogame:ogame@localhost:5432/ogame'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8).default('change-me-in-production'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  API_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
```

Note: remove `.url()` from DATABASE_URL — `postgresql://...` doesn't always pass URL validation with z.string().url().

- [ ] **Step 3: Write auth.service.ts**

```typescript
// apps/api/src/modules/auth/auth.service.ts
import { eq } from 'drizzle-orm';
import { hash, verify } from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'crypto';
import { TRPCError } from '@trpc/server';
import { users, refreshTokens } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { env } from '../../config/env.js';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry: ${expiry}`);
  const [, num, unit] = match;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(num) * multipliers[unit];
}

export function createAuthService(db: Database) {
  return {
    async register(email: string, username: string, password: string) {
      const passwordHash = await hash(password);

      const [user] = await db
        .insert(users)
        .values({ email, username, passwordHash })
        .returning({ id: users.id, email: users.email, username: users.username });

      if (!user) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return user;
    },

    async login(email: string, password: string) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });

      const valid = await verify(user.passwordHash, password);
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });

      const accessToken = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(env.JWT_EXPIRES_IN)
        .sign(JWT_SECRET);

      const rawRefresh = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + parseExpiry(env.REFRESH_TOKEN_EXPIRES_IN) * 1000);

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(rawRefresh),
        expiresAt,
      });

      return {
        accessToken,
        refreshToken: rawRefresh,
        user: { id: user.id, email: user.email, username: user.username },
      };
    },

    async refresh(rawRefreshToken: string) {
      const tokenHash = hashToken(rawRefreshToken);

      const [stored] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);

      if (!stored || stored.expiresAt < new Date()) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });
      }

      // Delete used token (rotation)
      await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

      // Issue new pair
      const accessToken = await new SignJWT({ userId: stored.userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(env.JWT_EXPIRES_IN)
        .sign(JWT_SECRET);

      const newRawRefresh = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + parseExpiry(env.REFRESH_TOKEN_EXPIRES_IN) * 1000);

      await db.insert(refreshTokens).values({
        userId: stored.userId,
        tokenHash: hashToken(newRawRefresh),
        expiresAt,
      });

      return { accessToken, refreshToken: newRawRefresh };
    },

    async logout(rawRefreshToken: string) {
      const tokenHash = hashToken(rawRefreshToken);
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    },

    async verifyAccessToken(token: string): Promise<{ userId: string }> {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return { userId: payload.userId as string };
      } catch {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' });
      }
    },
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/ apps/api/src/config/env.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add auth service (register, login, refresh, logout, JWT)"
```

### Task 5: Planet service

**Files:**
- Create: `apps/api/src/modules/planet/planet.service.ts`

- [ ] **Step 1: Write planet.service.ts**

```typescript
// apps/api/src/modules/planet/planet.service.ts
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  calculateMaxTemp,
  calculateMinTemp,
  calculateDiameter,
  calculateMaxFields,
} from '@ogame-clone/game-engine';
import { UNIVERSE_CONFIG } from '../universe/universe.config.js';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createPlanetService(db: Database) {
  return {
    async createHomePlanet(userId: string) {
      // Find a random free coordinate
      const galaxy = randomInt(1, UNIVERSE_CONFIG.galaxies);
      const system = randomInt(1, UNIVERSE_CONFIG.systems);
      const position = randomInt(4, 12); // home planets in middle range

      const randomOffset = randomInt(-20, 20);
      const maxTemp = calculateMaxTemp(position, randomOffset);
      const minTemp = calculateMinTemp(maxTemp);
      const diameter = calculateDiameter(position, Math.random());
      const maxFields = calculateMaxFields(diameter);

      const [planet] = await db
        .insert(planets)
        .values({
          userId,
          name: 'Homeworld',
          galaxy,
          system,
          position,
          planetType: 'planet',
          diameter,
          maxFields,
          minTemp,
          maxTemp,
        })
        .returning();

      return planet;
    },

    async listPlanets(userId: string) {
      return db
        .select()
        .from(planets)
        .where(eq(planets.userId, userId));
    },

    async getPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);

      if (!planet || planet.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return planet;
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/planet/
git commit -m "feat(api): add planet service (createHomePlanet, list, get)"
```

### Task 6: tRPC context, protectedProcedure, routers

**Files:**
- Modify: `apps/api/src/trpc/context.ts`
- Modify: `apps/api/src/trpc/router.ts`
- Create: `apps/api/src/modules/auth/auth.router.ts`
- Create: `apps/api/src/modules/planet/planet.router.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update context.ts to extract JWT from request**

```typescript
// apps/api/src/trpc/context.ts
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

export interface Context {
  userId: string | null;
  req: CreateFastifyContextOptions['req'];
  res: CreateFastifyContextOptions['res'];
}

export function createContext({ req, res }: CreateFastifyContextOptions): Context {
  return {
    userId: null, // set by protectedProcedure middleware
    req,
    res,
  };
}
```

- [ ] **Step 2: Update router.ts with protectedProcedure + merged routers**

```typescript
// apps/api/src/trpc/router.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { jwtVerify } from 'jose';
import type { Context } from './context.js';
import { env } from '../config/env.js';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const authHeader = ctx.req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  try {
    const token = authHeader.slice(7);
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return next({
      ctx: { ...ctx, userId: payload.userId as string },
    });
  } catch {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
});

// Routers are merged in index.ts after services are created
export const createAppRouter = (authRouter: ReturnType<typeof router>, planetRouter: ReturnType<typeof router>) =>
  router({
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),
    auth: authRouter,
    planet: planetRouter,
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
```

- [ ] **Step 3: Create auth.router.ts**

```typescript
// apps/api/src/modules/auth/auth.router.ts
import { z } from 'zod';
import { publicProcedure, router } from '../../trpc/router.js';
import type { createAuthService } from './auth.service.js';
import type { createPlanetService } from '../planet/planet.service.js';
import type { createUserResearchService } from './user-research.init.js';

export function createAuthRouter(
  authService: ReturnType<typeof createAuthService>,
  planetService: ReturnType<typeof createPlanetService>,
) {
  return router({
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          username: z.string().min(3).max(32),
          password: z.string().min(8).max(128),
        }),
      )
      .mutation(async ({ input }) => {
        const user = await authService.register(input.email, input.username, input.password);
        await planetService.createHomePlanet(user.id);
        const tokens = await authService.login(input.email, input.password);
        return tokens;
      }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        return authService.login(input.email, input.password);
      }),

    refresh: publicProcedure
      .input(z.object({ refreshToken: z.string() }))
      .mutation(async ({ input }) => {
        return authService.refresh(input.refreshToken);
      }),

    logout: publicProcedure
      .input(z.object({ refreshToken: z.string() }))
      .mutation(async ({ input }) => {
        await authService.logout(input.refreshToken);
        return { ok: true };
      }),
  });
}
```

- [ ] **Step 4: Create planet.router.ts**

```typescript
// apps/api/src/modules/planet/planet.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createPlanetService } from './planet.service.js';

export function createPlanetRouter(planetService: ReturnType<typeof createPlanetService>) {
  return router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return planetService.listPlanets(ctx.userId!);
    }),

    get: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return planetService.getPlanet(ctx.userId!, input.planetId);
      }),
  });
}
```

- [ ] **Step 5: Update index.ts to wire everything**

```typescript
// apps/api/src/index.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { createDb } from '@ogame-clone/db';
import { createAppRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createAuthRouter } from './modules/auth/auth.router.js';
import { createPlanetService } from './modules/planet/planet.service.js';
import { createPlanetRouter } from './modules/planet/planet.router.js';
import { env } from './config/env.js';

const server = Fastify({ logger: true });

await server.register(cors, { origin: true });

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// DB + Services
const db = createDb(env.DATABASE_URL);
const authService = createAuthService(db);
const planetService = createPlanetService(db);

// Routers
const authRouter = createAuthRouter(authService, planetService);
const planetRouter = createPlanetRouter(planetService);
const appRouter = createAppRouter(authRouter, planetRouter);

await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

try {
  await server.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${env.API_PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

export { appRouter };
export type { AppRouter } from './trpc/router.js';
```

- [ ] **Step 6: Update API package.json exports**

The API exports need updating since AppRouter is now created via a factory function:
```json
"exports": {
  "./trpc": {
    "import": "./src/trpc/router.ts",
    "types": "./src/trpc/router.ts"
  }
}
```
(No change needed — the type is still exported from router.ts)

- [ ] **Step 7: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add apps/api/
git commit -m "feat(api): wire auth + planet routers with protectedProcedure"
```

---

## Chunk 4: Frontend Auth + Overview

### Task 7: Auth store + hooks + tRPC auth header

**Files:**
- Create: `apps/web/src/stores/auth.store.ts`
- Create: `apps/web/src/hooks/useAuth.ts`
- Modify: `apps/web/src/trpc.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/package.json` (add zustand)

- [ ] **Step 1: Add zustand dependency**

Add to `apps/web/package.json` dependencies:
```json
"zustand": "^5.0.3"
```

Run: `pnpm install`

- [ ] **Step 2: Create auth.store.ts**

```typescript
// apps/web/src/stores/auth.store.ts
import { create } from 'zustand';

interface AuthUser {
  id: string;
  email: string;
  username: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  user: JSON.parse(localStorage.getItem('user') ?? 'null'),

  setAuth: (accessToken, refreshToken, user) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    set({ accessToken, refreshToken, user });
  },

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ accessToken, refreshToken });
  },

  clearAuth: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
```

- [ ] **Step 3: Update trpc.ts to attach JWT**

```typescript
// apps/web/src/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@ogame-clone/api/trpc';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        headers: () => {
          const token = localStorage.getItem('accessToken');
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
```

- [ ] **Step 4: Update App.tsx**

```typescript
// apps/web/src/App.tsx
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTRPCClient } from './trpc';
import { router } from './router';

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/ apps/web/src/trpc.ts apps/web/src/App.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add auth store + JWT-attached tRPC client"
```

### Task 8: Login + Register pages

**Files:**
- Create: `apps/web/src/pages/Login.tsx`
- Create: `apps/web/src/pages/Register.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Create Login.tsx**

```tsx
// apps/web/src/pages/Login.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setAuth(data.accessToken, data.refreshToken, data.user);
      navigate('/');
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">OGame Clone</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Connexion...' : 'Se connecter'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Pas de compte ?{' '}
              <Link to="/register" className="text-primary hover:underline">
                S'inscrire
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create Register.tsx**

```tsx
// apps/web/src/pages/Register.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';

export default function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      setAuth(data.accessToken, data.refreshToken, data.user);
      navigate('/');
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    registerMutation.mutate({ email, username, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl">Créer un compte</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              placeholder="Nom de commandant"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Mot de passe (8 caractères min.)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? 'Création...' : "S'inscrire"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Se connecter
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Update router.tsx with auth routes + guard**

```tsx
// apps/web/src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/layout/Layout';
import { useAuthStore } from './stores/auth.store';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('./pages/Login').then((m) => ({ Component: m.default })),
  },
  {
    path: '/register',
    lazy: () => import('./pages/Register').then((m) => ({ Component: m.default })),
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        lazy: () => import('./pages/Overview').then((m) => ({ Component: m.default })),
      },
    ],
  },
]);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/ apps/web/src/router.tsx
git commit -m "feat(web): add Login + Register pages with auth guard"
```

### Task 9: Overview page with planet info

**Files:**
- Modify: `apps/web/src/pages/Overview.tsx`

- [ ] **Step 1: Update Overview.tsx**

```tsx
// apps/web/src/pages/Overview.tsx
import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Overview() {
  const { data: planets, isLoading } = trpc.planet.list.useQuery();

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const planet = planets?.[0];
  if (!planet) {
    return <div className="p-6 text-muted-foreground">Aucune planète trouvée.</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Vue d'ensemble</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{planet.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coordonnées</span>
              <span>[{planet.galaxy}:{planet.system}:{planet.position}]</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Diamètre</span>
              <span>{planet.diameter.toLocaleString('fr-FR')} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Champs</span>
              <span>0 / {planet.maxFields}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Température</span>
              <span>{planet.minTemp}°C à {planet.maxTemp}°C</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ressources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-metal">Métal</span>
              <span>{Number(planet.metal).toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-crystal">Cristal</span>
              <span>{Number(planet.crystal).toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-deuterium">Deutérium</span>
              <span>{Number(planet.deuterium).toLocaleString('fr-FR')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bâtiments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mine de métal</span>
              <Badge variant="secondary">Niv. {planet.metalMineLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mine de cristal</span>
              <Badge variant="secondary">Niv. {planet.crystalMineLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Synthétiseur de deut.</span>
              <Badge variant="secondary">Niv. {planet.deutSynthLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Centrale solaire</span>
              <Badge variant="secondary">Niv. {planet.solarPlantLevel}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`

- [ ] **Step 3: Run all tests**

Run: `pnpm turbo test`
Expected: All pass (game-engine tests including new planet tests)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Overview.tsx
git commit -m "feat(web): Overview page shows planet info + resources + buildings"
```

---

## Verification

After all tasks:

1. `pnpm turbo typecheck` — 0 errors
2. `pnpm turbo test` — all pass (production + planet formula tests)
3. `pnpm turbo lint` — 0 errors
4. With DB running: register → auto-login → Overview shows planet with coords, diameter, temp, resources
5. Without auth token: redirected to /login
6. Login page → Register link → Register page → Login link (navigation works)
