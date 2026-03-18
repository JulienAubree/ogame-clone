# Refonte système de minage — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le minage en mission 4 phases (transport → prospection → minage → retour) avec une nouvelle technologie de fracturation des roches.

**Architecture:** Ajout de 2 valeurs à l'enum `fleet_phase` DB, 2 nouvelles formules dans game-engine, une nouvelle recherche `rockFracturing`, et refactoring du handler mine dans fleet.service.ts pour chaîner 4 jobs BullMQ séquentiels via la queue `fleet-arrival` existante.

**Tech Stack:** TypeScript, Drizzle ORM, BullMQ, tRPC, React

**Spec:** `docs/superpowers/specs/2026-03-18-mining-system-redesign-design.md`

---

## Chunk 1: Données et formules (game-engine + DB schema)

### Task 1: Ajouter `rockFracturing` au type ResearchId et constantes

**Files:**
- Modify: `packages/game-engine/src/constants/research.ts:1-10` (type union) + `:24-112` (RESEARCH record)

- [ ] **Step 1: Ajouter `rockFracturing` au type union `ResearchId`**

Dans `packages/game-engine/src/constants/research.ts`, ajouter `'rockFracturing'` à la fin du type union :

```ts
export type ResearchId =
  | 'espionageTech'
  | 'computerTech'
  | 'energyTech'
  | 'combustion'
  | 'impulse'
  | 'hyperspaceDrive'
  | 'weapons'
  | 'shielding'
  | 'armor'
  | 'rockFracturing';
```

- [ ] **Step 2: Ajouter la définition dans le record RESEARCH**

Après l'entrée `armor` (ligne 111), ajouter :

```ts
  rockFracturing: {
    id: 'rockFracturing',
    name: 'Technologie de fracturation des roches',
    description: 'Améliore les techniques d\'extraction minière, réduisant le temps de minage.',
    baseCost: { minerai: 2000, silicium: 4000, hydrogene: 1000 },
    costFactor: 2,
    prerequisites: {
      buildings: [{ buildingId: 'missionCenter', level: 1 }],
      research: [{ researchId: 'combustion', level: 3 }],
    },
  },
```

- [ ] **Step 3: Vérifier compilation**

Run: `cd packages/game-engine && npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 4: Commit**

```bash
git add packages/game-engine/src/constants/research.ts
git commit -m "feat: add rockFracturing research definition"
```

---

### Task 2: Ajouter les formules prospectionDuration et miningDuration

**Files:**
- Modify: `packages/game-engine/src/formulas/pve.ts`

- [ ] **Step 1: Renommer `extractionDuration` en `miningDuration` et ajouter le paramètre fracturation**

Dans `packages/game-engine/src/formulas/pve.ts`, remplacer la fonction `extractionDuration` (lignes 24-30) par :

```ts
/**
 * Mining duration in minutes at the belt.
 * Base formula: max(5, 16 - centerLevel)
 * Modified by rock fracturing tech: -10% per level, floor at 20%.
 */
export function miningDuration(centerLevel: number, fracturingLevel: number = 0): number {
  const base = Math.max(5, 16 - centerLevel);
  const reduction = Math.max(0.2, 1 - 0.1 * fracturingLevel);
  return base * reduction;
}
```

- [ ] **Step 2: Ajouter la fonction `prospectionDuration`**

Après `miningDuration`, ajouter :

```ts
/**
 * Prospection duration in minutes, based on deposit total quantity.
 * Richer deposits take longer to prospect.
 */
export function prospectionDuration(depositTotalQuantity: number): number {
  return 5 + Math.floor(depositTotalQuantity / 10000) * 2;
}
```

- [ ] **Step 3: Garder un alias `extractionDuration` pour compatibilité temporaire**

Ajouter après les nouvelles fonctions (sera supprimé à la Task 5 quand le fleet.service.ts sera refactoré) :

```ts
/** @deprecated Use miningDuration instead */
export function extractionDuration(centerLevel: number): number {
  return miningDuration(centerLevel, 0);
}
```

- [ ] **Step 4: Vérifier compilation**

Run: `cd packages/game-engine && npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/pve.ts
git commit -m "feat: add prospectionDuration and miningDuration formulas"
```

---

### Task 3: Étendre le schema DB (fleet_phase enum + user_research column)

**Files:**
- Modify: `packages/db/src/schema/fleet-events.ts:18`
- Modify: `packages/db/src/schema/user-research.ts`
- Modify: `packages/shared/src/types/missions.ts:11-14`

- [ ] **Step 1: Ajouter `prospecting` et `mining` à l'enum `fleetPhaseEnum`**

Dans `packages/db/src/schema/fleet-events.ts` ligne 18, changer :

```ts
export const fleetPhaseEnum = pgEnum('fleet_phase', ['outbound', 'prospecting', 'mining', 'return']);
```

- [ ] **Step 2: Ajouter la colonne `rockFracturing` dans `user_research`**

Dans `packages/db/src/schema/user-research.ts`, après la ligne `armor` (ligne 14), ajouter :

```ts
  rockFracturing: smallint('rock_fracturing').notNull().default(0),
```

- [ ] **Step 3: Étendre l'enum `FleetPhase` dans shared/types**

Dans `packages/shared/src/types/missions.ts`, modifier le `FleetPhase` :

```ts
export enum FleetPhase {
  Outbound = 'outbound',
  Prospecting = 'prospecting',
  Mining = 'mining',
  Return = 'return',
}
```

- [ ] **Step 4: Vérifier compilation des 3 packages**

Run: `npx tsc --noEmit --project packages/db/tsconfig.json && npx tsc --noEmit --project packages/shared/tsconfig.json && npx tsc --noEmit --project packages/game-engine/tsconfig.json`
Expected: pas d'erreur

- [ ] **Step 5: Appliquer le schema à la DB**

Run: `cd packages/db && npm run db:push`
Expected: schema synchronisé (ajout des valeurs enum + colonne)

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/fleet-events.ts packages/db/src/schema/user-research.ts packages/shared/src/types/missions.ts
git commit -m "feat: extend fleet_phase enum and add rockFracturing column"
```

---

### Task 4: Ajouter `rockFracturing` au seed et au router recherche

**Files:**
- Modify: `packages/db/src/seed-game-config.ts:72-82` (RESEARCH array)
- Modify: `apps/api/src/modules/research/research.router.ts:6-10` (researchIds)

- [ ] **Step 1: Ajouter l'entrée dans le seed RESEARCH**

Dans `packages/db/src/seed-game-config.ts`, après la ligne `armor` (ligne 81), ajouter à la fin du tableau RESEARCH :

```ts
  { id: 'rockFracturing', name: 'Technologie de fracturation des roches', description: "Améliore les techniques d'extraction minière, réduisant le temps de minage.", baseCostMinerai: 2000, baseCostSilicium: 4000, baseCostHydrogene: 1000, costFactor: 2, levelColumn: 'rockFracturing', categoryId: 'research_sciences', sortOrder: 9, flavorText: "Des techniques de fracturation avancees permettent de briser les asteroides plus efficacement, reduisant drastiquement le temps d'extraction.", effectDescription: "Chaque niveau reduit la duree de minage de 10% (minimum 20% de la duree de base).", prerequisites: { buildings: [{ buildingId: 'missionCenter', level: 1 }], research: [{ researchId: 'combustion', level: 3 }] } },
```

- [ ] **Step 2: Ajouter `rockFracturing` dans le router**

Dans `apps/api/src/modules/research/research.router.ts`, ajouter `'rockFracturing'` au tableau `researchIds` :

```ts
const researchIds = [
  'espionageTech', 'computerTech', 'energyTech',
  'combustion', 'impulse', 'hyperspaceDrive',
  'weapons', 'shielding', 'armor',
  'rockFracturing',
] as const;
```

- [ ] **Step 3: Re-seeder la config**

Run: `cd packages/db && npm run seed`
Expected: seed réussi avec la nouvelle recherche

- [ ] **Step 4: Vérifier compilation API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/seed-game-config.ts apps/api/src/modules/research/research.router.ts
git commit -m "feat: seed rockFracturing research and add to router"
```

---

## Chunk 2: Backend — Chaînage des jobs de minage

### Task 5: Refactorer processArrival pour mine et ajouter processProspectDone / processMineDone

**Files:**
- Modify: `apps/api/src/modules/fleet/fleet.service.ts`

Cette task modifie le handler mine dans `processArrival` et ajoute 2 nouvelles méthodes.

- [ ] **Step 1: Refactorer le bloc `mine` dans `processArrival` (lignes 454-502)**

Remplacer tout le bloc `if (event.mission === 'mine') { ... }` (lignes 454-502) par :

```ts
      if (event.mission === 'mine') {
        const pveMissionId = event.pveMissionId;
        const mission = pveMissionId
          ? await db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
          : null;

        const targetCoords = { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition };

        if (!mission || !pveService || !asteroidBeltService) {
          await this.scheduleReturn(event.id, event.originPlanetId, targetCoords, ships, 0, 0, 0);
          return { ...eventMeta, mission: 'mine', extracted: 0 };
        }

        // Phase 1 → 2: outbound → prospecting
        const params = mission.parameters as { depositId: string; resourceType: string };
        const [deposit] = await db.select().from(asteroidDeposits)
          .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
        const depositTotal = deposit ? Number(deposit.totalQuantity) : 0;
        const prospectMins = prospectionDuration(depositTotal);
        const prospectMs = prospectMins * 60 * 1000;

        const now = new Date();
        await db.update(fleetEvents).set({
          phase: 'prospecting',
          departureTime: now,
          arrivalTime: new Date(now.getTime() + prospectMs),
        }).where(eq(fleetEvents.id, event.id));

        await fleetArrivalQueue.add(
          'prospect-done',
          { fleetEventId: event.id },
          { delay: prospectMs, jobId: `fleet-prospect-${event.id}` },
        );

        return { ...eventMeta, mission: 'mine', phase: 'prospecting' };
      }
```

- [ ] **Step 2: Ajouter les imports nécessaires**

En haut de `fleet.service.ts` :

1. Ligne 1 — ajouter `inArray` à l'import drizzle-orm :
```ts
import { eq, and, sql, inArray } from 'drizzle-orm';
```

2. Ajouter `miningDuration` et `prospectionDuration` à l'import `@ogame-clone/game-engine` (chercher la ligne qui importe depuis ce package et ajouter ces 2 fonctions). Note : `userResearch` et `asteroidDeposits` sont déjà importés depuis `@ogame-clone/db`.

- [ ] **Step 3: Ajouter la méthode `processProspectDone`**

Ajouter cette méthode dans l'objet retourné par `createFleetService`, après `processArrival` :

```ts
    async processProspectDone(fleetEventId: string) {
      const [event] = await db.select().from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active'), eq(fleetEvents.phase, 'prospecting')))
        .limit(1);

      if (!event) return null;

      // Phase 2 → 3: prospecting → mining
      const research = await db.select().from(userResearch).where(eq(userResearch.userId, event.userId)).limit(1);
      const fracturingLevel = research[0]?.rockFracturing ?? 0;
      const centerLevel = pveService ? await pveService.getMissionCenterLevel(event.userId) : 1;
      const mineMins = miningDuration(centerLevel, fracturingLevel);
      const mineMs = mineMins * 60 * 1000;

      const now = new Date();
      await db.update(fleetEvents).set({
        phase: 'mining',
        departureTime: now,
        arrivalTime: new Date(now.getTime() + mineMs),
      }).where(eq(fleetEvents.id, event.id));

      await fleetArrivalQueue.add(
        'mine-done',
        { fleetEventId: event.id },
        { delay: mineMs, jobId: `fleet-mine-${event.id}` },
      );

      return { userId: event.userId, mission: 'mine', phase: 'mining' };
    },
```

- [ ] **Step 4: Ajouter la méthode `processMineDone`**

Ajouter cette méthode après `processProspectDone` :

```ts
    async processMineDone(fleetEventId: string) {
      const [event] = await db.select().from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active'), eq(fleetEvents.phase, 'mining')))
        .limit(1);

      if (!event) return null;

      const ships = event.ships as Record<string, number>;
      const pveMissionId = event.pveMissionId;
      const mission = pveMissionId
        ? await db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
        : null;

      const targetCoords = { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition };

      if (!mission || !pveService || !asteroidBeltService) {
        await this.scheduleReturn(event.id, event.originPlanetId, targetCoords, ships, 0, 0, 0);
        return { userId: event.userId, mission: 'mine', extracted: 0 };
      }

      const params = mission.parameters as { depositId: string; resourceType: string };
      const centerLevel = await pveService.getMissionCenterLevel(event.userId);
      const prospectorCount = ships['prospector'] ?? 0;
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);

      const [deposit] = await db.select().from(asteroidDeposits)
        .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
      const depositRemaining = deposit ? Number(deposit.remainingQuantity) : 0;
      const extractAmount = totalExtracted(centerLevel, prospectorCount, cargoCapacity, depositRemaining);

      const extracted = await asteroidBeltService.extractFromDeposit(params.depositId, extractAmount);

      const cargo = { minerai: 0, silicium: 0, hydrogene: 0 };
      if (extracted > 0) {
        cargo[params.resourceType as keyof typeof cargo] = extracted;
      }

      await db.update(fleetEvents).set({
        mineraiCargo: String(cargo.minerai),
        siliciumCargo: String(cargo.silicium),
        hydrogeneCargo: String(cargo.hydrogene),
      }).where(eq(fleetEvents.id, event.id));

      await this.scheduleReturn(
        event.id, event.originPlanetId, targetCoords, ships,
        cargo.minerai, cargo.silicium, cargo.hydrogene,
      );

      await pveService.completeMission(mission.id);

      return { userId: event.userId, mission: 'mine', extracted, phase: 'return' };
    },
```

- [ ] **Step 5: Supprimer l'alias `extractionDuration` dans pve.ts**

Dans `packages/game-engine/src/formulas/pve.ts`, supprimer la fonction dépréciée `extractionDuration` ajoutée à la Task 2 Step 3.

- [ ] **Step 6: Mettre à jour le test `pve.test.ts`**

Dans `packages/game-engine/src/formulas/pve.test.ts`, remplacer l'import et le bloc de test `extractionDuration` :

1. Dans l'import (ligne 5), remplacer `extractionDuration` par `miningDuration, prospectionDuration`
2. Remplacer le bloc `describe('extractionDuration', ...)` (lignes 40-53) par :

```ts
describe('miningDuration', () => {
  it('returns 15 min at level 1 without fracturing', () => {
    expect(miningDuration(1, 0)).toBe(15);
  });
  it('returns 5 min at level 11+ (floor) without fracturing', () => {
    expect(miningDuration(11, 0)).toBe(5);
  });
  it('reduces duration by 10% per fracturing level', () => {
    expect(miningDuration(1, 3)).toBeCloseTo(10.5);
  });
  it('has a floor at 20% of base duration (fracturing level 8)', () => {
    expect(miningDuration(1, 8)).toBe(3);
    expect(miningDuration(1, 10)).toBe(3); // same floor
  });
});

describe('prospectionDuration', () => {
  it('returns 9 min for 20k deposit', () => {
    expect(prospectionDuration(20000)).toBe(9);
  });
  it('returns 13 min for 40k deposit', () => {
    expect(prospectionDuration(40000)).toBe(13);
  });
  it('returns 5 min for very small deposit', () => {
    expect(prospectionDuration(5000)).toBe(5);
  });
});
```

- [ ] **Step 7: Lancer les tests**

Run: `cd packages/game-engine && npx vitest run src/formulas/pve.test.ts`
Expected: tous les tests passent

- [ ] **Step 8: Vérifier compilation API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.service.ts packages/game-engine/src/formulas/pve.ts packages/game-engine/src/formulas/pve.test.ts
git commit -m "feat: implement 4-phase mining with prospection and fracturing tech"
```

---

### Task 6: Mettre à jour le worker fleet-arrival pour dispatcher les nouveaux jobs

**Files:**
- Modify: `apps/api/src/workers/fleet-arrival.worker.ts`

- [ ] **Step 1: Modifier le worker pour dispatcher sur le nom du job**

Remplacer le handler du worker (lignes 24-57) par :

```ts
  const worker = new Worker(
    'fleet-arrival',
    async (job) => {
      const { fleetEventId } = job.data as { fleetEventId: string };
      console.log(`[fleet-arrival] Processing job ${job.name} (${job.id})`);

      let result: any = null;

      if (job.name === 'prospect-done') {
        result = await fleetService.processProspectDone(fleetEventId);
      } else if (job.name === 'mine-done') {
        result = await fleetService.processMineDone(fleetEventId);
      } else {
        result = await fleetService.processArrival(fleetEventId);
      }

      if (result) {
        console.log(`[fleet-arrival] Mission ${result.mission} processed (phase: ${result.phase ?? 'done'})`);

        if (result.userId) {
          publishNotification(redis, result.userId, {
            type: 'fleet-arrived',
            payload: {
              mission: result.mission,
              originName: result.originName,
              targetCoords: result.targetCoords,
            },
          });

          await db.insert(gameEvents).values({
            userId: result.userId,
            planetId: result.originPlanetId,
            type: 'fleet-arrived',
            payload: {
              mission: result.mission,
              originName: result.originName,
              targetCoords: result.targetCoords,
              ships: result.ships,
              cargo: result.cargo,
            },
          });
        }
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[fleet-arrival] Job ${job?.id} failed:`, err);
  });
```

- [ ] **Step 2: Vérifier compilation**

Run: `cd apps/api && npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/workers/fleet-arrival.worker.ts
git commit -m "feat: dispatch prospect-done and mine-done jobs in fleet-arrival worker"
```

---

### Task 7: Mettre à jour le rappel de flotte (recallFleet)

**Files:**
- Modify: `apps/api/src/modules/fleet/fleet.service.ts` (méthode `recallFleet`, lignes 280-325)

- [ ] **Step 1: Modifier le filtre de phase dans recallFleet**

Remplacer la ligne 289 :

```ts
            eq(fleetEvents.phase, 'outbound'),
```

Par :

```ts
            inArray(fleetEvents.phase, ['outbound', 'prospecting', 'mining']),
```

Note : `inArray` a été ajouté à l'import drizzle-orm dans Task 5 Step 2.

- [ ] **Step 2: Modifier l'annulation du job BullMQ**

Remplacer la ligne 302 :

```ts
      await fleetArrivalQueue.remove(`fleet-arrive-${event.id}`);
```

Par un code qui annule le bon job selon la phase :

```ts
      // Cancel the pending job for the current phase
      const jobIdMap: Record<string, string> = {
        outbound: `fleet-arrive-${event.id}`,
        prospecting: `fleet-prospect-${event.id}`,
        mining: `fleet-mine-${event.id}`,
      };
      const pendingJobId = jobIdMap[event.phase];
      if (pendingJobId) {
        await fleetArrivalQueue.remove(pendingJobId);
      }
```

- [ ] **Step 3: Vérifier compilation**

Run: `cd apps/api && npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.service.ts
git commit -m "feat: allow fleet recall during prospecting and mining phases"
```

---

## Chunk 3: Frontend

### Task 8: Mettre à jour les libellés de phase dans Movements.tsx

**Files:**
- Modify: `apps/web/src/pages/Movements.tsx`

- [ ] **Step 1: Remplacer la logique d'affichage de phase**

Remplacer les lignes 66-68 (variables `isOutbound` et `isExtracting`) par :

```ts
            const phaseLabel: Record<string, string> = {
              outbound: 'En route',
              prospecting: 'Prospection...',
              mining: 'Extraction...',
              return: 'Retour',
            };
            const canRecall = ['outbound', 'prospecting', 'mining'].includes(event.phase);
```

- [ ] **Step 2: Mettre à jour le libellé affiché**

Remplacer la ligne 76 :

```tsx
                      {isExtracting ? 'Extraction en cours...' : isOutbound ? 'Aller' : 'Retour'}
```

Par :

```tsx
                      {phaseLabel[event.phase] ?? event.phase}
```

- [ ] **Step 3: Mettre à jour la condition du bouton Rappeler**

Remplacer la ligne 101 :

```tsx
                {isOutbound && (
```

Par :

```tsx
                {canRecall && (
```

- [ ] **Step 4: Vérifier compilation**

Run: `cd apps/web && npx tsc --noEmit`
Expected: pas d'erreur

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Movements.tsx
git commit -m "feat: display mining phases and allow recall during prospecting/mining"
```

---

### Task 9: Vérification de bout en bout

- [ ] **Step 1: Lancer le serveur de dev**

Run: `npm run dev` (ou la commande de dev du projet)

- [ ] **Step 2: Vérifier la recherche fracturation**

Ouvrir la page Recherche → la technologie « Fracturation des roches » doit apparaître dans la catégorie Sciences, avec les prérequis missionCenter niv. 1 + combustion niv. 3.

- [ ] **Step 3: Tester une mission de minage**

1. Aller sur la page Missions
2. Envoyer une mission de minage avec des prospecteurs + cargos
3. Vérifier que la flotte passe par les 4 phases dans Mouvements : En route → Prospection → Extraction → Retour
4. Vérifier que les ressources arrivent bien sur la planète au retour

- [ ] **Step 4: Tester le rappel en phase prospection/minage**

1. Envoyer une mission de minage
2. Attendre que la phase passe à "Prospection..." dans Mouvements
3. Cliquer "Rappeler" → la flotte doit rentrer à vide

- [ ] **Step 5: Vérifier que le fret du prospecteur est bien 750**

Dans la page Flotte, sélectionner des prospecteurs pour une mission mine → la capacité de fret affichée doit refléter 750 par prospecteur.

- [ ] **Step 6: Commit + push final**

```bash
git push
```
