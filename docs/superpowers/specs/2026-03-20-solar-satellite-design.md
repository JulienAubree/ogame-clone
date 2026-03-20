# Satellite Solaire - Design Spec

## Vue d'ensemble

Ajout du satellite solaire, un vaisseau stationnaire qui produit de l'energie en orbite. Construit au chantier spatial comme un vaisseau, mais ne peut pas etre envoye en mission. Vulnerable aux attaques. Production d'energie dependante de la temperature de la planete.

## Approche retenue

**Vaisseau standard avec flag `isStationary`** : le satellite est defini dans `SHIPS` avec un champ `isStationary: true`. Il est stocke dans `planetShips`, construit au chantier spatial, et filtre automatiquement du selecteur de flotte via le flag.

## 1. Definition du vaisseau (game-engine)

### ShipId

Ajout de `'solarSatellite'` au type union `ShipId`.

### ShipDefinition

Ajout d'un champ optionnel `isStationary?: boolean` sur l'interface.

Entree dans `SHIPS` :

```ts
solarSatellite: {
  id: 'solarSatellite',
  name: 'Satellite solaire',
  description: "Produit de l'energie en orbite. Ne peut pas etre envoye en mission.",
  cost: { minerai: 0, silicium: 2000, hydrogene: 500 },
  countColumn: 'solarSatellite',
  isStationary: true,
  prerequisites: {
    buildings: [{ buildingId: 'shipyard', level: 1 }],
  },
}
```

### Ship Stats

```ts
solarSatellite: { baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion' }
```

### Combat Stats

```ts
solarSatellite: { weapons: 1, shield: 1, armor: 2000 }
```

### Rapid Fire

Ajout de `solarSatellite: 5` aux entrees existantes des vaisseaux suivants dans `RAPID_FIRE` (et dans la table game config `rapidFire`) :

| Attaquant | Entree existante | Ajout |
|-----------|-----------------|-------|
| lightFighter | `{ espionageProbe: 5 }` | `solarSatellite: 5` |
| heavyFighter | `{ espionageProbe: 5, smallCargo: 3 }` | `solarSatellite: 5` |
| cruiser | `{ espionageProbe: 5, lightFighter: 6, smallCargo: 3, rocketLauncher: 10 }` | `solarSatellite: 5` |
| battleship | `{ espionageProbe: 5, lightFighter: 4, smallCargo: 4, largeCargo: 4 }` | `solarSatellite: 5` |

## 2. Production d'energie

### Formule

```
energie par satellite = max(10, floor(maxTemp / 4) + 20)
```

Minimum garanti de 10 energie par satellite, meme sur les planetes les plus froides.

Exemples :
- Planete tres froide (-100C) : 10 energie/satellite (plancher)
- Planete froide (-40C) : 10 energie/satellite
- Planete temperee (80C) : 40 energie/satellite
- Planete chaude (240C) : 80 energie/satellite

### Nouvelle fonction dans `production.ts`

```ts
export function solarSatelliteEnergy(maxTemp: number): number {
  return Math.max(10, Math.floor(maxTemp / 4) + 20);
}
```

### Modification de `resources.ts`

- `PlanetLevels` : ajout de `solarSatelliteCount: number`
- `calculateProductionRates` : l'energie produite devient `solarPlantEnergy(level) + solarSatelliteEnergy(maxTemp) * solarSatelliteCount`

Le reste du calcul (productionFactor, lazy production, stockage) ne change pas.

### Modification de `resource.service.ts`

Le satellite count provient de `planetShips`, pas de `planetBuildings`. Les 3 call sites qui construisent l'objet `PlanetLevels` (`materializeResources`, `spendResources`, `getProductionRates`) doivent etre modifies pour :

1. Ajouter une requete sur `planetShips` pour recuperer `solarSatellite` :
   ```ts
   const [ships] = await db.select({ solarSatellite: planetShips.solarSatellite })
     .from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
   ```
2. Injecter `solarSatelliteCount: ships?.solarSatellite ?? 0` dans l'objet `PlanetLevels`.

Pour eviter la duplication, extraire une fonction helper `buildPlanetLevels(db, planetId, planet)` qui charge les building levels ET le satellite count et retourne l'objet `PlanetLevels` complet.

## 3. Base de donnees

### Schema `planet-ships.ts`

Ajout d'une colonne :

```ts
solarSatellite: integer('solar_satellite').notNull().default(0),
```

Migration Drizzle necessaire.

### Tables game config

Ajout des entrees dans :
- `shipDefinitions` : avec le champ `isStationary` (boolean, default false)
- `shipPrerequisites` : shipyard level 1
- Stats de combat et rapid fire dans les tables correspondantes

## 4. Exclusion des missions de flotte

### Approche : flag `isStationary`

Le filtrage se fait via le champ `isStationary` sur la definition du vaisseau, pas en hardcodant l'id. Cela permet de generaliser si d'autres vaisseaux stationnaires sont ajoutes.

### Frontend (`mission-config.ts`)

`categorizeShip` recoit la config du vaisseau et retourne `'disabled'` si `isStationary` est true :

```ts
export function categorizeShip(
  shipId: string,
  shipCount: number,
  mission: Mission,
  shipConfig?: { isStationary?: boolean },
): ShipCategory {
  if (shipConfig?.isStationary) return 'disabled';
  // ... reste de la logique inchangee
}
```

Le composant `FleetComposition` passe la config du vaisseau (provenant de la reponse API ship definitions) a `categorizeShip`.

`SHIP_NAMES` : ajout de `solarSatellite: 'Satellite solaire'`.

### Backend - Fleet router (`fleet.router.ts`)

Le `solarSatellite` n'est **pas** ajoute au tableau `shipIds` du Zod schema dans `fleet.router.ts`. Ainsi, toute requete incluant un satellite solaire dans la composition de flotte est rejetee au niveau validation avant d'atteindre le service. C'est la facon la plus simple et la plus sure de bloquer l'envoi.

### Backend - Shipyard router (`shipyard.router.ts`)

Ajouter `'solarSatellite'` au tableau `shipIds` dans le Zod schema de `shipyard.router.ts` pour permettre la construction.

## 5. Combat

### Attack handler (`attack.handler.ts`)

Le tableau `shipTypes` hardcode en ligne 80 doit inclure `'solarSatellite'` (ainsi que `'prospector'` et `'explorer'` qui manquent actuellement — bug pre-existant). Les satellites sur la planete defenderesse participent au combat defensif.

### Debris

Les satellites detruits generent des debris normalement (30% du cout silicium + hydrogene). Comportement correct par defaut puisque `solarSatellite` est un ship dans `shipIdSet`.

## 6. Frontend (affichage)

### Page Chantier spatial

Le satellite apparait dans la liste des vaisseaux constructibles. Meme composant, meme logique de construction que les autres vaisseaux.

### Page Ressources

L'energie des satellites est incluse dans le total `energyProduced` via `calculateProductionRates`. Si le detail de l'energie est affiche, ajouter une ligne "Satellites solaires : X".

### Page d'info du satellite

Afficher :
- La formule : `max(10, floor(tempMax / 4) + 20)`
- La production par satellite pour la planete courante (ex: "38 energie/satellite a 72C")
- Le total produit par les satellites en place
- Rappel qu'ils ne peuvent pas etre envoyes en mission et sont vulnerables aux attaques

### Selecteur de flotte

Le satellite est automatiquement categorise `'disabled'` grace au flag `isStationary`. Il apparait grise dans "Non disponibles" ou n'apparait pas.

## 7. Tests

- `production.test.ts` : tester `solarSatelliteEnergy` avec differentes temperatures (negatives, zero, positives)
- `resources.test.ts` : tester que `calculateProductionRates` inclut l'energie des satellites dans le total
- `combat.test.ts` : tester que le satellite participe au combat defensif avec ses stats et le rapid fire
