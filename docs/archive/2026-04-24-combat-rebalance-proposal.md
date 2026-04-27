> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Proposition de reequilibrage du systeme de combat

## 1. Constat

Le systeme de combat actuel fonctionne mais souffre de trois problemes structurels :

1. **Pas de counter-play** -- Le plus gros portefeuille gagne toujours. Aucune composition ne contrecarre une autre.
2. **Choix de composition illusoire** -- Le laser leger ecrase toutes les autres defenses, le cuirasse domine tous les vaisseaux. Le joueur rationnel ne diversifie jamais.
3. **Mecaniques trop plates** -- Un seul type d'arme par unite, ciblage par priorite unique, armure decorative. Pas de moment "wow" en combat.

Ce document propose des ajustements de chiffres **et** de nouvelles mecaniques pour resoudre ces problemes, en conservant la lisibilite du systeme.

---

## 2. Reequilibrage des chiffres

### 2.1 Armure dynamique

**Probleme** : L'armure est une reduction flat (1-7) qui ne beneficie d'aucune recherche. A haut niveau, un cuirasse (70 degats) ignore les 6 points d'armure d'un autre cuirasse (8.6% de reduction). L'armure est un stat decoratif.

**Changement** : L'armure beneficie du multiplicateur de recherche "Protection" comme la coque.

```
armure_effective = baseArmor * multiplicateur_armor
```

**Impact :**

| Unite        | Armure base | Rech. niv. 5 (x1.5) | Rech. niv. 10 (x2.0) |
|--------------|:-----------:|:-------------------:|:--------------------:|
| Intercepteur |           1 |                 1.5 |                  2.0 |
| Fregate      |           2 |                 3.0 |                  4.0 |
| Croiseur     |           4 |                 6.0 |                  8.0 |
| Cuirasse     |           6 |                 9.0 |                 12.0 |

A recherche 10, le cuirasse a 12 d'armure. Contre un autre cuirasse (70 degats), ca fait 17% de reduction post-bouclier au lieu de 8.6%. Contre un croiseur (45 degats), ca fait 27%. L'armure devient un vrai facteur de calcul pour les unites lourdes.

**Pourquoi ces chiffres** : On ne change aucune stat de base, on reutilise un multiplicateur existant. L'impact est progressif (nul au debut de partie, significatif en mid/late game). C'est le changement au meilleur rapport effort/impact.

**Implementation** : Une seule ligne dans `createUnits` -- remplacer `armor: config.baseArmor` par `armor: config.baseArmor * multipliers.armor`.

---

### 2.2 Defenses planetaires

**Probleme** : Le laser leger (cout 2 000, DPS 21, ratio 0.210) est la meilleure defense a tout point de la partie. Le lanceur de missiles (ratio 0.080) est 2.6x moins rentable. Les defenses lourdes ont un cout prohibitif pour des gains marginaux.

**Changements proposes** :

| Defense              | Stat    | Actuel | Propose | Delta   | Justification                               |
|----------------------|---------|-------:|--------:|---------|----------------------------------------------|
| Lanceur de missiles  | weapons |      5 |       6 | +1      | Aligner le DPS/cout sur le laser leger       |
| Lanceur de missiles  | shield  |      6 |       8 | +2      | Survie trop basse pour son role              |
| Lanceur de missiles  | hull    |     10 |      14 | +4      | Idem                                          |
| Lanceur de missiles  | shots   |      2 |       2 | =       |                                               |
| Canon EM             | weapons |     50 |      55 | +5      | Ratio cout/efficacite trop bas (0.122)       |
| Canon EM             | shield  |     30 |      35 | +5      | Idem                                          |
| Canon EM             | hull    |     60 |      70 | +10     | Idem                                          |
| Artillerie a ions    | weapons |     80 |      90 | +10     | Ratio 0.105 pour un cout de 130k -- injustifie|
| Artillerie a ions    | shield  |     50 |      60 | +10     | Idem                                          |
| Artillerie a ions    | hull    |    120 |     140 | +20     | Idem                                          |

**Ratios apres ajustement** :

| Defense              | Cout  | DPS avant | DPS apres | Ratio avant | Ratio apres |
|----------------------|------:|----------:|----------:|:-----------:|:-----------:|
| Lanceur de missiles  | 2 000 |        10 |        12 |       0.080 |       0.132 |
| Laser leger          | 2 000 |        21 |        21 |       0.210 |       0.210 |
| Laser lourd          | 8 000 |        30 |        30 |       0.199 |       0.199 |
| Canon EM             |37 000 |        50 |        55 |       0.122 |       0.160 |
| Artillerie a ions    |130 000|        80 |        90 |       0.105 |       0.138 |

Le laser leger reste le meilleur ratio (il est accessible tot, c'est son role), mais l'ecart se reduit. Les defenses lourdes justifient mieux leur investissement.

---

### 2.3 Bouclier planetaire

**Probleme** : Capacite de 30 au niveau 1. Cinq intercepteurs (60 DPS) le percent en un round. Le joueur investit 4 000 ressources + energie pour une protection negligeable.

**Changement** : Augmenter la base de 30 a 50.

```
capacite = round(50 * 1.3^(level-1))
```

| Niveau | Actuel | Propose | Energie (inchangee) |
|--------|-------:|--------:|--------------------:|
| 1      |     30 |      50 |                  30 |
| 2      |     39 |      65 |                  45 |
| 3      |     51 |      85 |                  68 |
| 5      |     86 |     143 |                 152 |
| 8      |    189 |     314 |                 513 |
| 10     |    319 |     531 |                1154 |

Au niveau 1, le bouclier absorbe maintenant un round complet de 5 intercepteurs. Au niveau 5, il faut une flotte serieuse (143 DPS) pour percer. L'investissement en energie est inchange, donc le bouclier haut niveau reste un luxe couteux.

---

### 2.4 Formule FP

**Probleme actuel** : `FP = round((weapons * shotCount^1.5) * (shield + hull) / 100)`. L'exposant 1.5 surestime les unites a haut shotCount (intercepteur FP 10) par rapport a leur performance reelle (overkill, dispersion des tirs).

**Nouvelle formule** adaptee au systeme multi-batteries (voir section 3.1) :

```
FP = round(DPS_total * durabilite / 100)
```

Ou `DPS_total` = somme de (degats * tirs) de toutes les batteries, et `durabilite` = shield + hull.

| Unite        | FP actuel | FP propose | Variation |
|--------------|----------:|-----------:|:---------:|
| Intercepteur |        10 |          2 |       -8  |
| Fregate      |        21 |         11 |      -10  |
| Croiseur     |        37 |         37 |        0  |
| Cuirasse     |        98 |         98 |        0  |

Le FP des unites a 1 tir ne change pas. Celui des unites multi-tirs baisse pour refleter la realite du combat (dispersion, overkill). La formule devient aussi plus simple a expliquer au joueur : *"FP = DPS total * resistance"*.

> **Note** : les valeurs exactes seront a ajuster par playtesting. Le diviseur (100) et les seuils d'alerte dans l'UI devront etre recalibres.

---

## 3. Nouvelles mecaniques de combat

Trois mecaniques sont proposees, par ordre de priorite d'implementation. Chacune repond a un probleme precis et respecte un principe : **une phrase suffit a l'expliquer a un joueur**.

---

### 3.1 Armement multiple (batteries d'armes)

> *"Chaque vaisseau a une ou deux batteries d'armes. Chaque batterie cible sa propre categorie d'ennemis."*

**Probleme resolu** : les unites n'ont qu'un seul profil de degats et un seul ciblage. Le joueur n'a aucun choix de composition car toutes les unites tirent sur la meme chose.

**Principe** : chaque unite possede une **batterie principale** (gros degats, cible naturelle de sa categorie) et optionnellement une **batterie secondaire** (degats plus faibles, cible une autre categorie). Les deux batteries tirent simultanement pendant le round.

**Profils proposes** :

#### Vaisseaux militaires

| Unite        | Batterie principale            | Batterie secondaire             | DPS total |
|--------------|--------------------------------|----------------------------------|----------:|
| Intercepteur | 4 degats, 3 tirs, cible light | --                               |        12 |
| Fregate      | 12 degats, 1 tir, cible medium| 6 degats, 2 tirs, cible light   |        24 |
| Croiseur     | 35 degats, 1 tir, cible heavy | 5 degats, 2 tirs, cible light   |        45 |
| Cuirasse     | 50 degats, 1 tir, cible heavy | 10 degats, 2 tirs, cible medium |        70 |

#### Defenses planetaires (une seule batterie -- les defenses sont specialisees)

| Defense              | Batterie unique                  | DPS |
|----------------------|----------------------------------|----:|
| Lanceur de missiles  | 6 degats, 2 tirs, cible light   |  12 |
| Laser leger          | 7 degats, 3 tirs, cible light   |  21 |
| Laser lourd          | 15 degats, 2 tirs, cible medium |  30 |
| Canon EM             | 55 degats, 1 tir, cible heavy   |  55 |
| Artillerie a ions    | 90 degats, 1 tir, cible heavy   |  90 |

**Regles de ciblage par batterie** :
- Chaque batterie cible independamment les ennemis de sa categorie designee
- Si la categorie designee est vide, la batterie suit le fallback standard (descend dans l'ordre light > medium > heavy > shield > defense > support)
- Le choix de "priorite de ciblage" du joueur disparait : il est remplace par le ciblage naturel de chaque batterie

**Pourquoi ces chiffres** : le DPS total de chaque unite est **strictement identique** a l'actuel. On redistribue les degats entre deux batteries au lieu d'une seule. Aucun nerf, aucun buff -- juste de la diversite.

**Ce que ca change en jeu** :
- Un croiseur ne gaspille plus son tir de 45 degats sur un intercepteur a 12 PV. Son canon principal frappe les lourds, ses tourelles nettoient les legers.
- Le joueur qui amene que des intercepteurs face a des croiseurs subit les tourelles secondaires qui les ciblent naturellement.
- La composition de flotte prend de l'importance : il faut des lourds pour absorber les canons principaux ET des legers pour submerger les tourelles secondaires.

**Presentation UI** : dans la fiche du vaisseau, afficher deux lignes d'armement :
```
  Canon principal    35 x1    cible prioritaire : Lourd
  Tourelles defense   5 x2    cible prioritaire : Leger
```

---

### 3.2 Enchainement

> *"Quand un tir detruit sa cible, l'unite tire un coup bonus sur une autre cible de la meme categorie."*

**Probleme resolu** : l'overkill. Un cuirasse (70 degats) qui acheve un intercepteur a 2 PV restants gaspille 68 points de degats. Le systeme actuel ne recompense pas les unites qui tuent efficacement.

**Regles** :
- Quand un tir detruit sa cible, l'unite **gagne 1 tir bonus** contre la meme categorie
- Le tir bonus inflige les **memes degats** que le tir original (meme batterie)
- **Maximum 1 enchainement par tir de base** (pas de chaine infinie)
- Si aucune cible ne reste dans la categorie, le bonus est perdu

**Unites avec Enchainement** :

| Unite               | Enchainement | Sur quelle batterie |
|---------------------|:------------:|:-------------------:|
| Intercepteur        | Oui          | Principale          |
| Lanceur de missiles | Oui          | Unique              |
| Laser leger         | Oui          | Unique              |

L'enchainement est reserve aux unites legeres a faible degat/haut tir. C'est leur identite : elles excellent a nettoyer des essaims de cibles fragiles.

**Exemple concret** :
Un intercepteur (4 degats, 3 tirs avec enchainement) attaque 5 sondes d'espionnage (3 PV, 0 bouclier, 0 armure) :
- Tir 1 : touche sonde A (3 PV -> 0). Detruite. Enchainement declenche.
- Tir bonus : touche sonde B (3 PV -> 0). Detruite. (max 1 enchainement atteint)
- Tir 2 : touche sonde C (3 PV -> 0). Detruite. Enchainement declenche.
- Tir bonus : touche sonde D (3 PV -> 0). Detruite.
- Tir 3 : touche sonde E (3 PV -> 0). Detruite. Enchainement declenche.
- Tir bonus : plus de cibles. Perdu.

Resultat : 1 intercepteur elimine **5 sondes** en un round au lieu de 3 normalement. Le gaspillage est reduit, les unites legeres ont un role distinct.

**Presentation UI** : un badge "Enchainement" sur la fiche de l'unite avec le tooltip : *"Sur destruction de la cible, tire un coup bonus."*

---

### 3.3 Rafale

> *"Rafale N [categorie] : cette batterie tire N coups supplementaires contre les cibles de cette categorie."*

**Probleme resolu** : pas de counter-play. Aucune unite n'est specialement bonne ou mauvaise contre une autre. En donnant a certaines batteries un **bonus de tirs garanti** contre une categorie specifique, on cree des relations de predateur/proie sans introduire de RNG supplementaire.

**Fonctionnement** :
- Une batterie peut avoir un champ optionnel `rafale: { category, count }`
- Quand la batterie tire sur une cible de la categorie designee, elle effectue `shots + count` tirs
- Quand elle tombe en fallback (pas de cible dans la categorie), seuls les `shots` de base s'appliquent
- **Entierement deterministe** : pas de proba, pas de chaine, pas de RNG

**Attributions** :

| Unite    | Batterie secondaire                             | DPS vs categorie ciblee | DPS en fallback |
|----------|-------------------------------------------------|------------------------:|----------------:|
| Croiseur | 5 dmg, 2 tirs, **Rafale 6 Leger** (8 vs Leger)  | 40                      | 10              |
| Cuirasse | 10 dmg, 2 tirs, **Rafale 4 Medium** (6 vs Medium)| 60                      | 20              |

**Exemple concret** -- Croiseur vs 10 intercepteurs :
- Bat. principale : 35 degats sur un heavy (ou fallback si pas de heavy)
- Bat. secondaire : cible light disponible → `2 + 6 = 8 tirs` de 5 degats = 40 degats sur les intercepteurs
- Si la flotte ennemie n'a **aucun** intercepteur : la batterie tombe en fallback sur medium/heavy et ne tire que 2 coups (10 degats)

**DPS effectif par contexte** :

| Unite    | vs fleet 100% lourds | vs fleet 100% legers | vs fleet mixte heavy+light | vs fleet mixte heavy+medium |
|----------|---------------------:|---------------------:|---------------------------:|----------------------------:|
| Croiseur |                   45 |           35+40 = 75 |               35+40 = 75   |                  35+10 = 45 |
| Cuirasse |                   70 |           50+20 = 70 |               50+20 = 70   |                 50+60 = 110 |

Le croiseur est un predateur naturel des intercepteurs. Le cuirasse excelle contre les flottes medium/lourdes. Contre une flotte 100% lourde, le DPS de base s'applique.

**Relations de contre-jeu creees** :

```
Intercepteurs ──domines par──> Croiseurs (Rafale 6 Leger)
Fregates      ──dominees par──> Cuirasses (Rafale 4 Medium)
Cuirasses     ──lents contre──> Essaims d'intercepteurs (pas de rafale vs Leger)
```

Le joueur qui spam un seul type d'unite est punissable. La diversification est recompensee.

**Presentation UI** : dans la fiche du vaisseau, sous la batterie concernee :
```
  Tourelles defense   5 dmg   x2    cible : Leger    [Rafale 6 Leger]
```
Tooltip : *"Tire 6 coups supplementaires contre les cibles Leger (8 au total, 2 sinon)."*

---

## 4. Fiches completes des unites (avant/apres)

### Vaisseaux militaires

```
INTERCEPTEUR (light)
  Avant : 4W x3 shots = 12 DPS | 8 shield, 12 hull, 1 armor
  Apres : Bat. 1 : 4W x3, cible light = 12 DPS
          Trait : Enchainement
          Defensif : 8 shield, 12 hull, 1 armor (echelle avec recherche)

FREGATE (medium)
  Avant : 12W x2 shots = 24 DPS | 16 shield, 30 hull, 2 armor
  Apres : Bat. 1 : 12W x1, cible medium = 12 DPS
          Bat. 2 :  6W x2, cible light  = 12 DPS
          Defensif : 16 shield, 30 hull, 2 armor (echelle avec recherche)

CROISEUR (heavy)
  Avant : 45W x1 shot = 45 DPS | 28 shield, 55 hull, 4 armor
  Apres : Bat. 1 : 35W x1, cible heavy = 35 DPS
          Bat. 2 :  5W x2, cible light, Rafale 6 Leger = 10/40 DPS
          Defensif : 28 shield, 55 hull, 4 armor (echelle avec recherche)

CUIRASSE (heavy)
  Avant : 70W x1 shot = 70 DPS | 40 shield, 100 hull, 6 armor
  Apres : Bat. 1 : 50W x1, cible heavy  = 50 DPS
          Bat. 2 : 10W x2, cible medium, Rafale 4 Medium = 20/60 DPS
          Defensif : 40 shield, 100 hull, 6 armor (echelle avec recherche)
```

### Defenses planetaires

```
LANCEUR DE MISSILES (light)
  Avant : 5W x2 = 10 DPS | 6 shield, 10 hull, 1 armor
  Apres : 6W x2, cible light = 12 DPS
          Trait : Enchainement
          Defensif : 8 shield, 14 hull, 1 armor (echelle avec recherche)

LASER LEGER (light)
  Avant : 7W x3 = 21 DPS | 8 shield, 12 hull, 1 armor
  Apres : 7W x3, cible light = 21 DPS (inchange)
          Trait : Enchainement
          Defensif : inchange

LASER LOURD (medium)
  Avant : 15W x2 = 30 DPS | 18 shield, 35 hull, 3 armor
  Apres : inchange
          Defensif : inchange

CANON ELECTROMAGNETIQUE (heavy)
  Avant : 50W x1 = 50 DPS | 30 shield, 60 hull, 5 armor
  Apres : 55W x1, cible heavy = 55 DPS
          Defensif : 35 shield, 70 hull, 5 armor (echelle avec recherche)

ARTILLERIE A IONS (heavy)
  Avant : 80W x1 = 80 DPS | 50 shield, 120 hull, 7 armor
  Apres : 90W x1, cible heavy = 90 DPS
          Defensif : 60 shield, 140 hull, 7 armor (echelle avec recherche)
```

---

## 5. Scenarios d'illustration

### Scenario A : Essaim d'intercepteurs vs defense planetaire

**Attaque** : 20 intercepteurs (DPS total : 240, trait : enchainement)
**Defense** : 10 lanceurs de missiles + 5 lasers legers + bouclier niv. 2

Le bouclier planetaire (capacite 65) absorbe une partie du premier round.
Les intercepteurs ciblent les defenses legeres. Grace a l'enchainement, chaque kill donne un tir bonus. Sur 20 intercepteurs tirant 3 coups chacun (60 tirs), plusieurs enchainements se declenchent, augmentant l'output effectif de ~15-20%.

Les defenses ripostent avec leur propre enchainement. Les lanceurs (6 degats) et lasers (7 degats) ciblent les intercepteurs (8 shield + 12 hull = 20 PV effectifs). Il faut ~3 tirs pour tuer un intercepteur.

**Resultat attendu** : victoire attaquant en 2-3 rounds, mais avec des pertes significatives (8-12 intercepteurs detruits). Le bouclier planetaire a absorbe un round de degats, donnant du temps aux defenses.

### Scenario B : Croiseurs vs essaim d'intercepteurs

**Attaque** : 3 croiseurs
**Defense** : 30 intercepteurs

**Round 1** :
- 3 croiseurs tirent :
  - Bat. principale (35 degats x1 vs heavy) : pas de heavy, fallback -> cible un intercepteur. Degats massifs, destruction certaine.
  - Bat. secondaire (5 degats x2, Rafale 6 Leger) : cible light disponible, 8 tirs garantis.
    - Croiseur 1 : 8 tirs a 5 degats = 40 degats sur les legers
    - Croiseur 2 : similaire
    - Croiseur 3 : similaire
  - Total degats legers : 120 + 3x35 = 225 degats sur les intercepteurs
  - 30 intercepteurs ont 30 * 20 = 600 PV total. ~37% elimines au round 1.

- 30 intercepteurs ripostent (mais sur clones) :
  - 30 * 12 = 360 DPS. 3 croiseurs ont 3 * 83 = 249 PV. Destruction probable de 1-2 croiseurs.

**Resultat** : le croiseur est efficace contre les intercepteurs grace a la rafale vs Leger, mais un essaim de 30 peut quand meme submerger 3 croiseurs. Le ratio force l'attaquant a amener plus de croiseurs ou mixer avec des fregates. **La composition compte.**

### Scenario C : Cuirasses vs fregates

**Attaque** : 2 cuirasses
**Defense** : 8 fregates

**Round 1** :
- 2 cuirasses tirent :
  - Bat. principale (50 degats x1, cible heavy) : pas de heavy, fallback -> medium (fregates). 50 degats vs fregate (16 shield + 30 hull = 46 PV, 2 armure). Tue la fregate facilement.
  - Bat. secondaire (10 degats x2, Rafale 4 Medium) : cible medium disponible, 6 tirs garantis.
    - Cuirasse 1 : 6 tirs a 10 degats = 60 degats sur fregates
    - Cuirasse 2 : similaire
  - Total degats medium : 120 + 2*50 = 220. 8 fregates ont 8*46 = 368 PV. ~60% elimines.

- 8 fregates ripostent :
  - Bat. 1 (12 degats x1, medium) : 8 * 12 = 96 degats vs cuirasses. Pas suffisant pour tuer un cuirasse (40 shield + 100 hull = 140 PV).
  - Bat. 2 (6 degats x2, light) : pas de light -> fallback. 8 * 12 = 96 degats supplementaires.
  - Total : ~192 degats sur 2 cuirasses (280 PV total). 1 cuirasse probablement detruit.

**Resultat** : les cuirasses dominent les fregates grace a la rafale vs Medium, mais un seul cuirasse survit. Les fregates ne sont pas un bon counter aux cuirasses -- il faudrait des croiseurs (dont le canon principal cible le heavy) pour les contrer.

---

## 6. Lisibilite joueur

Chaque mecanique est concue pour etre expliquee en une phrase dans l'UI.

### Fiche vaisseau

```
  ---- Croiseur ----
  Categorie : Lourd
  Blindage  : 28 | Coque : 55 | Armure : 4

  ARMEMENT
  Canon principal    35 x1    Cible : Lourd
  Tourelles defense   5 dmg   x2   Cible : Leger    [Rafale 6 Leger]
```

### Tooltip des traits

| Trait           | Tooltip                                                                         |
|-----------------|---------------------------------------------------------------------------------|
| Enchainement    | Si le tir detruit sa cible, tire un coup bonus sur la meme categorie.           |
| Rafale N [cat]  | Tire N coups supplementaires quand la cible appartient a cette categorie.       |

### Guide de combat (page existante)

La page CombatGuide.tsx est deja implementee. Il suffit d'y ajouter trois sections courtes :
1. **Armement multiple** : "Les vaisseaux avances ont deux batteries d'armes qui ciblent des categories differentes."
2. **Traits de combat** : tableau simple Enchainement / Rafale avec icones et une phrase chacun.
3. **Qui bat qui ?** : schema visuel des relations de counter (intercepteur < croiseur < cuirasse < essaim intercepteurs).

---

## 7. Feuille de route d'implementation

### Phase 1 -- Ajustements de chiffres (pas de nouveau code)

Modifications du seed uniquement. Peut etre deploye en une session.

1. Armure dynamique : 1 ligne dans `createUnits`
2. Stats des defenses : mise a jour des constantes dans `seed-game-config.ts`
3. Bouclier planetaire : changement du `30` en `50` dans `shield.ts`

### Phase 2 -- Armement multiple + Rafale

Impact sur le code :
- Nouveau type `WeaponProfile { damage, shots, targetCategory, rafale? }` dans `combat.ts`
- `ShipCombatConfig` evolue de `{baseWeaponDamage, baseShotCount}` vers `{weapons: WeaponProfile[]}`
- `fireSalvo` itere sur chaque profil d'arme au lieu d'un seul
- `selectTarget` recoit la categorie de la batterie (plus de priorite globale du joueur)
- Au moment du tir : si la cible appartient a `rafale.category`, utiliser `shots + rafale.count` au lieu de `shots`
- `seed-game-config.ts` : restructuration des donnees de combat
- Schema DB : ajouter table `weapon_profiles` ou champ JSON sur `ship_definitions`
- UI : mise a jour des fiches vaisseaux

### Phase 3 -- Enchainement

Impact sur le code :
- Nouveau champ `hasChainKill: boolean` sur `ShipCombatConfig`
- Dans `fireShot` : si `target.destroyed && hasChainKill`, planifier 1 tir bonus
- Dans `fireSalvo` : gerer le tir bonus (max 1 par tir de base)

### Estimation d'effort

| Phase | Changements principaux                            | Risque |
|-------|----------------------------------------------------|--------|
| 1     | Seed + 1 ligne moteur                             | Bas    |
| 2     | Refonte du modele d'armement + Rafale, UI         | Moyen  |
| 3     | Enchainement (mecanique simple dans le moteur)    | Bas    |
