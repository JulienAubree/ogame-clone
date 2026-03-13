# Phase 5b : Combat, Espionnage, Débris & Recyclage — Design Spec

## Objectif

Implémenter le combat OGame classique (rounds, rapid fire, débris), l'espionnage par sondes, les champs de débris et la mission recycleur.

---

## 1. Stats de combat

### Fichier : `packages/game-engine/src/constants/combat-stats.ts`

Chaque vaisseau et défense a 3 stats de base : **armes**, **bouclier**, **blindage** (structure).

#### Vaisseaux

| Type | Armes | Bouclier | Blindage |
|------|-------|----------|----------|
| smallCargo | 5 | 10 | 4000 |
| largeCargo | 5 | 25 | 12000 |
| lightFighter | 50 | 10 | 4000 |
| heavyFighter | 150 | 25 | 10000 |
| cruiser | 400 | 50 | 27000 |
| battleship | 1000 | 200 | 60000 |
| espionageProbe | 0 | 0 | 1000 |
| colonyShip | 50 | 100 | 30000 |
| recycler | 1 | 10 | 16000 |

#### Défenses

| Type | Armes | Bouclier | Blindage |
|------|-------|----------|----------|
| rocketLauncher | 80 | 20 | 2000 |
| lightLaser | 100 | 25 | 2000 |
| heavyLaser | 250 | 100 | 8000 |
| gaussCannon | 1100 | 200 | 35000 |
| plasmaTurret | 3000 | 300 | 100000 |
| smallShield | 1 | 2000 | 2000 |
| largeShield | 1 | 10000 | 10000 |

#### Rapid Fire

Table de rapid fire : `rapidFire[attacker][target] = N` signifie que l'attaquant a `(N-1)/N` chance de retirer après avoir touché la cible.

| Attaquant | Cible | Rapid fire |
|-----------|-------|------------|
| smallCargo | espionageProbe | 5 |
| largeCargo | espionageProbe | 5 |
| lightFighter | espionageProbe | 5 |
| heavyFighter | espionageProbe | 5 |
| heavyFighter | smallCargo | 3 |
| cruiser | espionageProbe | 5 |
| cruiser | lightFighter | 6 |
| cruiser | rocketLauncher | 10 |
| battleship | espionageProbe | 5 |
| recycler | espionageProbe | 5 |

Export : `COMBAT_STATS` (armes/bouclier/blindage par unitId), `RAPID_FIRE` (table rapid fire).

---

## 2. Simulation de combat

### Fichier : `packages/game-engine/src/formulas/combat.ts`

#### Algorithme

1. **Initialisation** : chaque unité reçoit ses stats effectives (base × (1 + 0.1 × techLevel)) pour armes, bouclier, blindage
2. **Max 6 rounds** :
   - Chaque unité vivante tire sur une cible aléatoire du camp adverse
   - Dégâts = armes_attaquant. Si dégâts < 1% du bouclier_cible → tir absorbé (bounce)
   - Sinon : bouclier absorbe min(bouclier_restant, dégâts), le reste va sur le blindage
   - Si blindage <= 30% du blindage initial et random() < (1 - blindage/blindage_initial) → unité explose (rapid destruction)
   - **Rapid fire** : après un tir réussi, chance de retirer = (rapidFire - 1) / rapidFire
   - Fin du round : boucliers se régénèrent à 100%, blindage reste
   - Retirer les unités détruites
3. **Fin** : si un camp est vide → victoire/défaite. Sinon → draw après 6 rounds

#### Fonctions exportées

- `simulateCombat(attackerFleet, defenderFleet, defenderDefenses, attackerTechs, defenderTechs)` → `CombatResult`
- `calculateDebris(destroyedShips)` → `{ metal: number, crystal: number }`

#### Types

```typescript
interface CombatTechs {
  weaponsTech: number;
  shieldingTech: number;
  armorTech: number;
}

interface CombatResult {
  rounds: number;
  outcome: 'attacker_wins' | 'defender_wins' | 'draw';
  attackerLosses: Record<string, number>;  // unités perdues par type
  defenderShipLosses: Record<string, number>;
  defenderDefenseLosses: Record<string, number>;
  debris: { metal: number; crystal: number };
  defenderDefensesRepaired: Record<string, number>;  // 70% repair
}
```

#### Débris

- 30% du métal + cristal des vaisseaux détruits (deux camps)
- Les défenses ne génèrent pas de débris
- Le deutérium est perdu

#### Réparation défenses

- Chaque défense détruite a 70% de chance d'être réparée après le combat
- Les défenses réparées sont restituées au défenseur

#### Tests

- Combat simple : 1 lightFighter vs 1 lightFighter → vérifier qu'un gagne
- Combat asymétrique : 100 battleships vs 10 lightFighters → attaquant gagne
- Débris : vérifier le calcul 30% métal/cristal
- Rapid fire : cruiser vs lightFighters → vérifier le rapid fire
- Réparation : vérifier que ~70% des défenses détruites sont réparées (test statistique sur N itérations)
- Draw : deux flottes équivalentes très résistantes → 6 rounds max
- Bounce : dégâts < 1% bouclier → pas de dommage
- Techs : vérifier que les bonus +10%/niveau s'appliquent

---

## 3. Espionnage

### Fichier : `packages/game-engine/src/formulas/espionage.ts`

#### Mécanique

- `probInfo = nombre_sondes - (techDéfenseur - techAttaquant)`
  - >= 1 : ressources visibles
  - >= 3 : flotte visible
  - >= 5 : défenses visibles
  - >= 7 : bâtiments visibles
  - >= 9 : recherches visibles

- `détection% = min(100, nombre_sondes * 2 - (techAttaquant - techDéfenseur) * 4)`
  - Si random(0-100) < détection% → sondes détectées et détruites

#### Fonctions exportées

- `calculateSpyReport(probeCount, attackerEspionageTech, defenderEspionageTech)` → `{ resources: boolean, fleet: boolean, defenses: boolean, buildings: boolean, research: boolean }`
- `calculateDetectionChance(probeCount, attackerEspionageTech, defenderEspionageTech)` → `number` (0-100)

#### Tests

- 3 sondes, même tech → ressources + flotte visibles, pas défenses
- 1 sonde, défenseur +5 tech → rien de visible
- 10 sondes, attaquant +3 tech → tout visible
- Détection : 1 sonde, même tech → 2% de chance
- Détection : 10 sondes, même tech → 20% de chance

---

## 4. Schema DB

### Table `debris_fields`

| Colonne | Type | Description |
|---------|------|-------------|
| id | uuid PK | Identifiant unique |
| galaxy | smallint | Galaxie |
| system | smallint | Système |
| position | smallint | Position |
| metal | numeric(20,2) default 0 | Métal |
| crystal | numeric(20,2) default 0 | Cristal |
| updatedAt | timestamp with timezone | Dernière mise à jour |

Index unique sur `(galaxy, system, position)`.

### Modifications existantes

- `fleetMissionEnum` : ajouter `'recycle'`
- `messageTypeEnum` : ajouter `'espionage'` et `'combat'`

---

## 5. Handlers fleet.service

### Mission `attack` — processAttack

1. Récupérer les vaisseaux/défenses du défenseur depuis planet_ships et planet_defenses
2. Récupérer les techs combat des deux joueurs (weaponsTech, shieldingTech, armorTech depuis la table planets, colonnes research)
3. Appeler `simulateCombat()`
4. Appliquer les pertes attaquant : décrémenter ses vaisseaux dans le fleet event
5. Appliquer les pertes défenseur : décrémenter vaisseaux dans planet_ships, défenses dans planet_defenses
6. Réparation 70% : ajouter les défenses réparées dans planet_defenses
7. Créer/accumuler le champ de débris dans debris_fields
8. Pillage : prendre les ressources du défenseur (métal, cristal, deut) limité par le cargo restant. Répartition : tiers chacun, puis remplissage si une ressource manque
9. Déduire les ressources pillées de la planète défenseur
10. Envoyer message `combat` à l'attaquant et au défenseur (rapport de bataille)
11. Retourner la flotte survivante avec le butin

### Mission `spy` — processSpy

1. Calculer `calculateSpyReport(probeCount, attackerTech, defenderTech)`
2. Construire le rapport avec les infos visibles (ressources, flotte, défenses, bâtiments, recherches)
3. Calculer `calculateDetectionChance()` + tirage aléatoire
4. Si détecté : sondes détruites (pas de retour), message au défenseur
5. Envoyer le rapport à l'attaquant (type `espionage`)
6. Si non détecté : retourner les sondes

### Mission `recycle` — processRecycle

1. Vérifier qu'un champ de débris existe à la position cible
2. Calculer la capacité cargo totale des recycleurs
3. Collecter métal puis cristal (limité par cargo)
4. Réduire le champ de débris. Supprimer la row si vide
5. Retourner les recycleurs avec le cargo

---

## 6. Frontend

### Messagerie

Les rapports de combat et d'espionnage arrivent dans la messagerie existante. Ajouter les types `combat` et `espionage` au filtre de la page Messages.

### Vue Galaxie

Ajouter un indicateur sur les positions ayant un champ de débris (icône ou badge avec quantités métal/cristal). Le galaxyService doit retourner les débris pour chaque position.

### Fleet (envoi)

- Mission `spy` : activer dans le wizard. Validation : au moins 1 sonde sélectionnée.
- Mission `attack` : activer dans le wizard. Validation : au moins 1 vaisseau de combat sélectionné.
- Mission `recycle` : nouvelle option. Validation : uniquement des recycleurs, champ de débris existant à la cible.

---

## 7. Fichiers à créer

| Fichier | Responsabilité |
|---------|---------------|
| `packages/game-engine/src/constants/combat-stats.ts` | Stats armes/bouclier/blindage + rapid fire |
| `packages/game-engine/src/formulas/combat.ts` | simulateCombat, calculateDebris |
| `packages/game-engine/src/formulas/combat.test.ts` | Tests combat |
| `packages/game-engine/src/formulas/espionage.ts` | calculateSpyReport, calculateDetectionChance |
| `packages/game-engine/src/formulas/espionage.test.ts` | Tests espionnage |
| `packages/db/src/schema/debris-fields.ts` | Table debris_fields |

## 8. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `packages/game-engine/src/index.ts` | Exports combat-stats, combat, espionage |
| `packages/db/src/schema/fleet-events.ts` | Ajouter 'recycle' à fleetMissionEnum |
| `packages/db/src/schema/messages.ts` | Ajouter 'espionage', 'combat' à messageTypeEnum |
| `packages/db/src/schema/index.ts` | Export debris-fields |
| `apps/api/src/modules/fleet/fleet.service.ts` | Handlers processAttack, processSpy, processRecycle |
| `apps/api/src/modules/galaxy/galaxy.service.ts` | Inclure les débris dans getSystem |
| `apps/web/src/pages/Galaxy.tsx` | Indicateur débris |
| `apps/web/src/pages/Fleet.tsx` | Activer missions spy, attack, recycle |
| `apps/web/src/pages/Messages.tsx` | Filtres combat/espionage |
