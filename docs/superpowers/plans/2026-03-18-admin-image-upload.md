# Admin Image Upload — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to upload PNG/JPG images from the admin panel, automatically convert them to 3 WebP sizes, and store them in the correct asset folder.

**Architecture:** REST multipart endpoint on the API (not tRPC — binary uploads are better as native Fastify multipart). Sharp for server-side conversion. `AdminImageUpload` component integrated into the 4 admin entity tables. Separate uploads directory in prod, `apps/web/public/assets/` in dev.

**Tech Stack:** Fastify + `@fastify/multipart`, sharp, React (admin app), Zustand (auth token)

**Spec:** `docs/superpowers/specs/2026-03-18-admin-image-upload-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/config/env.ts` | Modify | Add `ASSETS_DIR` optional env var |
| `apps/api/src/lib/image-processing.ts` | Create | Sharp conversion: buffer → 3 WebP files |
| `apps/api/src/modules/admin/asset-upload.route.ts` | Create | REST POST `/admin/upload-asset` with auth + validation |
| `apps/api/src/index.ts` | Modify | Register `@fastify/multipart` + upload route |
| `apps/api/package.json` | Modify | Add `sharp` + `@fastify/multipart` deps |
| `apps/admin/src/components/ui/AdminImageUpload.tsx` | Create | Upload component with preview/placeholder |
| `apps/admin/src/pages/Buildings.tsx` | Modify | Add Image column |
| `apps/admin/src/pages/Research.tsx` | Modify | Add Image column |
| `apps/admin/src/pages/Ships.tsx` | Modify | Add Image column |
| `apps/admin/src/pages/Defenses.tsx` | Modify | Add Image column |
| `apps/admin/vite.config.ts` | Modify | Add `/admin` proxy |
| `Caddyfile` | Modify | Add `/assets/*` route + `/admin/*` proxy on admin subdomain |
| `scripts/deploy.sh` | Modify | Create uploads dirs + migration |

---

## Chunk 1: Backend — Dependencies, Env, Image Processing

### Task 1: Install dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add sharp and @fastify/multipart to API**

```bash
cd /Users/julienaubree/_projet/ogame-clone
pnpm --filter @ogame-clone/api add sharp @fastify/multipart
pnpm --filter @ogame-clone/api add -D @types/busboy
```

- [ ] **Step 2: Verify installation**

```bash
pnpm --filter @ogame-clone/api exec -- node -e "import('sharp').then(s => console.log('sharp OK', s.default.versions))"
```

Expected: prints sharp version info without error.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore: add sharp and @fastify/multipart to API deps"
```

---

### Task 2: Add ASSETS_DIR to env config

**Files:**
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 1: Add ASSETS_DIR to Zod schema**

In `apps/api/src/config/env.ts`, add `ASSETS_DIR` as an optional string with a computed default. The API is ESM (`"type": "module"`), so `__dirname` must be reconstructed.

```ts
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://ogame:ogame@localhost:5432/ogame'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8).default('change-me-in-production'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  API_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ASSETS_DIR: z.string().default(path.resolve(__dirname, '../../../../apps/web/public/assets')),
});

export const env = envSchema.parse(process.env);
```

Note: Default resolves from `apps/api/src/config/` → `apps/web/public/assets` (4 levels up).

- [ ] **Step 2: Verify the API still starts**

```bash
cd /Users/julienaubree/_projet/ogame-clone
pnpm --filter @ogame-clone/api dev
```

Check logs for no errors. Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "feat: add ASSETS_DIR env var with dev default"
```

---

### Task 3: Create image processing utility

**Files:**
- Create: `apps/api/src/lib/image-processing.ts`

- [ ] **Step 1: Create the image processing module**

Create `apps/api/src/lib/image-processing.ts`:

```ts
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses';

const VALID_CATEGORIES: AssetCategory[] = ['buildings', 'research', 'ships', 'defenses'];

// Must match toKebab in apps/web/src/lib/assets.ts
function toKebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

const SIZES = [
  { suffix: '', width: 1200, quality: 85, label: 'hero' },
  { suffix: '-thumb', width: 400, quality: 80, label: 'thumb' },
  { suffix: '-icon', width: 64, height: 64, quality: 75, label: 'icon' },
] as const;

export function isValidCategory(value: string): value is AssetCategory {
  return VALID_CATEGORIES.includes(value as AssetCategory);
}

export async function processImage(
  buffer: Buffer,
  category: AssetCategory,
  entityId: string,
  assetsDir: string,
): Promise<string[]> {
  const kebabId = toKebab(entityId);
  const outputDir = path.join(assetsDir, category);
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];

  for (const size of SIZES) {
    const filename = `${kebabId}${size.suffix}.webp`;
    const outPath = path.join(outputDir, filename);

    let pipeline = sharp(buffer);

    if (size.height) {
      pipeline = pipeline.resize({
        width: size.width,
        height: size.height,
        fit: 'cover',
        position: 'centre',
      });
    } else {
      pipeline = pipeline.resize({ width: size.width });
    }

    await pipeline.webp({ quality: size.quality }).toFile(outPath);
    files.push(filename);
  }

  return files;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/julienaubree/_projet/ogame-clone
pnpm --filter @ogame-clone/api typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/image-processing.ts
git commit -m "feat: add image processing utility (sharp → 3 WebP sizes)"
```

---

## Chunk 2: Backend — Upload Route & API Registration

### Task 4: Create the upload route

**Files:**
- Create: `apps/api/src/modules/admin/asset-upload.route.ts`

- [ ] **Step 1: Create the route module**

Create `apps/api/src/modules/admin/asset-upload.route.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { users, type Database } from '@ogame-clone/db';
import { processImage, isValidCategory } from '../../lib/image-processing.js';
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
      return reply.status(401).send({ error: 'Admin access required' });
    }

    // 2. Parse multipart
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const category = (data.fields.category as { value: string } | undefined)?.value;
    const entityId = (data.fields.entityId as { value: string } | undefined)?.value;

    if (!category || !isValidCategory(category)) {
      return reply.status(400).send({ error: 'Invalid category. Must be: buildings, research, ships, defenses' });
    }
    if (!entityId) {
      return reply.status(400).send({ error: 'entityId is required' });
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
      const files = await processImage(buffer, category, entityId, env.ASSETS_DIR);
      return reply.send({ success: true, files });
    } catch (err) {
      request.log.error(err, 'Image processing failed');
      return reply.status(500).send({ error: 'Image processing failed' });
    }
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @ogame-clone/api typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/admin/asset-upload.route.ts
git commit -m "feat: add POST /admin/upload-asset REST route"
```

---

### Task 5: Register multipart plugin + route in index.ts

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Register @fastify/multipart and the upload route**

In `apps/api/src/index.ts`, add two imports and two registrations:

Add imports at top (after existing imports):

```ts
import multipart from '@fastify/multipart';
import { registerAssetUploadRoute } from './modules/admin/asset-upload.route.js';
```

Add after `await server.register(cors, { origin: true });` (line 13):

```ts
await server.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 },
});
```

Add after `registerSSE(server, env.REDIS_URL, JWT_SECRET);` (line 32):

```ts
registerAssetUploadRoute(server, db);
```

The final file should look like:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Redis from 'ioredis';
import { createDb } from '@ogame-clone/db';
import { buildAppRouter } from './trpc/app-router.js';
import { createContext } from './trpc/context.js';
import { env } from './config/env.js';
import { registerSSE } from './modules/notification/notification.sse.js';
import { registerAssetUploadRoute } from './modules/admin/asset-upload.route.js';

const server = Fastify({ logger: true, maxParamLength: 500 });

await server.register(cors, { origin: true });
await server.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 },
});

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const db = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const appRouter = buildAppRouter(db, redis);

await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

registerSSE(server, env.REDIS_URL, JWT_SECRET);
registerAssetUploadRoute(server, db);

try {
  await server.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${env.API_PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 2: Verify API starts and endpoint is reachable**

```bash
pnpm --filter @ogame-clone/api dev
```

In another terminal:

```bash
curl -X POST http://localhost:3000/admin/upload-asset
```

Expected: `{"error":"Unauthorized"}` (401) — proves the route is registered.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: register multipart plugin and upload route"
```

---

## Chunk 3: Frontend — AdminImageUpload Component

### Task 6: Add /admin proxy to admin Vite config

**Files:**
- Modify: `apps/admin/vite.config.ts`

- [ ] **Step 1: Add proxy rule for /admin**

In `apps/admin/vite.config.ts`, add a proxy entry for `/admin` alongside the existing `/trpc` proxy:

```ts
proxy: {
  '/trpc': 'http://localhost:3000',
  '/admin': 'http://localhost:3000',
},
```

- [ ] **Step 2: Verify admin dev server starts**

```bash
pnpm --filter @ogame-clone/admin dev
```

Check logs for no errors. Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/vite.config.ts
git commit -m "feat: add /admin proxy to admin Vite dev server"
```

---

### Task 7: Create AdminImageUpload component

**Files:**
- Create: `apps/admin/src/components/ui/AdminImageUpload.tsx`

- [ ] **Step 1: Create the component**

Create `apps/admin/src/components/ui/AdminImageUpload.tsx`:

```tsx
import { useState, useRef } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { Loader2 } from 'lucide-react';

type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses';

interface AdminImageUploadProps {
  category: AssetCategory;
  entityId: string;
  entityName: string;
}

// Must match toKebab in apps/web/src/lib/assets.ts
function toKebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function AdminImageUpload({ category, entityId, entityName }: AdminImageUploadProps) {
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cacheBust, setCacheBust] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.accessToken);

  const iconUrl = `/assets/${category}/${toKebab(entityId)}-icon.webp${cacheBust ? `?t=${cacheBust}` : ''}`;

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(false);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    formData.append('entityId', entityId);

    try {
      const res = await fetch('/admin/upload-asset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Upload failed');
        return;
      }

      setCacheBust(String(Date.now()));
      setError(false);
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
      // Reset input so same file can be re-uploaded
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const initial = entityName.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative w-10 h-10 rounded border border-panel-border hover:border-hull-400 transition-colors cursor-pointer overflow-hidden flex-shrink-0"
      title={`Upload image for ${entityName}`}
    >
      {uploading && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <Loader2 className="w-4 h-4 text-hull-400 animate-spin" />
        </div>
      )}

      {error ? (
        <div className="w-full h-full flex items-center justify-center bg-panel text-gray-500 text-xs font-mono border border-dashed border-panel-border">
          {initial}
        </div>
      ) : (
        <img
          src={iconUrl}
          alt={entityName}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @ogame-clone/admin typecheck
```

Expected: no errors (or only pre-existing ones unrelated to this file).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/ui/AdminImageUpload.tsx
git commit -m "feat: add AdminImageUpload component"
```

---

## Chunk 4: Frontend — Integrate into Admin Pages

### Task 8: Add Image column to Buildings page

**Files:**
- Modify: `apps/admin/src/pages/Buildings.tsx`

- [ ] **Step 1: Add import**

Add at top of `apps/admin/src/pages/Buildings.tsx` (after existing imports):

```ts
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';
```

- [ ] **Step 2: Add Image header in thead**

In the `<thead>` section (around line 169), add `<th>Image</th>` as the second column, right after the expand chevron column:

Before:
```html
<th className="w-8"></th>
<th>ID</th>
```

After:
```html
<th className="w-8"></th>
<th className="w-12">Image</th>
<th>ID</th>
```

- [ ] **Step 3: Add Image cell in tbody**

In the `<tbody>` row for each building (around line 214, after the chevron `<td>`), add:

Before:
```html
<td className="font-mono text-xs text-gray-500">{b.id}</td>
```

After (insert before the ID cell):
```html
<td className="!px-2">
  <AdminImageUpload category="buildings" entityId={b.id} entityName={b.name} />
</td>
<td className="font-mono text-xs text-gray-500">{b.id}</td>
```

- [ ] **Step 4: Update colspan for expanded rows**

The expanded level rows use `colSpan={11}` (line 262). Update to `colSpan={12}` to account for the new column.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/Buildings.tsx
git commit -m "feat: add Image column to admin Buildings table"
```

---

### Task 9: Add Image column to Research page

**Files:**
- Modify: `apps/admin/src/pages/Research.tsx`

- [ ] **Step 1: Add import**

Add at top:

```ts
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';
```

- [ ] **Step 2: Add Image header in thead**

Add `<th className="w-12">Image</th>` as the first column in the header row, before `<th>ID</th>`.

- [ ] **Step 3: Add Image cell in tbody**

In each `<tr>` for research items, add as the first cell:

```html
<td className="!px-2">
  <AdminImageUpload category="research" entityId={r.id} entityName={r.name} />
</td>
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/pages/Research.tsx
git commit -m "feat: add Image column to admin Research table"
```

---

### Task 10: Add Image column to Ships page

**Files:**
- Modify: `apps/admin/src/pages/Ships.tsx`

- [ ] **Step 1: Add import**

Add at top:

```ts
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';
```

- [ ] **Step 2: Add Image header in thead**

Add `<th className="w-12">Image</th>` as the first column, before `<th>ID</th>`.

- [ ] **Step 3: Add Image cell in tbody**

In each `<tr>` for ships, add as the first cell:

```html
<td className="!px-2">
  <AdminImageUpload category="ships" entityId={s.id} entityName={s.name} />
</td>
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/pages/Ships.tsx
git commit -m "feat: add Image column to admin Ships table"
```

---

### Task 11: Add Image column to Defenses page

**Files:**
- Modify: `apps/admin/src/pages/Defenses.tsx`

- [ ] **Step 1: Add import**

Add at top:

```ts
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';
```

- [ ] **Step 2: Add Image header in thead**

Add `<th className="w-12">Image</th>` as the first column, before `<th>ID</th>`.

- [ ] **Step 3: Add Image cell in tbody**

In each `<tr>` for defenses, add as the first cell:

```html
<td className="!px-2">
  <AdminImageUpload category="defenses" entityId={d.id} entityName={d.name} />
</td>
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/pages/Defenses.tsx
git commit -m "feat: add Image column to admin Defenses table"
```

---

## Chunk 5: Deployment Config

### Task 12: Update Caddyfile

**Files:**
- Modify: `Caddyfile`

- [ ] **Step 1: Add /assets/* route and /admin/* proxy**

Update `Caddyfile` to:

```
exilium-game.com, www.exilium-game.com {
	route /assets/* {
		@uploads file /opt/ogame-clone/uploads{path}
		handle @uploads {
			root * /opt/ogame-clone/uploads
			file_server
		}
		handle {
			root * /opt/ogame-clone/apps/web/dist
			file_server
		}
	}

	handle /trpc/* {
		reverse_proxy localhost:3000
	}

	handle /sse {
		reverse_proxy localhost:3000 {
			flush_interval -1
		}
	}

	handle /health {
		reverse_proxy localhost:3000
	}

	handle {
		root * /opt/ogame-clone/apps/web/dist
		try_files {path} /index.html
		file_server
	}
}

admin.exilium-game.com {
	handle /trpc/* {
		reverse_proxy localhost:3000
	}

	handle /admin/* {
		reverse_proxy localhost:3000
	}

	route /assets/* {
		@uploads file /opt/ogame-clone/uploads{path}
		handle @uploads {
			root * /opt/ogame-clone/uploads
			file_server
		}
		handle {
			root * /opt/ogame-clone/apps/web/dist
			file_server
		}
	}

	handle {
		root * /opt/ogame-clone/apps/admin/dist
		try_files {path} /index.html
		file_server
	}
}
```

Key changes:
- `exilium-game.com`: `route /assets/*` block BEFORE the existing handles, with uploads-first + dist-fallback
- `admin.exilium-game.com`: `handle /admin/*` proxy to API + `route /assets/*` with same uploads→dist fallback

Note: The spec references `/opt/ogame-clone/current/apps/web/dist` but the actual deploy uses `/opt/ogame-clone/apps/web/dist` (no `current` symlink). The plan follows the existing Caddyfile convention.

- [ ] **Step 2: Commit**

```bash
git add Caddyfile
git commit -m "feat: add asset serving and admin upload proxy to Caddy config"
```

---

### Task 13: Update deploy script

**Files:**
- Modify: `scripts/deploy.sh`

- [ ] **Step 1: Add uploads directory creation and migration**

In `scripts/deploy.sh`, add after the `echo "==> Loading environment variables..."` block (after line 23):

```bash
echo "==> Ensuring uploads directory..."
UPLOADS_DIR="/opt/ogame-clone/uploads/assets"
mkdir -p "$UPLOADS_DIR"/{buildings,research,ships,defenses}

# One-shot migration: copy existing assets from web dist to uploads
if [ -z "$(ls -A "$UPLOADS_DIR/buildings/" 2>/dev/null)" ] && [ -n "$(ls -A apps/web/public/assets/buildings/ 2>/dev/null)" ]; then
  echo "    Migrating existing assets to uploads directory..."
  cp -r apps/web/public/assets/buildings/* "$UPLOADS_DIR/buildings/" 2>/dev/null || true
  cp -r apps/web/public/assets/research/* "$UPLOADS_DIR/research/" 2>/dev/null || true
  cp -r apps/web/public/assets/ships/* "$UPLOADS_DIR/ships/" 2>/dev/null || true
  cp -r apps/web/public/assets/defenses/* "$UPLOADS_DIR/defenses/" 2>/dev/null || true
fi
```

- [ ] **Step 2: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat: add uploads dir creation and asset migration to deploy script"
```

---

### Task 14: Add ASSETS_DIR to production .env

- [ ] **Step 1: Document the env var for deployment**

When deploying, add to the server's `.env` file at `/opt/ogame-clone/.env`:

```
ASSETS_DIR=/opt/ogame-clone/uploads/assets
```

Without this, the API in production would use the default (relative to source), which points to `apps/web/public/assets` — uploads would go to the wrong directory.

- [ ] **Step 2: Add .env.example entry**

If an `.env.example` file exists in the project root, add `ASSETS_DIR=` as documentation. Otherwise, skip this step.

---

### Task 15: Final verification

- [ ] **Step 1: Typecheck all packages**

```bash
cd /Users/julienaubree/_projet/ogame-clone
pnpm exec turbo typecheck
```

Expected: all packages pass.

- [ ] **Step 2: Manual test — start API + admin**

In terminal 1:
```bash
pnpm --filter @ogame-clone/api dev
```

In terminal 2:
```bash
pnpm --filter @ogame-clone/admin dev
```

Open `http://localhost:5174/buildings` in browser. Verify:
1. Image column visible in table (placeholders with initials for buildings without images, actual icons for mineraiMine/siliciumMine/hydrogeneSynth)
2. Click a placeholder → file picker opens
3. Select a PNG → spinner shows → image appears after upload
4. Check `apps/web/public/assets/buildings/` for the 3 new WebP files

- [ ] **Step 3: Final commit + push**

```bash
git push origin main
```
