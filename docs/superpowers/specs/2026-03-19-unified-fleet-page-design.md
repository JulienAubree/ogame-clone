# Unified Fleet Page — Design Spec

## Objectif

Remplacer le wizard 3 étapes actuel (vaisseaux → destination/mission → cargo) et le flow séparé Missions PvE par **un écran unique** où l'utilisateur choisit mission, destination et composition de flotte d'un seul tenant.

## Principes

- **La mission guide tout** : le choix de la mission est le premier input, il conditionne quels vaisseaux sont requis/optionnels/inutilisables et quel hint contextuel s'affiche.
- **Deux modes d'entrée** : accès direct (tout éditable) ou pré-rempli depuis la page Missions PvE (mission + destination verrouillées).
- **Cargo toujours visible** : même pour les missions non-transport, l'utilisateur voit la capacité cargo de sa flotte.
- **Quasi pas de changement backend** : le endpoint `fleet.send` et les handlers de mission ne changent pas. Un seul ajout backend : un endpoint `pve.getMissionById` pour alimenter le bandeau de rappel PvE.

## Layout de l'écran

Du haut vers le bas :

### 1. Bandeau de rappel mission (PvE uniquement)

Affiché uniquement quand l'utilisateur arrive depuis la page Missions avec des paramètres URL (`?mission=...&pveMissionId=...`).

- **Mission minage** : icône + "Extraction minière" + type de ressource + quantité estimée + coordonnées
- **Mission pirate** : icône + "Repaire pirate" + difficulté (badge coloré) + récompenses (minerai, silicium, hydrogène) + coordonnées

Ce bandeau est informatif, non interactif. Les données proviennent d'un nouveau endpoint `pve.getMissionById(pveMissionId)` qui retourne les détails de la mission (type, coordonnées, et les champs dépliés depuis les JSONB `parameters` et `rewards` : ressource, quantité estimée pour le minage ; difficulté, récompenses minerai/silicium/hydrogène pour les pirates).

### 2. Sélecteur de mission

Rangée de **chips/pills** pour les 8 types de mission : Transport, Stationner, Espionner, Attaque, Coloniser, Recycler, Miner, Pirate.

- **Accès direct** : toutes les chips sont cliquables, la sélection change la couleur (fond vert + bordure).
- **Mode PvE** : la mission est pré-sélectionnée et toutes les chips sont désactivées. Un hint "🔒 Verrouillée pour cette mission" est affiché.
- Pas de mission sélectionnée par défaut en accès direct — l'utilisateur doit en choisir une.

### 3. Destination

Trois champs numériques inline : Galaxie (1-9) : Système (1-499) : Position (1-16).

- **Accès direct** : champs éditables, initialisés aux coordonnées de la planète courante du joueur.
- **Mode PvE** : champs pré-remplis et désactivés, icône cadenas à côté.

### 4. Hint contextuel

Bandeau bleu sous la destination, texte adapté à la mission sélectionnée :

| Mission     | Hint                                                           |
|-------------|----------------------------------------------------------------|
| Transport   | "Envoyez des ressources vers une planète alliée"               |
| Stationner  | "Stationnez votre flotte sur une planète alliée"               |
| Espionner   | "Envoyez des sondes d'espionnage"                              |
| Attaque     | "Attaquez une planète ennemie"                                 |
| Coloniser   | "Colonisez une position vide"                                  |
| Recycler    | "Récupérez les débris en orbite"                               |
| Miner       | "Envoyez des prospecteurs sur une ceinture d'astéroïdes"       |
| Pirate      | "Attaquez un repaire pirate"                                   |

En mode PvE, le hint est remplacé par le bandeau de rappel mission (section 1) et n'est pas affiché séparément.

### 5. Composition de la flotte — 3 sections

La liste des vaisseaux est divisée en 3 sections, déterminées par la mission sélectionnée :

#### Section "Requis" (fond vert subtil)
Vaisseaux obligatoires pour la mission. Au moins 1 doit être sélectionné pour pouvoir envoyer.

#### Section "Optionnels"
Vaisseaux utilisables en complément (escorte, capacité cargo supplémentaire...).

#### Section "Non disponibles" (grisé, opacity réduite)
Vaisseaux dont le joueur n'a aucun exemplaire (count = 0) OU qui sont explicitement interdits pour la mission.

#### Matrice mission → catégorisation des vaisseaux

| Mission     | Requis                    | Interdit                                      |
|-------------|---------------------------|-----------------------------------------------|
| Transport   | aucun (tout est optionnel)| —                                              |
| Stationner  | aucun                     | —                                              |
| Espionner   | espionageProbe            | tous les autres (exclusif)                     |
| Attaque     | ≥1 combat*                | —                                              |
| Coloniser   | colonyShip                | tous les autres (exclusif)                     |
| Recycler    | recycler                  | tous les autres (exclusif)                     |
| Miner       | ≥1 prospector             | —                                              |
| Pirate      | ≥1 combat*                | —  (PvE uniquement, nécessite pveMissionId)    |

\* combat = lightFighter, heavyFighter, cruiser, battleship

L'`explorer` n'est requis pour aucune mission et n'est interdit nulle part — il est toujours optionnel.

Pour les missions sans vaisseaux requis (Transport, Stationner), la section "Requis" devient "Recommandés" :
- **Transport** : smallCargo, largeCargo
- **Stationner** : tous les vaisseaux (pas de recommandation particulière, la section "Recommandés" est omise)

Ces recommandations sont visuelles uniquement, aucune contrainte n'est imposée.

Tout vaisseau qui n'est ni requis ni interdit est optionnel.

**Note** : les validations de la matrice (vaisseaux requis) sont des garde-fous frontend uniquement. Le backend ne valide pas la présence de vaisseaux de combat pour Attaque/Pirate — seuls les handlers spécifiques (espionnage, minage, colonisation, recyclage) font des vérifications côté serveur.

#### Chaque ligne de vaisseau affiche :
- Nom du vaisseau
- Bouton "MAX" (remplit au maximum disponible)
- Input numérique (0 à count disponible)
- Compteur "/ N" (nombre disponible sur la planète)

### 6. Section Cargo

Toujours visible, 3 inputs inline : Minerai, Silicium, Hydrogène.

- Indicateur de capacité en haut à droite : "X / Y" (chargé / capacité totale).
- La capacité se met à jour en temps réel quand la composition de flotte change. Le calcul utilise les stats vaisseaux du game config (déjà chargé via `useGameConfig` ou query dédiée).
- Les inputs sont éditables pour toutes les missions (le joueur peut vouloir transporter des ressources en plus d'une mission de combat).

### 7. Barre de résumé et envoi

Barre fixe en bas avec :
- **Gauche** : résumé textuel — nombre de vaisseaux sélectionnés, capacité cargo utilisée
- **Droite** : bouton "Envoyer" (ou libellé contextuel : "Attaquer", "Espionner"...)

Note : le temps de trajet et la consommation fuel ne sont pas affichés dans cette V1 (nécessiterait des calculs complexes côté client avec les stats de vitesse, recherches, distance). Ils pourront être ajoutés ultérieurement via un endpoint `fleet.estimate`.

Le bouton est **désactivé** (grisé) tant que :
- Aucune mission n'est sélectionnée, ou
- La destination est incomplète, ou
- Les vaisseaux requis ne sont pas sélectionnés (ex: 0 prospecteur pour minage)

Pour les missions dangereuses (Attaque, Coloniser, Pirate), un `ConfirmDialog` est affiché avant l'envoi (même liste que l'actuel).

## Mode PvE — Pré-remplissage

Quand l'utilisateur clique "Envoyer" ou "Attaquer" sur la page Missions, il est redirigé vers `/fleet?mission=mine&galaxy=X&system=Y&position=Z&pveMissionId=...`.

La page Flotte détecte ces paramètres et :
1. Affiche le bandeau de rappel mission (fetch des détails via `pveMissionId`)
2. Verrouille les chips de mission et les champs destination
3. Pré-sélectionne les vaisseaux requis au maximum (ex: tous les prospecteurs pour minage)

L'utilisateur peut toujours modifier la composition de flotte (ajouter des cargos, retirer des prospecteurs tant qu'il en reste ≥1).

## Comportement post-envoi

- **Succès** : toast de confirmation ("Flotte envoyée !"), puis reset complet du formulaire (aucune mission sélectionnée, destination vide, flotte à 0, cargo à 0). Si on était en mode PvE, les paramètres URL sont nettoyés.
- **Erreur serveur** : message d'erreur affiché dans un bandeau rouge en haut de la page (même pattern que l'existant). Le formulaire reste rempli pour permettre de corriger et réessayer.

## Ce qui ne change PAS

- **Page Missions** (`/missions`) : reste telle quelle, continue de rediriger vers `/fleet?...`
- **Page Mouvements** (`/movements`) : inchangée
- **Backend `fleet.send`** : mêmes inputs, mêmes validations
- **Handlers de mission** : aucune modification
- **Navigation sidebar** : "Flotte" et "Missions" restent deux entrées séparées

## Fichiers impactés

- `apps/web/src/pages/Fleet.tsx` — refonte complète (remplacement du wizard 3 étapes)
- Potentiellement extraction de sous-composants :
  - `MissionSelector` (chips de mission)
  - `FleetComposition` (3 sections de vaisseaux)
  - `PveMissionBanner` (bandeau rappel)
  - `FleetSummaryBar` (barre résumé + envoi)
