# Refactoring : Unification des queues BullMQ

## Contexte

Le projet utilise BullMQ (Redis) pour scheduler les jobs delayed (completion de builds, arrivee/retour de flottes). Actuellement, 5 queues separees et 5 workers distincts coexistent avec une duplication massive de code (~90% de boilerplate commun dans les workers de build).

## Problemes actuels

1. **5 queues BullMQ pour un meme pattern** : `building-completion`, `research-completion`, `shipyard-completion`, `fleet-arrival`, `fleet-return`
2. **Duplication massive dans les workers** : fetch entry, complete, get planet name, resolve config name, notify, insert gameEvent, tutorial check — repete dans chaque worker
3. **Couplage fort** : chaque service recoit sa queue dediee en injection (ex: `createBuildingService(db, resourceService, buildingCompletionQueue, gameConfigService)`)
4. **Catchup fragile** : le cron `event-catchup` route manuellement vers la bonne queue via `if/else`, a etendre a chaque nouvelle entite
5. **Chaque worker recree ses propres instances** de services et Redis
6. **Pas de retry** : juste un `console.error` sur failure
7. **Naming incohérent** : research utilise `'tutorial-quest-complete'` comme type d'event alors que building/shipyard utilisent `'tutorial-quest-done'`

## Design

### 1. Deux queues BullMQ par domaine

**Avant :** 5 queues

**Apres :**
- **`build-completion`** — building, research, shipyard (tous utilisent la table `build_queue`)
- **`fleet`** — arrival, return, prospect-done, mine-done (tous utilisent la table `fleet_events`)

Le `jobName` BullMQ distingue le sous-type :
- Build : `'building'`, `'research'`, `'shipyard-unit'`
- Fleet : `'arrive'`, `'return'`, `'prospect-done'`, `'mine-done'`

Le payload reste identique : `{ buildQueueId }` ou `{ fleetEventId }`.

### 2. Interface de retour standardisee

Deux types distincts pour les deux domaines, car la logique post-completion differe significativement.

#### BuildCompletionResult (building, research, shipyard)

```typescript
type BuildCompletionResult = {
  userId: string;
  planetId: string;
  eventType: string;           // 'building-done', 'research-done', 'shipyard-done'
  notificationPayload: Record<string, unknown>;
  eventPayload: Record<string, unknown>;
  tutorialCheck?: {
    type: string;              // 'building_level', 'research_level', 'ship_count'
    targetId: string;
    targetValue: number;
  };
} | null;  // null = entry not found / already completed
```

Les methodes `completeUpgrade`, `completeResearch`, `completeUnit` retournent ce format. La logique metier interne ne change pas.

Le build worker applique un pipeline post-completion commun :
1. `result = handler(id)`
2. Si null, return (entry not found / already completed)
3. `publishNotification(redis, result.userId, { type: result.eventType, payload: result.notificationPayload })`
4. `db.insert(gameEvents).values({ userId, planetId, type: eventType, payload: eventPayload })`
5. Si `result.tutorialCheck` present : `tutorialService.checkAndComplete()` puis notify + event si quete completee

Ce pipeline est ecrit **une seule fois**, quel que soit le type de build.

Normalisation : le type d'event tutorial est unifie en `'tutorial-quest-done'` partout (correction de l'incohérence actuelle dans research).

#### FleetCompletionResult (arrival, return)

```typescript
type FleetCompletionResult = {
  userId: string;
  planetId: string;
  mission: string;
  eventType: string;           // 'fleet-arrived', 'fleet-returned'
  notificationPayload: Record<string, unknown>;
  eventPayload: Record<string, unknown>;
  // Optionnel : events supplementaires (ex: pve-mission-done)
  extraEvents?: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
  // Optionnel : un ou plusieurs tutorial checks (fleet-return en fait 2)
  tutorialChecks?: Array<{
    type: string;
    targetId: string;
    targetValue: number;
  }>;
} | null;
```

Le fleet worker applique un pipeline similaire mais adapte :
1. `result = handler(id)`
2. Si null, return
3. Notification principale + gameEvent principal
4. Boucle sur `result.extraEvents` pour inserer les events supplementaires
5. Boucle sur `result.tutorialChecks` pour chaque check tutorial

Les methodes `processArrival` et `processReturn` construisent ce resultat structure. Les jobs `prospect-done` et `mine-done` retournent null (pas de post-completion, ils redispatchent en interne).

### 3. Workers unifies

**Build worker** — un seul worker ecoute `build-completion` et route par `jobName` :

```typescript
const handlers = {
  'building':      (id) => buildingService.completeUpgrade(id),
  'research':      (id) => researchService.completeResearch(id),
  'shipyard-unit': (id) => shipyardService.completeUnit(id),
};
```

Chaque handler retourne un `BuildCompletionResult`. Pipeline post-completion commun.

**Fleet worker** — un seul worker ecoute `fleet` et route par `jobName` :

```typescript
const handlers = {
  'arrive':        (id) => fleetService.processArrival(id),
  'return':        (id) => fleetService.processReturn(id),
  'prospect-done': (id) => fleetService.processProspectDone(id),
  'mine-done':     (id) => fleetService.processMineDone(id),
};
```

Chaque handler retourne un `FleetCompletionResult | null`. Pipeline post-completion adapte au domaine fleet.

**Services partages** : les instances `db`, `redis`, `gameConfigService`, `tutorialService` sont creees **une seule fois** dans `worker.ts` et injectees aux deux workers (au lieu d'etre recreees dans chaque fichier worker).

**Retry** : config BullMQ commune :
```typescript
{ attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
```

**Concurrency** : build-completion a concurrency 5, fleet a concurrency 5 (valeur max actuelle entre fleet-arrival=3 et fleet-return=5).

### 4. Catchup cron simplifie

**Avant :** routing `if/else` sur `entry.type` pour choisir parmi 5 queues, construction manuelle du `jobId`.

**Apres :**

```typescript
// Build catchup — une seule queue cible
const expiredBuilds = await db.select().from(buildQueue)
  .where(and(eq(buildQueue.status, 'active'), lte(buildQueue.endTime, now)));

// Mapping type DB -> jobName BullMQ
const buildJobName: Record<string, string> = {
  building: 'building',
  research: 'research',
  ship: 'shipyard-unit',
  defense: 'shipyard-unit',
};

for (const entry of expiredBuilds) {
  const jobName = buildJobName[entry.type] ?? 'shipyard-unit';
  // Preserve le format de jobId existant (shipyard utilise un suffixe -N)
  const jobId = (entry.type === 'ship' || entry.type === 'defense')
    ? `shipyard-${entry.id}-${entry.completedCount + 1}`
    : `${entry.type}-${entry.id}`;
  const existing = await buildCompletionQueue.getJob(jobId);
  if (!existing) {
    await buildCompletionQueue.add(jobName, { buildQueueId: entry.id }, { jobId });
  }
}

// Fleet catchup — une seule queue cible
// Mapping des 4 phases possibles vers le jobName correspondant
const fleetPhaseToJobName: Record<string, string> = {
  outbound: 'arrive',
  return: 'return',
  prospecting: 'prospect-done',
  mining: 'mine-done',
};

const expiredFleets = await db.select().from(fleetEvents)
  .where(and(eq(fleetEvents.status, 'active'), lte(fleetEvents.arrivalTime, now)));

for (const fleet of expiredFleets) {
  const jobName = fleetPhaseToJobName[fleet.phase] ?? 'arrive';
  const jobId = `fleet-${jobName}-${fleet.id}`;
  const existing = await fleetQueue.getJob(jobId);
  if (!existing) {
    await fleetQueue.add(jobName, { fleetEventId: fleet.id }, { jobId });
  }
}
```

### 5. Impact sur les services existants

**Cote enqueue (changements minimes) :**
- `buildingService` : `buildingCompletionQueue.add('complete', ...)` -> `buildCompletionQueue.add('building', ...)`
- `researchService` : `researchCompletionQueue.add('complete', ...)` -> `buildCompletionQueue.add('research', ...)`
- `shipyardService` : `shipyardCompletionQueue.add('complete-unit', ...)` -> `buildCompletionQueue.add('shipyard-unit', ...)`
- `fleetService` : `fleetArrivalQueue` / `fleetReturnQueue` -> une seule `fleetQueue`

**fleetService — points de changement specifiques (5 sites d'appel) :**
- `sendFleet()` : `fleetArrivalQueue.add('arrive', ...)` -> `fleetQueue.add('arrive', ...)`
- `recallFleet()` : `fleetArrivalQueue.remove(...)` -> `fleetQueue.remove(...)`
- `recallFleet()` : `fleetReturnQueue.add('return', ...)` -> `fleetQueue.add('return', ...)`
- `processArrival()` : `fleetArrivalQueue.add(result.schedulePhase.jobName, ...)` -> `fleetQueue.add(...)`
- `scheduleReturn()` : `fleetReturnQueue.add('return', ...)` -> `fleetQueue.add('return', ...)`

**fleet.types.ts :**
- `MissionHandlerContext` : remplacer `fleetArrivalQueue: Queue` + `fleetReturnQueue: Queue` par `fleetQueue: Queue`

Chaque service recoit **une seule queue** en injection au lieu d'une queue dediee.

**Cote completion :**
- `completeUpgrade`, `completeResearch`, `completeUnit` retournent `BuildCompletionResult` (inclut les infos pour notification, gameEvent, et tutorial check)
- `processArrival`, `processReturn` retournent `FleetCompletionResult` (inclut extraEvents et tutorialChecks en tableaux)
- La logique metier interne de ces methodes ne change pas

**Fichiers supprimes :**
- `queues/queue.ts` -> remplace par un nouveau fichier avec 2 queues
- Les 5 fichiers `*.worker.ts` -> remplaces par 2 fichiers (`build-completion.worker.ts` + `fleet.worker.ts`)

**Aucun changement sur :**
- Le schema DB (`build_queue`, `fleet_events`)
- Le frontend (aucune page impactee)
- Les routes tRPC

## Risques et vigilance

- **Transition des jobs en cours** : au deploiement, les jobs deja scheduled dans les anciennes queues ne seront pas traites par les nouveaux workers. Le catchup cron (qui tourne toutes les 30s) rattrapera automatiquement ces jobs en les re-schedulant dans les nouvelles queues. Apres migration, nettoyer les anciennes queues dans Redis (`bull:building-completion:*`, etc.).
- **Nommage des jobId** : les formats de `jobId` sont preserves a l'identique pour que les `cancel`/`remove` existants continuent de fonctionner. En particulier le format shipyard `shipyard-${id}-${N}`.
- **Idempotence** : les methodes `completeUpgrade`/`completeResearch`/`completeUnit` retournent deja null si l'entree est deja completed — safe pour les retries. Pour fleet, verifier que `processArrival`/`processReturn` sont idempotents (check `status: 'active'` avant traitement).
- **Rollback** : en cas de probleme, on peut redéployer l'ancien code. Le catchup cron de l'ancien code re-schedulera les jobs dans les anciennes queues.
