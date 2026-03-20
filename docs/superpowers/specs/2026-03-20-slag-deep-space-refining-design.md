# Scories & Raffinage en espace lointain

## Objectif

Ajouter un système de scories au minage pour nerfer un gameplay trop rémunérateur. Les scories occupent de la place dans la cargaison ET le gisement perd le montant brut (avant réduction). Une nouvelle technologie "Raffinage en espace lointain" permet de réduire progressivement le taux de scories.

## Mécanique des scories

### Principe

Lors d'une mission de minage, un pourcentage de la cargaison est constitué de scories (déchets inutiles). Cela a un double impact :

1. **Cargo** : la capacité cargo utile est réduite par le taux de scories
2. **Gisement** : le gisement perd le montant brut (incluant les scories), s'épuisant plus vite

### Formules

```
slagRate = clamp(baseSlagRate × 0.85^refiningLevel, 0, 0.99)
effectiveCargo = cargoCapacity × (1 - slagRate)
maxExtractable = min(baseExtraction × nbProspectors, effectiveCargo)
depositLoss = maxExtractable / (1 - slagRate)

if depositRemaining >= depositLoss:
  playerReceives = maxExtractable
  actualDepositLoss = depositLoss
else:
  actualDepositLoss = depositRemaining
  playerReceives = depositRemaining × (1 - slagRate)
```

- `baseSlagRate` : taux de base, variable selon position et ressource (stocké en DB, doit etre dans `[0, 1)`)
- `refiningLevel` : niveau de la tech "Raffinage en espace lointain"
- `actualDepositLoss` : ce que le gisement perd (toujours >= playerReceives)
- Le clamp a 0.99 protege contre une division par zero si `baseSlagRate` est mal configure

### Taux de base (configurables en DB)

| Ressource  | Position 8 (proche) | Position 16 (lointain) |
|------------|---------------------|------------------------|
| Minerai    | 35%                 | 20%                    |
| Silicium   | 30%                 | 15%                    |
| Hydrogene  | 20%                 | 10%                    |

Logique :
- Les gisements lointains (pos 16) sont plus purs, compensant le trajet plus long
- L'hydrogene (gaz) produit moins de déchets solides que les minerais
- Les positions 8 et 16 sont les seules ceintures d'asteroides ; le taux est lu par correspondance exacte position+ressource (pas d'interpolation)

## Tech "Raffinage en espace lointain"

### Définition

```
id: 'deepSpaceRefining'
name: 'Raffinage en espace lointain'
description: 'Développe des techniques de raffinage embarquées qui réduisent les scories lors de l extraction minière'
baseCost: { minerai: 2000, silicium: 4000, hydrogene: 1000 }
costFactor: 2
maxLevel: 15
prerequisites:
  - rockFracturing niveau 2
  - missionCenter niveau 2
```

### Calcul de la reduction de scories

Le systeme de bonus existant (`resolveBonus`) applique les reductions lineairement (`1 + percent * level`), ce qui ne correspond pas a la courbe multiplicative voulue (`0.85^level`).

**Decision** : le calcul des scories se fait directement dans `pve.ts` avec `0.85^refiningLevel`, sans passer par `resolveBonus`. Le bonus n'est PAS enregistre dans `bonus_definitions` — le niveau de la tech est lu directement depuis `user_research`. Ajouter un commentaire dans le seed expliquant cette omission intentionnelle.

### Progression (exemple avec 30% de base)

| Niveau | Scories restantes | Cargo utile (sur 10k) |
|--------|-------------------|-----------------------|
| 0      | 30.0%             | 7 000                 |
| 3      | 18.4%             | 8 160                 |
| 6      | 11.3%             | 8 870                 |
| 10     | 5.9%              | 9 410                 |
| 15     | 2.5%              | 9 750                 |

Réduction multiplicative : chaque niveau réduit les scories restantes de 15%. A niveau 15, les scories sont négligeables (~2.5%).

## Stockage en DB

Toutes les valeurs sont configurables en DB. Aucune valeur hardcodee dans le game-engine.

### Taux de scories dans `universe_config`

Les taux de base sont stockes dans la table `universe_config` (key-value existante) :

```
slag_rate.pos8.minerai = 0.35
slag_rate.pos8.silicium = 0.30
slag_rate.pos8.hydrogene = 0.20
slag_rate.pos16.minerai = 0.20
slag_rate.pos16.silicium = 0.15
slag_rate.pos16.hydrogene = 0.10
```

L'interface `GameConfig` est etendue pour exposer ces valeurs via `getFullConfig()`.

### Tech `deepSpaceRefining`

La definition de la recherche suit le meme format que les recherches existantes dans `research_definitions`.

## Points d'impact dans le code

### Game-engine (`packages/game-engine`)

- `formulas/pve.ts` : nouvelle fonction `effectiveCargoCapacity(cargo, slagRates, refiningLevel, position)` et modification de `totalExtracted` pour retourner `{ playerReceives, depositLoss }`
- `constants/research.ts` : ajout de `'deepSpaceRefining'` au type `ResearchId` et a l'interface `ResearchDefinition` (ajouter `maxLevel?: number`)

### API (`apps/api`)

- `modules/fleet/handlers/mine.handler.ts` : brancher les nouvelles formules lors de la phase mining, utiliser `effectiveCargo` pour le joueur et `depositLoss` pour la déduction du gisement
- `modules/pve/asteroid-belt.service.ts` : `extractFromDeposit` recoit `depositLoss` (brut). Le SQL existant gere atomiquement le cas ou le gisement n'a pas assez (`GREATEST(0, remaining - amount)`). Le `playerReceives` est derive du retour de `extractFromDeposit` : `actualExtracted × (1 - slagRate)`. Cela evite toute race condition TOCTOU

### DB (`packages/db`)

- `seed-game-config.ts` : ajouter les entrees `slag_rate.*` dans `universe_config`, la recherche `deepSpaceRefining` dans `research_definitions`
- **Migration necessaire** : ajouter la colonne `deepSpaceRefining` (default 0) a la table `user_research`
- Ajouter `maxLevel` au schema `research_definitions` (champ optionnel, applicable a toutes les recherches)

### Shared (`packages/shared`)

- Ajouter `'deepSpaceRefining'` au type `ResearchId`

### Frontend (`apps/web`)

- Afficher le cargo utile vs cargo total dans l'UI de lancement de mission mine (ex: "Cargo utile : 7 000 / 10 000")
- Afficher les scories dans le rapport de retour de mission (ex: "Scories : 30% — 3 000 tonnes perdues")
- Afficher le taux de scories actuel (apres bonus tech) dans la fiche de la recherche
