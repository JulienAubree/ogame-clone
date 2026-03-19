# Système de bonus unifié (recherches + bâtiments) — Design Spec

## Objectif

Remplacer tous les effets hardcodés (robotique, labo, moteurs, combat techs, etc.) par un système de bonus configurable via l'admin panel. Chaque bâtiment ou recherche peut définir un ou plusieurs bonus sur une stat, avec un pourcentage par niveau et un filtre de catégorie optionnel.

## Data model

### Nouvelle table `bonus_definitions`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid PK | Identifiant unique |
| `sourceType` | enum `'building' \| 'research'` | Type de source |
| `sourceId` | varchar | ID du bâtiment ou recherche source |
| `stat` | enum (14 valeurs) | Stat affectée |
| `percentPerLevel` | numeric | Ex: `-15` = -15% par niveau |
| `category` | varchar \| null | Filtre optionnel (ex: `combustion`, `build_military`) |

### Stats enum

`building_time`, `research_time`, `ship_build_time`, `defense_build_time`, `ship_speed`, `weapons`, `shielding`, `armor`, `mining_duration`, `cargo_capacity`, `fuel_consumption`, `resource_production`, `fleet_count`, `spy_range`

### Suppression

Colonnes `buildTimeReductionFactor` et `reducesTimeForCategory` supprimées de `buildingDefinitions`.

## Formule de résolution

### Par source de bonus

```
modifier_i = max(0.01, 1 + percentPerLevel / 100 * sourceLevel)
```

### Combinaison multiplicative

```
résultat = max(0.01, modifier_1 * modifier_2 * ... * modifier_n)
```

Si aucun bonus ne matche, le résultat est 1.0 (pas de modification).

### Matching

Un bonus matche une requête `(stat, category)` si :
- `bonus.stat === stat`
- ET (`bonus.category === null` OU `bonus.category === category`)

## Fonction game-engine

Nouveau fichier `packages/game-engine/src/formulas/bonus.ts` :

```typescript
interface BonusDefinition {
  sourceType: 'building' | 'research';
  sourceId: string;
  stat: string;
  percentPerLevel: number;
  category: string | null;
}

function resolveBonus(
  stat: string,
  category: string | null,
  userLevels: Record<string, number>,
  bonusDefs: BonusDefinition[],
): number
```

- `userLevels` : niveaux de tous les bâtiments et recherches du joueur (clé = sourceId, valeur = niveau)
- Retourne un multiplicateur (ex: 0.25 pour -75% de réduction)

## Intégration par stat

| Stat | Formule actuelle | Après migration |
|------|-----------------|-----------------|
| `building_time` | `/ (1 + roboticsLevel)` hardcodé | `* resolveBonus('building_time', null, ...)` |
| `research_time` | `/ (1000 * (1 + labLevel))` hardcodé | `* resolveBonus('research_time', null, ...)` |
| `ship_build_time` | `reducesTimeForCategory` par bâtiment | `* resolveBonus('ship_build_time', shipCategory, ...)` |
| `defense_build_time` | idem | `* resolveBonus('defense_build_time', null, ...)` |
| `ship_speed` | `* (1 + DRIVE_BONUS[type] * level)` par moteur | `* resolveBonus('ship_speed', driveType, ...)` |
| `weapons` | `* (1 + 0.1 * techs.weapons)` | `* resolveBonus('weapons', null, ...)` |
| `shielding` | `* (1 + 0.1 * techs.shielding)` | `* resolveBonus('shielding', null, ...)` |
| `armor` | `* (1 + 0.1 * techs.armor)` | `* resolveBonus('armor', null, ...)` |
| `mining_duration` | formule custom rockFracturing | `* resolveBonus('mining_duration', null, ...)` |
| `cargo_capacity` | aucun bonus | `* resolveBonus('cargo_capacity', null, ...)` |
| `fuel_consumption` | aucun bonus | `* resolveBonus('fuel_consumption', null, ...)` |
| `resource_production` | aucun bonus | `* resolveBonus('resource_production', null, ...)` |
| `fleet_count` | `1 + computerTech` hardcodé | `base * resolveBonus('fleet_count', null, ...)` |
| `spy_range` | tech level brut | `base * resolveBonus('spy_range', null, ...)` |

## Migration des valeurs actuelles

| Source (sourceId) | sourceType | Stat | %/niveau | Catégorie |
|-------------------|-----------|------|----------|-----------|
| robotics | building | building_time | -15 | null |
| researchLab | building | research_time | -15 | null |
| shipyard | building | ship_build_time | -15 | build_industrial |
| arsenal | building | defense_build_time | -15 | null |
| commandCenter | building | ship_build_time | -15 | build_military |
| weapons | research | weapons | +10 | null |
| shielding | research | shielding | +10 | null |
| armor | research | armor | +10 | null |
| combustion | research | ship_speed | +10 | combustion |
| impulse | research | ship_speed | +20 | impulse |
| hyperspaceDrive | research | ship_speed | +30 | hyperspaceDrive |
| rockFracturing | research | mining_duration | -10 | null |
| computerTech | research | fleet_count | +100 | null |
| espionageTech | research | spy_range | +100 | null |

> Les valeurs (surtout robotique/labo à -15%) devront être ajustées via l'admin après migration. La courbe `1/(1+level)` actuelle est plus agressive qu'un `-15%/niveau` linéaire.

## Admin panel

Chaque fiche bâtiment/recherche dans l'admin aura une section "Bonus" :

- Tableau éditable avec colonnes : Stat (dropdown), %/niveau (input number), Catégorie (input texte optionnel), bouton Supprimer
- Bouton "+ Ajouter un bonus" en bas du tableau
- CRUD via nouveaux endpoints : `createBonus`, `updateBonus`, `deleteBonus` dans le router admin

## Fichiers impactés

| Couche | Fichiers | Changement |
|--------|----------|-----------|
| DB schema | `packages/db/src/schema/game-config.ts` | Nouvelle table `bonusDefinitions`, suppr colonnes |
| Seed | `packages/db/src/seed-game-config.ts` | Données de bonus initiales |
| Game engine | `packages/game-engine/src/formulas/bonus.ts` (nouveau) | `resolveBonus()` |
| Game engine | `building-cost.ts` | `buildingTime()` reçoit multiplier |
| Game engine | `research-cost.ts` | `researchTime()` reçoit multiplier |
| Game engine | `shipyard-cost.ts` | temps construction reçoit multiplier |
| Game engine | `fleet.ts` | `shipSpeed()` reçoit multiplier |
| Game engine | `combat.ts` | `createUnits()` reçoit multipliers |
| API service | `building.service.ts` | Appeler resolveBonus pour temps |
| API service | `research.service.ts` | Appeler resolveBonus pour temps |
| API service | `fleet.service.ts` | Appeler resolveBonus pour speed/cargo/fuel |
| API handler | `mine.handler.ts` | Appeler resolveBonus pour mining_duration |
| API admin | `game-config.service.ts` | CRUD bonus definitions |
| API admin | `game-config.router.ts` | Endpoints bonus |
| Admin frontend | `Buildings.tsx`, `Research.tsx` | Section bonus éditable |
| Web frontend | Pages bâtiments/recherche/flotte | Afficher effets des bonus depuis config |
