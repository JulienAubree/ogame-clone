# Exploration PvE — P1 Reconnaissance — Design

**Goal :** Faire de l'exploration une activité PvE rentable et récurrente. Le mission center génère périodiquement des contrats *"Cartographier le système [G:S]"* qui demandent au joueur de découvrir N positions vierges dans un système éloigné. Récompense en ressources scalées + drop d'Exilium.

**Scope v1 (ce spec) :** un seul sous-type `recon`. Pas d'événements aléatoires ni de bounty rare (P2 et P3 séparés).

**Non-goals :**
- Pas de cross-galaxy en P1 (zone limitée à la galaxie du homeworld).
- Pas de rapport d'exploration auto-généré comme bonus (déplace en P1.5).
- Pas de combat ni d'événement aléatoire à l'arrivée — c'est juste de l'exploration normale qui valide un quota.
- Pas de partage de quête entre joueurs/alliances.

---

## 1. Architecture

### Schéma DB

Aucune nouvelle table. On étend deux schémas existants :

**`mission_center_state`** : nouvelle colonne nullable
```sql
ALTER TABLE mission_center_state
  ADD COLUMN next_exploration_discovery_at TIMESTAMPTZ;
```

**`pve_missions`** : pas de changement structurel. On utilise les colonnes existantes :
- `mission_type = 'exploration'` (nouvelle valeur, le champ est `varchar` libre)
- `parameters` (jsonb) = `{ subtype: 'recon', galaxy, system, quota, progress }`
- `rewards` (jsonb) = `{ minerai, silicium, hydrogene, exilium }`
- `expires_at` = `created_at + 48h`

### Module structure

```
apps/api/src/modules/pve/
  pve.service.ts                   ← +generateExplorationMission, +checkExplorationCompletion
  exploration-mission.service.ts   ← (NEW) génération + validation isolées
packages/game-engine/src/formulas/
  pve.ts                           ← +explorationRewards, +explorationQuota
apps/api/src/modules/fleet/handlers/
  explore.handler.ts               ← hook après processPhase('explore-done')
apps/web/src/components/command-center/
  ExplorationMissionCard.tsx       ← (NEW) carte mission
  ExplorationMissionsList.tsx      ← (NEW) onglet liste
```

### Flow

```
[Tick mission center]
  ├─ generateDiscoveredMission   (existant, mining)
  ├─ generatePirateMission       (existant, combat)
  └─ generateExplorationMission  (NEW)

[Joueur envoie mission explore vers position dans la zone du contrat]
  └─ explore.handler.processPhase('explore-done')
       ├─ flag selfExplored=true sur discoveredPositions  (existant)
       └─ checkExplorationCompletion(userId, galaxy, system, position)  (NEW)
            └─ pour chaque mission `exploration` active dans cette zone :
                 ├─ count discoveredPositions où selfExplored=true
                 │     AND createdAt > mission.createdAt
                 │     AND galaxy/system match
                 ├─ update parameters.progress
                 └─ si progress >= quota → completeExplorationMission
                      ├─ status = 'completed'
                      ├─ crédite ressources sur le homeworld
                      └─ exiliumService.tryDrop pour le bonus
```

---

## 2. Génération du contrat

### Appel

Dans `pve.service.materializeDiscoveries`, après les générations mining et pirate, on ajoute un nouveau bloc :

```ts
if (state.nextExplorationDiscoveryAt && now >= state.nextExplorationDiscoveryAt) {
  const explorationCount = countByType['exploration'] ?? 0;
  if (explorationCount < EXPLORATION_CAP) {
    await this.generateExplorationMission(userId, homePlanet.galaxy, homePlanet.system, centerLevel);
  }
  await db.update(missionCenterState).set({
    nextExplorationDiscoveryAt: new Date(now.getTime() + cooldownMs),
  }).where(eq(missionCenterState.userId, userId));
}
```

**Cooldown** : même `discoveryCooldown(centerLevel)` que mining (factorisé), mais offset différent (~25% du cooldown) pour ne pas spawner en même temps.

**Cap** : `pve_max_exploration_missions` = **2**.

**Gating** : `planetaryExploration ≥ 1`. Si non, skip silencieusement la génération. La colonne `nextExplorationDiscoveryAt` reste à null tant que le joueur n'a pas la techno.

### Tirage du système cible

```ts
function pickExplorationSystem(homeworldSystem, universe): number {
  const minDistance = Number(universe.pve_exploration_min_distance) || 3;
  const maxSystems = Number(universe.systems) || 499;
  // Tire un système à distance ≥ minDistance du homeworld, dans [1, maxSystems]
  // Évite system 1 et maxSystems (bordures qui posent problèmes de rotation galactique)
}
```

Filtre qualité : si le joueur a déjà découvert ≥ `quota` positions dans ce système, on retire un autre système (jusqu'à 5 essais, sinon on skip cette génération).

### Quota

```ts
function explorationQuota(centerLevel: number): number {
  return Math.max(2, Math.min(5, Math.ceil(centerLevel / 3)));
}
```

| centerLevel | quota |
|---|---|
| 1-3 | 2 |
| 4-6 | 2 |
| 7-9 | 3 |
| 10-12 | 4 |
| 13+ | 5 |

### Récompenses

```ts
function explorationRewards(centerLevel: number, quota: number) {
  return {
    minerai:   centerLevel * quota * 200,
    silicium:  centerLevel * quota * 150,
    hydrogene: centerLevel * quota * 100,
    exilium:   1,
  };
}
```

À centerLevel 5, quota 2 : 2 000 Mi / 1 500 Si / 1 000 H + 1 Exilium.
À centerLevel 10, quota 4 : 8 000 Mi / 6 000 Si / 4 000 H + 1 Exilium.

---

## 3. Validation

### Hook dans explore.handler

À la fin de `ExploreHandler.processPhase('explore-done', fleetEvent, ctx)`, après l'update de `discoveredPositions`, on appelle :

```ts
await ctx.pveService?.checkExplorationCompletion(
  fleetEvent.userId,
  fleetEvent.targetGalaxy,
  fleetEvent.targetSystem,
);
```

### Logique

```ts
async checkExplorationCompletion(userId: string, galaxy: number, system: number) {
  const activeMissions = await db.select().from(pveMissions).where(and(
    eq(pveMissions.userId, userId),
    eq(pveMissions.missionType, 'exploration'),
    eq(pveMissions.status, 'available'),
  ));

  for (const mission of activeMissions) {
    const params = mission.parameters as { subtype: string; galaxy: number; system: number; quota: number };
    if (params.galaxy !== galaxy || params.system !== system) continue;

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(discoveredPositions)
      .where(and(
        eq(discoveredPositions.userId, userId),
        eq(discoveredPositions.galaxy, params.galaxy),
        eq(discoveredPositions.system, params.system),
        eq(discoveredPositions.selfExplored, true),
        gt(discoveredPositions.createdAt, mission.createdAt),
      ));

    const progress = Math.min(count, params.quota);
    if (progress >= params.quota) {
      await this.completeExplorationMission(mission, userId);
    } else {
      // Update progress in parameters (cosmetic, for UI)
      await db.update(pveMissions).set({
        parameters: { ...params, progress },
      }).where(eq(pveMissions.id, mission.id));
    }
  }
}
```

### completeExplorationMission

```ts
async completeExplorationMission(mission, userId) {
  const rewards = mission.rewards as ExplorationRewards;
  // Crédite le homeworld
  const [homeworld] = await db.select({ id: planets.id })
    .from(planets)
    .where(and(eq(planets.userId, userId), eq(planets.planetClassId, 'homeworld')))
    .limit(1);

  if (homeworld) {
    await db.update(planets).set({
      minerai: sql`${planets.minerai} + ${rewards.minerai}`,
      silicium: sql`${planets.silicium} + ${rewards.silicium}`,
      hydrogene: sql`${planets.hydrogene} + ${rewards.hydrogene}`,
    }).where(eq(planets.id, homeworld.id));
  }

  if (rewards.exilium > 0 && exiliumService) {
    await exiliumService.credit(userId, rewards.exilium, 'exploration_mission', { missionId: mission.id });
  }

  await db.update(pveMissions).set({ status: 'completed' })
    .where(eq(pveMissions.id, mission.id));

  // Notification
  publishNotification(redis, userId, {
    type: 'exploration-mission-completed',
    payload: { missionId: mission.id, rewards },
  });

  // Création d'un report (mission)
  reportService.create({ userId, missionType: 'exploration', title: ... });
}
```

---

## 4. UI

### Centre de missions

Page existante : `apps/web/src/pages/CommandCenter.tsx` ou équivalent. On ajoute un onglet "Exploration" à côté de "Mining" et "Pirates".

Carte de mission (`ExplorationMissionCard.tsx`) :
```
┌────────────────────────────────────┐
│ 🔭 Cartographie du système [4:12]  │
│ Progression : 1/3 découvertes       │
│ Récompense : 4 200 Mi · 3 150 Si … │
│ Expire dans 41h                    │
│ [Lancer une exploration →]          │
└────────────────────────────────────┘
```

Le bouton redirige vers `/fleet/send?mission=explore&galaxy=4&system=12&pveMissionId=…`.

### Hook pveMissionId dans send-fleet

Le système actuel passe déjà `pveMissionId` pour mine/pirate. On l'accepte juste pour exploration sans logique différente côté send-fleet (pas de start/release pour exploration : la validation se fait à la complétion de l'`explore-done`).

### Notification toast à la complétion

À la complétion, le worker émet une notif SSE → toast "Mission d'exploration terminée — +4 200 Mi etc."

---

## 5. Edge cases

| Cas | Comportement |
|---|---|
| Joueur n'a pas `planetaryExploration` ≥ 1 | Pas de génération, `nextExplorationDiscoveryAt` reste null. |
| Joueur découvre une position dans la zone par hasard (mission perso) | Compte pour le quota (la mission n'a pas besoin d'être déclenchée explicitement par le contrat). |
| Joueur achète un rapport d'exploration sur la zone | Ne compte pas (`selfExplored = false`). |
| Quota atteint via positions découvertes avant l'acceptation du contrat | Ne compte pas (`createdAt > mission.createdAt`). |
| Mission expire avant complétion | Status `expired`, aucune récompense. |
| Le système choisi est vide ou full-belt | Le tirage évite les bordures ; les positions belt 8 et 16 ne peuvent pas être explorées (`explore.validateFleet`) → quota effectif = 6 max sur un système, OK pour quota 2-5. |
| Joueur abandonne la planète mère | `homeworld` introuvable → on skip le crédit ressources mais on marque `completed` quand même (cas rare). |

---

## 6. Tests

### Game-engine
`packages/game-engine/src/formulas/pve.test.ts` :
- `explorationQuota(level)` → 2/2/2/2/2/2/3/3/3/4/4/4/5… (clamping borné)
- `explorationRewards(level, quota)` → linéarité simple, exilium toujours 1

### PvE service
`apps/api/src/modules/pve/__tests__/exploration-mission.test.ts` :
- `generateExplorationMission` : tire un système à distance ≥ min, retire systèmes saturés, n'override pas un slot occupé
- `checkExplorationCompletion` :
  - quota non atteint → progress mis à jour
  - quota atteint → mission completed, ressources créditées sur homeworld
  - position découverte avant `createdAt` → ne compte pas
  - position purchased (`selfExplored=false`) → ne compte pas

### explore.handler
Test existant `explore.handler.test.ts` à compléter :
- vérifier que `pveService.checkExplorationCompletion` est appelé après `processPhase('explore-done')`

---

## 7. Migration & rollout

- Migration Drizzle : ajout colonne `next_exploration_discovery_at`. Pas de backfill (toutes les valeurs à null = pas de génération avant la prochaine matérialisation).
- Universe config (seed) : ajout de 3 clés
  - `pve_max_exploration_missions = 2`
  - `pve_exploration_min_distance = 3`
  - `pve_exploration_expiration_hours = 48`
- Pas de feature flag — le gating par `planetaryExploration ≥ 1` suffit à protéger les nouveaux joueurs.

---

## 8. Phases suivantes (hors scope)

- **P2 — Anomalies** : nouveau handler de mission qui résout aléatoirement à l'arrivée (épave, embuscade, artefact). Cible les positions explorées.
- **P3 — Bounty rare** : contrats long-terme (no expiration), ciblant un biome de rareté précise. Fort gain.
