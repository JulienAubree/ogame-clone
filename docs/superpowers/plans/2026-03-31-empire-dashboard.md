# Empire Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Empire dashboard at `/empire` showing all player planets with global KPIs, per-planet resource/activity status, and quick navigation shortcuts.

**Architecture:** Single new tRPC query `planet.empire` aggregates all planet data server-side (resources, production rates, build queues, fleet movements). Frontend renders a KPI bar + responsive card grid (cards on desktop, compact rows on mobile). Navigation added to Sidebar and BottomTabBar.

**Tech Stack:** React, tRPC, Drizzle ORM, Tailwind CSS, Lucide React, Zustand

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/src/modules/planet/planet.service.ts` | Add `getEmpireOverview` method |
| Modify | `apps/api/src/modules/planet/planet.router.ts` | Add `empire` procedure, accept new dependencies |
| Modify | `apps/api/src/trpc/app-router.ts` | Pass resourceService to planet router |
| Create | `apps/web/src/pages/Empire.tsx` | Page component assembling KPI bar + grid |
| Create | `apps/web/src/components/empire/EmpireKpiBar.tsx` | Global KPI metrics bar |
| Create | `apps/web/src/components/empire/EmpirePlanetCard.tsx` | Desktop planet card |
| Create | `apps/web/src/components/empire/EmpirePlanetRow.tsx` | Mobile compact planet row |
| Modify | `apps/web/src/lib/icons.tsx` | Add `EmpireIcon` |
| Modify | `apps/web/src/router.tsx` | Add `/empire` route |
| Modify | `apps/web/src/components/layout/Sidebar.tsx` | Add Empire nav section |
| Modify | `apps/web/src/components/layout/BottomTabBar.tsx` | Add Empire tab |

---

### Task 1: Backend — Empire query in planet service

**Files:**
- Modify: `apps/api/src/modules/planet/planet.service.ts`

- [ ] **Step 1: Add `getEmpireOverview` method to planet service**

The planet service needs access to `resourceService` and `db` for build queue / fleet queries. Since `db` and `gameConfigService` are already in scope via the closure, we only need `resourceService` passed in. Modify the factory to accept it as an optional dependency:

```typescript
// At the top, add imports:
import { buildQueue, fleetEvents } from '@exilium/db';

// Change the factory signature — add resourceService parameter:
export function createPlanetService(
  db: Database,
  gameConfigService: GameConfigService,
  assetsDir: string,
  resourceService?: { materializeResources(planetId: string, userId: string): Promise<any>; getProductionRates(planetId: string, planet: any, bonus?: any, userId?: string): Promise<any> },
) {
```

Then add the method at the end of the returned object (after `rename`):

```typescript
    async getEmpireOverview(userId: string) {
      const planetList = await this.listPlanets(userId);

      if (!resourceService) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'resourceService required for empire' });
      }

      const planetData = await Promise.all(
        planetList.map(async (planet) => {
          // Materialize resources to get up-to-date values
          const updated = await resourceService.materializeResources(planet.id, userId);

          // Get production rates
          const bonus = planet.planetClassId
            ? await db.select({
                mineraiBonus: planetTypes.mineraiBonus,
                siliciumBonus: planetTypes.siliciumBonus,
                hydrogeneBonus: planetTypes.hydrogeneBonus,
              }).from(planetTypes).where(eq(planetTypes.id, planet.planetClassId)).limit(1).then(r => r[0])
            : undefined;

          const rates = await resourceService.getProductionRates(planet.id, planet, bonus, userId);

          // Active build (building or research)
          const activeBuilds = await db
            .select({
              type: buildQueue.type,
              itemId: buildQueue.itemId,
              quantity: buildQueue.quantity,
              endTime: buildQueue.endTime,
            })
            .from(buildQueue)
            .where(and(eq(buildQueue.planetId, planet.id), eq(buildQueue.status, 'active')));

          const activeBuild = activeBuilds.find(b => b.type === 'building') ?? null;
          const activeResearch = activeBuilds.find(b => b.type === 'research') ?? null;

          // Outbound fleets from this planet
          const [outbound] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(fleetEvents)
            .where(and(
              eq(fleetEvents.originPlanetId, planet.id),
              eq(fleetEvents.userId, userId),
              eq(fleetEvents.status, 'active'),
            ));

          // Inbound attacks to this planet
          const inboundAttacks = await db
            .select({ arrivalTime: fleetEvents.arrivalTime })
            .from(fleetEvents)
            .where(and(
              eq(fleetEvents.targetPlanetId, planet.id),
              eq(fleetEvents.status, 'active'),
              eq(fleetEvents.mission, 'attack'),
              sql`${fleetEvents.userId} != ${userId}`,
            ))
            .orderBy(asc(fleetEvents.arrivalTime))
            .limit(1);

          return {
            id: planet.id,
            name: planet.name,
            galaxy: planet.galaxy,
            system: planet.system,
            position: planet.position,
            planetClassId: planet.planetClassId,
            planetImageIndex: planet.planetImageIndex,
            diameter: planet.diameter,
            minTemp: planet.minTemp,
            maxTemp: planet.maxTemp,
            minerai: Number(updated.minerai),
            silicium: Number(updated.silicium),
            hydrogene: Number(updated.hydrogene),
            mineraiPerHour: rates.mineraiPerHour,
            siliciumPerHour: rates.siliciumPerHour,
            hydrogenePerHour: rates.hydrogenePerHour,
            storageMineraiCapacity: rates.storageMineraiCapacity,
            storageSiliciumCapacity: rates.storageSiliciumCapacity,
            storageHydrogeneCapacity: rates.storageHydrogeneCapacity,
            energyProduced: rates.energyProduced,
            energyConsumed: rates.energyConsumed,
            activeBuild: activeBuild
              ? { buildingId: activeBuild.itemId, level: activeBuild.quantity, endTime: activeBuild.endTime.toISOString() }
              : null,
            activeResearch: activeResearch
              ? { researchId: activeResearch.itemId, level: activeResearch.quantity, endTime: activeResearch.endTime.toISOString() }
              : null,
            outboundFleetCount: outbound?.count ?? 0,
            inboundAttack: inboundAttacks[0]
              ? { arrivalTime: inboundAttacks[0].arrivalTime.toISOString() }
              : null,
          };
        }),
      );

      // Aggregate totals
      const totalRates = {
        mineraiPerHour: planetData.reduce((sum, p) => sum + p.mineraiPerHour, 0),
        siliciumPerHour: planetData.reduce((sum, p) => sum + p.siliciumPerHour, 0),
        hydrogenePerHour: planetData.reduce((sum, p) => sum + p.hydrogenePerHour, 0),
      };

      // Total active fleet movements for user
      const [fleetCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fleetEvents)
        .where(and(eq(fleetEvents.userId, userId), eq(fleetEvents.status, 'active')));

      const inboundAttackCount = planetData.filter(p => p.inboundAttack !== null).length;

      return {
        planets: planetData,
        totalRates,
        activeFleetCount: fleetCount?.count ?? 0,
        inboundAttackCount,
      };
    },
```

Note: add the missing imports at the top of the file:

```typescript
import { eq, asc, and, sql } from 'drizzle-orm';
import { planets, planetBuildings, planetTypes, buildQueue, fleetEvents } from '@exilium/db';
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/planet/planet.service.ts
git commit -m "feat(empire): add getEmpireOverview method to planet service"
```

---

### Task 2: Backend — Empire router and wiring

**Files:**
- Modify: `apps/api/src/modules/planet/planet.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Add empire procedure to planet router**

Replace the full content of `apps/api/src/modules/planet/planet.router.ts`:

```typescript
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

    rename: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        name: z.string().min(1).max(30),
      }))
      .mutation(async ({ ctx, input }) => {
        return planetService.rename(ctx.userId!, input.planetId, input.name);
      }),

    empire: protectedProcedure.query(async ({ ctx }) => {
      return planetService.getEmpireOverview(ctx.userId!);
    }),
  });
}
```

- [ ] **Step 2: Pass resourceService to createPlanetService in app-router.ts**

In `apps/api/src/trpc/app-router.ts`, the planetService is created before resourceService. We need to reorder so resourceService is created first, then pass it to planetService:

Find line:
```typescript
  const planetService = createPlanetService(db, gameConfigService, env.ASSETS_DIR);
  const resourceService = createResourceService(db, gameConfigService, dailyQuestService, talentService);
```

Replace with:
```typescript
  const resourceService = createResourceService(db, gameConfigService, dailyQuestService, talentService);
  const planetService = createPlanetService(db, gameConfigService, env.ASSETS_DIR, resourceService);
```

Note: `resourceService` depends on `dailyQuestService` and `talentService`, which are already created before it in the current file. So the reorder is safe.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/planet/planet.router.ts apps/api/src/trpc/app-router.ts
git commit -m "feat(empire): add empire query to planet router, wire dependencies"
```

---

### Task 3: Frontend — EmpireIcon

**Files:**
- Modify: `apps/web/src/lib/icons.tsx`

- [ ] **Step 1: Add EmpireIcon to icons.tsx**

Add the following export at the end of the file (Crown icon from Lucide):

```typescript
export function EmpireIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z" />
      <path d="M3 20h18" />
    </Icon>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/icons.tsx
git commit -m "feat(empire): add EmpireIcon to icon library"
```

---

### Task 4: Frontend — EmpirePlanetCard component

**Files:**
- Create: `apps/web/src/components/empire/EmpirePlanetCard.tsx`

- [ ] **Step 1: Create the EmpirePlanetCard component**

```typescript
import { useNavigate } from 'react-router';
import { Hammer, FlaskConical, Rocket, ShieldAlert, Check, Building2, Wrench, Layers, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { usePlanetStore } from '@/stores/planet.store';
import { Timer } from '@/components/common/Timer';

interface EmpirePlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  diameter: number;
  minerai: number;
  silicium: number;
  hydrogene: number;
  mineraiPerHour: number;
  siliciumPerHour: number;
  hydrogenePerHour: number;
  storageMineraiCapacity: number;
  storageSiliciumCapacity: number;
  storageHydrogeneCapacity: number;
  energyProduced: number;
  energyConsumed: number;
  activeBuild: { buildingId: string; level: number; endTime: string } | null;
  activeResearch: { researchId: string; level: number; endTime: string } | null;
  outboundFleetCount: number;
  inboundAttack: { arrivalTime: string } | null;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpirePlanetCard({ planet, isFirst }: { planet: EmpirePlanet; isFirst: boolean }) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const hasAttack = !!planet.inboundAttack;

  const goTo = (path: string) => {
    setActivePlanet(planet.id);
    navigate(path);
  };

  const resources = [
    { label: 'Fe', value: planet.minerai, max: planet.storageMineraiCapacity, rate: planet.mineraiPerHour, color: 'text-minerai', fill: 'bg-minerai' },
    { label: 'Si', value: planet.silicium, max: planet.storageSiliciumCapacity, rate: planet.siliciumPerHour, color: 'text-silicium', fill: 'bg-silicium' },
    { label: 'H', value: planet.hydrogene, max: planet.storageHydrogeneCapacity, rate: planet.hydrogenePerHour, color: 'text-hydrogene', fill: 'bg-hydrogene' },
  ];

  const hasActivity = planet.activeBuild || planet.activeResearch || planet.outboundFleetCount > 0 || hasAttack;

  return (
    <div className={cn(
      'rounded-xl border bg-card/80 overflow-hidden transition-colors',
      hasAttack
        ? 'border-destructive/25 hover:border-destructive/60 hover:shadow-lg hover:shadow-destructive/10'
        : 'border-border/50 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5',
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5 pb-2.5">
        {planet.planetClassId && planet.planetImageIndex != null ? (
          <img
            src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
            alt={planet.name}
            className={cn('h-11 w-11 rounded-full border-2 object-cover', hasAttack ? 'border-destructive/40' : 'border-border/50')}
          />
        ) : (
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-full border-2 bg-muted font-semibold text-muted-foreground', hasAttack ? 'border-destructive/40' : 'border-border/50')}>
            {planet.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{planet.name}</div>
          <div className="text-xs text-muted-foreground">
            [{planet.galaxy}:{planet.system}:{planet.position}] · {planet.diameter.toLocaleString('fr-FR')} km
          </div>
        </div>
        <span className={cn(
          'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium',
          isFirst ? 'bg-primary/15 text-primary' : 'bg-purple-500/15 text-purple-400',
        )}>
          {isFirst ? 'Capitale' : 'Colonie'}
        </span>
      </div>

      {/* Resource bars */}
      <div className="flex flex-col gap-1.5 px-3.5 pb-2.5">
        {resources.map((r) => {
          const pct = r.max > 0 ? Math.min(100, (r.value / r.max) * 100) : 0;
          const isFull = pct > 95;
          return (
            <div key={r.label} className="flex items-center gap-2">
              <span className={cn('w-4 text-center text-[10px] font-bold', r.color)}>{r.label}</span>
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', r.fill, isFull && 'animate-pulse')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={cn('w-16 text-right text-xs', r.color)}>+{formatRate(r.rate)}/h</span>
            </div>
          );
        })}
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
        {planet.activeBuild && (
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            <Hammer className="h-3 w-3" />
            <span>{planet.activeBuild.buildingId} Nv.{planet.activeBuild.level}</span>
            <Timer endTime={new Date(planet.activeBuild.endTime)} className="inline [&>span]:text-energy" />
          </div>
        )}
        {planet.activeResearch && (
          <div className="flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[11px] text-purple-400">
            <FlaskConical className="h-3 w-3" />
            <span>Recherche</span>
            <Timer endTime={new Date(planet.activeResearch.endTime)} className="inline [&>span]:text-purple-400" />
          </div>
        )}
        {planet.outboundFleetCount > 0 && (
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
            <Rocket className="h-3 w-3" />
            <span>{planet.outboundFleetCount} flotte{planet.outboundFleetCount > 1 ? 's' : ''}</span>
          </div>
        )}
        {hasAttack && (
          <div className="flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            <ShieldAlert className="h-3 w-3" />
            <span>Attaque</span>
            <Timer endTime={new Date(planet.inboundAttack!.arrivalTime)} className="inline [&>span]:text-destructive" />
          </div>
        )}
        {planet.energyConsumed > planet.energyProduced && !hasAttack && (
          <div className="flex items-center gap-1 rounded-md border border-energy/20 bg-energy/10 px-2 py-1 text-[11px] text-energy">
            ⚡ Déficit énergie
          </div>
        )}
        {!hasActivity && planet.energyConsumed <= planet.energyProduced && (
          <div className="flex items-center gap-1 rounded-md border border-green-500/20 bg-green-500/10 px-2 py-1 text-[11px] text-green-500">
            <Check className="h-3 w-3" />
            <span>Aucune activité</span>
          </div>
        )}
      </div>

      {/* Nav shortcuts */}
      <div className="flex border-t border-border/30">
        {[
          { label: 'Bâtiments', icon: Building2, path: '/buildings' },
          { label: 'Chantier', icon: Wrench, path: '/shipyard' },
          { label: 'Flottes', icon: Layers, path: '/fleet' },
          { label: 'Défenses', icon: Shield, path: '/defense' },
        ].map((item, i, arr) => (
          <button
            key={item.path}
            onClick={() => goTo(item.path)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary',
              i < arr.length - 1 && 'border-r border-border/30',
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/empire/EmpirePlanetCard.tsx
git commit -m "feat(empire): create EmpirePlanetCard component"
```

---

### Task 5: Frontend — EmpirePlanetRow component (mobile)

**Files:**
- Create: `apps/web/src/components/empire/EmpirePlanetRow.tsx`

- [ ] **Step 1: Create the EmpirePlanetRow component**

```typescript
import { useNavigate } from 'react-router';
import { Hammer, FlaskConical, ShieldAlert, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { usePlanetStore } from '@/stores/planet.store';
import { Timer } from '@/components/common/Timer';

interface EmpirePlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  mineraiPerHour: number;
  siliciumPerHour: number;
  hydrogenePerHour: number;
  activeBuild: { buildingId: string; level: number; endTime: string } | null;
  activeResearch: { researchId: string; level: number; endTime: string } | null;
  inboundAttack: { arrivalTime: string } | null;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpirePlanetRow({ planet, isFirst, isLast }: { planet: EmpirePlanet; isFirst: boolean; isLast: boolean }) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);

  const handleClick = () => {
    setActivePlanet(planet.id);
    navigate('/');
  };

  // Priority badge: attack > build > research
  const badge = planet.inboundAttack
    ? { icon: ShieldAlert, label: 'Attaque', endTime: planet.inboundAttack.arrivalTime, className: 'text-destructive' }
    : planet.activeBuild
      ? { icon: Hammer, label: planet.activeBuild.buildingId, endTime: planet.activeBuild.endTime, className: 'text-energy' }
      : planet.activeResearch
        ? { icon: FlaskConical, label: 'Recherche', endTime: planet.activeResearch.endTime, className: 'text-purple-400' }
        : null;

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-3 border border-border/50 bg-card/80 p-3 text-left transition-colors hover:bg-accent/30 touch-feedback',
        !isFirst && 'border-t-0',
        isFirst && 'rounded-t-xl',
        isLast && 'rounded-b-xl',
      )}
    >
      {/* Planet image */}
      {planet.planetClassId && planet.planetImageIndex != null ? (
        <img
          src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'icon')}
          alt={planet.name}
          className="h-9 w-9 rounded-full border border-border/50 object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-muted text-xs font-semibold text-muted-foreground">
          {planet.name.charAt(0)}
        </div>
      )}

      {/* Name + coords + badge */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{planet.name}</div>
        <div className="text-xs text-muted-foreground">[{planet.galaxy}:{planet.system}:{planet.position}]</div>
        {badge && (
          <div className={cn('mt-0.5 flex items-center gap-1 text-[11px]', badge.className)}>
            <badge.icon className="h-3 w-3" />
            <Timer endTime={new Date(badge.endTime)} className="inline" />
          </div>
        )}
      </div>

      {/* Production rates */}
      <div className="flex flex-col items-end gap-0.5 text-xs font-medium">
        <span className="text-minerai">+{formatRate(planet.mineraiPerHour)}</span>
        <span className="text-silicium">+{formatRate(planet.siliciumPerHour)}</span>
        <span className="text-hydrogene">+{formatRate(planet.hydrogenePerHour)}</span>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30" />
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/empire/EmpirePlanetRow.tsx
git commit -m "feat(empire): create EmpirePlanetRow component for mobile"
```

---

### Task 6: Frontend — EmpireKpiBar component

**Files:**
- Create: `apps/web/src/components/empire/EmpireKpiBar.tsx`

- [ ] **Step 1: Create the EmpireKpiBar component**

```typescript
import { Pickaxe, Gem, Droplets, Globe, Rocket, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmpireKpiBarProps {
  totalRates: { mineraiPerHour: number; siliciumPerHour: number; hydrogenePerHour: number };
  planetCount: number;
  activeFleetCount: number;
  inboundAttackCount: number;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpireKpiBar({ totalRates, planetCount, activeFleetCount, inboundAttackCount }: EmpireKpiBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/30 bg-card/60 p-3 lg:gap-6 lg:p-4">
      {/* Resource KPIs */}
      <Kpi icon={Pickaxe} iconBg="bg-minerai/10" color="text-minerai" value={`${formatRate(totalRates.mineraiPerHour)}/h`} label="Minerai total" />
      <Kpi icon={Gem} iconBg="bg-silicium/10" color="text-silicium" value={`${formatRate(totalRates.siliciumPerHour)}/h`} label="Silicium total" />
      <Kpi icon={Droplets} iconBg="bg-hydrogene/10" color="text-hydrogene" value={`${formatRate(totalRates.hydrogenePerHour)}/h`} label="Hydrogène total" />

      {/* Separator */}
      <div className="hidden h-7 w-px bg-border/50 lg:block" />

      {/* Counters */}
      <Kpi icon={Globe} iconBg="bg-muted" color="text-foreground" value={String(planetCount)} label="Planètes" />
      <Kpi icon={Rocket} iconBg="bg-primary/10" color="text-primary" value={String(activeFleetCount)} label="Flottes en vol" />

      {/* Attack alert */}
      {inboundAttackCount > 0 && (
        <div className="ml-auto flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive animate-pulse">
          <ShieldAlert className="h-4 w-4" />
          {inboundAttackCount} attaque{inboundAttackCount > 1 ? 's' : ''} en cours
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, iconBg, color, value, label }: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBg)}>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <div>
        <div className={cn('text-sm font-bold', color)}>{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/empire/EmpireKpiBar.tsx
git commit -m "feat(empire): create EmpireKpiBar component"
```

---

### Task 7: Frontend — Empire page

**Files:**
- Create: `apps/web/src/pages/Empire.tsx`

- [ ] **Step 1: Create the Empire page component**

```typescript
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { EmpireKpiBar } from '@/components/empire/EmpireKpiBar';
import { EmpirePlanetCard } from '@/components/empire/EmpirePlanetCard';
import { EmpirePlanetRow } from '@/components/empire/EmpirePlanetRow';

export default function Empire() {
  const { data, isLoading } = trpc.planet.empire.useQuery();

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title="Empire" description="Vue d'ensemble de vos colonies" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Empire" description="Vue d'ensemble de vos colonies" />

      <EmpireKpiBar
        totalRates={data.totalRates}
        planetCount={data.planets.length}
        activeFleetCount={data.activeFleetCount}
        inboundAttackCount={data.inboundAttackCount}
      />

      {/* Desktop grid */}
      <div className="hidden lg:grid lg:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] lg:gap-4">
        {data.planets.map((planet, i) => (
          <EmpirePlanetCard key={planet.id} planet={planet} isFirst={i === 0} />
        ))}
      </div>

      {/* Mobile list */}
      <div className="lg:hidden">
        {data.planets.map((planet, i) => (
          <EmpirePlanetRow
            key={planet.id}
            planet={planet}
            isFirst={i === 0}
            isLast={i === data.planets.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/Empire.tsx
git commit -m "feat(empire): create Empire page"
```

---

### Task 8: Frontend — Route and navigation

**Files:**
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/layout/BottomTabBar.tsx`

- [ ] **Step 1: Add route in router.tsx**

In `apps/web/src/router.tsx`, add the empire route inside the authenticated children array, after the index route:

```typescript
      {
        path: 'empire',
        lazy: lazyLoad(() => import('./pages/Empire')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
```

Place it right after the `index: true` block (line ~67).

- [ ] **Step 2: Add Empire section to Sidebar.tsx**

In `apps/web/src/components/layout/Sidebar.tsx`:

1. Add the import:
```typescript
import { EmpireIcon } from '@/lib/icons';
```

Add it to the existing import from `@/lib/icons`.

2. Add a new section at the beginning of the `sections` array (before 'Planète'):

```typescript
  {
    title: 'Empire',
    items: [
      { label: 'Empire', path: '/empire', icon: EmpireIcon },
    ],
  },
```

- [ ] **Step 3: Add Empire tab to BottomTabBar.tsx**

In `apps/web/src/components/layout/BottomTabBar.tsx`:

1. Add the import:
```typescript
import { EmpireIcon } from '@/lib/icons';
```

Add it to the existing import from `@/lib/icons`.

2. Add `/empire` to TAB_GROUPS:
```typescript
const TAB_GROUPS = {
  empire: ['/empire'],
  planete: ['/', '/energy', '/buildings', '/research'],
  production: ['/shipyard', '/command-center', '/defense'],
  espace: ['/galaxy', '/fleet', '/missions', '/market', '/flagship'],
  social: ['/messages', '/alliance', '/ranking', '/alliance-ranking'],
};
```

3. Add the empire sheet items to SHEET_ITEMS:
```typescript
  empire: [
    { label: 'Empire', path: '/empire', icon: EmpireIcon },
  ],
```

4. Add the empire tab as the first item in the `tabs` array inside the component:
```typescript
    { id: 'empire' as const, label: 'Empire', icon: EmpireIcon, action: () => navigate('/empire') },
```

Note: empire navigates directly (no sheet needed since it has only one item), so use `navigate('/empire')` instead of `toggleSheet('empire')`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/BottomTabBar.tsx
git commit -m "feat(empire): add route and navigation (sidebar + bottom tab)"
```

---

### Task 9: TypeScript verification

- [ ] **Step 1: Run TypeScript compilation check**

```bash
cd apps/api && npx tsc --noEmit
cd ../../apps/web && npx tsc --noEmit
```

Fix any type errors found. Common issues to watch for:
- `sql` import might need to come from `drizzle-orm`
- `planetTypes` table import from `@exilium/db`
- The `EmpirePlanet` interface used in both card components should match the backend return type

- [ ] **Step 2: Commit fixes if any**

```bash
git add -A && git commit -m "fix(empire): resolve TypeScript errors"
```
