# Abandon d'une colonie — design

**Date**: 2026-04-20
**Statut**: design validé, en attente de plan d'implémentation

## Objectif

Permettre à un joueur de se débarrasser volontairement d'une colonie active qu'il ne veut plus. Deux cas d'usage :

1. **Regret** — la colonie fondée s'avère décevante (biomes faibles, position isolée, classe inadaptée) et le joueur veut la remplacer.
2. **Nettoyage stratégique** — le joueur veut réduire son nombre de colonies pour repasser sous sa capacité IPC et supprimer la pénalité de gouvernance.

## Règles métier

| Sujet | Règle |
|---|---|
| Statut planète ciblée | `status='active'` uniquement. Jamais la planète-mère (`planetClassId='homeworld'`). Les colonies `status='colonizing'` passent par un flow "annuler la colonisation" distinct, hors scope. |
| Vaisseaux stationnés | Tous les `planetShips` (flagship inclus) forment une flotte de retour vers une destination choisie par le joueur parmi ses autres planètes `status='active'`. |
| Ressources stockées | Chargées dans la cargo totale de la flotte de retour, dans l'ordre minerai → silicium → hydrogène, jusqu'à saturation. |
| Surplus de ressources | Minerai et silicium non chargés forment un `debris_fields` sur la position abandonnée (recyclable par n'importe quel joueur, y compris l'abandonneur). L'hydrogène non chargé est perdu (pas stocké dans `debris_fields`). |
| Bâtiments, défenses, files d'attente | Tout perdu. Aucun remboursement de ressources investies. |
| Transit | `fleetEvents` nouvelle mission `abandon_return` (cf. section « Pourquoi pas `transport` » plus bas), origine = coords de la planète abandonnée, destination = planète choisie. Temps de transit normal (formule `travelTime` existante), flotte vulnérable en route. |
| Position après abandon | Planète supprimée, position libre pour une nouvelle colonisation. |
| Gouvernance | Recalcul automatique côté client (le query `colonization.governance` compte déjà les planètes actives). |
| Traces | Rapport personnel de type `abandon` avec bilan détaillé. Pas de diffusion alliance. |

### Blocages d'abandon

La mutation refuse si au moins l'une de ces conditions est vraie :

- La planète est le homeworld.
- La planète a le statut `colonizing`.
- Au moins une flotte hostile inbound active cible cette planète (missions `attack`, `spy`, `pirate`, `colonization_raid` avec `status='active'`).
- Au moins un `fleetEvents` actif a `originPlanetId` = cette planète (flotte sortante, toutes missions).
- Au moins une offre marché a `planetId` = cette planète avec `status in ('active', 'reserved')`.
- Destination invalide : n'appartient pas au joueur, est la planète abandonnée elle-même, ou `status != 'active'`.

## Architecture

### Backend

Nouveau service **`PlanetAbandonService`** dans `apps/api/src/modules/planet/planet-abandon.service.ts`. Séparé du `planet.service.ts` existant parce que la logique croise 6 domaines (planets, ships, resources, fleets, market, debris) et mérite un fichier testable indépendant.

Deux endpoints tRPC sur `planet.*` :

- **`planet.abandonPreview`** (query) — input `{ planetId, destinationPlanetId }`. Retourne le bilan calculé (ships, ressources chargées/surplus, bâtiments perdus, temps de transit, blocages détectés) sans rien modifier. Utilisé pour alimenter l'étape 2 de l'UX.
- **`planet.abandon`** (mutation) — input identique. Exécute l'abandon dans une transaction DB unique. Re-valide tous les blocages côté serveur pour fermer les races entre preview et mutation.

### Flow de `planet.abandon`

Dans une transaction PostgreSQL :

1. `SELECT ... FOR UPDATE` sur la planète. Valide toutes les règles de blocage.
2. Lit `planetShips`, resources de la planète, cargo capacity totale des ships.
3. Calcule le chargement cargo : minerai → silicium → hydrogène jusqu'à saturation.
4. Calcule les debris à déposer : overflow minerai + overflow silicium (hydrogène non stocké).
5. Crée le `fleetEvents` : mission `abandon_return`, phase `outbound`, `originPlanetId` = planète abandonnée, `targetPlanetId` + target coords = destination, `ships` = l'intégralité des ships, cargo = quantités chargées.
6. Si le flagship est stationné sur cette planète :
   - `flagships.planetId = null`
   - `flagships.status = 'in_mission'`
   - À l'arrivée du fleet event, le nouveau `AbandonReturnHandler` déclenche `flagshipService.returnFromMission(userId, destPlanetId)` pour re-stationner le flagship.
7. `INSERT ... ON CONFLICT DO UPDATE` sur `debris_fields` : ajoute les surplus minerai/silicium (merge si un debris préexiste déjà à cette coord).
8. Crée le rapport (`reports` table, nouveau `missionType='abandon'`).
9. `DELETE FROM planets WHERE id = ?` → cascade automatique sur `planetShips`, `planetDefenses`, `planetBuildings`, `planetBiomes`, `colonizationProcesses`, files de construction, etc. via les FK existantes.

Hors transaction, une fois la transaction committée :

10. `fleetQueue.add('arrive', { fleetEventId }, { delay: transitMs })`.
11. `publishNotification` côté Redis pour que le client rafraîchisse Empire / Rapports / KpiBar.

### Pourquoi une nouvelle mission `abandon_return` et pas `transport`

Le `TransportHandler` existant retourne systématiquement `scheduleReturn: true` : après livraison, la flotte est renvoyée vers `originPlanetId`. Pour notre cas :

1. La flotte arrive sur la destination, les ressources et ships sont déposés.
2. `fleet.service.processArrival` appelle `scheduleReturn(eventId, originPlanetId=<abandonnée>, ...)`.
3. `scheduleReturn` fait `SELECT ... WHERE id=<abandonnée>` ; la planète n'existe plus ⇒ la fonction `return` sans rien faire.
4. Le `fleetEvents` reste `status='active'` indéfiniment (jamais marqué completed, jamais rescheduled) ⇒ orphelin.

Deux façons de résoudre : un flag `metadata.abandon` lu par `TransportHandler` pour bypass le retour, ou une mission dédiée. **On retient la mission dédiée** pour séparer proprement la sémantique (transport = aller-retour volontaire vs abandon = aller simple), éviter de polluer `TransportHandler` avec une branche conditionnelle, et garder les rapports distincts (un rapport `abandon_return` raconte l'abandon, pas un transport).

### Nouveaux types / enums

- Nouveau `missionType='abandon'` à ajouter à l'enum `missions` des rapports (`reports.mission_type`).
- Nouvelle mission `abandon_return` à ajouter à l'enum `fleet_mission` des `fleetEvents` et au registre de missions dans `game-config` (mêmes points d'ajout qu'une mission classique — cf. `docs/adding-a-new-mission.md`).
- Nouveau handler `AbandonReturnHandler` dans `apps/api/src/modules/fleet/handlers/abandon-return.handler.ts` :
  - `validateFleet` : no-op (la flotte n'est jamais envoyée par le joueur via l'UI classique, uniquement créée par `PlanetAbandonService`).
  - `processArrival` : cherche la planète destination (si disparue, comme `transport.handler`, fallback report `aborted`) ; dépose les ressources ; mergeant les ships sur `planetShips` de la destination ; re-stationne le flagship via `flagshipService.returnFromMission` si présent ; crée un rapport `abandon` avec le bilan complet (ships arrivés, cargo, loss origin) ; retourne `scheduleReturn: false`, `schedulePhase: undefined`, `createReturnEvent: undefined` ⇒ `fleet.service` marquera l'event `completed`.
- Nouveau composant web `AbandonReportDetail` parallèle à `TransportReportDetail`, câblé dans `ReportDetail.tsx`.

### Audit FK requis avant implémentation

La Phase 1 du plan doit auditer toutes les FK `REFERENCES planets(id)` et vérifier la politique `ON DELETE` de chacune :

- `fleetEvents.originPlanetId` et `targetPlanetId` : **doivent être `SET NULL`** (sinon on tue la flotte de retour qu'on vient de créer).
- `reports.*` pointant vers la planète : **doivent être `SET NULL`** (sinon on efface tous les rapports historiques liés à cette planète, y compris ceux d'autres joueurs pour un combat qui s'y est déroulé).
- `debrisFields` : pas de FK vers planets (indépendant par coord), rien à faire.
- `market_offers.planetId` : `CASCADE` acceptable (mais la mutation bloque déjà si des offres actives/reserved existent).

Tout autre FK doit être auditée avec la même grille.

### Frontend

**Point d'entrée** : menu contextuel (bouton "⋯") sur chaque `EmpirePlanetCard` et `EmpirePlanetRow` dans `apps/web/src/pages/Empire.tsx`. Le menu est absent pour la carte du homeworld et pour les cartes `status='colonizing'` (celles-ci gardent leur redirection existante vers `ColonizationProgress`).

**Modal en deux étapes** :

**Étape 1 — Choix destination**
- Liste radio des planètes `status='active'` du joueur autres que la planète abandonnée, triées par `sortOrder`.
- Pour chaque option : coord, nom, temps de transit estimé, cargo capacity totale des ships de la planète abandonnée.
- Bouton "Suivant" désactivé tant qu'aucune destination n'est choisie.
- Si au moins un blocage est détecté (via `abandonPreview`), affichage d'un pavé d'erreurs listant chaque blocage avec lien vers la page concernée (flottes, marché, etc.). "Suivant" reste désactivé.

**Étape 2 — Résumé**
- **Sauvé** : liste des ships rapatriés, ressources chargées par type, mention "flagship inclus" si applicable, destination + heure d'arrivée.
- **En champ de débris sur [coord]** : overflow minerai + silicium, avec avertissement "Un recycleur peut les récupérer — y compris les vôtres."
- **Perdu définitivement** : bâtiments (avec total de niveaux), défenses, files d'attente, hydrogène overflow.
- Checkbox "J'ai compris ce que je vais perdre" requise pour déverrouiller le bouton final.
- Boutons "Abandonner définitivement" + "Retour".

**Post-mutation** :
- Toast "Colonie abandonnée. Flotte en retour — arrivée [heure]."
- Redirect vers Empire.
- Invalidation des queries `planet.empire`, `planet.list`, `colonization.governance`, `fleet.events`, `report.list`, `report.unreadCount`.

## Tests

### Unitaires (`planet-abandon.service.test.ts`)

- Calcul du chargement cargo : ordre minerai → silicium → hydrogène, overflow correct.
- Debris field créé si overflow minerai+silicium > 0, pas créé sinon.
- Debris field mergé correctement si un preexiste à la même coord.
- Hydrogène overflow perdu (pas inséré dans debris_fields).
- Flotte de retour créée avec `departureTime`/`arrivalTime` corrects (même formule que les transports classiques).
- Flagship sur la planète : inclus dans `ships` du fleet event, `flagship.planetId = null`, `flagship.status = 'in_mission'` après abandon.
- Rapport généré avec le bon payload (ships, cargo chargée, losses, destination, debris).
- Cascade : suppression de la planète efface `planetShips`, `planetDefenses`, `planetBuildings`, `planetBiomes`, `colonizationProcesses`, files de construction.

### Validation (blocages)

- Refus si planète = homeworld.
- Refus si `planetId` n'appartient pas au user.
- Refus si planète `status='colonizing'`.
- Refus si au moins une flotte hostile inbound (`attack`/`spy`/`pirate`/`colonization_raid`, `status='active'`, target = cette planète).
- Refus si au moins un `fleetEvents` actif avec `originPlanetId` = cette planète.
- Refus si au moins une offre marché `status in ('active','reserved')` sur cette planète.
- Refus si destination n'appartient pas au user, est la planète abandonnée elle-même, ou `status != 'active'`.

### Intégration bout-en-bout

- Flow complet : `abandon` → fleet event créé (mission `abandon_return`) → job BullMQ scheduled → `AbandonReturnHandler.processArrival` dépose ships+resources sur destination, re-stationne le flagship, marque le fleet event `completed`.
- Après abandon, `colonization.governance.colonyCount` a décrémenté.
- Le fleet event de retour survit à la suppression de la planète d'origine (FK `originPlanetId` doit être `SET NULL`).
- Si la planète destination est elle-même détruite pendant le transit (abandon en chaîne), le handler produit un rapport `abandon_aborted` et les ships+ressources sont définitivement perdus (à confirmer avec un test explicite ; ou alternative : retomber sur le homeworld).

## Edge cases documentés

1. **Race condition preview/mutation** : le joueur peut lancer une attaque ou créer une offre marché entre les deux appels. La mutation re-valide tout en transaction — le preview n'engage rien.
2. **Connaissance conservée** : `discoveredBiomes` et `discoveredPositions` ne sont pas liés à la planète (ils sont par user). Le joueur garde sa connaissance des biomes/positions après abandon.
3. **Flagship déjà en mission** : si le flagship a `status='in_mission'` au moment de l'abandon (pas physiquement sur la planète), il n'est pas inclus dans le retour et ses FK sont indépendantes. Vérifier qu'aucune FK du flagship ne cascade-delete avec la planète abandonnée.
4. **Debris préexistant** : une position peut déjà avoir un `debris_fields` (combat précédent). L'abandon doit merger (ADD) les quantités, pas remplacer.

## Hors scope

- Flow "annuler la colonisation" pour les planètes `status='colonizing'` (déjà partiellement existant via le chemin `colonizationService.fail`, sera traité séparément).
- Cooldown entre abandons (évalué puis écarté : la pénalité économique des pertes est déjà dissuasive).
- Diffusion des abandons dans le feed d'activité alliance (évalué puis écarté : peut être ajouté plus tard si souhaité).
- Remboursement partiel des constructions en cours (écarté : incohérent avec la perte totale des bâtiments finis).
