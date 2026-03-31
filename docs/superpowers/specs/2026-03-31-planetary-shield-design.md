# Bouclier planetaire - Design Spec

## Contexte

Les boucliers planetaires sont actuellement des defenses (`smallShield`, `largeShield`) limitees a 1 par planete, avec des stats fixes. Le nouveau systeme les remplace par un batiment a niveaux, avec une consommation d'energie reglable et un comportement de combat specifique.

## Nouveau batiment : `planetaryShield`

### Caracteristiques
- **Type** : batiment (construit via la page Batiments, comme les mines)
- **Prerequis** : Recherche Blindage (`armor`) niv.1 + Recherche Boucliers (`shielding`) niv.1
- **Cout niv.1** : 2000 minerai + 2000 silicium (scaling exponentiel standard comme les autres batiments)
- **Shield niv.1** : 30 points
- **Energie niv.1 a 100%** : 30

### Formules
- Shield max : `floor(30 * 1.3^(level-1))`
- Energie max : `floor(30 * 1.5^(level-1))`
- Shield effectif en combat : `shieldMax * (puissance / 100)`
- Energie consommee : `energieMax * (puissance / 100)`

### Table de reference (niveaux 1-10)

| Niveau | Shield | Energie (100%) | Energie (50%) |
|--------|--------|----------------|---------------|
| 1 | 30 | 30 | 15 |
| 2 | 39 | 45 | 23 |
| 3 | 51 | 68 | 34 |
| 4 | 66 | 101 | 51 |
| 5 | 86 | 152 | 76 |
| 6 | 111 | 228 | 114 |
| 7 | 145 | 342 | 171 |
| 8 | 188 | 513 | 257 |
| 9 | 245 | 769 | 385 |
| 10 | 318 | 1154 | 577 |

### Puissance reglable
- Reglable de 0 a 100% par pas de 10% (meme pattern que les mines)
- Nouvelle colonne `shieldPercent` sur la table `planets` (defaut 100%, smallint)
- Le slider apparait sur la page Ressources (qui devient la page Energie/Ressources)

## Suppression des anciennes defenses bouclier

### Defenses supprimees
- `smallShield` : retire de la config defenses et de `planet_defenses`
- `largeShield` : retire de la config defenses et de `planet_defenses`

### Migration des joueurs existants
- Joueur avec `smallShield` = 1 → `planetaryShield` niv.1
- Joueur avec `largeShield` = 1 → `planetaryShield` niv.3
- Joueur avec les deux → `planetaryShield` niv.3 (le plus haut)
- Colonnes `smallShield` et `largeShield` retirees de `planet_defenses` apres migration

## Comportement en combat

### Nouvel ordre de ciblage

1. **Flotte du defenseur** : light → medium → heavy (categories existantes)
2. **Bouclier planetaire** : unite speciale (voir ci-dessous)
3. **Defenses** : tourelles (lanceur missiles, lasers, canon EM, tourelle plasma)
4. **Utilitaires/Support** : satellites solaires + vaisseaux support (transporteurs, sondes, recycleurs)

### Mecanique du bouclier en combat
- Le bouclier est une unite speciale injectee dans le combat avec :
  - `shield` = shieldMax * puissance% (pool de points de bouclier)
  - `hull` = 0 (ne peut pas etre detruit)
  - `weapons` = 0, `shotCount` = 0 (ne tire pas)
  - `armor` = 0
- Le bouclier est cible apres la flotte du defenseur mais avant les defenses
- Tant que le bouclier a du shield > 0, les tirs sont absorbes par le bouclier
- Si le shield tombe a 0 dans un round, les tirs excedentaires passent aux defenses
- **Regeneration** : le shield remonte a 100% au debut de chaque round
- Le bouclier ne genere pas de debris (0 cout, pas detruisable)
- Si le joueur a mis la puissance a 0%, le bouclier n'est pas present en combat

### Impact strategique
- L'attaquant doit concentrer assez de degats en un seul round pour percer le bouclier ET toucher les defenses
- Les rounds ou le bouclier tient = 0 degats aux defenses
- Cela favorise les grosses flottes concentrees (pour percer) vs les petites attaques repetees (bloquees par le bouclier)

## Changements par zone

### Game Engine (`packages/game-engine`)
- Nouvelles formules : `calculateShieldCapacity(level, config)`, `calculateShieldEnergy(level, config)`
- Modifier `simulateCombat` pour gerer le nouvel ordre de ciblage et la regeneration du bouclier
- Ajouter une nouvelle categorie de ciblage `'shield'` avec priorite entre heavy et defenses
- Tests pour les nouvelles formules et le comportement du bouclier en combat

### Base de donnees (`packages/db`)
- Ajouter `shieldPercent` (smallint, default 100) a la table `planets`
- Ajouter `planetaryShield` dans la config batiments (seed)
- Retirer `smallShield` et `largeShield` de la config defenses (seed)
- Retirer colonnes `smallShield` et `largeShield` de `planet_defenses`
- Script de migration pour convertir les anciens boucliers

### API (`apps/api`)
- Le batiment `planetaryShield` se construit/ameliore via le systeme de batiments existant
- `attack.handler.ts` : injecter le bouclier dans le combat avec les bonnes stats et la bonne priorite
- `resource.service.ts` : calculer la conso energie du bouclier dans le bilan energetique
- `resource.router.ts` ou `building.router.ts` : endpoint pour modifier `shieldPercent`

### Frontend (`apps/web`)
- **Page Batiments** : le bouclier apparait comme un batiment normal (avec image, cout, amelioration)
- **Page Ressources** : ajouter slider de puissance du bouclier (meme UX que les sliders mines)
- **Page Defense** : retirer `smallShield` et `largeShield` de l'affichage
- **Rapports de combat** : afficher les degats absorbes par le bouclier a chaque round
- **Overview** : afficher le statut du bouclier (niveau, puissance, shield effectif)

### Admin (`apps/admin`)
- Le bouclier apparait dans la config batiments (comme les autres)
- Retirer smallShield/largeShield de la config defenses

## Hors scope
- Bouclier offensif (qui protege la flotte attaquante)
- Bouclier de zone (qui protege plusieurs planetes)
- Recherche dediee au bouclier planetaire (on reutilise les recherches existantes)
- Animation visuelle du bouclier sur la page Overview
