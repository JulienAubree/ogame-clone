# Alliance Blason & Devise — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each alliance a visual blason (shape + icon + 2 colors) and an optional 100-char motto, rendered consistently across 5 display contexts (alliance page, profile, ranking, chat, galaxy), with founder-only editing and deterministic auto-generation for existing alliances.

**Architecture:** A shared module `@exilium/shared/alliance-blason` owns the catalog (12 shapes × 17 icons), Zod validation, SVG path components, and a deterministic `generateDefaultBlason(tag)`. Four new columns on `alliances` store the blason + motto. A single `<AllianceBlason>` React component is reused at every size. PR 1 delivers the socle (migration, module, editor, hero). PR 2 propagates the blason to profile, ranking, chat, galaxy.

**Tech Stack:** TypeScript, Drizzle ORM + drizzle-kit (migrations), Zod, React + tRPC, Vitest.

---

## Spec reference

Full spec: `docs/superpowers/specs/2026-04-21-alliance-blason-design.md`.

## Context the implementer needs

- Monorepo with pnpm workspaces. Key packages:
  - `packages/shared` — TS-only, no deps beyond TS. Exports via `src/index.ts`.
  - `packages/db` — Drizzle schema + drizzle migrations in `drizzle/NNNN_*.sql`. Generate new migration with `pnpm --filter @exilium/db db:generate`.
  - `apps/api` — tRPC backend, service per domain in `src/modules/<domain>/`. Vitest.
  - `apps/web` — React frontend. Alliance UI in `src/pages/Alliance.tsx`.
- Alliance code entry points:
  - Schema: `packages/db/src/schema/alliances.ts`
  - Service: `apps/api/src/modules/alliance/alliance.service.ts`
  - Router: `apps/api/src/modules/alliance/alliance.router.ts`
  - UI page: `apps/web/src/pages/Alliance.tsx`
- Existing alliance badge component: `apps/web/src/components/profile/AllianceTagBadge.tsx` (used in profile). We do **not** replace it; we compose alongside.
- Zod is already a dep of the API. Add it to `packages/shared` for `BlasonSchema`.

## Global conventions

- Commit messages: follow repo style (`feat(alliance):`, `refactor(alliance):`, etc.). Include the `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
- Don't mock the database in tests (feedback: integration tests hit a real DB). Unit-test pure functions only (Zod schema, `generateDefaultBlason`).
- French UI copy uses **vous** (feedback: vouvoyer).
- No emojis in UI (feedback: use SVG icons from `src/lib/icons.tsx` if needed).
- Run `pnpm -s exec tsc --noEmit -p apps/api/tsconfig.json` and `pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json` after each task to verify typecheck.

## Parallelization notes

- **Tasks 1–3** (shared module internals) can be done in parallel by different agents (no shared files).
- **Tasks 11–14** (propagation to profile / ranking / chat / galaxy) are fully independent and can be parallelized.
- **Tasks 4–10** are sequential.

---

# PR 1 — Socle

## Task 1: Shared module — catalog (enums + Zod schema)

**Files:**
- Create: `packages/shared/src/alliance-blason/catalog.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add `zod` dep)
- Test: `packages/shared/src/alliance-blason/__tests__/catalog.test.ts`

- [ ] **Step 1: Add zod to shared package**

Edit `packages/shared/package.json`, add under `dependencies`:

```json
"dependencies": {
  "zod": "^3.24.1"
}
```

Run:

```bash
pnpm install
```

- [ ] **Step 2: Create catalog.ts**

Write `packages/shared/src/alliance-blason/catalog.ts`:

```ts
import { z } from 'zod';

export const BLASON_SHAPES = [
  'shield-classic', 'shield-pointed', 'shield-heater',
  'circle', 'hexagon', 'diamond', 'rounded-square', 'chevron',
  'star-4', 'star-6',
  'split-horizontal', 'split-diagonal',
] as const;
export type BlasonShape = typeof BLASON_SHAPES[number];

export const BLASON_ICONS = [
  'crossed-swords', 'skull', 'planet', 'star', 'moon',
  'rocket', 'satellite', 'galaxy', 'crosshair', 'crown',
  'lightning', 'eye', 'atom', 'gear', 'crystal', 'trident', 'book',
] as const;
export type BlasonIcon = typeof BLASON_ICONS[number];

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const BlasonSchema = z.object({
  shape: z.enum(BLASON_SHAPES),
  icon: z.enum(BLASON_ICONS),
  color1: z.string().regex(HEX_COLOR_REGEX, 'Couleur invalide (format #RRGGBB attendu)'),
  color2: z.string().regex(HEX_COLOR_REGEX, 'Couleur invalide (format #RRGGBB attendu)'),
});
export type Blason = z.infer<typeof BlasonSchema>;

export const MottoSchema = z.string().max(100).nullable();

// Used by generateDefaultBlason only. Manual edit uses a free hex picker.
export const DEFAULT_PALETTE: readonly string[] = [
  '#8b0000', '#1a3a6c', '#3d1a5b', '#1f4d2e',
  '#4a2c17', '#5c4a1a', '#2d4a7a', '#5c1a3b',
  '#d4af37', '#00e0ff', '#e8e4d4', '#8aa0a8',
  '#c0392b', '#27ae60', '#8e44ad', '#f39c12',
];
```

- [ ] **Step 3: Export from index.ts**

Edit `packages/shared/src/index.ts`, add:

```ts
export * from './alliance-blason/catalog.js';
```

- [ ] **Step 4: Write tests**

Write `packages/shared/src/alliance-blason/__tests__/catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BlasonSchema, BLASON_SHAPES, BLASON_ICONS } from '../catalog.js';

describe('BlasonSchema', () => {
  it('accepts a valid blason', () => {
    const result = BlasonSchema.safeParse({
      shape: 'shield-classic',
      icon: 'crossed-swords',
      color1: '#8b0000',
      color2: '#d4af37',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown shape', () => {
    const result = BlasonSchema.safeParse({
      shape: 'unknown-shape',
      icon: 'crossed-swords',
      color1: '#8b0000',
      color2: '#d4af37',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed hex color', () => {
    const result = BlasonSchema.safeParse({
      shape: 'circle',
      icon: 'star',
      color1: 'red',
      color2: '#d4af37',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a 3-char hex color', () => {
    const result = BlasonSchema.safeParse({
      shape: 'circle',
      icon: 'star',
      color1: '#f00',
      color2: '#d4af37',
    });
    expect(result.success).toBe(false);
  });

  it('has 12 shapes and 17 icons', () => {
    expect(BLASON_SHAPES).toHaveLength(12);
    expect(BLASON_ICONS).toHaveLength(17);
  });
});
```

- [ ] **Step 5: Configure vitest on shared package**

Edit `packages/shared/package.json`, add under `scripts`:

```json
"test": "vitest run"
```

Add under `devDependencies`:

```json
"vitest": "^2.1.8"
```

Create `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true } });
```

Run `pnpm install`.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @exilium/shared test
```

Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat(alliance): shared module — blason catalog + Zod schema

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Shared module — shape and icon SVG components

**Files:**
- Create: `packages/shared/src/alliance-blason/shapes.tsx`
- Create: `packages/shared/src/alliance-blason/icons.tsx`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add React peer dep, tsx support)

**Context:** The components return SVG `<g>` fragments (not full `<svg>`). Each shape receives `color1`, `color2`, and a `strokeWidth`. Each icon receives `color`. All paths are sized to the `0 0 100 100` viewBox (shapes) or `0 0 24 24` recalibrated (icons — but we'll scale them in the outer composition).

- [ ] **Step 1: Add React types / peer dep to shared package**

Edit `packages/shared/package.json`:

```json
"peerDependencies": {
  "react": "^18.3.0"
},
"devDependencies": {
  "@types/react": "^18.3.0",
  "typescript": "^5.7.3",
  "vitest": "^2.1.8"
}
```

Edit `packages/shared/tsconfig.json` to enable JSX:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    ...
  }
}
```

(Preserve other fields if they exist; just ensure `jsx: "react-jsx"`.)

Run `pnpm install`.

- [ ] **Step 2: Create shapes.tsx**

Write `packages/shared/src/alliance-blason/shapes.tsx`. Each component takes `{ color1, color2 }` and returns a `<g>`. All coordinates are in the `0 0 100 100` viewBox. Strokes are on the outer path with `stroke-width={3}`.

```tsx
import type { BlasonShape } from './catalog.js';

type ShapeProps = { color1: string; color2: string; id: string };

// Solid shapes: color1 = fill, color2 = stroke
function SolidShield({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function PointedShield({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M10 10 L90 10 L90 50 L50 95 L10 50 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function HeaterShield({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M15 15 L85 15 Q85 60 50 95 Q15 60 15 15 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Circle({ color1, color2 }: ShapeProps) {
  return <circle cx="50" cy="50" r="42" fill={color1} stroke={color2} strokeWidth={3} />;
}

function Hexagon({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 8 L88 30 L88 70 L50 92 L12 70 L12 30 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Diamond({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 8 L92 50 L50 92 L8 50 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function RoundedSquare({ color1, color2 }: ShapeProps) {
  return <rect x="10" y="10" width="80" height="80" rx="14" fill={color1} stroke={color2} strokeWidth={3} />;
}

function Chevron({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 10 L95 50 L80 90 L20 90 L5 50 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Star4({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 5 L62 38 L95 50 L62 62 L50 95 L38 62 L5 50 L38 38 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

function Star6({ color1, color2 }: ShapeProps) {
  return (
    <path
      d="M50 5 L62 35 L95 35 L68 55 L78 88 L50 70 L22 88 L32 55 L5 35 L38 35 Z"
      fill={color1}
      stroke={color2}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

// Split shapes: color1 = half A, color2 = half B (both halves, stroke = color2)
function SplitHorizontal({ color1, color2, id }: ShapeProps) {
  const clipId = `shield-clip-${id}`;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="100" height="50" fill={color1} />
        <rect x="0" y="50" width="100" height="50" fill={color2} />
      </g>
      <path
        d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z"
        fill="none"
        stroke={color2}
        strokeWidth={3}
      />
    </>
  );
}

function SplitDiagonal({ color1, color2, id }: ShapeProps) {
  const clipId = `diag-clip-${id}`;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <polygon points="10,5 90,5 90,95 10,95" fill={color1} />
        <polygon points="10,5 90,95 10,95" fill={color2} />
      </g>
      <path
        d="M50 5 L90 20 L90 55 Q90 85 50 95 Q10 85 10 55 L10 20 Z"
        fill="none"
        stroke={color2}
        strokeWidth={3}
      />
    </>
  );
}

export const SHAPE_COMPONENTS: Record<BlasonShape, (p: ShapeProps) => JSX.Element> = {
  'shield-classic': SolidShield,
  'shield-pointed': PointedShield,
  'shield-heater': HeaterShield,
  'circle': Circle,
  'hexagon': Hexagon,
  'diamond': Diamond,
  'rounded-square': RoundedSquare,
  'chevron': Chevron,
  'star-4': Star4,
  'star-6': Star6,
  'split-horizontal': SplitHorizontal,
  'split-diagonal': SplitDiagonal,
};

export const SPLIT_SHAPES: readonly BlasonShape[] = ['split-horizontal', 'split-diagonal'];
```

- [ ] **Step 3: Create icons.tsx**

Write `packages/shared/src/alliance-blason/icons.tsx`. Each icon takes `{ color }` and returns a `<g>` with paths. Icons are defined in a `0 0 24 24` local space. The outer composition will translate + scale them to sit centered in the shape.

Use the SVG paths from the visual companion preview. Each icon is a component that accepts `{ color, strokeWidth }`:

```tsx
import type { BlasonIcon } from './catalog.js';

type IconProps = { color: string; strokeWidth?: number };

const commonStrokeProps = (color: string, strokeWidth: number) => ({
  stroke: color,
  strokeWidth,
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

function CrossedSwords({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5" />
      <path d="m13 19 1.5-1.5" />
      <path d="m11 19-1.5-1.5" />
    </g>
  );
}

function Skull({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="9" cy="12" r="1" fill={color} />
      <circle cx="15" cy="12" r="1" fill={color} />
      <path d="M8 20v2h8v-2" />
      <path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20" />
    </g>
  );
}

function Planet({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="5" />
      <ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-20 12 12)" />
    </g>
  );
}

function Star({ color }: IconProps) {
  return (
    <g>
      <polygon fill={color} points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
    </g>
  );
}

function Moon({ color }: IconProps) {
  return (
    <g>
      <path fill={color} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </g>
  );
}

function Rocket({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </g>
  );
}

function Satellite({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M13 7 9 3 5 7l4 4" />
      <path d="m17 11 4 4-4 4-4-4" />
      <path d="m8 12 4 4 6-6-4-4Z" />
      <path d="m16 8 3-3" />
      <path d="M9 21a6 6 0 0 0-6-6" />
    </g>
  );
}

function Galaxy({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4a8 8 0 0 1 8 8c0 2-1 4-3 4s-3-1-3-3 1-3 3-3" />
      <path d="M12 20a8 8 0 0 1-8-8c0-2 1-4 3-4s3 1 3 3-1 3-3 3" />
    </g>
  );
}

function Crosshair({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </g>
  );
}

function Crown({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M2 18h20l-2-11-4 4-4-6-4 6-4-4z" />
      <path d="M5 21h14" />
    </g>
  );
}

function Lightning({ color }: IconProps) {
  return (
    <g>
      <polygon fill={color} points="13 2 3 14 12 14 11 22 21 10 12 10" />
    </g>
  );
}

function Eye({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </g>
  );
}

function Atom({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="1.5" fill={color} />
      <ellipse cx="12" cy="12" rx="10" ry="4" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
    </g>
  );
}

function Gear({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </g>
  );
}

function Crystal({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round">
      <path d="M6 3h12l4 6-10 13L2 9Z" />
      <path d="M12 22V9" />
      <path d="m2 9 10 4 10-4" />
      <path d="M6 3l6 6 6-6" />
    </g>
  );
}

function Trident({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M12 22V7" />
      <path d="M6 2v5a6 6 0 0 0 12 0V2" />
      <path d="M4 4h4M16 4h4" />
    </g>
  );
}

function Book({ color, strokeWidth = 2 }: IconProps) {
  return (
    <g {...commonStrokeProps(color, strokeWidth)}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </g>
  );
}

export const ICON_COMPONENTS: Record<BlasonIcon, (p: IconProps) => JSX.Element> = {
  'crossed-swords': CrossedSwords,
  'skull': Skull,
  'planet': Planet,
  'star': Star,
  'moon': Moon,
  'rocket': Rocket,
  'satellite': Satellite,
  'galaxy': Galaxy,
  'crosshair': Crosshair,
  'crown': Crown,
  'lightning': Lightning,
  'eye': Eye,
  'atom': Atom,
  'gear': Gear,
  'crystal': Crystal,
  'trident': Trident,
  'book': Book,
};
```

- [ ] **Step 4: Update shared index**

Edit `packages/shared/src/index.ts`:

```ts
export * from './alliance-blason/catalog.js';
export { SHAPE_COMPONENTS, SPLIT_SHAPES } from './alliance-blason/shapes.js';
export { ICON_COMPONENTS } from './alliance-blason/icons.js';
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @exilium/shared typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(alliance): shared module — shape and icon SVG components

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Shared module — generateDefaultBlason

**Files:**
- Create: `packages/shared/src/alliance-blason/generate-default.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/alliance-blason/__tests__/generate-default.test.ts`

- [ ] **Step 1: Create generate-default.ts**

```ts
import { BLASON_SHAPES, BLASON_ICONS, DEFAULT_PALETTE, type Blason } from './catalog.js';

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // ensure unsigned 32-bit
  return hash >>> 0;
}

export function generateDefaultBlason(tag: string): Blason {
  const h = fnv1a(tag.toUpperCase());
  const shape = BLASON_SHAPES[h % BLASON_SHAPES.length];
  const icon = BLASON_ICONS[(h >>> 4) % BLASON_ICONS.length];
  const c1Idx = (h >>> 8) % DEFAULT_PALETTE.length;
  let c2Idx = (h >>> 12) % DEFAULT_PALETTE.length;
  if (c2Idx === c1Idx) c2Idx = (c2Idx + 1) % DEFAULT_PALETTE.length;
  return {
    shape,
    icon,
    color1: DEFAULT_PALETTE[c1Idx],
    color2: DEFAULT_PALETTE[c2Idx],
  };
}
```

- [ ] **Step 2: Export from index**

Edit `packages/shared/src/index.ts`:

```ts
export { generateDefaultBlason } from './alliance-blason/generate-default.js';
```

- [ ] **Step 3: Write tests**

```ts
import { describe, it, expect } from 'vitest';
import { generateDefaultBlason } from '../generate-default.js';
import { BlasonSchema } from '../catalog.js';

describe('generateDefaultBlason', () => {
  it('is deterministic for a given tag', () => {
    expect(generateDefaultBlason('LSTL')).toEqual(generateDefaultBlason('LSTL'));
  });

  it('produces different blasons for different tags', () => {
    const a = generateDefaultBlason('LSTL');
    const b = generateDefaultBlason('ERNT');
    expect(a).not.toEqual(b);
  });

  it('always produces a valid blason (Zod)', () => {
    for (const tag of ['A', 'AB', 'ABC', 'ABCD', 'ZZZZ', 'CORS', 'CMU', 'XY12']) {
      const b = generateDefaultBlason(tag);
      expect(BlasonSchema.safeParse(b).success).toBe(true);
    }
  });

  it('produces color1 !== color2', () => {
    for (const tag of ['A', 'AB', 'ABC', 'ABCD', 'ZZZZ']) {
      const b = generateDefaultBlason(tag);
      expect(b.color1).not.toEqual(b.color2);
    }
  });

  it('normalizes tag to uppercase', () => {
    expect(generateDefaultBlason('lstl')).toEqual(generateDefaultBlason('LSTL'));
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @exilium/shared test
```

Expected: all tests pass (5 catalog + 5 generate-default = 10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat(alliance): shared module — deterministic default blason

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: DB schema update + migration

**Files:**
- Modify: `packages/db/src/schema/alliances.ts`
- Create: `packages/db/drizzle/NNNN_alliance_blason.sql` (NNNN = next migration number)

- [ ] **Step 1: Update Drizzle schema**

Edit `packages/db/src/schema/alliances.ts` — add the 5 new columns to `alliances` table:

```ts
export const alliances = pgTable('alliances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 30 }).notNull().unique(),
  tag: varchar('tag', { length: 8 }).notNull().unique(),
  description: text('description'),
  founderId: uuid('founder_id').notNull().references(() => users.id),
  blasonShape: varchar('blason_shape', { length: 32 }).notNull(),
  blasonIcon: varchar('blason_icon', { length: 32 }).notNull(),
  blasonColor1: varchar('blason_color1', { length: 7 }).notNull(),
  blasonColor2: varchar('blason_color2', { length: 7 }).notNull(),
  motto: varchar('motto', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate migration**

```bash
pnpm --filter @exilium/db db:generate
```

This produces a new file `packages/db/drizzle/NNNN_<name>.sql`. Check its contents: it should add the 4 `blason_*` columns and `motto`. The `NOT NULL` columns need default values or a manual backfill.

- [ ] **Step 3: Check the generated migration**

The auto-generated SQL will likely fail on existing rows because of `NOT NULL`. Rewrite it manually. Replace the generated file's content with:

```sql
-- Alliance blason + motto
-- Add columns as nullable first, backfill with deterministic default, then enforce NOT NULL.

ALTER TABLE "alliances" ADD COLUMN "blason_shape" varchar(32);
ALTER TABLE "alliances" ADD COLUMN "blason_icon" varchar(32);
ALTER TABLE "alliances" ADD COLUMN "blason_color1" varchar(7);
ALTER TABLE "alliances" ADD COLUMN "blason_color2" varchar(7);
ALTER TABLE "alliances" ADD COLUMN "motto" varchar(100);

-- Backfill will be applied by scripts/migrate-alliance-blason.ts before enforcing NOT NULL.
```

- [ ] **Step 4: Write the backfill script**

Create `packages/db/src/scripts/migrate-alliance-blason.ts`:

```ts
import { db, closeDb } from '../connection.js';
import { alliances } from '../schema/alliances.js';
import { eq, isNull } from 'drizzle-orm';
import { generateDefaultBlason } from '@exilium/shared';

async function main() {
  const rows = await db
    .select({ id: alliances.id, tag: alliances.tag })
    .from(alliances)
    .where(isNull(alliances.blasonShape));

  console.log(`Backfilling ${rows.length} alliances…`);
  for (const row of rows) {
    const b = generateDefaultBlason(row.tag);
    await db.update(alliances).set({
      blasonShape: b.shape,
      blasonIcon: b.icon,
      blasonColor1: b.color1,
      blasonColor2: b.color2,
    }).where(eq(alliances.id, row.id));
  }
  console.log('Backfill done.');
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Add a script to `packages/db/package.json`:

```json
"db:migrate-alliance-blason": "tsx src/scripts/migrate-alliance-blason.ts"
```

- [ ] **Step 5: Write the NOT NULL follow-up migration**

Create a second migration file `packages/db/drizzle/NNNN+1_alliance_blason_not_null.sql`. NNNN+1 is the next number after the one generated in step 3.

```sql
-- Enforce NOT NULL after backfill. Run pnpm --filter @exilium/db db:migrate-alliance-blason first.

ALTER TABLE "alliances" ALTER COLUMN "blason_shape" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_icon" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_color1" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_color2" SET NOT NULL;
```

- [ ] **Step 6: Apply migrations + backfill locally**

```bash
pnpm --filter @exilium/db db:migrate    # applies the first (adds nullable columns)
pnpm --filter @exilium/db db:migrate-alliance-blason  # backfills
pnpm --filter @exilium/db db:migrate    # applies the NOT NULL constraints
```

Verify in DB that all alliances have blason columns populated:

```bash
psql -U exilium -d exilium -c "SELECT tag, blason_shape, blason_icon, blason_color1, blason_color2, motto FROM alliances LIMIT 5;"
```

- [ ] **Step 7: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/api/tsconfig.json
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/db/
git commit -m "feat(alliance): DB migration for blason + motto (nullable → backfill → NOT NULL)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Backend — blason fields on alliance.create, myAlliance, get

**Files:**
- Modify: `apps/api/src/modules/alliance/alliance.service.ts`
- Modify: `apps/api/src/modules/alliance/alliance.router.ts`

- [ ] **Step 1: Update `create` to accept and persist blason + motto**

In `alliance.service.ts`, replace the `create` method:

```ts
async create(userId: string, params: { name: string; tag: string; blason: Blason; motto: string | null }) {
  const existing = await getMembership(db, userId);
  if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous êtes déjà dans une alliance.' });

  const { blason, motto } = params;
  const [alliance] = await db.insert(alliances).values({
    name: params.name,
    tag: params.tag.toUpperCase(),
    founderId: userId,
    blasonShape: blason.shape,
    blasonIcon: blason.icon,
    blasonColor1: blason.color1,
    blasonColor2: blason.color2,
    motto,
  }).returning();
  await db.insert(allianceMembers).values({ allianceId: alliance.id, userId, role: 'founder' });
  return alliance;
},
```

Add imports at the top of `alliance.service.ts`:

```ts
import type { Blason } from '@exilium/shared';
```

- [ ] **Step 2: Add updateBlason method**

Add below the existing `update` method in `alliance.service.ts`:

```ts
async updateBlason(userId: string, params: { blason: Blason; motto: string | null }) {
  const membership = await requireRole(db, userId, ['founder']);
  await db.update(alliances).set({
    blasonShape: params.blason.shape,
    blasonIcon: params.blason.icon,
    blasonColor1: params.blason.color1,
    blasonColor2: params.blason.color2,
    motto: params.motto,
  }).where(eq(alliances.id, membership.allianceId));
  return { success: true };
},
```

- [ ] **Step 3: Verify `get` and `myAlliance` already return blason**

Since both use `db.select().from(alliances)` (no column projection), they already return the new columns. Confirm by reading the methods — no change needed.

- [ ] **Step 4: Update router — `create` input**

Edit `apps/api/src/modules/alliance/alliance.router.ts`. Replace the `create` route input:

```ts
import { BlasonSchema, MottoSchema } from '@exilium/shared';

// ...

create: protectedProcedure
  .input(z.object({
    name: z.string().min(3).max(30),
    tag: z.string().min(2).max(8),
    blason: BlasonSchema,
    motto: MottoSchema,
  }))
  .mutation(async ({ ctx, input }) => {
    return allianceService.create(ctx.userId!, input);
  }),
```

- [ ] **Step 5: Add updateBlason route**

Add below the existing `update` route:

```ts
updateBlason: protectedProcedure
  .input(z.object({
    blason: BlasonSchema,
    motto: MottoSchema,
  }))
  .mutation(async ({ ctx, input }) => {
    return allianceService.updateBlason(ctx.userId!, input);
  }),
```

- [ ] **Step 6: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/api/tsconfig.json
```

Expected: no errors. If `alliance.service.ts` uses `allianceService.create(ctx.userId!, input.name, input.tag)` anywhere else, update call sites.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/alliance/
git commit -m "feat(alliance): blason + motto on create + updateBlason mutation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — `<AllianceBlason>` component

**Files:**
- Create: `apps/web/src/components/alliance/AllianceBlason.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { Blason } from '@exilium/shared';
import { SHAPE_COMPONENTS, ICON_COMPONENTS, SPLIT_SHAPES } from '@exilium/shared';
import { useId } from 'react';

type Props = {
  blason: Blason;
  size: number;
  className?: string;
  title?: string;
};

/**
 * Relative luminance (WCAG) of a #RRGGBB color.
 * Returns a number in [0, 1].
 */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function AllianceBlason({ blason, size, className, title }: Props) {
  const id = useId();
  const Shape = SHAPE_COMPONENTS[blason.shape];
  const Icon = ICON_COMPONENTS[blason.icon];
  const isSplit = SPLIT_SHAPES.includes(blason.shape);

  // For split shapes, pick black or white for the icon based on average luminance
  // of the two halves. For solid shapes, icon uses color2 (same as the border).
  const iconColor = isSplit
    ? ((luminance(blason.color1) + luminance(blason.color2)) / 2 > 0.5 ? '#000000' : '#ffffff')
    : blason.color2;

  // Icon is in a 24x24 local space, we scale it to ~60% of the shape and center at (50,50).
  // scale = 60 / 24 = 2.5; translate so the icon center (12,12) lands at (50,50).
  const scale = 2.5;
  const tx = 50 - 12 * scale;
  const ty = 50 - 12 * scale;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <Shape color1={blason.color1} color2={blason.color2} id={id} />
      <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
        <Icon color={iconColor} strokeWidth={1.6} />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/alliance/
git commit -m "feat(alliance): <AllianceBlason> rendering component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Frontend — BlasonPicker sub-component

**Files:**
- Create: `apps/web/src/components/alliance/BlasonPicker.tsx`

Reusable UI to edit a `Blason` + `motto`. Shared between the create-alliance form and the founder edit section.

- [ ] **Step 1: Create the picker**

```tsx
import type { Blason } from '@exilium/shared';
import { BLASON_SHAPES, BLASON_ICONS, SHAPE_COMPONENTS, ICON_COMPONENTS } from '@exilium/shared';
import { AllianceBlason } from './AllianceBlason';
import { Input } from '@/components/ui/input';

type Props = {
  blason: Blason;
  motto: string | null;
  onBlasonChange: (b: Blason) => void;
  onMottoChange: (m: string | null) => void;
  allianceName?: string;
  allianceTag?: string;
};

// Relative luminance reused for contrast warning
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function BlasonPicker({
  blason,
  motto,
  onBlasonChange,
  onMottoChange,
  allianceName,
  allianceTag,
}: Props) {
  const lowContrast = contrastRatio(blason.color1, blason.color2) < 3;

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <AllianceBlason blason={blason} size={128} />
        {allianceName && (
          <div className="text-center">
            <div className="text-sm font-semibold">{allianceName}</div>
            {allianceTag && <div className="text-xs text-muted-foreground">[{allianceTag}]</div>}
          </div>
        )}
        {motto && (
          <p className="text-xs italic text-center text-muted-foreground max-w-[200px] border-l-2 border-primary/40 pl-2">
            {motto}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Shapes */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">Forme</label>
          <div className="grid grid-cols-6 gap-2">
            {BLASON_SHAPES.map((shape) => {
              const Shape = SHAPE_COMPONENTS[shape];
              const selected = blason.shape === shape;
              return (
                <button
                  key={shape}
                  type="button"
                  onClick={() => onBlasonChange({ ...blason, shape })}
                  className={`aspect-square rounded border p-1 transition-colors ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-muted-foreground'}`}
                  aria-label={shape}
                >
                  <svg viewBox="0 0 100 100" width="100%" height="100%">
                    <Shape color1={blason.color1} color2={blason.color2} id={`pick-s-${shape}`} />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>

        {/* Icons */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">Icône</label>
          <div className="grid grid-cols-8 gap-2">
            {BLASON_ICONS.map((icon) => {
              const Icon = ICON_COMPONENTS[icon];
              const selected = blason.icon === icon;
              return (
                <button
                  key={icon}
                  type="button"
                  onClick={() => onBlasonChange({ ...blason, icon })}
                  className={`aspect-square rounded border p-1.5 transition-colors ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-muted-foreground'}`}
                  aria-label={icon}
                >
                  <svg viewBox="0 0 24 24" width="100%" height="100%">
                    <Icon color="currentColor" strokeWidth={2} />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground block mb-1">Couleur principale</span>
            <div className="flex gap-2">
              <input
                type="color"
                value={blason.color1}
                onChange={(e) => onBlasonChange({ ...blason, color1: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
              <Input
                value={blason.color1}
                onChange={(e) => onBlasonChange({ ...blason, color1: e.target.value })}
                className="flex-1 font-mono text-xs"
                maxLength={7}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground block mb-1">Couleur secondaire</span>
            <div className="flex gap-2">
              <input
                type="color"
                value={blason.color2}
                onChange={(e) => onBlasonChange({ ...blason, color2: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
              <Input
                value={blason.color2}
                onChange={(e) => onBlasonChange({ ...blason, color2: e.target.value })}
                className="flex-1 font-mono text-xs"
                maxLength={7}
              />
            </div>
          </label>
        </div>

        {lowContrast && (
          <p className="text-xs text-amber-500">Lisibilité faible — les 2 couleurs sont trop proches.</p>
        )}

        {/* Motto */}
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground block mb-1">
            Devise (optionnelle, {(motto ?? '').length}/100)
          </span>
          <textarea
            value={motto ?? ''}
            onChange={(e) => onMottoChange(e.target.value.length === 0 ? null : e.target.value.slice(0, 100))}
            rows={2}
            maxLength={100}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            placeholder="Une devise qui vous représente…"
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/alliance/
git commit -m "feat(alliance): BlasonPicker (form UI for blason + motto)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Frontend — wire BlasonPicker into Create Alliance form

**Files:**
- Modify: `apps/web/src/pages/Alliance.tsx`

- [ ] **Step 1: Update NoAllianceView to include blason**

At the top of `Alliance.tsx`, add imports:

```tsx
import { generateDefaultBlason, type Blason } from '@exilium/shared';
import { BlasonPicker } from '@/components/alliance/BlasonPicker';
```

In `NoAllianceView`, add state for blason + motto after the existing `setTag`:

```tsx
const [blason, setBlason] = useState<Blason>(() => generateDefaultBlason('XXXX'));
const [motto, setMotto] = useState<string | null>(null);

// Regenerate the default blason whenever the tag changes (user can still customize after).
const lastAutoTagRef = useRef<string>('');
useEffect(() => {
  if (tag.length >= 2 && tag !== lastAutoTagRef.current) {
    lastAutoTagRef.current = tag;
    setBlason(generateDefaultBlason(tag));
  }
}, [tag]);
```

Add imports at the top:

```tsx
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Insert the picker in the create form**

Inside the create tab `<section>`, after the `Tag` input, insert:

```tsx
<div>
  <label className="text-xs text-muted-foreground mb-1 block">Blason & devise</label>
  <BlasonPicker
    blason={blason}
    motto={motto}
    onBlasonChange={setBlason}
    onMottoChange={setMotto}
    allianceName={name || 'Alliance'}
    allianceTag={tag || 'TAG'}
  />
</div>
```

- [ ] **Step 3: Update the create mutation call**

Change the `Créer` button's onClick:

```tsx
<Button
  onClick={() => createMutation.mutate({ name, tag, blason, motto })}
  disabled={createMutation.isPending || name.length < 3 || tag.length < 2}
>
  Créer
</Button>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 5: Manual verification**

Run the web dev server (`pnpm --filter @exilium/web dev` or per repo convention) and test:
- Log in as a user without alliance
- Go to `/alliance`, click Créer
- Type a tag — blason should auto-regenerate
- Change a shape/icon/color, type a motto — preview updates
- Submit — alliance is created with the chosen blason

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Alliance.tsx
git commit -m "feat(alliance): blason picker in create alliance form

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Frontend — blason & devise edit section (Gestion tab) + hero on Alliance page

**Files:**
- Modify: `apps/web/src/pages/Alliance.tsx`

- [ ] **Step 1: Update AllianceView props type**

In `Alliance.tsx`, the `AllianceView` function signature types `alliance` inline. Update it to include the blason + motto fields:

```tsx
function AllianceView({ alliance }: {
  alliance: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    myRole: string;
    members: { userId: string; username: string; role: string; joinedAt: string }[];
    blasonShape: string;
    blasonIcon: string;
    blasonColor1: string;
    blasonColor2: string;
    motto: string | null;
  };
}) {
```

- [ ] **Step 2: Derive a typed blason from the alliance row**

Inside `AllianceView`, after the existing `useState` calls:

```tsx
const currentBlason: Blason = {
  shape: alliance.blasonShape as Blason['shape'],
  icon: alliance.blasonIcon as Blason['icon'],
  color1: alliance.blasonColor1,
  color2: alliance.blasonColor2,
};
const [editBlason, setEditBlason] = useState<Blason>(currentBlason);
const [editMotto, setEditMotto] = useState<string | null>(alliance.motto);
```

Add imports:

```tsx
import { AllianceBlason } from '@/components/alliance/AllianceBlason';
```

- [ ] **Step 3: Add updateBlason mutation**

Add alongside existing mutations:

```tsx
const updateBlasonMutation = trpc.alliance.updateBlason.useMutation({
  onSuccess: invalidateAll,
});
```

Helper to detect unsaved change:

```tsx
const blasonDirty = useMemo(() => {
  return editBlason.shape !== currentBlason.shape
    || editBlason.icon !== currentBlason.icon
    || editBlason.color1.toLowerCase() !== currentBlason.color1.toLowerCase()
    || editBlason.color2.toLowerCase() !== currentBlason.color2.toLowerCase()
    || (editMotto ?? '') !== (alliance.motto ?? '');
}, [editBlason, editMotto, currentBlason, alliance.motto]);
```

Add `useMemo` to the React imports.

- [ ] **Step 4: Add hero block at the top of the "info" tab**

Find where the "info" tab content is rendered. Add at the top of that tab:

```tsx
<section className="glass-card p-6">
  <div className="flex flex-wrap items-start gap-5">
    <AllianceBlason blason={currentBlason} size={96} />
    <div className="flex-1 min-w-0">
      <h2 className="text-xl font-bold">{alliance.name}</h2>
      <div className="text-sm font-semibold text-primary mt-0.5">[{alliance.tag}]</div>
      {alliance.description && (
        <p className="text-sm text-muted-foreground mt-2">{alliance.description}</p>
      )}
      {alliance.motto && (
        <p className="mt-3 border-l-2 border-primary/60 pl-3 italic text-sm text-foreground/90">
          {alliance.motto}
        </p>
      )}
    </div>
  </div>
</section>
```

- [ ] **Step 5: Add edit section in the "manage" tab (founder only)**

Find where the "manage" tab content is rendered. At the top (for founder only), add:

```tsx
{isFounder && (
  <section className="glass-card p-4 space-y-4">
    <h3 className="text-base font-semibold">Blason &amp; devise</h3>
    <BlasonPicker
      blason={editBlason}
      motto={editMotto}
      onBlasonChange={setEditBlason}
      onMottoChange={setEditMotto}
      allianceName={alliance.name}
      allianceTag={alliance.tag}
    />
    <div className="flex gap-2 justify-end">
      <Button
        variant="outline"
        onClick={() => { setEditBlason(currentBlason); setEditMotto(alliance.motto); }}
        disabled={!blasonDirty || updateBlasonMutation.isPending}
      >
        Annuler
      </Button>
      <Button
        onClick={() => updateBlasonMutation.mutate({ blason: editBlason, motto: editMotto })}
        disabled={!blasonDirty || updateBlasonMutation.isPending}
      >
        Enregistrer
      </Button>
    </div>
    {updateBlasonMutation.error && (
      <p className="text-sm text-destructive">{updateBlasonMutation.error.message}</p>
    )}
  </section>
)}
```

- [ ] **Step 6: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 7: Manual verification (golden path)**

- Go to `/alliance` as founder
- Info tab: hero shows blason + name + tag + motto
- Manage tab (founder only): picker shows current blason, editable
- Change shape — "Enregistrer" enables. Save. Hero updates.
- Change only the motto — same flow
- Cancel: reverts to saved state

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/Alliance.tsx
git commit -m "feat(alliance): hero blason on info tab + founder edit in manage tab

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Push PR 1

- [ ] **Step 1: Push**

```bash
git push
```

End of PR 1. Everything below is PR 2 (propagation).

---

# PR 2 — Propagation to other display contexts

**Tasks 11–14 are independent and can be dispatched in parallel.**

## Task 11: Profile integration

**Files:**
- Modify: `apps/api/src/modules/profile/` (locate the service returning the alliance card fields)
- Modify: `apps/web/src/components/profile/ProfileAllianceCard.tsx`

- [ ] **Step 1: Find the profile service that returns alliance info**

```bash
grep -rn "allianceTag\|allianceName" apps/api/src/modules/profile/ apps/api/src/routers/
```

Add blason fields to the returned shape: `blasonShape`, `blasonIcon`, `blasonColor1`, `blasonColor2`. Join is already on `alliances` — just extend the column projection.

- [ ] **Step 2: Update ProfileAllianceCard props**

Add to the props interface:

```ts
interface ProfileAllianceCardProps {
  allianceName: string;
  allianceTag: string;
  blason: Blason;
  allianceRole?: 'founder' | 'officer' | 'member' | null;
  isOwn: boolean;
}
```

Replace the `<AllianceTagBadge>` line with:

```tsx
<AllianceBlason blason={blason} size={48} title={`[${allianceTag}] ${allianceName}`} />
```

Add imports:

```tsx
import { AllianceBlason } from '@/components/alliance/AllianceBlason';
import type { Blason } from '@exilium/shared';
```

- [ ] **Step 3: Update call sites of ProfileAllianceCard**

Find `<ProfileAllianceCard` usages and pass the new `blason` prop built from the trPC response:

```tsx
<ProfileAllianceCard
  ...
  blason={{
    shape: profile.alliance.blasonShape as Blason['shape'],
    icon: profile.alliance.blasonIcon as Blason['icon'],
    color1: profile.alliance.blasonColor1,
    color2: profile.alliance.blasonColor2,
  }}
/>
```

- [ ] **Step 4: Typecheck both apps**

```bash
pnpm -s exec tsc --noEmit -p apps/api/tsconfig.json
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 5: Manual verification**

- Open your own profile — alliance card now shows the 48px blason.
- Open another player's profile — their alliance blason shows.

- [ ] **Step 6: Commit + push**

```bash
git add apps/api apps/web
git commit -m "feat(alliance): blason on profile alliance card

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 12: Alliance ranking integration

**Files:**
- Modify: `apps/api/src/modules/alliance/alliance.service.ts` (the `ranking` method)
- Modify: `apps/web/src/pages/AllianceRanking.tsx`

- [ ] **Step 1: Extend `ranking` projection**

In `alliance.service.ts`, update the `ranking` method to include blason fields:

```ts
async ranking(page: number = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;

  return db
    .select({
      allianceId: alliances.id,
      name: alliances.name,
      tag: alliances.tag,
      blasonShape: alliances.blasonShape,
      blasonIcon: alliances.blasonIcon,
      blasonColor1: alliances.blasonColor1,
      blasonColor2: alliances.blasonColor2,
      memberCount: sql<number>`count(${allianceMembers.userId})::int`,
      totalPoints: sql<number>`coalesce(sum(${rankings.totalPoints}), 0)::int`,
    })
    .from(alliances)
    .innerJoin(allianceMembers, eq(allianceMembers.allianceId, alliances.id))
    .leftJoin(rankings, eq(rankings.userId, allianceMembers.userId))
    .groupBy(alliances.id, alliances.name, alliances.tag, alliances.blasonShape, alliances.blasonIcon, alliances.blasonColor1, alliances.blasonColor2)
    .orderBy(desc(sql`coalesce(sum(${rankings.totalPoints}), 0)`))
    .limit(limit)
    .offset(offset);
},
```

- [ ] **Step 2: Render the 32px blason in AllianceRanking.tsx**

In `AllianceRanking.tsx`, import:

```tsx
import { AllianceBlason } from '@/components/alliance/AllianceBlason';
import type { Blason } from '@exilium/shared';
```

In each row (mobile + desktop), add a `<AllianceBlason>` 32px before the tag/name. Example for the mobile row:

```tsx
<div className="flex items-center gap-3">
  <span className="w-8 text-center font-mono text-sm">{...}</span>
  <AllianceBlason
    blason={{
      shape: entry.blasonShape as Blason['shape'],
      icon: entry.blasonIcon as Blason['icon'],
      color1: entry.blasonColor1,
      color2: entry.blasonColor2,
    }}
    size={32}
  />
  <span className="text-sm">[{entry.tag}] {entry.name}</span>
</div>
```

Same for the desktop table — add a new `<td>` with the blason before the name column.

- [ ] **Step 3: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/api/tsconfig.json
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 4: Manual verification**

- Go to `/alliance-ranking`
- Each row shows a 32px blason
- Mobile and desktop both render correctly

- [ ] **Step 5: Commit + push**

```bash
git add apps/api apps/web
git commit -m "feat(alliance): blason in alliance ranking (mobile + desktop)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 13: Chat integration

**Files:**
- Modify: chat service/router (find via grep)
- Modify: `apps/web/src/components/chat/ChatOverlayWindow.tsx` (or the row component)
- Modify: the SSE payload type in `packages/shared/src/types/notifications.ts` if it declares chat message shape

- [ ] **Step 1: Locate the chat payload source**

```bash
grep -rn "allianceTag" apps/api/src/modules/chat/ apps/api/src/routers/ apps/web/src/components/chat/ apps/web/src/stores/chat.store.ts
```

Identify the shape of a chat message returned by the API/SSE (fields already include `allianceTag`, `senderUsername`, etc.).

- [ ] **Step 2: Add blason fields to chat message shape**

Add the 4 blason fields to whatever type declares `allianceTag` (sender-side):

```ts
allianceBlason: {
  shape: string;
  icon: string;
  color1: string;
  color2: string;
} | null;
```

(Null for messages whose sender has no alliance — general chat.)

Update the DB query that builds messages to join on `alliances` and project these 4 columns. Pattern: if the existing join projects `alliances.tag as allianceTag`, add `alliances.blasonShape as blasonShape`, etc., then nest into a `allianceBlason` object at the service layer.

- [ ] **Step 3: Render the 16px blason in chat rows**

In the chat row component (from `ChatOverlayWindow.tsx` or its child row), inject before the username:

```tsx
{message.allianceBlason && (
  <AllianceBlason
    blason={{
      shape: message.allianceBlason.shape as Blason['shape'],
      icon: message.allianceBlason.icon as Blason['icon'],
      color1: message.allianceBlason.color1,
      color2: message.allianceBlason.color2,
    }}
    size={16}
    className="inline-block align-middle"
  />
)}
```

Add imports for `AllianceBlason` and `Blason`.

- [ ] **Step 4: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/api/tsconfig.json
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 5: Manual verification**

- Open chat as a member of alliance A
- Post a message — your alliance blason shows 16px next to your username
- Have another player (different alliance) post — their blason shows
- Non-alliance player: no blason

- [ ] **Step 6: Commit + push**

```bash
git add apps/api apps/web packages/shared
git commit -m "feat(alliance): blason next to username in chat

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 14: Galaxy integration

**Files:**
- Modify: galaxy system/planet service (find via grep)
- Modify: the galaxy component rendering the alliance tag on a planet tooltip or detail panel

- [ ] **Step 1: Locate where allianceTag is shown in galaxy**

```bash
grep -rn "allianceTag" apps/web/src/components/galaxy/
```

Likely candidates: `GalaxySystemView/DetailPanel/ModePlanet.tsx`, `OrbitalCanvas.tsx`, or similar. Also find the backend query that provides the planet's owner alliance.

- [ ] **Step 2: Add blason fields to the galaxy payload**

Extend the projection in the API query that returns planet owner alliance info. Add the 4 blason fields. Same pattern as tasks 11–13.

- [ ] **Step 3: Render the 14px blason next to the tag**

Wherever `[{allianceTag}]` is rendered today in the galaxy, wrap it with an adjacent blason:

```tsx
{planet.ownerAllianceBlason && (
  <AllianceBlason
    blason={{
      shape: planet.ownerAllianceBlason.shape as Blason['shape'],
      icon: planet.ownerAllianceBlason.icon as Blason['icon'],
      color1: planet.ownerAllianceBlason.color1,
      color2: planet.ownerAllianceBlason.color2,
    }}
    size={14}
    className="inline-block align-middle mr-1"
  />
)}
[{planet.allianceTag}]
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -s exec tsc --noEmit -p apps/api/tsconfig.json
pnpm -s exec tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 5: Manual verification**

- Open the galaxy
- Hover/click a planet owned by an alliance player
- Blason 14px shows next to the tag

- [ ] **Step 6: Commit + push**

```bash
git add apps/api apps/web
git commit -m "feat(alliance): blason next to alliance tag in galaxy

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 15: Update `docs/proposals/2026-04-21-alliance-improvements.md` — mark section 1 done

**Files:**
- Modify: `docs/proposals/2026-04-21-alliance-improvements.md`

- [ ] **Step 1: Remove section 1 entries (blason + devise)**

Delete the "Blason d'alliance" and "Bannière / devise" subsections under "## 1. Personnalisation visuelle". If the whole section 1 is now empty, delete the section heading too.

Update the priorities table: remove the "Blason + devise" row.

- [ ] **Step 2: Commit + push**

```bash
git add docs/proposals/2026-04-21-alliance-improvements.md
git commit -m "docs(alliance): mark blason + devise as shipped (section 1 done)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```
