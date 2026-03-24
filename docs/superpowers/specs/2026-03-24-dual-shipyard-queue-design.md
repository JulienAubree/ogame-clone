# Queues de production separees par batiment — Design Spec

## Objectif

Separer la queue de production des vaisseaux en deux queues independantes liees a leur batiment de production : chantier spatial (industriels) et centre de commandement (militaires). Les defenses (arsenal) ont deja leur propre queue via `type: 'defense'`. L'objectif est de permettre la production en parallele : un cargo et un chasseur peuvent etre construits simultanement.

## Principes

- **Un champ `facilityId`** sur `buildQueue` identifie le batiment de production (pas de modification de l'enum `type`)
- **Pas de nouveau service** : le shipyard service gere toutes les queues de production
- **La separation est dans la queue, pas dans le type** : `type` reste `'ship'` ou `'defense'`, `facilityId` distingue les queues

---

## Modele de donnees

### Fichier a modifier : `packages/db/src/schema/build-queue.ts`

Ajouter le champ `facilityId` a la table `buildQueue` :

| Colonne | Type | Default | Description |
|---------|------|---------|-------------|
| `facilityId` | varchar(64), nullable | `null` | Batiment de production : `'shipyard'`, `'commandCenter'`, `'arsenal'`. Nullable pour backward compat avec les builds `building`/`research` qui n'ont pas de facility. |

### Determination du facilityId

Nouvelle helper `getFacilityId(type, itemId, config)` :
- Si `type === 'defense'` → retourne `'arsenal'`
- Si `type === 'ship'` → lit `config.ships[itemId].prerequisites.buildings[0].buildingId` et retourne cette valeur (`'shipyard'` ou `'commandCenter'`)
- Fallback si pas de prerequisite building (ne devrait pas arriver avec le config actuel) : `'shipyard'` par defaut

Note : c'est la meme logique d'extraction du premier prerequisite building que dans `getShipBuildCategory()`, mais on retourne directement le `buildingId` au lieu de chercher le bonus category.

### Migration

- Ajouter la colonne `facility_id` (nullable) via `drizzle-kit generate`
- Pas de backfill necessaire : les builds en cours sont ephemeres. Les nouvelles insertions rempliront le champ.

---

## Backend

### shipyard.service.ts

**`getFacilityId(type, itemId, config)`** — nouvelle fonction helper (decrite ci-dessus).

**`getShipyardQueue(planetId, facilityId?)`** — parametre optionnel :
- Si `facilityId` fourni : filtre en SQL (`where facilityId = ?`) en plus de `planetId` et `status`
- Si absent : comportement actuel (toutes les queues ship + defense, filtre in-memory)

**`startBuild(userId, planetId, type, itemId, quantity)`** — signature inchangee :
- Calcule le `facilityId` via `getFacilityId()`
- Le stocke dans l'insertion `buildQueue`
- `sameTypeQueue` filtre par `facilityId` au lieu de `type` seul — c'est le changement cle pour la production parallele
- La logique de merge (dernier batch avec meme `itemId`) reste inchangee car elle s'applique dans la meme queue

**`activateNextBatch(planetId, type, facilityId)`** — nouveau parametre :
- Filtre par `(type, facilityId)` au lieu de `type` seul
- Ordre de selection : premier `queued` par `startTime ASC` (FIFO dans la queue)

**`completeUnit(buildQueueId)`** :
- Passe `entry.facilityId` (lu depuis le build queue row) a `activateNextBatch()`

**`cancelBatch(userId, planetId, batchId)`** :
- Passe `entry.facilityId` a `activateNextBatch()` lors de l'activation du batch suivant
- Signature du router inchangee (`{ planetId, batchId }`) — le service lit le `facilityId` depuis le row DB

### shipyard.router.ts

**`shipyard.queue`** — ajouter `facilityId` optionnel a l'input :
```
input: z.object({
  planetId: z.string().uuid(),
  facilityId: z.enum(['shipyard', 'commandCenter', 'arsenal']).optional(),
})
```

**`shipyard.buildShip`** et **`shipyard.buildDefense`** — signatures inchangees. Le backend derive le `facilityId` en interne depuis `itemId`. Le frontend n'a pas a le passer.

Pas de nouvel endpoint — le frontend appelle `shipyard.queue({ planetId, facilityId: 'commandCenter' })` pour la queue du centre de commandement.

---

## Frontend

### Catalogue de vaisseaux

Les deux pages (`Shipyard.tsx` et `CommandCenter.tsx`) appellent le meme endpoint `trpc.shipyard.ships.useQuery({ planetId })` qui retourne tous les vaisseaux. Le filtrage se fait cote client par `categoryId` :
- **Shipyard** : categories `ship_transport` + `ship_utilitaire`
- **CommandCenter** : categorie `ship_combat`

Ce pattern est deja utilise dans le Shipyard actuel (filtrage par `entityType` et `categoryId`).

### Nouvelle page `CommandCenter.tsx`

Fichier : `apps/web/src/pages/CommandCenter.tsx`

Copie structurelle de `Shipyard.tsx` avec ces differences :
- Titre : "Centre de commandement"
- Filtre les categories vaisseaux a `ship_combat`
- Queue : `trpc.shipyard.queue.useQuery({ planetId, facilityId: 'commandCenter' })`
- Build : `trpc.shipyard.buildShip.useMutation()` (meme mutation, signature inchangee)
- Reutilise `ShipDetailContent` tel quel (compatible avec tous les types de vaisseaux)

### Modification de `Shipyard.tsx`

Fichier : `apps/web/src/pages/Shipyard.tsx`

- Filtre les categories a `ship_transport` + `ship_utilitaire` (exclut `ship_combat`)
- Queue : `trpc.shipyard.queue.useQuery({ planetId, facilityId: 'shipyard' })`

### Navigation

- **Sidebar** (`apps/web/src/components/layout/Sidebar.tsx`) : ajouter "Centre de commandement" avec `CommandCenterIcon`, entre "Chantier spatial" et "Defense"
- **BottomTabBar** (`apps/web/src/components/layout/BottomTabBar.tsx`) : ajouter `/command-center` dans `TAB_GROUPS.base` et une entree dans `SHEET_ITEMS.base`
- **Router** (`apps/web/src/router.tsx`) : nouvelle route `/command-center` → lazy load `CommandCenter.tsx`

### Icone

Ajouter `CommandCenterIcon` dans `apps/web/src/lib/icons.tsx` — silhouette militaire (croix de visee ou etoile de commandement).

---

## Hors perimetre

- Migration/backfill des builds existants : non necessaire (builds ephemeres)
- Nouveau service ou routeur : le shipyard service gere tout
- Modification du worker `build-completion.worker.ts` : pas necessaire, il appelle `completeUnit(buildQueueId)` qui gere le reste
- Modification des formules game-engine : pas necessaire, les formules ne changent pas
- Modification de `listShips` endpoint : pas necessaire, le filtrage est cote client par category
