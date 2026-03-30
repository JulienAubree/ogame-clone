# Refactoring Combat + Debris Atomique + Logs Alliance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger la race condition debris, extraire la logique combat partagée dans un helper, et remplacer les system messages alliance par des notifications SSE visibles sur la page Alliance (officiers uniquement).

**Architecture:** Le debris upsert utilise `onConflictDoUpdate` atomique. La logique combat dupliquée (~200 lignes) est extraite dans `combat.helpers.ts`. Les 3 `createSystemMessage` d'alliance sont remplacés par des `publishNotification` SSE avec un nouveau type `alliance-activity`, affiché dans un log sur la page Alliance côté officiers.

**Tech Stack:** TypeScript, Drizzle ORM (`onConflictDoUpdate`, `sql`), game-engine (`simulateCombat`, `computeFleetFP`), SSE via Redis Pub/Sub, React (tRPC)

---

## File Map

| Action | File | Responsabilité |
|--------|------|----------------|
| Create | `apps/api/src/modules/fleet/combat.helpers.ts` | Helper partagé : combat setup, simulation, loss application, debris, FP, shots, report data |
| Modify | `apps/api/src/modules/fleet/handlers/attack.handler.ts` | Remplacer combat inline par appel au helper |
| Modify | `apps/api/src/modules/fleet/handlers/spy.handler.ts` | Remplacer combat inline par appel au helper |
| Modify | `apps/api/src/modules/alliance/alliance.service.ts` | Remplacer `createSystemMessage` par `publishNotification` SSE |
| Modify | `apps/web/src/hooks/useNotifications.ts` | Ajouter case `alliance-activity` |
| Modify | `apps/web/src/pages/Alliance.tsx` | Ajouter section log d'activité (officiers) |
| Modify | `apps/api/src/modules/alliance/alliance.router.ts` | Ajouter query `activityLog` |

---

### Task 1: Debris upsert atomique dans attack.handler.ts

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/attack.handler.ts:281-313`

- [ ] **Step 1: Remplacer le bloc SELECT-then-UPDATE/INSERT par un upsert atomique**

Le bloc actuel (lignes 282-313) fait un SELECT puis UPDATE ou INSERT. Remplacer par :

```typescript
    // Create/accumulate debris field (atomic upsert)
    if (debris.minerai > 0 || debris.silicium > 0) {
      await ctx.db.insert(debrisFields).values({
        galaxy: fleetEvent.targetGalaxy,
        system: fleetEvent.targetSystem,
        position: fleetEvent.targetPosition,
        minerai: String(debris.minerai),
        silicium: String(debris.silicium),
      }).onConflictDoUpdate({
        target: [debrisFields.galaxy, debrisFields.system, debrisFields.position],
        set: {
          minerai: sql`${debrisFields.minerai}::numeric + ${String(debris.minerai)}::numeric`,
          silicium: sql`${debrisFields.silicium}::numeric + ${String(debris.silicium)}::numeric`,
          updatedAt: new Date(),
        },
      });
    }
```

Note : l'import `sql` est déjà présent ligne 1 (`import { eq, and, sql } from 'drizzle-orm'`). L'index unique `debris_fields_coords_idx` sur `(galaxy, system, position)` existe déjà dans le schema.

- [ ] **Step 2: Vérifier que le build compile**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: Pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/attack.handler.ts
git commit -m "fix: atomic debris upsert in attack handler (race condition)"
```

---

### Task 2: Debris upsert atomique dans spy.handler.ts

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/spy.handler.ts:318-349`

- [ ] **Step 1: Ajouter import `sql` et remplacer le bloc debris**

Ajouter `sql` à l'import drizzle-orm ligne 1 :
```typescript
import { eq, and, sql } from 'drizzle-orm';
```

Remplacer le bloc debris (lignes 318-349) par :

```typescript
      // Create/accumulate debris field (atomic upsert)
      if (debris.minerai > 0 || debris.silicium > 0) {
        await ctx.db.insert(debrisFields).values({
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
          minerai: String(debris.minerai),
          silicium: String(debris.silicium),
        }).onConflictDoUpdate({
          target: [debrisFields.galaxy, debrisFields.system, debrisFields.position],
          set: {
            minerai: sql`${debrisFields.minerai}::numeric + ${String(debris.minerai)}::numeric`,
            silicium: sql`${debrisFields.silicium}::numeric + ${String(debris.silicium)}::numeric`,
            updatedAt: new Date(),
          },
        });
      }
```

- [ ] **Step 2: Vérifier que le build compile**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: Pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/spy.handler.ts
git commit -m "fix: atomic debris upsert in spy handler (race condition)"
```

---

### Task 3: Créer combat.helpers.ts — le helper partagé

**Files:**
- Create: `apps/api/src/modules/fleet/combat.helpers.ts`

Ce fichier exporte les fonctions partagées entre attack et spy handlers. Il ne gère PAS le pillage (spécifique à attack), ni les reports (chaque handler construit ses propres titres/payloads).

- [ ] **Step 1: Créer le fichier avec les types et fonctions partagées**

```typescript
import { eq, and, sql } from 'drizzle-orm';
import { planetShips, planetDefenses, debrisFields, users } from '@exilium/db';
import { simulateCombat, computeFleetFP } from '@exilium/game-engine';
import type { CombatConfig, ShipCategory, CombatInput, RoundResult, UnitCombatStats, FPConfig, ShipCombatConfig } from '@exilium/game-engine';
import type { Database } from '@exilium/db';
import type { GameConfig, MissionHandlerContext, FleetEvent } from './fleet.types.js';
import { buildShipCombatConfigs, buildShipCosts, getCombatMultipliers } from './fleet.types.js';

// ── Shared combat categories ──

export const COMBAT_CATEGORIES: ShipCategory[] = [
  { id: 'light', name: 'Léger', targetable: true, targetOrder: 1 },
  { id: 'medium', name: 'Moyen', targetable: true, targetOrder: 2 },
  { id: 'heavy', name: 'Lourd', targetable: true, targetOrder: 3 },
  { id: 'support', name: 'Support', targetable: false, targetOrder: 4 },
];

// ── Build CombatConfig from universe config ──

export function buildCombatConfig(config: GameConfig, overrides?: Partial<CombatConfig>): CombatConfig {
  return {
    maxRounds: Number(config.universe['combat_max_rounds']) || 4,
    debrisRatio: Number(config.universe['combat_debris_ratio']) || 0.3,
    defenseRepairRate: Number(config.universe['combat_defense_repair_rate']) || 0.7,
    pillageRatio: Number(config.universe['combat_pillage_ratio']) || 0.33,
    minDamagePerHit: Number(config.universe['combat_min_damage_per_hit']) || 1,
    researchBonusPerLevel: Number(config.universe['combat_research_bonus_per_level']) || 0.1,
    categories: COMBAT_CATEGORIES,
    ...overrides,
  };
}

// ── Parse DB row to unit map (skip planetId, keep only positive numbers) ──

export function parseUnitRow(row: Record<string, unknown> | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  if (!row) return map;
  for (const [key, val] of Object.entries(row)) {
    if (key === 'planetId') continue;
    if (typeof val === 'number' && val > 0) map[key] = val;
  }
  return map;
}

// ── Compute multipliers with defense bonus ──

export async function computeCombatMultipliers(
  ctx: MissionHandlerContext,
  config: GameConfig,
  attackerUserId: string,
  defenderUserId: string,
  defenderPlanetId?: string,
): Promise<{
  attackerMultipliers: { weapons: number; shielding: number; armor: number };
  defenderMultipliers: { weapons: number; shielding: number; armor: number };
  attackerTalentCtx: Record<string, number>;
  defenderTalentCtx: Record<string, number>;
}> {
  const attackerTalentCtx = ctx.talentService
    ? await ctx.talentService.computeTalentContext(attackerUserId)
    : {};
  const defenderTalentCtx = ctx.talentService
    ? await ctx.talentService.computeTalentContext(defenderUserId, defenderPlanetId)
    : {};

  const attackerMultipliers = await getCombatMultipliers(ctx.db, attackerUserId, config.bonuses, attackerTalentCtx);
  const defenderMultipliers = await getCombatMultipliers(ctx.db, defenderUserId, config.bonuses, defenderTalentCtx);

  // Defense strength bonus (planet defense talent)
  const defenseBonus = 1 + (defenderTalentCtx['defense_strength'] ?? 0);
  defenderMultipliers.weapons *= defenseBonus;
  defenderMultipliers.shielding *= defenseBonus;
  defenderMultipliers.armor *= defenseBonus;

  return { attackerMultipliers, defenderMultipliers, attackerTalentCtx, defenderTalentCtx };
}

// ── Apply defender losses to DB ──

export async function applyDefenderLosses(
  db: Database,
  planetId: string,
  defShipsRow: Record<string, unknown> | undefined,
  defDefsRow: Record<string, unknown> | undefined,
  defenderLosses: Record<string, number>,
  repairedDefenses: Record<string, number>,
): Promise<void> {
  if (defShipsRow) {
    const shipUpdates: Record<string, number> = {};
    for (const [key, val] of Object.entries(defShipsRow)) {
      if (key === 'planetId') continue;
      const lost = defenderLosses[key] ?? 0;
      if (lost > 0) shipUpdates[key] = Math.max(0, Number(val) - lost);
    }
    if (Object.keys(shipUpdates).length > 0) {
      await db.update(planetShips).set(shipUpdates).where(eq(planetShips.planetId, planetId));
    }
  }

  if (defDefsRow) {
    const defUpdates: Record<string, number> = {};
    for (const [key, val] of Object.entries(defDefsRow)) {
      if (key === 'planetId') continue;
      const lost = defenderLosses[key] ?? 0;
      const repaired = repairedDefenses[key] ?? 0;
      const netLoss = lost - repaired;
      if (netLoss > 0) defUpdates[key] = Math.max(0, Number(val) - netLoss);
    }
    if (Object.keys(defUpdates).length > 0) {
      await db.update(planetDefenses).set(defUpdates).where(eq(planetDefenses.planetId, planetId));
    }
  }
}

// ── Atomic debris upsert ──

export async function upsertDebris(
  db: Database,
  galaxy: number,
  system: number,
  position: number,
  debris: { minerai: number; silicium: number },
): Promise<void> {
  if (debris.minerai <= 0 && debris.silicium <= 0) return;
  await db.insert(debrisFields).values({
    galaxy,
    system,
    position,
    minerai: String(debris.minerai),
    silicium: String(debris.silicium),
  }).onConflictDoUpdate({
    target: [debrisFields.galaxy, debrisFields.system, debrisFields.position],
    set: {
      minerai: sql`${debrisFields.minerai}::numeric + ${String(debris.minerai)}::numeric`,
      silicium: sql`${debrisFields.silicium}::numeric + ${String(debris.silicium)}::numeric`,
      updatedAt: new Date(),
    },
  });
}

// ── Compute FP for both sides ──

export function computeBothFP(
  config: GameConfig,
  attackerFleet: Record<string, number>,
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number>,
  shipCombatConfigs: Record<string, ShipCombatConfig>,
): { attackerFP: number; defenderFP: number } {
  const unitCombatStats: Record<string, UnitCombatStats> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    unitCombatStats[id] = { weapons: ship.weapons, shotCount: ship.shotCount ?? 1, shield: ship.shield, hull: ship.hull };
  }
  for (const [id, def] of Object.entries(config.defenses)) {
    unitCombatStats[id] = { weapons: def.weapons, shotCount: def.shotCount ?? 1, shield: def.shield, hull: def.hull };
  }
  // Include flagship in FP calculation if present
  if (shipCombatConfigs['flagship']) {
    const fc = shipCombatConfigs['flagship'];
    unitCombatStats['flagship'] = { weapons: fc.baseWeaponDamage, shotCount: fc.baseShotCount, shield: fc.baseShield, hull: fc.baseHull };
  }
  const fpConfig: FPConfig = {
    shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
    divisor: Number(config.universe.fp_divisor) || 100,
  };
  const attackerFP = computeFleetFP(attackerFleet, unitCombatStats, fpConfig);
  const defenderCombined: Record<string, number> = { ...defenderFleet, ...defenderDefenses };
  const defenderFP = computeFleetFP(defenderCombined, unitCombatStats, fpConfig);
  return { attackerFP, defenderFP };
}

// ── Compute shots per round ──

export function computeShotsPerRound(
  config: GameConfig,
  attackerFleet: Record<string, number>,
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number>,
  rounds: RoundResult[],
): Array<{ attacker: number; defender: number }> {
  return rounds.map((_round, i) => {
    const attFleet = i === 0 ? attackerFleet : rounds[i - 1].attackerShips;
    const defFleetRound = i === 0 ? { ...defenderFleet, ...defenderDefenses } : rounds[i - 1].defenderShips;
    const attShots = Object.entries(attFleet).reduce((sum, [id, count]) => {
      const sc = config.ships[id]?.shotCount ?? config.defenses[id]?.shotCount ?? 1;
      return sum + count * sc;
    }, 0);
    const defShots = Object.entries(defFleetRound).reduce((sum, [id, count]) => {
      const sc = config.ships[id]?.shotCount ?? config.defenses[id]?.shotCount ?? 1;
      return sum + count * sc;
    }, 0);
    return { attacker: attShots, defender: defShots };
  });
}

// ── Compute survivor ships (attacker side) ──

export function computeAttackerSurvivors(
  fleet: Record<string, number>,
  attackerLosses: Record<string, number>,
): Record<string, number> {
  const surviving: Record<string, number> = { ...fleet };
  for (const [type, lost] of Object.entries(attackerLosses)) {
    surviving[type] = (surviving[type] ?? 0) - lost;
    if (surviving[type] <= 0) delete surviving[type];
  }
  return surviving;
}

// ── Compute defender survivors ──

export function computeDefenderSurvivors(
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number>,
  defenderLosses: Record<string, number>,
  repairedDefenses: Record<string, number>,
): Record<string, number> {
  const combined: Record<string, number> = { ...defenderFleet, ...defenderDefenses };
  const survivors: Record<string, number> = {};
  for (const [type, count] of Object.entries(combined)) {
    const remaining = count - (defenderLosses[type] ?? 0) + (repairedDefenses[type] ?? 0);
    if (remaining > 0) survivors[type] = remaining;
  }
  return survivors;
}

// ── Fetch usernames ──

export async function fetchUsernames(
  db: Database,
  attackerUserId: string,
  defenderUserId: string,
): Promise<{ attackerUsername: string; defenderUsername: string }> {
  const [[attackerUser], [defenderUser]] = await Promise.all([
    db.select({ username: users.username }).from(users).where(eq(users.id, attackerUserId)).limit(1),
    db.select({ username: users.username }).from(users).where(eq(users.id, defenderUserId)).limit(1),
  ]);
  return {
    attackerUsername: attackerUser?.username ?? 'Inconnu',
    defenderUsername: defenderUser?.username ?? 'Inconnu',
  };
}

// ── Build combat report data ──

export function buildCombatReportData(params: {
  outcome: 'attacker' | 'defender' | 'draw';
  attackerUsername: string;
  defenderUsername: string;
  targetPlanetName: string;
  attackerFleet: Record<string, number>;
  defenderFleet: Record<string, number>;
  defenderDefenses: Record<string, number>;
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
  attackerSurvivors: Record<string, number>;
  repairedDefenses: Record<string, number>;
  debris: { minerai: number; silicium: number };
  rounds: RoundResult[];
  attackerStats?: unknown;
  defenderStats?: unknown;
  attackerFP: number;
  defenderFP: number;
  shotsPerRound: Array<{ attacker: number; defender: number }>;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    outcome: params.outcome,
    perspective: 'attacker' as const,
    attackerUsername: params.attackerUsername,
    defenderUsername: params.defenderUsername,
    targetPlanetName: params.targetPlanetName,
    roundCount: params.rounds.length,
    attackerFleet: params.attackerFleet,
    attackerLosses: params.attackerLosses,
    attackerSurvivors: params.attackerSurvivors,
    defenderFleet: params.defenderFleet,
    defenderDefenses: params.defenderDefenses,
    defenderLosses: params.defenderLosses,
    defenderSurvivors: computeDefenderSurvivors(
      params.defenderFleet,
      params.defenderDefenses,
      params.defenderLosses,
      params.repairedDefenses,
    ),
    repairedDefenses: params.repairedDefenses,
    debris: params.debris,
    rounds: params.rounds,
    attackerStats: params.attackerStats,
    defenderStats: params.defenderStats,
    attackerFP: params.attackerFP,
    defenderFP: params.defenderFP,
    shotsPerRound: params.shotsPerRound,
    ...params.extra,
  };
}

// ── Outcome text helpers ──

export function outcomeText(outcome: 'attacker' | 'defender' | 'draw'): string {
  return outcome === 'attacker' ? 'Victoire' : outcome === 'defender' ? 'Défaite' : 'Match nul';
}

export function defenderOutcome(outcome: 'attacker' | 'defender' | 'draw'): string {
  return outcome === 'attacker' ? 'Défaite' : outcome === 'defender' ? 'Victoire' : 'Match nul';
}
```

- [ ] **Step 2: Vérifier que le build compile**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: Pas d'erreur (fichier importé nulle part encore)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/fleet/combat.helpers.ts
git commit -m "feat: add shared combat helpers (debris upsert, FP, losses, report data)"
```

---

### Task 4: Refactorer attack.handler.ts pour utiliser combat.helpers.ts

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/attack.handler.ts`

- [ ] **Step 1: Remplacer les imports et le code inline par les helpers**

Remplacer les imports lignes 1-8 :
```typescript
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, users } from '@exilium/db';
import { simulateCombat, totalCargoCapacity } from '@exilium/game-engine';
import type { CombatInput } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, buildShipCombatConfigs, buildShipCosts } from '../fleet.types.js';
import { publishNotification } from '../../notification/notification.publisher.js';
import {
  buildCombatConfig,
  parseUnitRow,
  computeCombatMultipliers,
  applyDefenderLosses,
  upsertDebris,
  computeBothFP,
  computeShotsPerRound,
  computeAttackerSurvivors,
  buildCombatReportData,
  fetchUsernames,
  outcomeText,
  defenderOutcome,
} from '../combat.helpers.js';
```

Supprimer l'import de `debrisFields` (plus utilisé directement), `computeFleetFP`, et les types `CombatConfig, ShipCategory, RoundResult, UnitCombatStats, FPConfig`.

Remplacer le corps de `processArrival` à partir de la ligne 42 (après le early return pour `!targetPlanet`). Le nouveau code :

```typescript
    // Config and combat setup
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const shipCombatConfigs = buildShipCombatConfigs(config);
    const shipCostsMap = buildShipCosts(config);
    const shipIdSet = new Set(Object.keys(config.ships));
    const defenseIdSet = new Set(Object.keys(config.defenses));

    // Inject flagship combat config if flagship is in the fleet
    if (ships['flagship'] && ships['flagship'] > 0 && ctx.flagshipService) {
      const flagship = await ctx.flagshipService.get(fleetEvent.userId);
      if (flagship) {
        shipStatsMap['flagship'] = {
          baseSpeed: flagship.baseSpeed,
          fuelConsumption: flagship.fuelConsumption,
          cargoCapacity: flagship.cargoCapacity,
          driveType: flagship.driveType as import('@exilium/game-engine').ShipStats['driveType'],
          miningExtraction: 0,
        };
        shipCombatConfigs['flagship'] = {
          shipType: 'flagship',
          categoryId: flagship.combatCategoryId ?? 'support',
          baseShield: flagship.shield,
          baseArmor: flagship.baseArmor ?? 0,
          baseHull: flagship.hull,
          baseWeaponDamage: flagship.weapons,
          baseShotCount: flagship.shotCount ?? 1,
        };
        shipCostsMap['flagship'] = { minerai: 0, silicium: 0 };
        shipIdSet.add('flagship');
      }
    }

    const combatConfig = buildCombatConfig(config);

    // ... (targetPlanet fetch + no-planet early return restent identiques, lignes 92-138)

    const { attackerUsername, defenderUsername } = await fetchUsernames(ctx.db, fleetEvent.userId, targetPlanet.userId);
    const targetPlanetName = targetPlanet.name;

    const [defShipsRow] = await ctx.db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
    const [defDefsRow] = await ctx.db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);

    const defenderFleet = parseUnitRow(defShipsRow);
    const defenderDefenses = parseUnitRow(defDefsRow);

    const { attackerMultipliers, defenderMultipliers, defenderTalentCtx } = await computeCombatMultipliers(
      ctx, config, fleetEvent.userId, targetPlanet.userId, targetPlanet.id,
    );

    const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                         Object.values(defenderDefenses).some(v => v > 0);

    let outcome: 'attacker' | 'defender' | 'draw';
    let attackerLosses: Record<string, number> = {};
    let defenderLosses: Record<string, number> = {};
    let debris = { minerai: 0, silicium: 0 };
    let repairedDefenses: Record<string, number> = {};
    let rounds: import('@exilium/game-engine').RoundResult[] = [];
    let result: ReturnType<typeof simulateCombat> | undefined;

    if (!hasDefenders) {
      outcome = 'attacker';
    } else {
      const combatInput: CombatInput = {
        attackerFleet: ships,
        defenderFleet,
        defenderDefenses,
        attackerMultipliers,
        defenderMultipliers,
        attackerTargetPriority: fleetEvent.targetPriority ?? 'light',
        defenderTargetPriority: 'light',
        combatConfig,
        shipConfigs: shipCombatConfigs,
        shipCosts: shipCostsMap,
        shipIds: shipIdSet,
        defenseIds: defenseIdSet,
      };
      result = simulateCombat(combatInput);
      outcome = result.outcome;
      attackerLosses = result.attackerLosses;
      defenderLosses = result.defenderLosses;
      debris = result.debris;
      repairedDefenses = result.repairedDefenses;
      rounds = result.rounds;
    }

    // Apply attacker losses + handle flagship incapacitation
    const survivingShips: Record<string, number> = { ...ships };
    let flagshipDestroyed = false;
    for (const [type, lost] of Object.entries(attackerLosses)) {
      if (type === 'flagship' && lost > 0) {
        if (ctx.flagshipService) await ctx.flagshipService.incapacitate(fleetEvent.userId);
        if (ctx.redis) {
          publishNotification(ctx.redis, fleetEvent.userId, {
            type: 'flagship-incapacitated',
            payload: { coords, mission: 'attack' },
          });
        }
        flagshipDestroyed = true;
        delete survivingShips['flagship'];
        continue;
      }
      survivingShips[type] = (survivingShips[type] ?? 0) - lost;
      if (survivingShips[type] <= 0) delete survivingShips[type];
    }

    const returnShips = { ...survivingShips };
    if (flagshipDestroyed) delete returnShips['flagship'];

    // Apply defender losses + debris (via shared helpers)
    await applyDefenderLosses(ctx.db, targetPlanet.id, defShipsRow, defDefsRow, defenderLosses, repairedDefenses);
    await upsertDebris(ctx.db, fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition, debris);

    // ... Pillage logic remains identical (lignes 315-367) ...

    // Fetch origin planet for report
    const [originPlanet] = await ctx.db.select({
      galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
    }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

    // Compute FP + shots per round
    const { attackerFP, defenderFP } = computeBothFP(config, ships, defenderFleet, defenderDefenses, shipCombatConfigs);
    const shotsPerRound = computeShotsPerRound(config, ships, defenderFleet, defenderDefenses, rounds);

    // Build combat report data
    const attackerSurvivors = computeAttackerSurvivors(ships, attackerLosses);

    let reportId: string | undefined;
    let defenderReportId: string | undefined;
    if (ctx.reportService) {
      const reportResult = buildCombatReportData({
        outcome,
        attackerUsername,
        defenderUsername,
        targetPlanetName,
        attackerFleet: ships,
        defenderFleet,
        defenderDefenses,
        attackerLosses,
        defenderLosses,
        attackerSurvivors: survivingShips,
        repairedDefenses,
        debris,
        rounds,
        attackerStats: result?.attackerStats,
        defenderStats: result?.defenderStats,
        attackerFP,
        defenderFP,
        shotsPerRound,
      });
      if (outcome === 'attacker') {
        reportResult.pillage = {
          minerai: pillagedMinerai,
          silicium: pillagedSilicium,
          hydrogene: pillagedHydrogene,
        };
      }

      // Create attacker report
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'attack',
        title: `Rapport de combat ${coords} — ${outcomeText(outcome)}`,
        coordinates: {
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
        },
        originCoordinates: originPlanet ? {
          galaxy: originPlanet.galaxy,
          system: originPlanet.system,
          position: originPlanet.position,
          planetName: originPlanet.name,
        } : undefined,
        fleet: { ships, totalCargo: totalCargoCapacity(ships, shipStatsMap) },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result: reportResult,
      });
      reportId = report.id;

      // Create defender report
      const defenderReportResult = { ...reportResult, perspective: 'defender' as const };
      const defenderReport = await ctx.reportService.create({
        userId: targetPlanet.userId,
        missionType: 'attack',
        title: `Rapport de combat ${coords} — ${defenderOutcome(outcome)}`,
        coordinates: {
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
        },
        originCoordinates: originPlanet ? {
          galaxy: originPlanet.galaxy,
          system: originPlanet.system,
          position: originPlanet.position,
          planetName: originPlanet.name,
        } : undefined,
        fleet: { ships: {}, totalCargo: 0 },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result: defenderReportResult,
      });
      defenderReportId = defenderReport.id;
    }

    // ... Daily quest + exilium drop hooks remain identical (lignes 512-526) ...
    // ... Final return remains identical (lignes 528-547) ...
```

**Important** : Le flagship handling, le pillage et les daily quest hooks restent dans attack.handler.ts car ils sont spécifiques à l'attaque. Seuls les blocs partagés (debris, FP, shots, defender losses, report data, parse unit row, combat config, multipliers, usernames, outcome text) sont remplacés par les helpers.

- [ ] **Step 2: Vérifier que le build compile**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: Pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/attack.handler.ts
git commit -m "refactor: use shared combat helpers in attack handler"
```

---

### Task 5: Refactorer spy.handler.ts pour utiliser combat.helpers.ts

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/spy.handler.ts`

- [ ] **Step 1: Remplacer les imports et le code combat inline par les helpers**

Mettre à jour les imports lignes 1-10 :
```typescript
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, planetBuildings, userResearch, users } from '@exilium/db';
import { calculateSpyReport, calculateDetectionChance, totalCargoCapacity, simulateCombat } from '@exilium/game-engine';
import type { Database } from '@exilium/db';
import type { CombatInput } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, buildShipCombatConfigs, buildShipCosts } from '../fleet.types.js';
import { findShipByRole } from '../../../lib/config-helpers.js';
import { publishNotification } from '../../notification/notification.publisher.js';
import {
  buildCombatConfig,
  parseUnitRow,
  computeCombatMultipliers,
  applyDefenderLosses,
  upsertDebris,
  computeBothFP,
  computeShotsPerRound,
  computeAttackerSurvivors,
  buildCombatReportData,
  fetchUsernames,
  outcomeText,
  defenderOutcome,
} from '../combat.helpers.js';
```

Supprimer les imports de `debrisFields`, `computeFleetFP`, et les types `CombatConfig, ShipCategory, RoundResult, UnitCombatStats, FPConfig`.

Remplacer le bloc combat `if (detected)` (lignes 198-518) par le code utilisant les helpers. Les changements principaux :

- `parseUnitRow(targetShipsRow)` / `parseUnitRow(targetDefsRow)` au lieu des boucles manuelles
- `buildCombatConfig(config, { pillageRatio: 0 })` au lieu de la construction manuelle
- `computeCombatMultipliers(ctx, config, ...)` au lieu du code inline
- `applyDefenderLosses(ctx.db, ...)` au lieu des 2 blocs inline
- `upsertDebris(ctx.db, ...)` au lieu du SELECT-then-UPDATE/INSERT
- `computeBothFP(config, ...)` au lieu du code inline
- `computeShotsPerRound(config, ...)` au lieu du code inline
- `fetchUsernames(ctx.db, ...)` au lieu du Promise.all inline
- `buildCombatReportData({ ..., extra: { spyCombat: true } })` au lieu du gros objet inline
- `outcomeText(outcome)` / `defenderOutcome(outcome)` au lieu des ternaires inline

Le code complet du bloc `if (detected)` après refactoring :

```typescript
    if (detected) {
      const defenderFleet = parseUnitRow(targetShipsRow);
      const defenderDefenses = parseUnitRow(targetDefsRow);

      const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                           Object.values(defenderDefenses).some(v => v > 0);

      if (!hasDefenders) {
        return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 }, reportId };
      }

      // --- Combat setup ---
      const shipCombatConfigs = buildShipCombatConfigs(config);
      const shipCostsMap = buildShipCosts(config);
      const shipIdSet = new Set(Object.keys(config.ships));
      const defenseIdSet = new Set(Object.keys(config.defenses));

      const combatConfig = buildCombatConfig(config, { pillageRatio: 0 });

      const { attackerMultipliers, defenderMultipliers } = await computeCombatMultipliers(
        ctx, config, fleetEvent.userId, targetPlanet.userId, targetPlanet.id,
      );

      const combatInput: CombatInput = {
        attackerFleet: ships,
        defenderFleet,
        defenderDefenses,
        attackerMultipliers,
        defenderMultipliers,
        attackerTargetPriority: 'light',
        defenderTargetPriority: 'light',
        combatConfig,
        shipConfigs: shipCombatConfigs,
        shipCosts: shipCostsMap,
        shipIds: shipIdSet,
        defenseIds: defenseIdSet,
      };
      const combatResult = simulateCombat(combatInput);
      const { outcome, attackerLosses, defenderLosses, debris, repairedDefenses, rounds } = combatResult;

      // Apply losses
      const survivingShips = computeAttackerSurvivors(ships, attackerLosses);
      await applyDefenderLosses(ctx.db, targetPlanet.id, targetShipsRow, targetDefsRow, defenderLosses, repairedDefenses);
      await upsertDebris(ctx.db, fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition, debris);

      // FP + shots
      const { attackerFP, defenderFP } = computeBothFP(config, ships, defenderFleet, defenderDefenses, shipCombatConfigs);
      const shotsPerRound = computeShotsPerRound(config, ships, defenderFleet, defenderDefenses, rounds);

      // Usernames
      const { attackerUsername, defenderUsername } = await fetchUsernames(ctx.db, fleetEvent.userId, targetPlanet.userId);
      const probesSurvived = Object.values(survivingShips).some(v => v > 0);

      // Combat reports
      let combatReportId: string | undefined;
      let defenderReportId: string | undefined;
      if (ctx.reportService) {
        const combatReportResult = buildCombatReportData({
          outcome,
          attackerUsername,
          defenderUsername,
          targetPlanetName: targetPlanet.name,
          attackerFleet: ships,
          defenderFleet,
          defenderDefenses,
          attackerLosses,
          defenderLosses,
          attackerSurvivors: survivingShips,
          repairedDefenses,
          debris,
          rounds,
          attackerStats: combatResult.attackerStats,
          defenderStats: combatResult.defenderStats,
          attackerFP,
          defenderFP,
          shotsPerRound,
          extra: { spyCombat: true },
        });

        const attackerReport = await ctx.reportService.create({
          userId: fleetEvent.userId,
          fleetEventId: fleetEvent.id,
          missionType: 'spy',
          title: `Espionnage ${coords} — Combat ${outcomeText(outcome)}`,
          coordinates: {
            galaxy: fleetEvent.targetGalaxy,
            system: fleetEvent.targetSystem,
            position: fleetEvent.targetPosition,
          },
          originCoordinates: originPlanet ? {
            galaxy: originPlanet.galaxy,
            system: originPlanet.system,
            position: originPlanet.position,
            planetName: originPlanet.name,
          } : undefined,
          fleet: { ships, totalCargo: totalCargoCapacity(ships, shipStatsMap) },
          departureTime: fleetEvent.departureTime,
          completionTime: fleetEvent.arrivalTime,
          result: combatReportResult,
        });
        combatReportId = attackerReport.id;

        const defenderReportResult = { ...combatReportResult, perspective: 'defender' as const };
        const defenderReport = await ctx.reportService.create({
          userId: targetPlanet.userId,
          missionType: 'spy',
          title: `Espionnage détecté ${coords} — ${defenderOutcome(outcome)}`,
          coordinates: {
            galaxy: fleetEvent.targetGalaxy,
            system: fleetEvent.targetSystem,
            position: fleetEvent.targetPosition,
          },
          originCoordinates: originPlanet ? {
            galaxy: originPlanet.galaxy,
            system: originPlanet.system,
            position: originPlanet.position,
            planetName: originPlanet.name,
          } : undefined,
          fleet: { ships: {}, totalCargo: 0 },
          departureTime: fleetEvent.departureTime,
          completionTime: fleetEvent.arrivalTime,
          result: defenderReportResult,
        });
        defenderReportId = defenderReport.id;
      }

      // Notify defender
      if (ctx.redis) {
        publishNotification(ctx.redis, targetPlanet.userId, {
          type: 'fleet-attack-landed',
          payload: { coords, mission: 'spy' },
        });
      }

      if (probesSurvived) {
        return {
          scheduleReturn: true,
          cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
          shipsAfterArrival: survivingShips,
          reportId,
          defenderReportId,
          attackerUsername,
          defenderOutcomeText: defenderOutcome(outcome),
        };
      } else {
        if (reportId && ctx.reportService) {
          await ctx.reportService.deleteReport(fleetEvent.userId, reportId);
        }
        return {
          scheduleReturn: false,
          shipsAfterArrival: {},
          reportId: combatReportId,
          defenderReportId,
          attackerUsername,
          defenderOutcomeText: defenderOutcome(outcome),
        };
      }
    }
```

- [ ] **Step 2: Vérifier que le build compile**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: Pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/spy.handler.ts
git commit -m "refactor: use shared combat helpers in spy handler"
```

---

### Task 6: Alliance — remplacer createSystemMessage par SSE notifications

**Files:**
- Modify: `apps/api/src/modules/alliance/alliance.service.ts`

Le but : remplacer les 3 `createSystemMessage` par des `publishNotification` SSE avec type `alliance-activity`. L'alliance service a besoin d'accéder à Redis pour publier. On passe `redis` au service factory.

- [ ] **Step 1: Modifier la factory pour accepter Redis et remplacer les 3 messages**

```typescript
import { eq, and, ilike, or, sql, asc, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { alliances, allianceMembers, allianceInvitations, allianceApplications, users, rankings } from '@exilium/db';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';

// messageService n'est plus nécessaire
export function createAllianceService(db: Database, redis?: Redis) {
```

Ligne 131 — invitation :
```typescript
      // Remplacer :
      // await messageService.createSystemMessage(targetUser.id, 'alliance', `Invitation alliance [${alliance.tag}]`, `Vous avez été invité à rejoindre l'alliance ${alliance.name} [${alliance.tag}].`);
      // Par :
      if (redis) {
        publishNotification(redis, targetUser.id, {
          type: 'alliance-activity',
          payload: { action: 'invitation', allianceTag: alliance.tag, allianceName: alliance.name },
        });
      }
```

Lignes 172-174 — candidature (dans la boucle `for (const leader of leaders)`) :
```typescript
      // Remplacer :
      // await messageService.createSystemMessage(leader.userId, 'alliance', `Candidature [${alliance.tag}]`, `${applicant.username} a postulé pour rejoindre votre alliance.`);
      // Par :
      if (redis) {
        publishNotification(redis, leader.userId, {
          type: 'alliance-activity',
          payload: { action: 'application', allianceTag: alliance.tag, applicantUsername: applicant.username },
        });
      }
```

Lignes 204-207 — circulaire (dans la boucle `for (const member of members)`) :
```typescript
      // Remplacer :
      // await messageService.createSystemMessage(member.userId, 'alliance', subject, body);
      // Par :
      if (redis) {
        publishNotification(redis, member.userId, {
          type: 'alliance-activity',
          payload: { action: 'circular', subject, senderUsername: senderUsername },
        });
      }
```

Pour le circulaire, il faut aussi fetch le username de l'expéditeur :
```typescript
    async sendCircular(userId: string, subject: string, body: string) {
      const membership = await requireRole(db, userId, ['founder', 'officer']);
      const [sender] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
      const senderUsername = sender?.username ?? 'Officier';
      // ... reste du code
```

- [ ] **Step 2: Mettre à jour l'instanciation du service dans le bootstrap**

Trouver où `createAllianceService` est appelé (probablement dans le fichier de bootstrap/app) et passer `redis` au lieu de `messageService`.

Run: `grep -rn "createAllianceService" apps/api/src/ --include="*.ts"`

Adapter l'appel : `createAllianceService(db, redis)` au lieu de `createAllianceService(db, messageService)`.

- [ ] **Step 3: Vérifier que le build compile**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: Pas d'erreur

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/alliance/alliance.service.ts
git add apps/api/src/**/*.ts  # le fichier bootstrap modifié
git commit -m "refactor: replace alliance system messages with SSE notifications"
```

---

### Task 7: Frontend — handler SSE alliance-activity + toast

**Files:**
- Modify: `apps/web/src/hooks/useNotifications.ts`

- [ ] **Step 1: Ajouter le case `alliance-activity` dans le switch**

Après le case `new-alliance-message` (ligne 248), ajouter :

```typescript
      case 'alliance-activity': {
        utils.alliance.myAlliance.invalidate();
        const payload = event.payload;
        let msg = '';
        if (payload.action === 'invitation') {
          msg = `Invitation alliance [${payload.allianceTag}] reçue`;
        } else if (payload.action === 'application') {
          msg = `Candidature de ${payload.applicantUsername} [${payload.allianceTag}]`;
        } else if (payload.action === 'circular') {
          msg = `[Alliance] ${payload.senderUsername} : ${payload.subject}`;
        }
        if (msg) {
          addToast(msg, 'info', '/alliance');
          showBrowserNotification('Alliance', msg);
        }
        break;
      }
```

- [ ] **Step 2: Vérifier que le build frontend compile**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20`
Expected: Pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useNotifications.ts
git commit -m "feat: handle alliance-activity SSE events with toasts"
```

---

### Task 8: Vérification finale + push

- [ ] **Step 1: Vérifier plus aucun createSystemMessage en dehors de message.service.ts (définition)**

Run: `grep -rn "createSystemMessage" apps/api/src/ --include="*.ts"`
Expected: Seul `message.service.ts` (la définition de la méthode)

- [ ] **Step 2: Build complet API + Web**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: 0 erreur

- [ ] **Step 3: Push**

```bash
git push
```
