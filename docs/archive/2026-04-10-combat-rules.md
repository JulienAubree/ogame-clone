> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Regles de combat -- Exilium

## Vue d'ensemble

Le combat dans Exilium est **simultane** et **deterministe**. Les deux camps tirent en meme temps sur un snapshot de l'etat de debut de round, puis les degats sont appliques ensemble. Un seed RNG (mulberry32) permet de rejouer un combat de maniere identique.

---

## Deroulement d'un combat

### 1. Initialisation

**Entrees :**
- Flotte attaquante (vaisseaux + flagship optionnel)
- Flotte defendante (vaisseaux + defenses planetaires)
- Bouclier planetaire (si batiment construit et actif)
- Multiplicateurs de recherche des deux camps (armes, bouclier, coque)
- Priorite de ciblage de chaque camp (categorie ciblee en premier)

**Creation des unites :**
Chaque vaisseau/defense est instancie individuellement avec ses stats :
- `shield` = baseShield * multiplicateur bouclier
- `hull` = baseHull * multiplicateur coque
- `weaponDamage` = baseWeaponDamage * multiplicateur armes
- `armor` = baseArmor (flat, **non affecte par la recherche**)
- `shotCount` = baseShotCount

**Bouclier planetaire :**
Si le defenseur a un bouclier planetaire actif, une unite speciale `__planetaryShield__` est injectee dans la defense :
- Categorie : `shield` (targetOrder 4)
- Shield = capacite du bouclier (formule : `round(30 * 1.3^(level-1))`, modulee par le % d'activation)
- Hull = 1 (se "detruit" quand le shield est perce, mais se regenere chaque round)
- Aucun armement (0 damage, 0 shots)

### 2. Boucle de rounds (max 4 par defaut)

Pour chaque round :

**a) Verification de fin de combat :**
Si l'un des deux camps n'a plus d'unites vivantes (hors bouclier planetaire), le combat s'arrete.

**b) Tir simultane :**
1. Les unites des deux camps sont **clonees** (snapshot de debut de round)
2. Les attaquants tirent sur les clones des defenseurs
3. Les defenseurs tirent sur les clones des attaquants
4. Les degats des deux phases sont **appliques** simultanement sur les unites reelles

**c) Regeneration des boucliers :**
Tous les survivants recuperent leur bouclier a 100% (`shield = maxShield`).
Le bouclier planetaire est **ressuscite** s'il a ete "detruit" pendant le round.

### 3. Resolution du tir (salve)

Chaque unite tire `shotCount` coups par round.

**Pour chaque tir :**

1. **Selection de la cible** (voir Systeme de ciblage)
2. **Application des degats** :
   - Le bouclier absorbe d'abord : si `shield >= damage`, le tir est entierement absorbe
   - Sinon le surplus passe a travers : `surplus = damage - shield`
   - L'armure reduit le surplus : `hullDamage = max(surplus - armor, minDamagePerHit)`
   - Le minimum de degats par tir est **1** (garantie de progression)
   - Si `hull <= 0`, l'unite est detruite

---

## Systeme de ciblage

### Categories (par ordre de priorite)

| Ordre | ID       | Nom      | Cible par defaut ? |
|-------|----------|----------|--------------------|
| 1     | light    | Leger    | Oui                |
| 2     | medium   | Moyen    | Oui                |
| 3     | heavy    | Lourd    | Oui                |
| 4     | shield   | Bouclier | Oui                |
| 5     | defense  | Defense  | Oui                |
| 6     | support  | Support  | Non (dernier recours) |

### Algorithme de selection

1. **Priorite choisie** : les cibles de la categorie prioritaire de l'attaquant sont ciblees en premier (selection aleatoire parmi elles)
2. **Fallback par ordre** : si aucune cible dans la categorie prioritaire, on descend par targetOrder (light -> medium -> heavy -> shield -> defense), en sautant les non-targetable
3. **Dernier recours** : les categories non-targetable (support) ne sont ciblees que quand toutes les autres sont detruites

Chaque tir individuel choisit une cible aleatoire dans la categorie selectionnee (RNG seede).

---

## Stats de combat des unites

### Vaisseaux militaires

| Vaisseau      | Cat.   | Armes | Bouclier | Coque | Armure | Tirs | Cout (M/S/H)          |
|---------------|--------|------:|--------:|------:|-------:|-----:|-----------------------|
| Intercepteur  | light  |     4 |       8 |    12 |      1 |    3 | 3 000 / 1 000 / 0     |
| Fregate       | medium |    12 |      16 |    30 |      2 |    2 | 6 000 / 4 000 / 0     |
| Croiseur      | heavy  |    45 |      28 |    55 |      4 |    1 | 20 000 / 7 000 / 2 000 |
| Cuirasse      | heavy  |    70 |      40 |   100 |      6 |    1 | 45 000 / 15 000 / 0   |

### Vaisseaux support

| Vaisseau           | Cat.    | Armes | Bouclier | Coque | Armure | Tirs | Cout (M/S/H)            |
|--------------------|---------|------:|--------:|------:|-------:|-----:|-------------------------|
| Petit transporteur | support |     1 |       8 |    12 |      0 |    1 | 2 000 / 2 000 / 0       |
| Grand transporteur | support |     1 |      20 |    36 |      0 |    1 | 6 000 / 6 000 / 0       |
| Prospecteur        | support |     1 |       8 |    15 |      0 |    1 | 3 000 / 1 000 / 500     |
| Recuperateur       | support |     1 |      10 |    20 |      0 |    1 | 3 000 / 1 000 / 500     |
| Recycleur          | support |     1 |       8 |    48 |      0 |    1 | 10 000 / 6 000 / 2 000  |
| Sonde espionnage   | support |     0 |       0 |     3 |      0 |    1 | 0 / 1 000 / 0           |
| Vaisseau colonie   | support |     4 |      80 |    90 |      0 |    1 | 10 000 / 20 000 / 10 000|
| Satellite solaire  | support |     1 |       1 |     6 |      0 |    1 | 0 / 2 000 / 500         |

### Defenses planetaires

| Defense              | Cat.    | Armes | Bouclier | Coque | Armure | Tirs | Cout (M/S/H)            |
|----------------------|---------|------:|--------:|------:|-------:|-----:|-------------------------|
| Lanceur de missiles  | light   |     5 |       6 |    10 |      1 |    2 | 2 000 / 0 / 0           |
| Laser leger          | light   |     7 |       8 |    12 |      1 |    3 | 1 500 / 500 / 0         |
| Laser lourd          | medium  |    15 |      18 |    35 |      3 |    2 | 6 000 / 2 000 / 0       |
| Canon electromagnetique | heavy |    50 |      30 |    60 |      5 |    1 | 20 000 / 15 000 / 2 000 |
| Artillerie a ions    | heavy   |    80 |      50 |   120 |      7 |    1 | 50 000 / 50 000 / 30 000|

---

## Modificateurs de stats

### Recherche (bonus global, lineaire)

| Recherche          | Effet par niveau           |
|--------------------|----------------------------|
| Technologie Armes  | +10% degats toutes unites  |
| Technologie Bouclier | +10% bouclier toutes unites |
| Technologie Protection | +10% coque toutes unites |

Formule : `stat_finale = stat_base * (1 + 0.10 * niveau_recherche)`

L'armure (baseArmor) n'est **pas** affectee par la recherche.

### Talents du flagship (bonus flat, appliques au flagship uniquement)

| Talent          | Branche     | Effet par rang | Max rangs |
|-----------------|-------------|----------------|-----------|
| mil_weapons     | Militaire   | +2 armes       | 3 (+6)    |
| mil_armor       | Militaire   | +2 blindage    | 3 (+6)    |
| mil_shield      | Militaire   | +3 bouclier    | 3 (+9)    |
| sci_shots       | Scientifique| +1 tir         | 3 (+3)    |
| sci_shield      | Scientifique| +2 bouclier    | 3 (+6)    |
| ind_hull        | Industriel  | +5 coque       | 3 (+15)   |

### Coque de combat (bonus passifs du hull, flagship uniquement)

| Bonus             | Valeur |
|-------------------|--------|
| bonus_weapons     | +8     |
| bonus_armor       | +6     |
| bonus_shot_count  | +2     |

### Talent defensif planetaire

Le talent `defense_strength` (si present dans le contexte du defenseur) multiplie les trois multiplicateurs de combat du defenseur :
```
defenderMultipliers.weapons *= (1 + defense_strength)
defenderMultipliers.shielding *= (1 + defense_strength)
defenderMultipliers.armor *= (1 + defense_strength)
```

---

## Bouclier planetaire

### Formules

- **Capacite** : `round(30 * 1.3^(level-1))`
- **Energie** : `ceil(30 * 1.5^(level-1))`
- Modulable par un pourcentage (0-100%) pour economiser l'energie
- Talent `sci_shield_boost` : +1 niveau effectif par rang (max 2 rangs)

### Comportement en combat

- Categorie `shield` (targetOrder 4) -- cible **avant** les defenses
- Se regenere **integralement** a chaque round
- Ne tire pas (0 degats, 0 tirs)
- Est exclue des calculs de pertes et de victoire
- Son role : absorber des degats pour proteger les defenses situees derriere

### Progression par niveau

| Niveau | Capacite | Energie |
|--------|--------:|--------:|
| 1      |      30 |      30 |
| 2      |      39 |      45 |
| 3      |      51 |      68 |
| 4      |      66 |     101 |
| 5      |      86 |     152 |
| 6      |     112 |     228 |
| 7      |     145 |     342 |
| 8      |     189 |     513 |
| 9      |     245 |     769 |
| 10     |     319 |    1154 |

---

## Apres le combat

### Issue

| Condition                              | Resultat  |
|----------------------------------------|-----------|
| Attaquant vivant, defenseur detruit    | Victoire attaquant |
| Attaquant detruit, defenseur vivant    | Victoire defenseur |
| Les deux vivants apres 4 rounds        | Match nul |
| Les deux detruits                       | Match nul |

### Debris

Seuls les **vaisseaux** detruits generent des debris (pas les defenses).
Les deux camps contribuent (attaquant + defenseur).

```
debris_minerai = floor(cout_minerai_total_vaisseaux_detruits * 0.30)
debris_silicium = floor(cout_silicium_total_vaisseaux_detruits * 0.30)
```

### Reparation des defenses

Les defenses detruites ont **70%** de chance d'etre reparees automatiquement (par unite, jet individuel).

### Pillage (attaquant gagne)

- Ratio de pillage : **33%** des ressources non protegees
- Protection blindee : recherche `armoredStorage` (+5% capacite blindee par niveau)
- Protection par talent : `pillage_protection` (cap a 90%)
- Distribution : 1/3 du cargo par ressource, puis surplus redistribue dans l'ordre minerai > silicium > hydrogene

```
ressource_pillable = max(0, ressource_planete - ressource_protegee) * 0.33 * (1 - pillage_protection)
```

---

## Force de Puissance (FP)

Le FP est un indicateur de puissance relative d'une flotte/defense.

### Formule par unite

```
FP_unite = round((weapons * shotCount^exponent) * (shield + hull) / divisor)
```

Parametres par defaut :
- `shotcountExponent` = 1.5
- `divisor` = 100

### FP de flotte

```
FP_total = somme(FP_unite * nombre) pour chaque type de vaisseau/defense
```

---

## PvE -- Missions pirates

### Tiers

| Tier   | Templates                                        |
|--------|--------------------------------------------------|
| Easy   | 5 interceptors / 4 inter + 1 fregate / 3 inter + 5 small cargo |
| Medium | 4 inter + 1 fregate / 3 inter + 1 fregate / 8 fregates + 1 croiseur / 4 inter + 1 fregate |
| Hard   | 5 fregates + 3 croiseurs + 1 cuirasse / 2 croiseurs + 1 cuirasse / 4 fregates + 3 croiseurs + 2 cuirasses |

### Recompenses

- Ressources fixes par template (minerai, silicium, hydrogene)
- Chance de bonus vaisseaux (ex: 30% de 2 interceptors, 20% d'1 croiseur)
- Pas de debris generes en PvE

---

## Constantes de configuration

| Cle                              | Valeur par defaut | Description                    |
|----------------------------------|:-----------------:|--------------------------------|
| `combat_max_rounds`              | 4                 | Rounds max par combat          |
| `combat_debris_ratio`            | 0.30              | % de debris des vaisseaux detruits |
| `combat_defense_repair_rate`     | 0.70              | % de chance de reparation defense |
| `combat_pillage_ratio`           | 0.33              | % de ressources pillables      |
| `combat_min_damage_per_hit`      | 1                 | Degats minimum par tir         |
| `combat_research_bonus_per_level`| 0.10              | Bonus recherche par niveau     |
| `fp_shotcount_exponent`          | 1.5               | Exposant shotCount pour le FP  |
| `fp_divisor`                     | 100               | Diviseur pour le calcul de FP  |

Toutes ces valeurs sont configurables dans la table `universe_config`.
