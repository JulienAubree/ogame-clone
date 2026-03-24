# Entity Cards Redesign — Design Spec

## Objectif

Refondre les cartes de liste et les panneaux de détails des entités (bâtiments, vaisseaux, recherches, défenses) pour mettre l'illustration en valeur, réduire le bruit visuel et afficher les informations les plus utiles au joueur.

**Phase 1** : Bâtiments uniquement. Les autres entités suivront le même pattern dans une itération ultérieure.

## Carte de liste — Layout vertical

Remplace le layout horizontal actuel (image à gauche, infos à droite) par un layout **vertical** (image en haut, infos en dessous).

### Structure

Du haut vers le bas :

1. **Zone image** — fond dégradé subtil, illustration centrée plus grande qu'aujourd'hui (~80px au lieu de 40-72px). Badge niveau en overlay (coin haut-droit), fond vert, texte blanc.
2. **Nom** — texte principal, 13px, font-weight 600.
3. **Stat contextuelle** — une seule ligne, adaptée au type de bâtiment :
   - Mines/synthés : `+X ressource/h` (production actuelle)
   - Centrale solaire : `+X énergie`
   - Entrepôts : `capacité X`
   - Bâtiments utilitaires (chantier, labo, etc.) : rien
4. **Coût** — composant `ResourceCost` existant (3 icônes, vert si abordable, rouge sinon).
5. **Durée** — temps de construction, petite icône horloge.
6. **Bouton d'action** — pleine largeur : "Améliorer".

### Grille

- **Desktop** : grille responsive, 3-4 colonnes selon la largeur (`grid-cols-[repeat(auto-fill,minmax(180px,1fr))]`).
- **Mobile** : conserver le layout compact en liste existant (pas de changement).

### Catégories

Conserver le regroupement par catégories avec sections collapsibles (comportement actuel).

### États spéciaux

- **En cours d'amélioration** : le bouton est remplacé par un timer avec barre de progression (comportement actuel conservé).
- **Prérequis non remplis** : carte en opacity réduite, coût grisé, message "Prérequis : X niveau Y" (comportement actuel conservé).
- **Non abordable** : bouton désactivé, coûts en rouge (comportement actuel conservé).

## Panneau de détails

Affiché dans le `EntityDetailOverlay` existant (drawer mobile / modal desktop). Le contenu interne est refait.

### Structure — Bâtiments

Du haut vers le bas :

#### 1. Illustration hero
Pleine largeur du panneau, ~200px de haut, fond dégradé. Image centrée grande (~120px) via `GameImage` (catégorie `buildings`). Badge niveau en overlay (coin bas-droit).

#### 2. Nom
Titre 18px, blanc, immédiatement sous l'image.

#### 3. Flavor text
Italique, gris (#888), 12px, 2-3 lignes. Provient de `gameConfig.buildings[id].flavorText`.

#### 4. Bloc "Effets actifs"

Fond distinct (#1e293b), border-radius 8px. Affiché uniquement si au moins un effet s'applique au bâtiment.

**Data flow :** Les bonus sont déjà disponibles via `useGameConfig()` (champ `bonuses: BonusDefinition[]`). Les niveaux des bâtiments du joueur sont disponibles via `buildings.list` (déjà chargé dans la page). Aucun nouvel endpoint nécessaire.

**Filtrage :** Pour un bâtiment donné, afficher les bonus dont le `stat` est `building_time` (s'applique à tous les bâtiments). En pratique dans la BDD actuelle, le seul bonus `building_time` est :
- `robotics` (Usine de robots) : `-15%` par niveau → "Réduit le temps de construction de 15% par niveau"

Chaque effet affiche :
- Icône miniature (28x28px) via `GameImage` (catégorie `buildings` ou `research` selon `sourceType`)
- Nom + niveau actuel du joueur (ex: "Usine de robots niv. 5"). Le niveau est lu depuis la liste des bâtiments du joueur (`buildings.find(b => b.id === bonus.sourceId)?.level ?? 0`).
- Description : `"{percentPerLevel}% par niveau"` (négatif = réduction, positif = bonus)

Si aucun bonus ne s'applique (ex: aucun bâtiment avec stat `building_time` dans les bonus_definitions), le bloc est masqué.

#### 5. Tableau contextuel

Toujours 6 lignes : du niveau actuel du joueur à niveau actuel + 5. La ligne du niveau actuel est mise en évidence (fond distinct + marqueur ◄).

Les valeurs de production sont calculées via les formules existantes de `@ogame-clone/game-engine`, déjà importées dans `Buildings.tsx` : `mineraiProduction`, `siliciumProduction`, `hydrogeneProduction`, `solarPlantEnergy`, `mineraiMineEnergy`, `siliciumMineEnergy`, `hydrogeneSynthEnergy`, `storageCapacity`. Ces formules prennent un niveau en paramètre et retournent la valeur brute.

**Mines (minerai, silicium) et Synthétiseur d'hydrogène :**

| Niveau | Production/h | Gain | ⚡ Énergie |
|--------|-------------|------|-----------|
| 12 ◄   | 3 856       | —    | -158      |
| 13     | 4 628       | +772 | -178      |
| ...    | ...         | ...  | ...       |

- Production/h : valeur brute de la formule de production pour ce niveau
- Gain : delta avec le niveau précédent (affiché en vert avec `+`)
- Énergie : consommation d'énergie pour ce niveau (affiché en rouge avec `-`)

**Centrale solaire :**

| Niveau | ⚡ Production | Gain |
|--------|-------------|------|
| 8 ◄    | 526         | —    |
| 9      | 614         | +88  |

**Entrepôts (minerai, silicium, hydrogène) :**

| Niveau | Capacité    | Gain     |
|--------|-------------|----------|
| 5 ◄    | 100 000     | —        |
| 6      | 200 000     | +100 000 |

**Bâtiments utilitaires** (chantier spatial, labo de recherche, usine de robots, centre de commandement, arsenal) : pas de tableau. Les sections flavor text + effets actifs + prérequis suffisent.

#### 6. Prérequis
Liste avec icône check vert (rempli) ou croix rouge (manquant) + nom du prérequis + niveau requis. Même données que l'actuel (`gameConfig.buildings[id].prerequisites`), rendu simplifié.

### Structure — Autres entités (Phase 2, hors scope)

Pour référence, le même pattern de carte verticale et de panneau hero s'appliquera avec des tableaux adaptés :

- **Vaisseaux/Défenses** : stats de combat (armes, bouclier, blindage), mouvement (vitesse, fuel, cargo), tir rapide
- **Recherches** : description de l'effet en jeu, coût par niveau

## Ce qui ne change PAS

- `EntityDetailOverlay` — le conteneur modal/drawer reste identique
- `ResourceCost` — l'affichage des coûts reste identique
- `GameImage` — le chargement des images reste identique
- La logique métier : affordability check, mutations upgrade/build, queues, timers
- Le layout mobile compact en liste (pas de changement en Phase 1)
- Les pages Shipyard, Research, Defense (Phase 2)
- Aucun changement backend

## Fichiers impactés (Phase 1)

- `apps/web/src/pages/Buildings.tsx` — refonte du rendu des cartes desktop (layout vertical), le rendu mobile compact reste tel quel
- `apps/web/src/components/entity-details/BuildingDetailContent.tsx` — refonte complète du contenu (hero image, flavor text, effets actifs, tableau production/énergie, prérequis)
