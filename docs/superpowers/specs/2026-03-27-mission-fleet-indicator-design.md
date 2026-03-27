# Indicateur "flotte en route" sur la page Missions — Design Spec

## Contexte

La page Missions affiche les gisements découverts et les repaires pirates avec un bouton "Envoyer"/"Attaquer", mais ne montre pas si une flotte est déjà en route vers cette mission. Le joueur peut envoyer par erreur plusieurs flottes sur un même repaire pirate (mission unique) ou ne pas savoir qu'un gisement est déjà en cours d'exploitation.

## Approche

Croiser les données de `trpc.fleet.movements` avec les missions PvE affichées via le champ `pveMissionId` présent dans les fleet events. Afficher un indicateur visuel sur chaque carte de mission ayant une flotte active associée.

## Changements

### Fichier unique : `apps/web/src/pages/Missions.tsx`

### 1. Données

Ajouter `trpc.fleet.movements.useQuery()` dans le composant. Construire un `Map<string, FleetMovement[]>` indexé par `pveMissionId` pour un lookup O(1) par mission.

### 2. Gisements (mine)

Si une ou plusieurs flottes sont en route (`pveMissionId` match) :
- Afficher un bandeau sous les ressources estimées, avant les boutons
- Style : `rounded-lg bg-blue-500/10 border border-blue-500/20 p-2`
- Contenu : dot animé bleu + texte phase traduit (en vol / prospection / extraction / retour) + `<Timer endTime={arrivalTime} />`
- Si plusieurs flottes, afficher une ligne par flotte
- Le bouton "Envoyer" reste **actif** (un gisement accepte plusieurs flottes)

### 3. Repaires pirates

Si une flotte est en route (`pveMissionId` match) :
- Afficher le même bandeau (style rose au lieu de bleu : `bg-rose-500/10 border-rose-500/20`)
- Le bouton "Attaquer" est **désactivé** (`disabled`) avec le texte "Flotte en route"
- Une mission pirate est un combat unique, pas de doublon

### 4. Labels de phase

Mapping des phases fleet vers des labels français :
- `outbound` → "En vol"
- `prospecting` → "Prospection"
- `mining` → "Extraction"
- `return` → "Retour"
- Pour les pirates : `outbound` → "En vol", `return` → "Retour"

### 5. Invalidation

Quand le timer d'un mouvement se termine (`onComplete`), invalider `fleet.movements` pour rafraîchir l'indicateur.

## Ce qui ne change pas

- Le backend (aucune modification API)
- Le comportement des boutons pour les gisements (toujours actifs)
- Le reste de la page Missions (explainer, status bar, dismiss)
- La page Galaxy (hors scope)
