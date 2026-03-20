# Rapports de mission v2 — Design Spec

Remplace le spec `2026-03-19-mission-reports-design.md` (approche messages texte seuls).

## Objectif

Generer automatiquement un rapport de mission structure a la fin de chaque mission de minage, consultable via une page dediee `/reports` et lie au message systeme dans la messagerie. Le modele est concu pour etre extensible a tous les types de missions (transport, espionnage, combat, pirate, recyclage, colonisation, stationnement).

## Probleme actuel

1. Le `messageService` n'est pas injecte dans les workers BullMQ (`fleet-arrival.worker.ts` passe `undefined`), donc aucun message systeme n'est cree a la fin du minage.
2. Les messages systeme actuels sont du texte brut sans donnees structurees, ce qui empeche un affichage riche et filtrable.

## Architecture

### Approche retenue : Table `mission_reports` dediee

- **Colonnes typees** pour les donnees communes (coordonnees, flotte, dates)
- **Champ JSONB `result`** pour les donnees specifiques a chaque type de mission
- **Lien unidirectionnel** : seul `mission_reports.message_id` fait le lien. Pas de `reportId` sur la table `messages` (evite une migration sur une table a fort trafic). L'endpoint `report.byMessage` couvre la navigation messagerie -> rapport.

### Pourquoi pas les alternatives

- **JSON dans body du message** : melange donnees structurees et texte, anciens messages incoherents
- **JSONB dans fleet_events** : surcharge une table ephemere, les rapports doivent persister

## Modele de donnees

### Table `mission_reports`

```sql
mission_reports
  id                  UUID PK DEFAULT gen_random_uuid()
  user_id             UUID FK -> users (ON DELETE CASCADE)
  fleet_event_id      UUID FK -> fleet_events (ON DELETE SET NULL, nullable)
  pve_mission_id      UUID FK -> pve_missions (ON DELETE SET NULL, nullable)
  message_id          UUID FK -> messages (ON DELETE SET NULL, nullable)
  mission_type        fleet_mission enum ('mine','transport','spy','attack','pirate','colonize','recycle','station')
  title               VARCHAR(255)
  coordinates         JSONB  -- { galaxy: number, system: number, position: number }
  origin_coordinates  JSONB  -- { galaxy: number, system: number, position: number, planetName: string }
  fleet               JSONB  -- { ships: Record<string, number>, totalCargo: number }
  departure_time      TIMESTAMP WITH TIME ZONE
  completion_time     TIMESTAMP WITH TIME ZONE
  result              JSONB  -- contenu variable selon mission_type
  read                BOOLEAN DEFAULT false
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
```

Index : `(user_id, created_at DESC)`, `(message_id)`.

### Contenu du champ `result` par type

**mine** :
```json
{
  "rewards": { "minerai": 1200, "silicium": 800, "hydrogene": 400 },
  "slagRate": 0.18,
  "technologies": [
    { "name": "deepSpaceRefining", "level": 3, "bonusType": "slag_reduction", "description": "Scories reduites a 18%" },
    { "name": "mining_duration", "level": null, "bonusType": "duration_reduction", "description": "Duree de minage -10%" }
  ]
}
```

**spy** :
```json
{
  "targetResources": { "minerai": 50000, "silicium": 30000, "hydrogene": 10000 },
  "targetFleet": { "chasseurLeger": 20, "croiseur": 5 },
  "targetDefenses": { "lanceurMissiles": 10 },
  "targetResearch": { "espionage": 4 },
  "counterEspionage": false
}
```

**transport** :
```json
{
  "delivered": { "minerai": 5000, "silicium": 3000, "hydrogene": 1000 }
}
```

**attack / pirate** :
```json
{
  "outcome": "victory",
  "loot": { "minerai": 2000, "silicium": 1500 },
  "losses": { "chasseurLeger": 3 },
  "debris": { "minerai": 500, "silicium": 300 },
  "combatRounds": 6
}
```

**recycle** :
```json
{
  "recovered": { "minerai": 1500, "silicium": 800 }
}
```

**colonize** :
```json
{
  "success": true,
  "planetName": "Nouvelle colonie"
}
```

**station** :
```json
{
  "shipsStationed": { "transporteurLourd": 2 },
  "cargoDeposited": { "minerai": 10000 }
}
```

### Types TypeScript (shared)

Definir des types discrimines pour le champ `result` dans `packages/game-engine` ou `packages/shared` :

```typescript
type MineReportResult = {
  rewards: { minerai: number; silicium: number; hydrogene: number };
  slagRate: number;
  technologies: Array<{
    name: string;
    level: number | null;
    bonusType: string;
    description: string;
  }>;
};

// ... autres types par mission

type MissionReportResult =
  | MineReportResult
  | SpyReportResult
  | TransportReportResult
  // etc.
```

## Backend

### Fix du bug messageService dans les workers

`fleet-arrival.worker.ts` et `fleet-return.worker.ts` :
1. **Deplacer** `new Redis(env.REDIS_URL)` AVANT l'appel a `createFleetService()` (actuellement cree apres)
2. Injecter `createMessageService(db, redis)` en 6eme parametre au lieu de `undefined`

### Creation du rapport dans mine.handler.ts

Dans `processMineDone()`, flux precis :

```
1. Calcul de l'extraction (existant)
2. const msg = await ctx.messageService.createSystemMessage(...)  // capturer le retour !
3. Collecter les technologies :
   - deepSpaceRefining : niveau + effet sur le taux de scories
   - mining_duration : valeur du bonus resolue + effet sur la duree
4. await ctx.reportService.create({
     userId, fleetEventId, pveMissionId,
     messageId: msg.id,
     missionType: 'mine',
     title, coordinates, originCoordinates, fleet,
     departureTime, completionTime,
     result: { rewards, slagRate, technologies }
   })
```

Note : `createSystemMessage` retourne deja la ligne inseree via `.returning()`. Il suffit de capturer la valeur de retour, actuellement ignoree (ligne 195 de mine.handler.ts).

La creation du message + rapport doit etre wrappee dans une transaction DB pour garantir l'atomicite.

### Injection de reportService dans le contexte des handlers

Ajouter `reportService` a `MissionHandlerContext` (fleet.types.ts), le creer et l'injecter dans les workers de la meme facon que `messageService`.

### Nouveaux endpoints tRPC

Module `report` :

- `report.list` : liste paginee des rapports du joueur, filtrable par `missionType`, tri par `createdAt DESC`. Cursor-based pagination.
- `report.detail` : rapport complet par `id` (avec verification `userId`). Marque le rapport comme lu.
- `report.byMessage` : rapport lie a un `messageId` (pour le lien messagerie -> rapport). Retourne `null` si aucun rapport lie (messages anterieurs a la feature).
- `report.delete` : suppression d'un rapport par `id` (avec verification `userId`).

### Schema Drizzle

Nouveau fichier `packages/db/src/schema/mission-reports.ts`, exporte dans l'index du package.

## Frontend

### Nouvelle route `/reports`

Ajoutee dans la section "Social" du menu (sidebar, bottom bar), entre Messages et Classement.

### Page Rapports — Liste

- Filtres par type de mission (pills, meme pattern que Messages.tsx et History.tsx)
- Pagination infinie (cursor-based, meme pattern que History.tsx)
- Cartes de rapport :
  - Icone selon `missionType` + titre
  - Coordonnees + date relative
  - Resume rapide des gains
  - Badge "Non lu" base sur `mission_reports.read`

### Page Rapports — Detail

Layout responsive 2-3 colonnes (meme pattern que Messages.tsx) :

- **En-tete** : titre, type de mission, coordonnees (origine + cible), date d'envoi
- **Flotte** : liste des vaisseaux par type + capacite cargo totale
- **Resultats** : ressources gagnees avec icones colorees (minerai orange, silicium vert, hydrogene bleu)
- **Scories** : pourcentage affiche avec barre visuelle
- **Technologies** : liste avec niveau et description de l'effet concret

### Lien depuis la messagerie

Les messages de type `'mission'` affichent un bouton "Voir le rapport detaille". Clic -> appel `report.byMessage` avec le `messageId`, puis navigation vers `/reports?id=<reportId>`. Si `report.byMessage` retourne `null` (ancien message), le bouton n'est pas affiche.

## Fichiers impactes

| Fichier | Modification |
|---------|-------------|
| `packages/db/src/schema/mission-reports.ts` | NOUVEAU — schema Drizzle |
| `packages/db/src/schema/index.ts` | Export du nouveau schema |
| `packages/db/src/migrations/` | Migration creation table |
| `packages/game-engine/src/types/` | Types TypeScript pour `result` JSONB |
| `apps/api/src/workers/fleet-arrival.worker.ts` | Fix : deplacer Redis avant createFleetService, injecter messageService + reportService |
| `apps/api/src/workers/fleet-return.worker.ts` | Fix : idem |
| `apps/api/src/modules/fleet/fleet.types.ts` | Ajouter `reportService` a `MissionHandlerContext` |
| `apps/api/src/modules/fleet/fleet.service.ts` | Accepter et propager `reportService` |
| `apps/api/src/modules/fleet/handlers/mine.handler.ts` | Capturer messageId, creer le rapport, transaction |
| `apps/api/src/modules/report/report.service.ts` | NOUVEAU — service CRUD rapports |
| `apps/api/src/modules/report/report.router.ts` | NOUVEAU — endpoints tRPC |
| `apps/api/src/trpc/app-router.ts` | Enregistrement du router report |
| `apps/web/src/router.tsx` | Route /reports |
| `apps/web/src/pages/Reports.tsx` | NOUVEAU — page liste + detail |
| `apps/web/src/pages/Messages.tsx` | Bouton "Voir le rapport" sur messages mission |
| `apps/web/src/components/layout/Sidebar.tsx` | Lien Rapports dans le menu |
| `apps/web/src/components/layout/BottomTabBar.tsx` | Lien Rapports dans le menu mobile |

## Scope

Cette spec couvre uniquement la creation de rapports pour les missions de **minage**. Les autres types (transport, spy, attack, pirate, recycle, colonize, station) utilisent la meme table et le meme pattern, mais seront implementes incrementalement.
