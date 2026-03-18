# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refonte de l'onboarding de 12 à 16 quêtes, avec introduction de la recherche, mouvements de flotte, et mission de minage tutoriel avant le centre de missions.

**Architecture:** Modifications data-driven : les quêtes sont définies dans les constantes game-engine et seedées en DB. Les workers existants sont étendus pour déclencher les nouveaux types de conditions (`research_level`, `fleet_return`). Le tutorial service est enrichi pour générer une mission PvE tutoriel et retourner les coordonnées du joueur.

**Tech Stack:** TypeScript, Drizzle ORM, BullMQ workers, tRPC, React

---

## Chunk 1: Constantes, schema et données

### Task 1: Constantes tutorial-quests.ts — 16 quêtes + nouveaux types

**Files:**
- Modify: `packages/game-engine/src/constants/tutorial-quests.ts`

- [ ] **Step 1: Update TutorialQuest type and rewrite 16 quests**

Replace the entire file content with:

```typescript
export interface TutorialQuest {
  id: string;
  order: number;
  title: string;
  narrativeText: string;
  condition: {
    type: 'building_level' | 'ship_count' | 'mission_complete' | 'research_level' | 'fleet_return';
    targetId: string;
    targetValue: number;
  };
  reward: { minerai: number; silicium: number; hydrogene: number };
}

export const TUTORIAL_QUESTS: TutorialQuest[] = [
  {
    id: 'quest_1',
    order: 1,
    title: 'Premiers pas',
    narrativeText: 'Commandant, bienvenue sur votre nouvelle colonie. Notre priorité est d\'établir une extraction de minerai. Construisez votre première mine pour alimenter nos projets.',
    condition: { type: 'building_level', targetId: 'mineraiMine', targetValue: 1 },
    reward: { minerai: 100, silicium: 0, hydrogene: 0 },
  },
  {
    id: 'quest_2',
    order: 2,
    title: 'Fondations technologiques',
    narrativeText: 'Excellent travail. Le silicium est essentiel pour toute technologie avancée. Lancez l\'extraction de silicium sans tarder.',
    condition: { type: 'building_level', targetId: 'siliciumMine', targetValue: 1 },
    reward: { minerai: 0, silicium: 100, hydrogene: 0 },
  },
  {
    id: 'quest_3',
    order: 3,
    title: 'Alimenter la colonie',
    narrativeText: 'Nos installations ont besoin d\'énergie pour fonctionner. Une centrale solaire assurera l\'alimentation de vos mines.',
    condition: { type: 'building_level', targetId: 'solarPlant', targetValue: 1 },
    reward: { minerai: 100, silicium: 75, hydrogene: 0 },
  },
  {
    id: 'quest_4',
    order: 4,
    title: 'Expansion minière',
    narrativeText: 'Bien. Il est temps d\'accélérer notre production. Montez votre mine de minerai au niveau 3 pour assurer un flux constant.',
    condition: { type: 'building_level', targetId: 'mineraiMine', targetValue: 3 },
    reward: { minerai: 200, silicium: 100, hydrogene: 0 },
  },
  {
    id: 'quest_5',
    order: 5,
    title: 'Équilibre énergétique',
    narrativeText: 'La croissance exige de l\'énergie. Améliorez votre centrale solaire au niveau 3 pour soutenir l\'expansion.',
    condition: { type: 'building_level', targetId: 'solarPlant', targetValue: 3 },
    reward: { minerai: 250, silicium: 150, hydrogene: 50 },
  },
  {
    id: 'quest_6',
    order: 6,
    title: 'L\'automatisation',
    narrativeText: 'Les robots de construction accéléreront tous vos projets futurs. Construisez une usine de robots.',
    condition: { type: 'building_level', targetId: 'robotics', targetValue: 1 },
    reward: { minerai: 350, silicium: 200, hydrogene: 150 },
  },
  {
    id: 'quest_7',
    order: 7,
    title: 'La science avant tout',
    narrativeText: 'La recherche est la clé du progrès. Construisez un laboratoire de recherche pour débloquer les technologies avancées.',
    condition: { type: 'building_level', targetId: 'researchLab', targetValue: 1 },
    reward: { minerai: 200, silicium: 400, hydrogene: 200 },
  },
  {
    id: 'quest_8',
    order: 8,
    title: 'Maîtrise énergétique',
    narrativeText: 'Avant de concevoir des moteurs, nous devons maîtriser les fondamentaux de l\'énergie. Recherchez la Technologie Énergie.',
    condition: { type: 'research_level', targetId: 'energyTech', targetValue: 1 },
    reward: { minerai: 150, silicium: 350, hydrogene: 200 },
  },
  {
    id: 'quest_9',
    order: 9,
    title: 'Premiers moteurs',
    narrativeText: 'Nos scientifiques peuvent désormais concevoir des moteurs à combustion. Cette propulsion sera essentielle pour nos futurs vaisseaux.',
    condition: { type: 'research_level', targetId: 'combustion', targetValue: 1 },
    reward: { minerai: 400, silicium: 200, hydrogene: 300 },
  },
  {
    id: 'quest_10',
    order: 10,
    title: 'Le chantier spatial',
    narrativeText: 'Commandant, il est temps de conquérir les étoiles. Un chantier spatial nous permettra de construire nos premiers vaisseaux.',
    condition: { type: 'building_level', targetId: 'shipyard', targetValue: 1 },
    reward: { minerai: 500, silicium: 300, hydrogene: 150 },
  },
  {
    id: 'quest_11',
    order: 11,
    title: 'Premier vol',
    narrativeText: 'Le moment est historique. Construisez votre premier Explorateur et ouvrez la voie vers les systèmes voisins.',
    condition: { type: 'ship_count', targetId: 'explorer', targetValue: 1 },
    reward: { minerai: 600, silicium: 350, hydrogene: 150 },
  },
  {
    id: 'quest_12',
    order: 12,
    title: 'Cargaison abandonnée',
    narrativeText: 'Nos scanners ont détecté un vaisseau de transport abandonné dans la ceinture d\'astéroïdes en [{galaxy}:{system}:8]. Envoyez votre explorateur récupérer la cargaison !',
    condition: { type: 'fleet_return', targetId: 'any', targetValue: 1 },
    reward: { minerai: 800, silicium: 450, hydrogene: 200 },
  },
  {
    id: 'quest_13',
    order: 13,
    title: 'Agrandir le chantier',
    narrativeText: 'Pour construire des vaisseaux plus avancés, nous devons agrandir notre chantier spatial au niveau 2.',
    condition: { type: 'building_level', targetId: 'shipyard', targetValue: 2 },
    reward: { minerai: 1000, silicium: 500, hydrogene: 200 },
  },
  {
    id: 'quest_14',
    order: 14,
    title: 'Premier prospecteur',
    narrativeText: 'Le Prospecteur est un vaisseau minier spécialisé. Construisez-en un pour exploiter les gisements d\'astéroïdes.',
    condition: { type: 'ship_count', targetId: 'prospector', targetValue: 1 },
    reward: { minerai: 1200, silicium: 600, hydrogene: 200 },
  },
  {
    id: 'quest_15',
    order: 15,
    title: 'Première récolte',
    narrativeText: 'Un gisement prometteur a été repéré en [{galaxy}:{system}:8]. Envoyez vos prospecteurs pour votre première extraction !',
    condition: { type: 'mission_complete', targetId: 'mine', targetValue: 1 },
    reward: { minerai: 1500, silicium: 700, hydrogene: 250 },
  },
  {
    id: 'quest_16',
    order: 16,
    title: 'Centre de missions',
    narrativeText: 'Votre colonie est florissante. Un centre de missions vous permettra de détecter de nouvelles opportunités : gisements et menaces pirates.',
    condition: { type: 'building_level', targetId: 'missionCenter', targetValue: 1 },
    reward: { minerai: 1800, silicium: 800, hydrogene: 250 },
  },
];
```

- [ ] **Step 2: Verify compilation**

Run: `cd packages/game-engine && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/constants/tutorial-quests.ts
git commit -m "feat: rewrite tutorial quests to 16 with research_level and fleet_return types"
```

---

### Task 2: Prérequis prospecteur — retirer missionCenter

**Files:**
- Modify: `packages/game-engine/src/constants/ships.ts:144-146`

- [ ] **Step 1: Remove missionCenter from prospector prerequisites**

In `packages/game-engine/src/constants/ships.ts`, change the prospector `prerequisites` (around line 144):

From:
```typescript
    prerequisites: {
      buildings: [{ buildingId: 'missionCenter', level: 1 }, { buildingId: 'shipyard', level: 2 }],
    },
```

To:
```typescript
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 2 }],
    },
```

- [ ] **Step 2: Verify compilation**

Run: `cd packages/game-engine && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/constants/ships.ts
git commit -m "feat: remove missionCenter prerequisite from prospector"
```

---

### Task 3: Seed data — 16 quêtes + prospecteur

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`

- [ ] **Step 1: Update TUTORIAL_QUESTS array in seed**

Replace the `TUTORIAL_QUESTS` array (around line 277-290) with the 16 new quests. Each entry follows the format `{ id, order, title, narrativeText, conditionType, conditionTargetId, conditionTargetValue, rewardMinerai, rewardSilicium, rewardHydrogene }`.

```typescript
const TUTORIAL_QUESTS = [
  { id: 'quest_1', order: 1, title: 'Premiers pas', narrativeText: "Commandant, bienvenue sur votre nouvelle colonie. Notre priorité est d'établir une extraction de minerai. Construisez votre première mine pour alimenter nos projets.", conditionType: 'building_level', conditionTargetId: 'mineraiMine', conditionTargetValue: 1, rewardMinerai: 100, rewardSilicium: 0, rewardHydrogene: 0 },
  { id: 'quest_2', order: 2, title: 'Fondations technologiques', narrativeText: "Excellent travail. Le silicium est essentiel pour toute technologie avancée. Lancez l'extraction de silicium sans tarder.", conditionType: 'building_level', conditionTargetId: 'siliciumMine', conditionTargetValue: 1, rewardMinerai: 0, rewardSilicium: 100, rewardHydrogene: 0 },
  { id: 'quest_3', order: 3, title: 'Alimenter la colonie', narrativeText: "Nos installations ont besoin d'énergie pour fonctionner. Une centrale solaire assurera l'alimentation de vos mines.", conditionType: 'building_level', conditionTargetId: 'solarPlant', conditionTargetValue: 1, rewardMinerai: 100, rewardSilicium: 75, rewardHydrogene: 0 },
  { id: 'quest_4', order: 4, title: 'Expansion minière', narrativeText: "Bien. Il est temps d'accélérer notre production. Montez votre mine de minerai au niveau 3 pour assurer un flux constant.", conditionType: 'building_level', conditionTargetId: 'mineraiMine', conditionTargetValue: 3, rewardMinerai: 200, rewardSilicium: 100, rewardHydrogene: 0 },
  { id: 'quest_5', order: 5, title: 'Équilibre énergétique', narrativeText: "La croissance exige de l'énergie. Améliorez votre centrale solaire au niveau 3 pour soutenir l'expansion.", conditionType: 'building_level', conditionTargetId: 'solarPlant', conditionTargetValue: 3, rewardMinerai: 250, rewardSilicium: 150, rewardHydrogene: 50 },
  { id: 'quest_6', order: 6, title: "L'automatisation", narrativeText: 'Les robots de construction accéléreront tous vos projets futurs. Construisez une usine de robots.', conditionType: 'building_level', conditionTargetId: 'robotics', conditionTargetValue: 1, rewardMinerai: 350, rewardSilicium: 200, rewardHydrogene: 150 },
  { id: 'quest_7', order: 7, title: 'La science avant tout', narrativeText: "La recherche est la clé du progrès. Construisez un laboratoire de recherche pour débloquer les technologies avancées.", conditionType: 'building_level', conditionTargetId: 'researchLab', conditionTargetValue: 1, rewardMinerai: 200, rewardSilicium: 400, rewardHydrogene: 200 },
  { id: 'quest_8', order: 8, title: 'Maîtrise énergétique', narrativeText: "Avant de concevoir des moteurs, nous devons maîtriser les fondamentaux de l'énergie. Recherchez la Technologie Énergie.", conditionType: 'research_level', conditionTargetId: 'energyTech', conditionTargetValue: 1, rewardMinerai: 150, rewardSilicium: 350, rewardHydrogene: 200 },
  { id: 'quest_9', order: 9, title: 'Premiers moteurs', narrativeText: "Nos scientifiques peuvent désormais concevoir des moteurs à combustion. Cette propulsion sera essentielle pour nos futurs vaisseaux.", conditionType: 'research_level', conditionTargetId: 'combustion', conditionTargetValue: 1, rewardMinerai: 400, rewardSilicium: 200, rewardHydrogene: 300 },
  { id: 'quest_10', order: 10, title: 'Le chantier spatial', narrativeText: "Commandant, il est temps de conquérir les étoiles. Un chantier spatial nous permettra de construire nos premiers vaisseaux.", conditionType: 'building_level', conditionTargetId: 'shipyard', conditionTargetValue: 1, rewardMinerai: 500, rewardSilicium: 300, rewardHydrogene: 150 },
  { id: 'quest_11', order: 11, title: 'Premier vol', narrativeText: "Le moment est historique. Construisez votre premier Explorateur et ouvrez la voie vers les systèmes voisins.", conditionType: 'ship_count', conditionTargetId: 'explorer', conditionTargetValue: 1, rewardMinerai: 600, rewardSilicium: 350, rewardHydrogene: 150 },
  { id: 'quest_12', order: 12, title: 'Cargaison abandonnée', narrativeText: "Nos scanners ont détecté un vaisseau de transport abandonné dans la ceinture d'astéroïdes en [{galaxy}:{system}:8]. Envoyez votre explorateur récupérer la cargaison !", conditionType: 'fleet_return', conditionTargetId: 'any', conditionTargetValue: 1, rewardMinerai: 800, rewardSilicium: 450, rewardHydrogene: 200 },
  { id: 'quest_13', order: 13, title: 'Agrandir le chantier', narrativeText: "Pour construire des vaisseaux plus avancés, nous devons agrandir notre chantier spatial au niveau 2.", conditionType: 'building_level', conditionTargetId: 'shipyard', conditionTargetValue: 2, rewardMinerai: 1000, rewardSilicium: 500, rewardHydrogene: 200 },
  { id: 'quest_14', order: 14, title: 'Premier prospecteur', narrativeText: "Le Prospecteur est un vaisseau minier spécialisé. Construisez-en un pour exploiter les gisements d'astéroïdes.", conditionType: 'ship_count', conditionTargetId: 'prospector', conditionTargetValue: 1, rewardMinerai: 1200, rewardSilicium: 600, rewardHydrogene: 200 },
  { id: 'quest_15', order: 15, title: 'Première récolte', narrativeText: "Un gisement prometteur a été repéré en [{galaxy}:{system}:8]. Envoyez vos prospecteurs pour votre première extraction !", conditionType: 'mission_complete', conditionTargetId: 'mine', conditionTargetValue: 1, rewardMinerai: 1500, rewardSilicium: 700, rewardHydrogene: 250 },
  { id: 'quest_16', order: 16, title: 'Centre de missions', narrativeText: "Votre colonie est florissante. Un centre de missions vous permettra de détecter de nouvelles opportunités : gisements et menaces pirates.", conditionType: 'building_level', conditionTargetId: 'missionCenter', conditionTargetValue: 1, rewardMinerai: 1800, rewardSilicium: 800, rewardHydrogene: 250 },
];
```

- [ ] **Step 2: Update prospector prerequisites in SHIPS array**

In the `SHIPS` array (around line 88), change prospector `prerequisites` from:
```
prerequisites: { buildings: [{ buildingId: 'missionCenter', level: 1 }, { buildingId: 'shipyard', level: 2 }], research: [] }
```
To:
```
prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [] }
```

- [ ] **Step 3: Verify compilation**

Run: `cd packages/db && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/seed-game-config.ts
git commit -m "feat: update seed data with 16 tutorial quests and remove prospector missionCenter prereq"
```

---

### Task 4: Schema tutorial_progress — ajouter metadata

**Files:**
- Modify: `packages/db/src/schema/tutorial-progress.ts`

- [ ] **Step 1: Add metadata column**

Add after the `isComplete` line:

```typescript
  metadata: jsonb('metadata'),
```

The import line already has `jsonb` imported. The column is nullable by default — no migration needed for existing rows.

- [ ] **Step 2: Verify compilation**

Run: `cd packages/db && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/tutorial-progress.ts
git commit -m "feat: add metadata JSONB column to tutorial_progress"
```

---

## Chunk 2: Backend — tutorial service et workers

### Task 5: Tutorial service — nouveaux types, wildcard, pveService, getCurrent enrichi

**Files:**
- Modify: `apps/api/src/modules/tutorial/tutorial.service.ts`

- [ ] **Step 1: Update the condition type union and add pveService parameter**

Change the function signature and types:

```typescript
// Line 1: add planets import (already imported)
// Lines 5-16: Update TutorialQuest interface
export interface TutorialQuest {
  id: string;
  order: number;
  title: string;
  narrativeText: string;
  condition: {
    type: 'building_level' | 'ship_count' | 'mission_complete' | 'research_level' | 'fleet_return';
    targetId: string;
    targetValue: number;
  };
  reward: { minerai: number; silicium: number; hydrogene: number };
}
```

Change the `createTutorialService` signature (line 23) from:
```typescript
export function createTutorialService(db: Database) {
```
To:
```typescript
export function createTutorialService(db: Database, pveService?: { generateMiningMission: (userId: string, galaxy: number, system: number, centerLevel: number) => Promise<void> }) {
```

Note: `pveService` is optional to avoid breaking existing callers that don't need PvE generation (like workers for building/shipyard). Only the app-router and fleet-return worker will pass it.

- [ ] **Step 2: Update loadQuests type cast**

In `loadQuests()` (line 35), change the type cast from:
```typescript
type: r.conditionType as 'building_level' | 'ship_count' | 'mission_complete',
```
To:
```typescript
type: r.conditionType as TutorialQuest['condition']['type'],
```

- [ ] **Step 3: Update checkAndComplete — event type + wildcard matching**

Change `checkAndComplete` method signature (line 80) from:
```typescript
async checkAndComplete(userId: string, event: {
  type: 'building_level' | 'ship_count' | 'mission_complete';
  targetId: string;
  targetValue: number;
}) {
```
To:
```typescript
async checkAndComplete(userId: string, event: {
  type: TutorialQuest['condition']['type'];
  targetId: string;
  targetValue: number;
}) {
```

Change the targetId matching (line 94) from:
```typescript
if (quest.condition.targetId !== event.targetId) return null;
```
To:
```typescript
if (quest.condition.targetId !== 'any' && quest.condition.targetId !== event.targetId) return null;
```

- [ ] **Step 4: Add post-completion hook for PvE mission generation**

After the `// Update progress` block (after line 130), add before the return:

```typescript
      // Generate tutorial mining mission when quest_14 (prospector) is completed
      if (quest.id === 'quest_14' && nextQuest?.id === 'quest_15' && pveService) {
        try {
          const [playerPlanet] = await db
            .select()
            .from(planets)
            .where(eq(planets.userId, userId))
            .limit(1);
          if (playerPlanet) {
            await pveService.generateMiningMission(userId, playerPlanet.galaxy, playerPlanet.system, 1);
            // Store the mining mission ID in tutorial progress metadata
            const { pveMissions } = await import('@ogame-clone/db');
            const [miningMission] = await db
              .select()
              .from(pveMissions)
              .where(and(
                eq(pveMissions.userId, userId),
                eq(pveMissions.missionType, 'mine'),
                eq(pveMissions.status, 'available'),
              ))
              .limit(1);
            if (miningMission) {
              await db
                .update(tutorialProgress)
                .set({ metadata: { tutorialMiningMissionId: miningMission.id } })
                .where(eq(tutorialProgress.userId, userId));
            }
          }
        } catch (e) {
          console.error('[tutorial] Failed to generate tutorial mining mission:', e);
        }
      }
```

Note: import `pveMissions` at the top of the file instead of the dynamic import. Add to the existing import line:

```typescript
import { tutorialProgress, planets, planetBuildings, planetShips, tutorialQuestDefinitions, pveMissions } from '@ogame-clone/db';
```

Also add `and` to the drizzle-orm import if not already there (it is — line 1).

- [ ] **Step 5: Enrich getCurrent with playerCoords and tutorialMiningMissionId**

Replace the `getCurrent` method (lines 64-78) with:

```typescript
    async getCurrent(userId: string) {
      const progress = await this.getOrCreateProgress(userId);

      if (progress.isComplete) {
        return { isComplete: true, quest: null, completedQuests: progress.completedQuests as CompletedQuestEntry[], playerCoords: null, tutorialMiningMissionId: null };
      }

      const quests = await loadQuests();
      const quest = quests.find(q => q.id === progress.currentQuestId);

      // Get player's first planet coordinates
      const [planet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system })
        .from(planets)
        .where(eq(planets.userId, userId))
        .limit(1);

      const metadata = progress.metadata as { tutorialMiningMissionId?: string } | null;

      return {
        isComplete: false,
        quest: quest ?? null,
        completedQuests: progress.completedQuests as CompletedQuestEntry[],
        playerCoords: planet ? { galaxy: planet.galaxy, system: planet.system } : null,
        tutorialMiningMissionId: metadata?.tutorialMiningMissionId ?? null,
      };
    },
```

- [ ] **Step 6: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`
Fix any import issues.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/tutorial/tutorial.service.ts
git commit -m "feat: extend tutorial service with research_level, fleet_return, PvE generation, and playerCoords"
```

---

### Task 6: Tutorial router — enrichir la réponse

**Files:**
- Modify: `apps/api/src/modules/tutorial/tutorial.router.ts`

- [ ] **Step 1: No code change needed**

The router already passes through whatever `getCurrent` returns. Since we enriched the return value in Task 5, the frontend will automatically receive `playerCoords` and `tutorialMiningMissionId`. No change needed in the router.

Verify by reading the file — it's a simple passthrough:
```typescript
getCurrent: protectedProcedure
  .query(async ({ ctx }) => {
    return tutorialService.getCurrent(ctx.userId!);
  }),
```

- [ ] **Step 2: Commit (skip — no changes)**

---

### Task 7: Research completion worker — appeler checkAndComplete

**Files:**
- Modify: `apps/api/src/workers/research-completion.worker.ts`

- [ ] **Step 1: Add tutorialService import and instantiation**

Add import (after line 8):
```typescript
import { createTutorialService } from '../modules/tutorial/tutorial.service.js';
```

Add instantiation inside `startResearchCompletionWorker` (after line 15):
```typescript
  const tutorialService = createTutorialService(db);
```

- [ ] **Step 2: Add checkAndComplete call after research completion**

Inside the worker callback, after the notification/gameEvent block (after line 53, inside the `if (entry)` block), add:

```typescript
          // Tutorial quest check (research_level)
          const tutorialResult = await tutorialService.checkAndComplete(entry.userId, {
            type: 'research_level',
            targetId: result.researchId,
            targetValue: result.newLevel,
          });
          if (tutorialResult) {
            publishNotification(redis, entry.userId, {
              type: 'tutorial-quest-complete',
              payload: {
                questId: tutorialResult.completedQuest.id,
                questTitle: tutorialResult.completedQuest.title,
                reward: tutorialResult.reward,
                nextQuest: tutorialResult.nextQuest ? { id: tutorialResult.nextQuest.id, title: tutorialResult.nextQuest.title } : null,
                tutorialComplete: tutorialResult.tutorialComplete,
              },
            });

            await db.insert(gameEvents).values({
              userId: entry.userId,
              planetId: entry.planetId,
              type: 'tutorial-quest-done',
              payload: {
                questId: tutorialResult.completedQuest.id,
                questTitle: tutorialResult.completedQuest.title,
                reward: tutorialResult.reward,
                tutorialComplete: tutorialResult.tutorialComplete,
              },
            });
          }
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/research-completion.worker.ts
git commit -m "feat: integrate tutorial checkAndComplete in research completion worker"
```

---

### Task 8: Fleet return worker — fleet_return pour tout retour de flotte

**Files:**
- Modify: `apps/api/src/workers/fleet-return.worker.ts`

- [ ] **Step 1: Add fleet_return tutorial check for all fleet returns**

After the existing `mission_complete` check block for mine missions (after line 103, but still inside the `if (result.userId)` block), add:

```typescript
          // Tutorial quest check (fleet_return — any fleet return)
          {
            const tutorialResult = await tutorialService.checkAndComplete(result.userId, {
              type: 'fleet_return',
              targetId: 'any',
              targetValue: 1,
            });
            if (tutorialResult) {
              publishNotification(redis, result.userId, {
                type: 'tutorial-quest-complete',
                payload: {
                  questId: tutorialResult.completedQuest.id,
                  questTitle: tutorialResult.completedQuest.title,
                  reward: tutorialResult.reward,
                  nextQuest: tutorialResult.nextQuest ? { id: tutorialResult.nextQuest.id, title: tutorialResult.nextQuest.title } : null,
                  tutorialComplete: tutorialResult.tutorialComplete,
                },
              });

              await db.insert(gameEvents).values({
                userId: result.userId,
                planetId: result.originPlanetId,
                type: 'tutorial-quest-done',
                payload: {
                  questId: tutorialResult.completedQuest.id,
                  questTitle: tutorialResult.completedQuest.title,
                  reward: tutorialResult.reward,
                  tutorialComplete: tutorialResult.tutorialComplete,
                },
              });
            }
          }
```

- [ ] **Step 2: Update tutorialService instantiation to pass pveService**

Change line 23 from:
```typescript
  const tutorialService = createTutorialService(db);
```
To:
```typescript
  const tutorialService = createTutorialService(db, pveService);
```

This enables the tutorial service to generate the PvE mining mission when quest_14 is completed (prospector built → triggers quest advance → which may trigger PvE generation if next quest is quest_15).

Note: `pveService` is already instantiated at line 21 in this file.

- [ ] **Step 3: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/fleet-return.worker.ts
git commit -m "feat: add fleet_return tutorial check and pass pveService to tutorialService"
```

---

### Task 9: App router — passer pveService au tutorialService

**Files:**
- Modify: `apps/api/src/trpc/app-router.ts:61`

- [ ] **Step 1: Pass pveService to createTutorialService**

Change line 61 from:
```typescript
  const tutorialService = createTutorialService(db);
```
To:
```typescript
  const tutorialService = createTutorialService(db, pveService);
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/trpc/app-router.ts
git commit -m "feat: pass pveService to tutorialService in app router"
```

---

## Chunk 3: Frontend

### Task 10: TutorialPanel — coordonnées, liens, 16 quêtes

**Files:**
- Modify: `apps/web/src/components/tutorial/TutorialPanel.tsx`

- [ ] **Step 1: Update totalQuests and add coordinate interpolation**

Change line 13 from:
```typescript
  const totalQuests = 12;
```
To:
```typescript
  const totalQuests = 16;
```

- [ ] **Step 2: Add narrative text interpolation and link**

Add a helper function before the return statement, and update the narrative display. Replace the quest content section (lines 60-66) with:

```tsx
      {/* Quest content */}
      <div className="p-3">
        <h4 className="text-xs font-semibold text-foreground">
          {quest.title}
        </h4>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground italic">
          "{narrativeText}"
        </p>

        {fleetLink && (
          <a
            href={fleetLink}
            className="mt-1.5 inline-block text-[11px] font-medium text-amber-400 underline underline-offset-2 hover:text-amber-300"
          >
            Envoyer la flotte
          </a>
        )}
```

And add the interpolation logic after `const progressPercent` (line 14):

```typescript
  // Interpolate coordinates in narrative text
  const playerCoords = data.playerCoords;
  let narrativeText = quest.narrativeText;
  if (playerCoords) {
    narrativeText = narrativeText
      .replace('{galaxy}', String(playerCoords.galaxy))
      .replace('{system}', String(playerCoords.system));
  }

  // Generate fleet link for quests 12 (transport) and 15 (mine)
  let fleetLink: string | null = null;
  if (playerCoords) {
    if (quest.id === 'quest_12') {
      fleetLink = `/fleet?galaxy=${playerCoords.galaxy}&system=${playerCoords.system}&position=8&mission=transport`;
    } else if (quest.id === 'quest_15' && data.tutorialMiningMissionId) {
      fleetLink = `/fleet?galaxy=${playerCoords.galaxy}&system=${playerCoords.system}&position=8&mission=mine&pveMissionId=${data.tutorialMiningMissionId}`;
    }
  }
```

- [ ] **Step 3: Verify compilation**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/tutorial/TutorialPanel.tsx
git commit -m "feat: update TutorialPanel with 16 quests, coordinate interpolation, and fleet links"
```

---

## Chunk 4: Build, push

### Task 11: Build complet + push

- [ ] **Step 1: Build all packages**

Run: `npx turbo build`

- [ ] **Step 2: Push**

Run: `git push`

---

## Notes pour le déploiement

Après déploiement :
1. `drizzle-kit push` pour ajouter la colonne `metadata` à `tutorial_progress` et les nouvelles valeurs d'enum `fleet_phase`
2. Re-seed avec `npx tsx packages/db/src/seed-game-config.ts` pour mettre à jour les quêtes et prérequis
3. Les joueurs avec tutoriel terminé ne sont pas affectés
4. Les joueurs en cours aux quêtes 7-12 (ancien système) seront sur des quêtes dont le contenu a changé — surveiller les cas edge
