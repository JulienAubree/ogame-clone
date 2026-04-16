import type { FastifyInstance } from 'fastify';
import '@fastify/multipart';
import { jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { users, type Database } from '@exilium/db';
import { processImage, processPlanetImage, processFlagshipImage, processAvatarImage, isValidCategory } from '../../lib/image-processing.js';
import { getNextPlanetImageIndex, listPlanetImageIndexes } from '../../lib/planet-image.util.js';
import { getNextFlagshipImageIndex, listFlagshipImageIndexes } from '../../lib/flagship-image.util.js';
import { readdirSync, unlinkSync, existsSync } from 'fs';
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

    if (!category || !isValidCategory(category)) {
      return reply.status(400).send({ error: 'Invalid category. Must be: buildings, research, ships, defenses, planets, flagships' });
    }
    if (!entityId) {
      return reply.status(400).send({ error: 'entityId is required (hullId for flagships)' });
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
        files = await processAvatarImage(buffer, entityId!, env.ASSETS_DIR);
      } else if (category === 'planets') {
        const planetClassId = entityId!;
        const nextIndex = getNextPlanetImageIndex(planetClassId, env.ASSETS_DIR);
        files = await processPlanetImage(buffer, planetClassId, nextIndex, env.ASSETS_DIR);
      } else if (category === 'flagships') {
        const hullId = entityId!;
        const nextIndex = getNextFlagshipImageIndex(hullId, env.ASSETS_DIR);
        files = await processFlagshipImage(buffer, hullId, nextIndex, env.ASSETS_DIR);
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
    const indexes = listFlagshipImageIndexes(hullId, env.ASSETS_DIR);
    const images = indexes.map((index) => ({
      index,
      thumbUrl: `/assets/flagships/${hullId}/${index}-thumb.webp`,
    }));

    return reply.send({ images });
  });

  // --- Avatar management routes ---

  server.get('/admin/avatars', async (request, reply) => {
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

    const dir = join(env.ASSETS_DIR, 'avatars');
    try {
      const avatars = readdirSync(dir)
        .filter(f => f.endsWith('.webp'))
        .map(f => f.replace('.webp', ''))
        .sort();
      return reply.send({ avatars });
    } catch {
      return reply.send({ avatars: [] });
    }
  });

  server.delete('/admin/avatars/:avatarId', async (request, reply) => {
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

    const { avatarId } = request.params as { avatarId: string };
    const filePath = join(env.ASSETS_DIR, 'avatars', `${avatarId}.webp`);

    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Avatar not found' });
    }

    try {
      unlinkSync(filePath);
      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err, 'Failed to delete avatar');
      return reply.status(500).send({ error: 'Failed to delete avatar' });
    }
  });
}
