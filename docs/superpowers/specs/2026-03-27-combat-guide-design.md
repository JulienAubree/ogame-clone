# Guide de Combat Spatial — Design Spec

## Contexte

Le système FP est en place mais les joueurs n'ont aucune explication sur le fonctionnement du combat. Il faut un encart rapide sur la page Missions et une page guide dédiée avec deux niveaux de lecture (débutant et technique).

Note : `docs/game-mechanics.md` est obsolète (décrit encore le rapidfire, la règle du bounce, la destruction à 30%). Cette spec se base sur le moteur réel (`packages/game-engine/src/formulas/combat.ts`).

## 1. Encart dépliable (page Missions)

### Emplacement

Sous le titre "Repaires pirates", avant les cartes de mission pirate.

### Comportement

- **Toujours présent** (pas de "Ne plus afficher")
- **Replié par défaut** : icône info + "Le **Facteur de Puissance (FP)** mesure la force d'une flotte." + bouton "En savoir plus"
- **Déplié** :
  - Explication FP : "Plus le FP est élevé, plus la flotte est puissante. Comparez votre FP à celui des pirates avant d'attaquer."
  - Résumé combat : "Le combat se déroule en 4 rounds maximum. Chaque round, vos vaisseaux tirent simultanément sur les ennemis et vice-versa. Les boucliers absorbent les dégâts en premier puis se régénèrent à chaque round. Les dégâts sur la coque sont permanents."
  - Lien : "Guide complet du combat spatial →" vers `/guide/combat`
  - Bouton "Réduire"

### Style

Même pattern `glass-card` que l'encart explicatif existant, mais avec `border-rose-500/20 bg-rose-500/5` (cohérent section pirate). Utilise `useState` pour l'état plié/déplié.

## 2. Page guide de combat

### Route

`/guide/combat` — ajoutée dans `apps/web/src/router.tsx`, protégée par AuthGuard (dans le layout authentifié).

### Structure

- `PageHeader` "Guide de combat spatial"
- Deux onglets : **"Comprendre le combat"** | **"Référence technique"**
- Onglet actif géré via query param `?tab=reference` pour lien direct. Défaut : onglet débutant.

### Onglet "Comprendre le combat" (débutant)

Ton pédagogique, explique chaque concept depuis zéro. Sections :

1. **C'est quoi le FP ?**
   - Analogie simple : "C'est la note de puissance de ta flotte"
   - Formule vulgarisée : "On combine la puissance de feu et la résistance de chaque vaisseau"
   - Exemple : "Un intercepteur = 4 FP, un cuirassé = 98 FP"

2. **Les stats d'un vaisseau**
   - **Armes** : les dégâts infligés par tir
   - **ShotCount** : le nombre de tirs par round (ex: l'intercepteur tire 3 fois, le croiseur 1 seule fois)
   - **Bouclier** : absorbe les dégâts en premier, se régénère à 100% chaque round
   - **Armure** : réduit les dégâts qui passent le bouclier (réduction plate, fixe)
   - **Coque** : les points de vie — quand ça tombe à 0, le vaisseau est détruit. Pas de régénération.

3. **Comment se déroule un combat**
   - Étapes : déploiement des flottes → jusqu'à 4 rounds → résultat
   - Résolution simultanée : les deux camps tirent "en même temps" (un vaisseau détruit dans le round tire quand même)
   - Le combat s'arrête si un camp est entièrement détruit

4. **Un round en détail**
   - Phase 1 : tous les attaquants tirent (chaque vaisseau tire `shotCount` fois sur une cible aléatoire)
   - Phase 2 : tous les défenseurs tirent de la même façon
   - Phase 3 : les boucliers de tous les survivants se régénèrent à 100%
   - Les dégâts sur la coque sont permanents

5. **Ciblage**
   - Chaque vaisseau a une priorité de cible (léger → moyen → lourd → support)
   - Les vaisseaux de support (cargos) ne sont ciblés qu'en dernier recours
   - Au sein d'une catégorie, la cible est aléatoire

6. **Après le combat**
   - Débris : 30% du coût des vaisseaux détruits (pas les défenses) récupérables en minerai + silicium
   - Défenses : 70% de chance d'être réparées automatiquement
   - Les vaisseaux détruits sont perdus définitivement

7. **Exemple animé** — 2-3 replays pré-configurés (voir section 3)

### Onglet "Référence technique" (wiki)

Ton encyclopédique, exhaustif. Sections :

1. **Formule FP**
   - Formule exacte : `Math.round((weapons × shotCount^exponent) × (shield + hull) / divisor)`
   - Paramètres univers : `fp_shotcount_exponent` (défaut 1.5), `fp_divisor` (défaut 100)
   - FP flotte = somme des FP unitaires × quantité
   - Table de référence avec FP de chaque vaisseau et défense

2. **Formules de combat**
   - Calcul des stats effectives (multiplicateurs de recherche)
   - Algorithme de dégâts par tir :
     1. Si `bouclier >= dégâts` → bouclier absorbe tout, 0 dégâts coque
     2. Sinon surplus = `dégâts - bouclier`
     3. Dégâts coque = `max(surplus - armure, 1)` (minimum 1 si le tir perce le bouclier)
     4. Destruction si `coque <= 0`
   - Résolution simultanée (clonage d'état début de round)

3. **Priorité de ciblage**
   - Table des catégories (léger, moyen, lourd, support) avec targetOrder
   - Algorithme : priorité configurée → catégories targetable par ordre → support en dernier

4. **Table des vaisseaux**
   - Tous les vaisseaux avec : armes, shotCount, bouclier, armure, coque, FP, catégorie
   - Chargée dynamiquement depuis la game config

5. **Table des défenses**
   - Idem pour les défenses

6. **Débris et réparation**
   - Formule débris : `floor(coût_minerai × debrisRatio)` + `floor(coût_silicium × debrisRatio)`
   - Seuls les vaisseaux génèrent des débris (pas les défenses)
   - Réparation défenses : chaque défense détruite a `defenseRepairRate` (70%) de chance d'être restaurée

7. **Simulateur de combat** (voir section 3)

## 3. Composants interactifs

### CombatReplay (onglet débutant)

Scénarios pré-définis hardcodés dans le composant :
- **"Combat équilibré"** — 5 intercepteurs vs 5 intercepteurs
- **"Supériorité numérique"** — 10 intercepteurs vs 3 frégates
- **"ShotCount en action"** — 8 intercepteurs (shotCount 3) vs 2 croiseurs (shotCount 1)

Fonctionnement :
1. Sélection du scénario via boutons
2. Bouton "Lancer le combat" → exécute `simulateCombat()` du game-engine avec un seed fixe
3. Affichage round par round avec animation (transition CSS ~1s entre rounds) :
   - Deux colonnes (Attaquant | Défenseur)
   - Chaque type : nom + compteur unités + barre de coque (% moyen) + indicateur bouclier
   - Le bouclier se "vide" puis "se remplit" à chaque round
   - Les unités détruites disparaissent avec fade out
   - Numéro du round ("Round 1/4")
4. Résultat : Victoire/Défaite/Nul + pertes de chaque camp
5. Bouton "Rejouer"

Stats vaisseaux : utilise la game config chargée via `useGameConfig()`. Les scénarios définissent seulement les compositions de flottes, pas les stats.

### CombatSimulator (onglet technique)

Fonctionnement :
1. Deux panneaux côte à côte : "Ta flotte" | "Flotte ennemie"
2. Pour chaque panneau :
   - Liste des vaisseaux/défenses ajoutés avec input nombre
   - Dropdown pour sélectionner le type à ajouter + bouton "+"
   - FP total affiché en temps réel (recalculé via `computeFleetFP`)
3. Bouton "Simuler le combat"
4. Résultat : même affichage round par round que CombatReplay
5. Stats détaillées en plus : dégâts par catégorie, bouclier absorbé, armure bloquée, overkill, débris

Utilise directement `simulateCombat()` de `packages/game-engine` côté client.
Les multiplicateurs sont fixés à 1/1/1 (pas de gestion recherche dans le simulateur — simplicité).

## 4. Fichiers impactés

### Nouveaux fichiers
- `apps/web/src/pages/CombatGuide.tsx` — page principale avec onglets
- `apps/web/src/components/combat-guide/CombatReplay.tsx` — replay animé
- `apps/web/src/components/combat-guide/CombatSimulator.tsx` — simulateur configurable
- `apps/web/src/components/combat-guide/RoundDisplay.tsx` — composant partagé d'affichage d'un round (utilisé par Replay et Simulator)
- `apps/web/src/components/combat-guide/FleetComposer.tsx` — panneau de composition de flotte (utilisé par Simulator)

### Fichiers modifiés
- `apps/web/src/pages/Missions.tsx` — ajout de l'encart dépliable dans la section pirates
- `apps/web/src/router.tsx` — ajout route `/guide/combat`

### Pas de modification backend
Tout est calculé côté client avec le game-engine existant.

## 5. Dépendances

- `packages/game-engine` — déjà dépendance de `apps/web` (utilisé pour le FP)
- Fonctions nécessaires : `simulateCombat`, `computeUnitFP`, `computeFleetFP` (déjà exportées)
- Game config : stats vaisseaux/défenses, catégories, combat config — déjà disponibles via `useGameConfig()`
