import type { FastifyInstance } from 'fastify';
import '@fastify/multipart';
import { jwtVerify } from 'jose';
import { eq, sql } from 'drizzle-orm';
import { users, planetTypes, type Database } from '@exilium/db';
import { processImage, processPlanetImage, processFlagshipImage, processAvatarImage, processBuildingVariant, processLandingImage, processAnomalyImage, isValidCategory } from '../../lib/image-processing.js';
import { getNextPlanetImageIndex, listPlanetImageIndexes } from '../../lib/planet-image.util.js';
import { getNextFlagshipImageIndex, listFlagshipImageIndexes } from '../../lib/flagship-image.util.js';
import { getNextAvatarIndex, listAvatarIndexes } from '../../lib/avatar-image.util.js';
import { toKebab } from '@exilium/shared';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { env } from '../../config/env.js';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

export function registerAssetUploadRoute(server: FastifyInstance, db: Database) {
  server.post('/admin/upload-asset', async (request, reply) => {
    // 1. Auth: verify JWT + admin role
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
      userId = payload.userId as string;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.isAdmin) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    // 2. Parse multipart — field types from @fastify/multipart are Multipart | Multipart[] | undefined
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const category = (data.fields.category as { value: string } | undefined)?.value;
    const entityId = (data.fields.entityId as { value: string } | undefined)?.value;
    const planetType = (data.fields.planetType as { value: string } | undefined)?.value;

    if (!category || !isValidCategory(category)) {
      return reply.status(400).send({ error: 'Invalid category. Must be: buildings, research, ships, defenses, planets, flagships, avatars, landing, anomaly' });
    }
    if (!entityId && category !== 'avatars') {
      return reply.status(400).send({ error: 'entityId is required (hullId for flagships, slot for landing/anomaly)' });
    }
    if (!ALLOWED_MIMES.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Invalid file type. Must be PNG, JPEG, or WebP' });
    }

    // 3. Read buffer + check size
    const buffer = await data.toBuffer();
    if (buffer.length > MAX_FILE_SIZE) {
      return reply.status(413).send({ error: 'File too large (max 10 MB)' });
    }

    // 4. Process image
    try {
      let files: string[];
      if (category === 'avatars') {
        const nextIndex = getNextAvatarIndex(env.ASSETS_DIR);
        files = await processAvatarImage(buffer, nextIndex, env.ASSETS_DIR);
      } else if (category === 'planets') {
        const planetClassId = entityId!;
        const nextIndex = getNextPlanetImageIndex(planetClassId, env.ASSETS_DIR);
        files = await processPlanetImage(buffer, planetClassId, nextIndex, env.ASSETS_DIR);
      } else if (category === 'flagships') {
        const hullId = entityId!;
        const nextIndex = getNextFlagshipImageIndex(hullId, env.ASSETS_DIR);
        files = await processFlagshipImage(buffer, hullId, nextIndex, env.ASSETS_DIR);
      } else if (category === 'landing') {
        // Landing images use a free-form slot key instead of a DB-backed entity.
        // Slot must be safe for filenames (alphanum + dash/underscore).
        if (!/^[a-z0-9_-]+$/i.test(entityId!)) {
          return reply.status(400).send({ error: 'Invalid landing slot' });
        }
        files = await processLandingImage(buffer, entityId!, env.ASSETS_DIR);
      } else if (category === 'anomaly') {
        // Anomaly content images use a free-form slot key (e.g. "depth-1").
        if (!/^[a-z0-9_-]+$/i.test(entityId!)) {
          return reply.status(400).send({ error: 'Invalid anomaly slot' });
        }
        files = await processAnomalyImage(buffer, entityId!, env.ASSETS_DIR);
      } else if (planetType) {
        if (category !== 'buildings' && category !== 'defenses') {
          return reply.status(400).send({ error: 'planetType only supported for buildings|defenses' });
        }
        if (!/^[a-z0-9_-]+$/i.test(planetType)) {
          return reply.status(400).send({ error: 'Invalid planetType' });
        }
        const [pt] = await db
          .select({ id: planetTypes.id })
          .from(planetTypes)
          .where(eq(planetTypes.id, planetType))
          .limit(1);
        if (!pt) {
          return reply.status(400).send({ error: 'Unknown planetType' });
        }

        files = await processBuildingVariant(buffer, category, entityId!, planetType, env.ASSETS_DIR);

        // Atomic jsonb append-if-absent at the SQL level — avoids any
        // driver-side ambiguity around how jsonb columns round-trip.
        const payload = JSON.stringify([planetType]);
        const result = category === 'buildings'
          ? await db.execute(sql`
              UPDATE building_definitions
              SET variant_planet_types = CASE
                WHEN variant_planet_types @> ${payload}::jsonb THEN variant_planet_types
                ELSE COALESCE(variant_planet_types, '[]'::jsonb) || ${payload}::jsonb
              END
              WHERE id = ${entityId!}
              RETURNING variant_planet_types
            `)
          : await db.execute(sql`
              UPDATE defense_definitions
              SET variant_planet_types = CASE
                WHEN variant_planet_types @> ${payload}::jsonb THEN variant_planet_types
                ELSE COALESCE(variant_planet_types, '[]'::jsonb) || ${payload}::jsonb
              END
              WHERE id = ${entityId!}
              RETURNING variant_planet_types
            `);
        const returned = Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows?.[0];
        request.log.info(
          { category, entityId, planetType, returned },
          'variant upload: DB state after jsonb append',
        );
        if (!returned) {
          return reply.status(404).send({ error: 'Entity not found' });
        }
      } else {
        files = await processImage(buffer, category, entityId!, env.ASSETS_DIR);
      }
      return reply.send({ success: true, files });
    } catch (err) {
      request.log.error(err, 'Image processing failed');
      return reply.status(500).send({ error: 'Image processing failed' });
    }
  });

  server.get('/admin/planet-images/:planetClassId', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
      userId = payload.userId as string;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.isAdmin) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { planetClassId } = request.params as { planetClassId: string };
    if (!/^[a-z0-9_-]+$/i.test(planetClassId)) {
      return reply.status(400).send({ error: 'Invalid planetClassId' });
    }
    const indexes = listPlanetImageIndexes(planetClassId, env.ASSETS_DIR);
    const images = indexes.map((index) => ({
      index,
      thumbUrl: `/assets/planets/${planetClassId}/${index}-thumb.webp`,
    }));

    return reply.send({ images });
  });

  server.get('/admin/flagship-images/:hullId', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
      userId = payload.userId as string;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.isAdmin) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { hullId } = request.params as { hullId: string };
    if (!/^[a-z0-9_-]+$/i.test(hullId)) {
      return reply.status(400).send({ error: 'Invalid hullId' });
    }
    const indexes = listFlagshipImageIndexes(hullId, env.ASSETS_DIR);
    const images = indexes.map((index) => ({
      index,
      thumbUrl: `/assets/flagships/${hullId}/${index}-thumb.webp`,
    }));

    return reply.send({ images });
  });

  // --- Avatar management routes ---

  server.get('/admin/avatar-images', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
      userId = payload.userId as string;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.isAdmin) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const indexes = listAvatarIndexes(env.ASSETS_DIR);
    const images = indexes.map((index) => ({
      index,
      thumbUrl: `/assets/avatars/${index}-thumb.webp`,
    }));

    return reply.send({ images });
  });

  server.delete('/admin/avatar-images/:index', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
      userId = payload.userId as string;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.isAdmin) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { index } = request.params as { index: string };
    // Harden against path traversal: accept digits only.
    if (!/^\d+$/.test(index)) {
      return reply.status(400).send({ error: 'Invalid index' });
    }
    const dir = join(env.ASSETS_DIR, 'avatars');
    const heroPath = join(dir, `${index}.webp`);

    if (!existsSync(heroPath)) {
      return reply.status(404).send({ error: 'Avatar not found' });
    }

    try {
      for (const suffix of ['', '-thumb', '-icon']) {
        const fp = join(dir, `${index}${suffix}.webp`);
        if (existsSync(fp)) unlinkSync(fp);
      }
      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err, 'Failed to delete avatar');
      return reply.status(500).send({ error: 'Failed to delete avatar' });
    }
  });

  server.delete('/admin/asset-variant/:category/:entityId/:planetType', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
      userId = payload.userId as string;
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const [user] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.isAdmin) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { category, entityId, planetType } = request.params as {
      category: string;
      entityId: string;
      planetType: string;
    };
    if (category !== 'buildings' && category !== 'defenses') {
      return reply.status(400).send({ error: 'Invalid category' });
    }
    if (!/^[a-z0-9_-]+$/i.test(entityId)) {
      return reply.status(400).send({ error: 'Invalid entityId' });
    }
    if (!/^[a-z0-9_-]+$/i.test(planetType)) {
      return reply.status(400).send({ error: 'Invalid planetType' });
    }

    const slug = toKebab(entityId);
    const dir = join(env.ASSETS_DIR, category, slug);
    const heroPath = join(dir, `${planetType}.webp`);
    if (!existsSync(heroPath)) {
      return reply.status(404).send({ error: 'Variant not found' });
    }

    try {
      for (const suffix of ['', '-thumb', '-icon']) {
        const fp = join(dir, `${planetType}${suffix}.webp`);
        if (existsSync(fp)) unlinkSync(fp);
      }

      // Atomic jsonb element removal; `jsonb - text` drops the matching
      // element from the array (or key from an object). Safe when the value
      // is absent — no-op.
      if (category === 'buildings') {
        await db.execute(sql`
          UPDATE building_definitions
          SET variant_planet_types = COALESCE(variant_planet_types, '[]'::jsonb) - ${planetType}
          WHERE id = ${entityId}
        `);
      } else {
        await db.execute(sql`
          UPDATE defense_definitions
          SET variant_planet_types = COALESCE(variant_planet_types, '[]'::jsonb) - ${planetType}
          WHERE id = ${entityId}
        `);
      }

      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err, 'Failed to delete variant');
      return reply.status(500).send({ error: 'Failed to delete variant' });
    }
  });
}
