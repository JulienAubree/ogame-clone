# Elimination des donnees hardcodees — Design Spec

## Objectif

Supprimer toutes les donnees hardcodees du projet ogame-clone. Tout doit venir de la base de donnees : labels, textes informatifs, constantes de formules, IDs d'entites dans la logique metier. Le jeu doit etre entierement configurable via l'admin panel sans toucher au code.

## Principes

- **Source de verite unique** : la DB, exposee via `gameConfig.getAll`
- **Enrichir les tables existantes** plutot que creer des tables cle-valeur generiques
- **Formules parametriques** : les formules restent dans le code, mais lisent leurs coefficients depuis la config DB
- **Roles sur les entites** : les handlers referent les entites par role, pas par ID
- **Pas de fallback hardcode** : si la config n'est pas chargee, on n'affiche rien plutot que de fallback sur du texte en dur

## Decomposition en sous-projets

5 sous-projets sequentiels, chacun livrable et testable independamment :

1. **Labels & textes** (independant)
2. **Universe config complet** (independant)
3. **Formules parametriques** (depend de #2)
4. **Systeme de roles** (independant)
5. **Cleanup game-engine constants** (depend de #1-4)

Ordre d'implementation : 1 → 2 → 4 → 3 → 5

---

## Sous-projet 1 : Labels & textes centralises

### Probleme

Les labels francais sont dupliques dans 2 a 4 fichiers independants (`STAT_LABELS` x2, `DRIVE_LABELS` x3, mission labels x3, phase labels x3, tier labels x2). Des textes informatifs sont hardcodes dans le JSX.

### Nouvelle table `mission_definitions`

Une ligne par type de mission. Inclut les champs d'affichage ET les champs comportementaux (actuellement hardcodes dans `MISSION_CONFIG` de `mission-config.ts`).

| Colonne | Type | Exemple |
|---------|------|---------|
| `id` | text PK | `'transport'` |
| `label` | text | `'Transport'` |
| `hint` | text | `'Envoyez des ressources vers une planete alliee'` |
| `buttonLabel` | text | `'Envoyer'` |
| `color` | text | `'#3b82f6'` |
| `sortOrder` | int | `1` |
| `dangerous` | boolean | `false` |
| `requiredShipRoles` | jsonb (string[] ou null) | `null` ou `['probe']` |
| `exclusive` | boolean | `false` |
| `recommendedShipRoles` | jsonb (string[] ou null) | `['smallCargo', 'largeCargo']` (IDs tant que le sous-projet 4 n'est pas fait, puis roles) |
| `requiresPveMission` | boolean | `false` |

Note : `requiredShipRoles` et `recommendedShipRoles` referencent des IDs de vaisseaux dans un premier temps. Apres le sous-projet 4 (roles), ils pourront referencer des roles a la place. Ce changement est optionnel et non bloquant.

### Nouvelle table `ui_labels`

Pour les labels orphelins sans table naturelle.

| Colonne | Type | Exemple |
|---------|------|---------|
| `key` | text PK | `'drive.combustion'` |
| `label` | text | `'Combustion'` |

Contenu exhaustif (liste complete, pas illustrative) :
- `drive.combustion`, `drive.impulse`, `drive.hyperspaceDrive` — labels de propulsion
- `phase.outbound`, `phase.prospecting`, `phase.mining`, `phase.return`, `phase.base` — labels de phases de flotte
- `tier.easy`, `tier.medium`, `tier.hard` — labels de difficulte PvE
- `event.building-done`, `event.research-done`, `event.shipyard-done`, `event.fleet-arrived`, `event.fleet-returned`, `event.pve-mission-done`, `event.tutorial-quest-done` — labels de types d'evenements
- `spy_visibility.resources`, `spy_visibility.fleet`, `spy_visibility.defenses`, `spy_visibility.buildings`, `spy_visibility.research` — labels espionnage
- `outcome.attacker`, `outcome.defender`, `outcome.draw` — labels d'issue de combat

Si d'autres labels orphelins sont decouverts pendant l'implementation, ils sont ajoutes a cette table.

### Colonnes ajoutees

- `bonus_definitions.statLabel` (text) — ex: `'Temps de construction'` pour `building_time`
- `tutorial_quest_definitions.conditionLabel` (text) — ex: `'Niveau batiment'` pour `building_level`

### Impact sur gameConfig

L'endpoint `gameConfig.getAll` inclura :
- `missions: Record<string, { label, hint, buttonLabel, color, sortOrder, dangerous, requiredShipRoles, exclusive, recommendedShipRoles, requiresPveMission }>`
- `labels: Record<string, string>` (contenu de `ui_labels`)
- Les `bonuses` portent leur `statLabel`

### Impact frontend

- Suppression de tous les maps hardcodes : `STAT_LABELS`, `DRIVE_LABELS`, `MISSION_CONFIG.label/hint/buttonLabel`, `MISSION_TYPE_LABELS`, `MISSION_LABELS`, `PHASE_STYLE`, `PHASE_LABELS`, `MINE_PHASES`, `TIER_LABELS`, `DIFFICULTY_LABELS`, `EVENT_TYPE_OPTIONS`, `VISIBILITY_LABELS`, `OUTCOME_STYLES`, `MISSION_HEX`
- Chaque composant lit depuis `gameConfig.missions`, `gameConfig.labels`, ou les champs enrichis des entites
- Suppression du dead code `SHIP_NAMES` dans `mission-config.ts`
- Suppression de `RESEARCH_NAMES` fallback dans `entity-names.ts`
- Les textes informatifs hardcodes (description satellite solaire, explication missions PvE, texte annulation 70%) deviennent des champs `description` sur les entites concernees ou des `ui_labels`

### Impact admin

- Nouvelle page "Missions" pour gerer `mission_definitions`
- Nouvelle page ou section "Labels" pour gerer `ui_labels`
- Le formulaire bonus affiche/edite le `statLabel`
- Le formulaire quete tutoriel affiche/edite le `conditionLabel`

---

## Sous-projet 2 : Universe config complet

### Probleme

`UNIVERSE_CONFIG` en TypeScript contient des constantes jamais lues depuis la DB. Des magic numbers sont disperses dans le code (combat, PvE, fleet).

### Nouvelles cles dans `universe_config` (table DB existante)

**Economie & regles generales :**
- `cancel_refund_ratio` (0.7)
- `belt_positions` (JSON: `[8, 16]`)
- `max_planets_per_player` (9)
- `home_planet_diameter` (12000)
- `home_planet_position_min` (4) / `home_planet_position_max` (12)
- `starting_resources.minerai` (500) / `.silicium` (300) / `.hydrogene` (100)

**Combat :**
- `combat_max_rounds` (6)
- `combat_debris_ratio` (0.3)
- `combat_defense_repair_probability` (0.7)
- `combat_bounce_threshold` (0.01)
- `combat_rapid_destruction_threshold` (0.3)
- `loot_ratio` (0.5)

**PvE :**
- `pve_max_concurrent_missions` (3)
- `pve_hydrogene_cap` (1500)
- `pve_dismiss_cooldown_hours` (24)
- `pve_mission_expiry_days` (7)
- `pve_search_radius` (5)
- `pve_tier_medium_unlock` (4)
- `pve_tier_hard_unlock` (6)
- `pve_deposit_variance_min` (0.6) / `_max` (1.6)

**Fleet :**
- `fleet_distance_galaxy_factor` (20000)
- `fleet_distance_system_base` (2700)
- `fleet_distance_system_factor` (95)
- `fleet_distance_position_base` (1000)
- `fleet_distance_position_factor` (5)
- `fleet_same_position_distance` (5)
- `fleet_speed_factor` (35000)

**Formules (consommes par sous-projet 3, mais crees ici) :**
- `pve_discovery_cooldown_base` (7)
- `pve_deposit_size_base` (15000)
- `spy_visibility_thresholds` (JSON: `[1, 3, 5, 7, 9]`)
- `ranking_points_divisor` (1000)
- `shipyard_time_divisor` (2500)
- `research_time_divisor` (1000)
- `storage_base` (5000)
- `storage_coeff_a` (2.5)
- `storage_coeff_b` (20)
- `storage_coeff_c` (33)
- `satellite_home_planet_energy` (50)
- `satellite_base_divisor` (4)
- `satellite_base_offset` (20)
- `phase_multiplier` (JSON: `{"1":0.35,"2":0.45,"3":0.55,"4":0.65,"5":0.78,"6":0.90,"7":0.95}`)

### Impact

- `universe.config.ts` disparait ou se reduit a un helper de lecture
- Tous les consommateurs lisent depuis `config.universe`. En particulier :
  - `cancel_refund_ratio` : consomme par `building.service.ts`, `research.service.ts`, ET `shipyard.service.ts` (3 services)
  - `belt_positions` : consomme par `pve.service.ts`, `resource.service.ts`, frontend `ResearchDetailContent.tsx`
  - `max_planets_per_player` : consomme par `colonize.handler.ts`
- L'admin page "Univers" expose ces nouvelles cles par sections (General, Combat, PvE, Fleet)

---

## Sous-projet 3 : Formules parametriques

### Probleme

Les formules dans `packages/game-engine/src/formulas/` utilisent des constantes hardcodees alors que `productionConfig` en DB porte deja `baseProduction` et `exponentBase` inutilises.

### Approche

Chaque fonction de formule recoit ses coefficients en parametre. L'appelant passe les valeurs lues depuis la config DB.

### Formules impactees

**Production** (`production.ts`) :

| Fonction | Params ajoutes depuis `productionConfig` |
|----------|------------------------------------------|
| `mineraiProduction` | `baseProduction` (30), `exponentBase` (1.1) |
| `siliciumProduction` | `baseProduction` (20), `exponentBase` (1.1) |
| `hydrogeneProduction` | `baseProduction` (10), `exponentBase` (1.1), `tempCoeffA` (1.36), `tempCoeffB` (0.004) |
| `solarPlantEnergy` | `baseProduction` (20), `exponentBase` (1.1) |
| `*MineEnergy` (x3) | `baseConsumption` (10), `exponentBase` (1.1) |
| `storageCapacity` | `storageBase` (5000), coefficients (2.5, 20/33) |
| `solarSatelliteEnergy` | `homePlanetEnergy` (50), `baseDivisor` (4), `baseOffset` (20) |

Colonnes manquantes a ajouter a `productionConfig` :
- Sur la ligne `hydrogeneSynth` : `tempCoeffA` (1.36), `tempCoeffB` (0.004)
- Sur chaque ligne de mine : `baseConsumption` (10) — consommation d'energie de base
- Les coefficients satellite et stockage ne sont pas lies a un batiment specifique. Ils sont stockes dans `universeConfig` :
  - `storage_base` (5000), `storage_coeff_a` (2.5), `storage_coeff_b` (20), `storage_coeff_c` (33)
  - `satellite_home_planet_energy` (50), `satellite_base_divisor` (4), `satellite_base_offset` (20)

**Couts & temps** :
- `shipyard-cost.ts` : `shipyard_time_divisor` (2500) depuis `universeConfig`
- `research-cost.ts` : `research_time_divisor` (1000) depuis `universeConfig`

**Combat** (`combat.ts`) :
- Lit `maxRounds`, `debrisRatio`, `repairProbability`, `bounceThreshold`, `rapidDestructionThreshold` depuis `universeConfig`
- Necessite de threader la config a travers les fonctions internes : `simulateCombat` → `executeRound` → `fireAtTarget`. La config combat est passee en parametre a `simulateCombat` qui la propage.

**Fleet** (`fleet.ts`) :
- Lit constantes de distance/vitesse depuis `universeConfig`

**PvE** (`pve.ts`) :
- `discoveryCooldown` base (7), `depositSize` base (15000) depuis `universeConfig`

**Espionnage** (`espionage.ts`) :
- `spy_visibility_thresholds` (JSON: `[1, 3, 5, 7, 9]`) depuis `universeConfig`

**Ranking** (`ranking.ts`) :
- `ranking_points_divisor` (1000) depuis `universeConfig`

### Changement de signatures

```ts
// Avant
mineraiProduction(level: number, productionFactor: number): number

// Apres
mineraiProduction(level: number, productionFactor: number, config: { baseProduction: number; exponentBase: number }): number
```

Tous les appelants (services API, cron, frontend BuildingDetailContent) passent la config. Cote frontend, `useGameConfig()` fournit deja la config — les composants qui appellent des formules (ex: `BuildingDetailContent`, `ShipDetailContent`) extraient les params de `gameConfig.productionConfig` ou `gameConfig.universe`.

**PHASE_MULTIPLIER** (`progression.ts`) :
- `PHASE_MULTIPLIER` est un map niveau→multiplicateur (`{1: 0.35, 2: 0.45, ...}`), pas un scalaire
- Stocke en JSON dans `universeConfig` sous la cle `phase_multiplier` (ex: `{"1":0.35,"2":0.45,"3":0.55,"4":0.65,"5":0.78,"6":0.90,"7":0.95}`)
- `getPhaseMultiplier(level)` dans `building-cost.ts` et `research-cost.ts` lit depuis `config.universe.phase_multiplier`
- Editable dans l'admin page "Univers" comme un champ JSON

### Impact admin

- Page "Production" : expose tous les champs (existants + nouveaux)
- Page "Univers" : expose les coefficients combat, fleet, espionnage, ranking

---

## Sous-projet 4 : Systeme de roles

### Probleme

Les fleet handlers referencent des ship IDs en dur. `resource.service.ts` mappe 7 building IDs en dur. `planet.service.ts` utilise `'homeworld'` comme magic string.

### Nouvelle colonne `role`

**`ship_definitions`** — colonne `role` (text, nullable, unique quand non-null) :

| Ship actuel | Role |
|-------------|------|
| `prospector` | `'prospector'` |
| `recycler` | `'recycler'` |
| `colonyShip` | `'colonizer'` |
| `espionageProbe` | `'probe'` |
| `solarSatellite` | `'stationary'` |

**`building_definitions`** — colonne `role` (text, nullable, unique quand non-null) :

| Building actuel | Role |
|-----------------|------|
| `mineraiMine` | `'producer_minerai'` |
| `siliciumMine` | `'producer_silicium'` |
| `hydrogeneSynth` | `'producer_hydrogene'` |
| `solarPlant` | `'producer_energy'` |
| `storageMinerai` | `'storage_minerai'` |
| `storageSilicium` | `'storage_silicium'` |
| `storageHydrogene` | `'storage_hydrogene'` |
| `missionCenter` | `'mission_center'` |

**`planet_types`** — colonne `role` (text, nullable, unique quand non-null) :

| Type actuel | Role |
|-------------|------|
| `homeworld` | `'homeworld'` |

### Helpers de lookup

```ts
function findShipByRole(config: GameConfig, role: string): ShipDef
function findBuildingByRole(config: GameConfig, role: string): BuildingDef
function findPlanetTypeByRole(config: GameConfig, role: string): PlanetTypeDef
```

Throw si le role n'existe pas (erreur de config).

### Impact handlers

```ts
// Avant
const prospectorCount = input.ships['prospector'] ?? 0;

// Apres
const prospectorDef = findShipByRole(config, 'prospector');
const prospectorCount = input.ships[prospectorDef.id] ?? 0;
```

### Impact resource.service.ts

Lookup par role pour chaque batiment de production/stockage. Le mapping `role -> niveau du batiment` est construit dynamiquement depuis la config + les niveaux de la planete.

### Limitation schema column-per-entity

Les tables `planet_ships`, `planet_defenses`, `user_research` utilisent un schema avec une colonne par entite (ex: `planetShips.solarSatellite`). Ce couplage structurel ne peut pas etre resolu par le systeme de roles seul — il faudrait migrer vers un schema flexible `(planet_id, entity_id, count)`. Ce refactoring de schema est **hors scope** de ce chantier. Les references directes aux colonnes (`planetShips.solarSatellite`, `userResearch.espionageTech`, etc.) restent dans le code pour cette iteration.

### Impact admin

- Colonne "Role" visible et editable dans les pages Batiments, Vaisseaux, Types de planetes

---

## Sous-projet 5 : Cleanup game-engine constants

### Probleme

`packages/game-engine/src/constants/` contient 8 fichiers qui dupliquent integralement la DB.

### Fichiers supprimes

```
packages/game-engine/src/constants/buildings.ts
packages/game-engine/src/constants/ships.ts
packages/game-engine/src/constants/research.ts
packages/game-engine/src/constants/defenses.ts
packages/game-engine/src/constants/combat-stats.ts
packages/game-engine/src/constants/ship-stats.ts
packages/game-engine/src/constants/tutorial-quests.ts
packages/game-engine/src/constants/progression.ts  → PHASE_MULTIPLIER migre vers universeConfig
```

### Consommateurs a migrer

- **Backend** : remplacer les rares imports de constantes par `config.ships[id]`, `config.defenses[id]`
- **Frontend** : supprimer les fallbacks hardcodes (`RESEARCH_NAMES`, `SHIP_NAMES`)
- **Seed** : reste intact, c'est la source d'initialisation

### Ce qui reste dans game-engine

- `formulas/` — fonctions de calcul (parametriques apres sous-projet 3)
- `bonus.ts` — `resolveBonus()`
- Types/interfaces partages (deplaces dans `packages/shared/src/types/` si pas deja fait)
- `index.ts` — reexports

### Cleanup supplementaire

- `SHIP_NAMES` dans `mission-config.ts` — dead code, supprime
- `RESEARCH_NAMES` dans `entity-names.ts` — supprime, retourne l'ID brut si config pas chargee
- `mission-config.ts` : ne garde que la logique de cargo capacity et les types (labels/hints/couleurs viennent de `gameConfig.missions`)

---

## Strategie de migration

Chaque sous-projet suit le meme pattern :

1. **Schema** : modifier les tables Drizzle (ajout de colonnes, creation de tables). Generer la migration Drizzle (`drizzle-kit generate`).
2. **Seed** : mettre a jour `seed-game-config.ts` pour peupler les nouvelles colonnes/tables avec les valeurs actuellement hardcodees. Le seed est idempotent (upsert).
3. **Code** : modifier les consommateurs pour lire depuis la config DB au lieu des constantes.
4. **Admin** : ajouter/modifier les pages admin pour exposer les nouveaux champs.

Pour les environnements existants :
- Executer la migration Drizzle (`drizzle-kit push` ou appliquer le SQL genere)
- Re-executer le seed pour peupler les nouvelles donnees
- Les valeurs par defaut dans le seed correspondent exactement aux valeurs hardcodees actuelles — zero changement de comportement
- Le seed utilise des upserts (`ON CONFLICT DO UPDATE`) — en cas d'echec partiel, il peut etre relance sans risque

### Typage de `gameConfig.universe`

La table `universe_config` stocke des paires cle-valeur. L'API les expose via `gameConfig.universe` type `Record<string, string | number>`. Pour les cles JSON (`belt_positions`, `spy_visibility_thresholds`, `phase_multiplier`), la valeur est stockee comme string JSON en DB et parsee par `game-config.service.ts` avant d'etre exposee. Les consommateurs accedent aux valeurs par cle avec cast : `Number(config.universe.combat_max_rounds)`, `JSON.parse(config.universe.phase_multiplier)`, etc. Le typage existant est deja `Record<string, unknown>` — pas de changement structurel.

---

## Hors perimetre

- **i18n / multi-langue** : pas dans cette iteration. Les textes sont en francais, stockes en DB. Un systeme i18n pourra etre ajoute plus tard.
- **Messages d'erreur TRPC** : les messages d'erreur cote serveur (`'Batiment invalide'`, `'Construction deja en cours'`) restent hardcodes dans le code. Ce sont des messages techniques, pas du contenu de jeu.
- **Textes de rapports de combat/espionnage/minage** : les templates de corps de message dans les handlers (`attack.handler.ts`, `spy.handler.ts`, etc.) restent dans le code pour cette iteration. Les externaliser necessiterait un systeme de templates, hors scope.
- **Schema column-per-entity** : les tables `planet_ships`, `planet_defenses`, `user_research` gardent leur schema a colonnes fixes. La migration vers un schema flexible `(entity_id, count)` est un refactoring majeur hors scope.
- **Migration des `requiredShipRoles`/`recommendedShipRoles` vers des roles** : dans un premier temps, ces champs referencent des IDs de vaisseaux. La migration vers des roles est optionnelle apres le sous-projet 4.
