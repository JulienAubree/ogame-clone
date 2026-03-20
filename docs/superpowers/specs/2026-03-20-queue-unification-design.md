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

### 2. Interface de retour standardisee (CompletionResult)

Chaque service retourne un objet structure commun apres completion :

```typescript
type CompletionResult = {
  success: boolean;
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

Les methodes `completeUpgrade`, `completeResearch`, `completeUnit` sont enrichies pour retourner ce format. La logique metier interne ne change pas.

Le worker unifie applique un pipeline post-completion commun :
1. `result = service.completeXxx(id)`
2. Si null, return (entry not found / already completed)
3. `publishNotification(redis, result.userId, { type: result.eventType, payload: result.notificationPayload })`
4. `db.insert(gameEvents).values({ userId, planetId, type: eventType, payload: eventPayload })`
5. Si `result.tutorialCheck` present : `tutorialService.checkAndComplete()` puis notify + event si quete completee

Ce pipeline est ecrit **une seule fois**, quel que soit le type.

### 3. Workers unifies

**Build worker** — un seul worker ecoute `build-completion` et route par `jobName` :

```typescript
const handlers = {
  'building':      (id) => buildingService.completeUpgrade(id),
  'research':      (id) => researchService.completeResearch(id),
  'shipyard-unit': (id) => shipyardService.completeUnit(id),
};
```

**Fleet worker** — un seul worker ecoute `fleet` et route par `jobName` :

```typescript
const handlers = {
  'arrive':        (id) => fleetService.processArrival(id),
  'return':        (id) => fleetService.processReturn(id),
  'prospect-done': (id) => fleetService.processProspectDone(id),
  'mine-done':     (id) => fleetService.processMineDone(id),
};
```

Meme pipeline post-completion pour les deux workers.

**Services partages** : les instances `db`, `redis`, `gameConfigService`, `tutorialService` sont creees **une seule fois** dans `worker.ts` et injectees aux deux workers.

**Retry** : config BullMQ commune :
```typescript
{ attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
```

### 4. Catchup cron simplifie

**Avant :** routing `if/else` sur `entry.type` pour choisir parmi 5 queues, construction manuelle du `jobId`.

**Apres :**

```typescript
// Build catchup — une seule queue cible
const expiredBuilds = await db.select().from(buildQueue)
  .where(and(eq(buildQueue.status, 'active'), lte(buildQueue.endTime, now)));

for (const entry of expiredBuilds) {
  const jobName = entry.type === 'building' ? 'building'
    : entry.type === 'research' ? 'research'
    : 'shipyard-unit';
  const jobId = `${entry.type}-${entry.id}`;
  const existing = await buildCompletionQueue.getJob(jobId);
  if (!existing) {
    await buildCompletionQueue.add(jobName, { buildQueueId: entry.id }, { jobId });
  }
}

// Fleet catchup — une seule queue cible
const expiredFleets = await db.select().from(fleetEvents)
  .where(and(eq(fleetEvents.status, 'active'), lte(fleetEvents.arrivalTime, now)));

for (const fleet of expiredFleets) {
  const jobName = fleet.phase === 'return' ? 'return' : 'arrive';
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

Chaque service recoit **une seule queue** en injection au lieu d'une queue dediee.

**Cote completion :**
Les methodes `completeUpgrade`, `completeResearch`, `completeUnit` retournent le `CompletionResult` standardise. La logique metier interne ne change pas.

**Fichiers supprimes :**
- `queues/queue.ts` -> remplace par un nouveau fichier avec 2 queues
- Les 5 fichiers `*.worker.ts` -> remplaces par 2 fichiers (`build-completion.worker.ts` + `fleet.worker.ts`)

**Aucun changement sur :**
- Le schema DB (`build_queue`, `fleet_events`)
- Le frontend (aucune page impactee)
- Les routes tRPC

## Risques et vigilance

- **Transition des jobs en cours** : au deploiement, les jobs deja scheduled dans les anciennes queues ne seront pas traites par les nouveaux workers. Le catchup cron (qui tourne toutes les 30s) rattrapera automatiquement ces jobs en les re-schedulant dans les nouvelles queues.
- **Nommage des jobId** : les `jobId` restent au meme format pour que les `cancel`/`remove` existants continuent de fonctionner.
- **Concurrency** : build-completion a concurrency 5, fleet a concurrency 3 (valeurs actuelles conservees).
