# Refonte de l'onboarding — Nouvelles quêtes tutoriel

**Date** : 2026-03-18

## Problème

L'onboarding actuel (12 quêtes) passe directement de l'usine de robots au chantier spatial, sans guider le joueur vers la recherche. Le joueur ne découvre ni le labo, ni les technologies, ni les mouvements de flotte avant d'arriver au minage. Le centre de missions est débloqué trop tôt par rapport à la progression naturelle. Au final, le joueur accumule trop de ressources via les récompenses et n'a pas besoin de compter sur sa production.

## Solution

### 1. Nouvelle séquence de 16 quêtes

| # | ID | Titre | Type condition | Target | Valeur | M | S | H |
|---|-----|-------|---------------|--------|--------|---|---|---|
| 1 | quest_1 | Premiers pas | `building_level` | mineraiMine | 1 | 100 | 0 | 0 |
| 2 | quest_2 | Fondations technologiques | `building_level` | siliciumMine | 1 | 0 | 100 | 0 |
| 3 | quest_3 | Alimenter la colonie | `building_level` | solarPlant | 1 | 100 | 75 | 0 |
| 4 | quest_4 | Expansion minière | `building_level` | mineraiMine | 3 | 200 | 100 | 0 |
| 5 | quest_5 | Équilibre énergétique | `building_level` | solarPlant | 3 | 250 | 150 | 50 |
| 6 | quest_6 | L'automatisation | `building_level` | robotics | 1 | 350 | 200 | 150 |
| 7 | quest_7 | La science avant tout | `building_level` | researchLab | 1 | 200 | 400 | 200 |
| 8 | quest_8 | Maîtrise énergétique | `research_level` | energyTech | 1 | 150 | 350 | 200 |
| 9 | quest_9 | Premiers moteurs | `research_level` | combustion | 1 | 400 | 200 | 300 |
| 10 | quest_10 | Le chantier spatial | `building_level` | shipyard | 1 | 500 | 300 | 150 |
| 11 | quest_11 | Premier vol | `ship_count` | explorer | 1 | 600 | 350 | 150 |
| 12 | quest_12 | Cargaison abandonnée | `fleet_return` | any | 1 | 800 | 450 | 200 |
| 13 | quest_13 | Agrandir le chantier | `building_level` | shipyard | 2 | 1000 | 500 | 200 |
| 14 | quest_14 | Premier prospecteur | `ship_count` | prospector | 1 | 1200 | 600 | 200 |
| 15 | quest_15 | Première récolte | `mission_complete` | mine | 1 | 1500 | 700 | 250 |
| 16 | quest_16 | Centre de missions | `building_level` | missionCenter | 1 | 1800 | 800 | 250 |

**Total récompenses** : ~9 150 M, ~5 275 S, ~2 300 H

**Note :** La quête 8 (energyTech) est nécessaire car la recherche `combustion` a pour prérequis `energyTech niv. 1`. Sans cette quête, le joueur serait bloqué sans guidance.

### 2. Nouveaux types de condition

#### `research_level`

Déclenché par le research-completion worker quand une recherche atteint un certain niveau. Event :
```
{ type: 'research_level', targetId: 'combustion', targetValue: 1 }
```

Le worker `research-completion.worker.ts` doit appeler `tutorialService.checkAndComplete()` après la complétion d'une recherche, en passant le `researchId` et le nouveau niveau.

#### `fleet_return`

Déclenché par le fleet-return worker quand n'importe quelle flotte revient. Event :
```
{ type: 'fleet_return', targetId: 'any', targetValue: 1 }
```

Le worker `fleet-return.worker.ts` doit appeler `tutorialService.checkAndComplete()` pour tout retour de flotte (pas seulement les missions mine).

**Matching wildcard :** La méthode `checkAndComplete` doit traiter `targetId === 'any'` comme un wildcard : si le `targetId` de la quête est `'any'`, la comparaison `targetId` est ignorée et seul le `type` et `targetValue` sont vérifiés.

### 3. Modification des prérequis du prospecteur

Retirer `missionCenter` des prérequis du prospecteur. Le prospecteur ne nécessite plus que `shipyard niv. 2`.

**Fichiers impactés :**
- `packages/game-engine/src/constants/ships.ts` (ligne 144-146) : retirer `{ buildingId: 'missionCenter', level: 1 }`
- `packages/db/src/seed-game-config.ts` (ligne 88) : idem dans les données de seed

### 4. Quête 12 — Cargaison abandonnée

**Texte narratif :** « Nos scanners ont détecté un vaisseau de transport abandonné dans la ceinture d'astéroïdes en [{galaxy}:{system}:8]. Envoyez votre explorateur récupérer la cargaison ! »

Le texte contient un placeholder `{galaxy}:{system}` remplacé dynamiquement par les coordonnées du système du joueur. La position est toujours 8 (ceinture d'astéroïdes).

**Validation :** La quête se valide quand n'importe quelle flotte du joueur revient (type `fleet_return`). Pas de vérification des coordonnées de destination — le narratif guide, mais la mécanique est souple. La récompense de quête (800 M, 450 S, 200 H) **représente** la cargaison récupérée ; la flotte elle-même revient à vide.

**Frontend :** Le texte narratif dans `TutorialPanel.tsx` affiche les coordonnées réelles. Un lien cliquable redirige vers `/fleet?galaxy={g}&system={s}&position=8&mission=transport` pour pré-remplir la page Flotte.

### 5. Quête 15 — Première récolte (mission PvE tutoriel)

**Déclenchement :** Quand le joueur complète la quête 14 (prospecteur construit), le `tutorialService` génère automatiquement une mission PvE de minage en appelant `pveService.generateMiningMission(userId, galaxy, system, 1)` avec `centerLevel = 1` (le joueur n'a pas encore de centre de missions ; on simule un niveau 1 pour la génération de cette mission unique).

**Dépendance :** `createTutorialService` doit recevoir `pveService` en paramètre (actuellement il ne reçoit que `db`). Cela impacte les fichiers qui instancient le service : `app-router.ts` et les workers qui utilisent `tutorialService`.

**Stockage :** Le `pveMissionId` généré est stocké dans un nouveau champ `metadata` (JSONB, nullable) de la table `tutorial_progress`. Format : `{ tutorialMiningMissionId: string }`. Ce champ est nettoyé (mis à `null`) quand la quête 15 est complétée.

**Fallback :** Si `generateMiningMission` échoue (pas de gisement disponible), le service crée un gisement garanti sur la ceinture position 8 du système du joueur avant de réessayer.

**Texte narratif :** « Un gisement prometteur a été repéré en [{galaxy}:{system}:8]. Envoyez vos prospecteurs pour votre première extraction ! »

Avec lien cliquable vers `/fleet?galaxy={g}&system={s}&position=8&mission=mine&pveMissionId={id}`.

**Validation :** Identique à l'existant — `mission_complete` pour `mine` dans le fleet-return worker.

### 6. Coordonnées dynamiques dans l'API

Le endpoint `tutorial.getCurrent` est enrichi pour retourner les coordonnées de la première planète du joueur :

```typescript
{
  isComplete: boolean,
  quest: TutorialQuest | null,
  completedQuests: CompletedQuestEntry[],
  playerCoords: { galaxy: number, system: number } | null,  // NOUVEAU
  tutorialMiningMissionId: string | null,                     // NOUVEAU (quête 15)
}
```

Le frontend utilise `playerCoords` pour interpoler les placeholders `{galaxy}` et `{system}` dans le texte narratif.

### 7. Types TypeScript

Le type `TutorialQuest.condition.type` doit être étendu dans deux fichiers :

- `packages/game-engine/src/constants/tutorial-quests.ts` : union type de condition
- `apps/api/src/modules/tutorial/tutorial.service.ts` : interface `TutorialQuest` et type de l'event dans `checkAndComplete`

Ancien :
```typescript
type: 'building_level' | 'ship_count' | 'mission_complete'
```

Nouveau :
```typescript
type: 'building_level' | 'ship_count' | 'mission_complete' | 'research_level' | 'fleet_return'
```

Les nouveaux types `research_level` et `fleet_return` sont **purement event-driven** (comme `mission_complete`) : ils ne sont pas vérifiés par la méthode `checkCompletion` mais uniquement via les events des workers. La méthode `checkCompletion` n'a pas besoin de nouvelles branches.

### 8. Frontend — TutorialPanel.tsx

Modifications :
- Interpolation des coordonnées dans le texte narratif (remplacer `{galaxy}`, `{system}`)
- Lien cliquable dans le texte pour les quêtes 12 et 15 (redirection vers /fleet avec params)
- Total quêtes passe de 12 à 16 dans la barre de progression

### 9. Migration des joueurs existants

- **Tutoriel terminé** (`isComplete = true`) : aucun changement, le joueur n'est pas affecté.
- **Tutoriel en cours** : le `currentQuestId` pointe sur un ancien ID de quête. Comme les IDs `quest_1` à `quest_6` ne changent pas de condition, les joueurs qui en sont aux quêtes 1-6 ne sont pas affectés. Pour les joueurs aux quêtes 7-12 (ancien système), on reset leur `currentQuestId` à `quest_7` (la nouvelle quête labo) lors du seed. Les quêtes déjà complétées dans `completedQuests` restent intactes.
- **Stratégie** : dans le script de seed, ajouter une requête SQL qui met à jour les `currentQuestId` des joueurs en cours si l'ID pointe sur une quête qui a changé de sens (quest_7 à quest_12 ancien → quest_7 nouveau).

## Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `packages/game-engine/src/constants/tutorial-quests.ts` | Réécrire les 16 quêtes + étendre le type `condition.type` |
| `packages/game-engine/src/constants/ships.ts` | Retirer `missionCenter` des prérequis du prospecteur |
| `packages/db/src/seed-game-config.ts` | Mettre à jour TUTORIAL_QUESTS (16 quêtes) + prérequis prospector + migration joueurs en cours |
| `packages/db/src/schema/tutorial-progress.ts` | Ajouter champ optionnel `metadata` (JSONB, nullable) |
| `apps/api/src/modules/tutorial/tutorial.service.ts` | Étendre types, gestion `research_level` + `fleet_return` + wildcard `any` dans `checkAndComplete`, génération PvE tutoriel lors complétion quête 14, enrichir `getCurrent` avec `playerCoords` + `tutorialMiningMissionId` |
| `apps/api/src/modules/tutorial/tutorial.router.ts` | Passer `playerCoords` + `tutorialMiningMissionId` dans la réponse |
| `apps/api/src/workers/research-completion.worker.ts` | Injecter `tutorialService`, appeler `checkAndComplete` avec `research_level` |
| `apps/api/src/workers/fleet-return.worker.ts` | Appeler `checkAndComplete` avec `fleet_return` pour tout retour de flotte |
| `apps/web/src/components/tutorial/TutorialPanel.tsx` | Interpoler coordonnées, lien Fleet, total 16 quêtes |
| Fichiers d'instanciation (`app-router.ts`, workers) | Ajouter `pveService` en dépendance de `createTutorialService` |

## Ce qui ne change PAS

- Schema `tutorial-quest-definitions` (varchar conditionType, pas d'enum)
- Mécanique de complétion des quêtes (event-driven via workers)
- Récompenses données sur la première planète
- Système de notifications de quête
- Page Missions (toujours liée au centre de missions)
- Formules de minage (prospection, extraction, retour)
- Méthode `checkCompletion` (les nouveaux types sont event-driven uniquement)
