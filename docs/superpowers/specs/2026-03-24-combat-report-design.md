# Rapport de combat enrichi — Design Spec

## Objectif

Enrichir les rapports de combat avec le detail complet : flottes initiales des deux camps, survivants, detail round par round. Envoyer le rapport structure (mission_reports) aux deux belligerants, pas seulement a l'attaquant.

## Principes

- **Pas de nouvelle table** : enrichir le JSONB `result` existant des mission_reports
- **Meme rapport pour les deux** : attaquant et defenseur voient les memes donnees, seul le titre/perspective change
- **Round par round en accordeons** : resume visible par defaut, detail depliable

---

## Moteur de combat

### Fichier : `packages/game-engine/src/formulas/combat.ts`

Enrichir l'interface `RoundResult` avec le detail par type d'unite :

```ts
export interface RoundResult {
  round: number;
  attackersRemaining: number;
  defendersRemaining: number;
  attackerShips: Record<string, number>;  // unites restantes par type
  defenderShips: Record<string, number>;  // unites restantes par type
}
```

Dans `simulateCombat`, apres chaque appel a `executeRound`, calculer les survivants par type pour chaque camp et les stocker dans le `RoundResult`. La logique de combat elle-meme ne change pas.

Le calcul des survivants par type : parcourir le tableau d'unites, filtrer les non-detruites, compter par `unit.type`.

---

## Backend

### Fichier : `apps/api/src/modules/fleet/handlers/attack.handler.ts`

#### Variables a extraire hors du bloc if/else

`result.rounds` est scope dans le bloc `else` (ligne 118-130) et n'est pas accessible la ou `reportResult` est construit. Il faut declarer `let rounds: RoundResult[] = [];` avant le `if (!hasDefenders)`, puis assigner `rounds = result.rounds` dans le bloc `else` (comme c'est deja fait pour `roundCount`, `attackerLosses`, etc.).

#### Enrichir le result JSONB

Ajouter 4 nouvelles cles au `reportResult` :

| Cle | Type | Source | Description |
|-----|------|--------|-------------|
| `attackerFleet` | `Record<string, number>` | `ships` (parametre existant) | Flotte initiale de l'attaquant. Duplique intentionnellement `report.fleet.ships` pour que le frontend puisse lire les deux camps uniformement depuis `result.*` |
| `attackerSurvivors` | `Record<string, number>` | `survivingShips` (deja calcule ligne 133) | Unites restantes de l'attaquant |
| `defenderSurvivors` | `Record<string, number>` | Calcule | Unites restantes du defenseur |
| `rounds` | `RoundResult[]` | Variable `rounds` (extraite ci-dessus) | Detail round par round |

Le `roundCount` reste present (backward compat, et evite de compter `rounds.length` cote client).

**Calcul de `defenderSurvivors`** : iterer sur `{...defenderFleet, ...defenderDefenses}` (les deux variables qui existent deja). Pour chaque `[type, count]`, calculer `count - (defenderLosses[type] ?? 0) + (repairedDefenses[type] ?? 0)`. Ne garder que les entrees > 0.

**Cas sans defenseur (`!hasDefenders`)** : quand il n'y a pas de defenseur, les nouvelles valeurs sont : `rounds = []`, `attackerSurvivors = { ...ships }` (copie de la flotte initiale, aucune perte), `defenderSurvivors = {}`.

#### Creer le rapport du defenseur

Apres la creation du rapport de l'attaquant (ligne 312), appeler `reportService.create()` une seconde fois :

```
userId: targetPlanet.userId
fleetEventId: null  (ce n'est pas la flotte du defenseur)
messageId: defenderMsg.id (voir ci-dessous)
missionType: 'attack'
title: perspective inversee — si outcome=attacker → "Defaite", si outcome=defender → "Victoire", si draw → "Match nul"
coordinates: coordonnees de la planete cible (c'est la planete du defenseur)
originCoordinates: memes coordonnees d'origine (planete de l'attaquant)
fleet: { ships: {}, totalCargo: 0 }  (le defenseur n'a pas envoye de flotte — le champ est NOT NULL en base)
departureTime: fleetEvent.departureTime
completionTime: fleetEvent.arrivalTime
result: meme objet reportResult que l'attaquant
```

**Message systeme du defenseur** : capturer le `messageId` retourne par le second `createSystemMessage` (ligne 276) pour le lier au rapport. Actuellement le `messageId` n'est pas capture — changer en `const defenderMsg = await ctx.messageService.createSystemMessage(...)` et utiliser `defenderMsg.id`.

---

## Frontend

### Fichier : `apps/web/src/pages/Reports.tsx`

#### Section generique "Flotte"

La section generique qui affiche `selectedReport.fleet.ships` (avant les sections specifiques par type) doit etre gardee pour les rapports d'attaque du defenseur : si `fleet.ships` est un objet vide (`Object.keys(fleet.ships).length === 0`), ne pas afficher cette section. Cela evite un affichage vide pour les rapports du defenseur.

#### Structure du rapport d'attaque (section `missionType === 'attack'`)

Remplacer l'affichage actuel par cette structure :

**1. Resume (existe, inchange)**
Badge outcome (Victoire/Defaite/Match nul) + nombre de rounds.

**2. Forces initiales (enrichi)**
Deux sous-sections cote a cote ou empilees :
- **Attaquant** : liste des unites de `result.attackerFleet` (nouveau — actuellement seul le defenseur est affiche)
- **Defenseur** : liste des unites de `result.defenderFleet` + `result.defenderDefenses` (existe deja)

Backward compat : si `result.attackerFleet` est absent (ancien rapport), afficher uniquement le defenseur comme avant.

**3. Detail des rounds (nouveau)**
Pour chaque round dans `result.rounds` :
- Section depliable (accordeon) avec titre "Round N"
- Contenu : unites restantes par type pour attaquant et defenseur (`round.attackerShips`, `round.defenderShips`)
- Afficher en deux colonnes (attaquant | defenseur)

Backward compat : si `result.rounds` est absent, ne rien afficher (anciens rapports n'ont que `roundCount`).

**4. Survivants (nouveau)**
Apres les rounds, section "Survivants" montrant :
- **Attaquant** : `result.attackerSurvivors` en vert
- **Defenseur** : `result.defenderSurvivors` en vert

Backward compat : si absent, ne pas afficher la section.

**5. Pertes (existe, inchange)**
Liste des pertes des deux camps en rouge.

**6. Defenses reparees (existe, inchange)**

**7. Debris (existe, inchange)**

**8. Pillage (existe, inchange)**

---

## Hors perimetre

- Modification du moteur de combat (logique de tirs, degats, etc.) : pas de changement
- Rapports pour les autres types de mission (pirate, recycle, etc.)
- Notification SSE specifique au combat : le systeme actuel (message systeme) suffit
- Filtrage des rapports par "mes attaques" vs "defenses" dans l'UI : a faire ulterieurement si necessaire
- Statistiques aggregees (nombre total de combats, ratio victoires, etc.)
