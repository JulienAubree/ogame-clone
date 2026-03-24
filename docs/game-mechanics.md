# Mecaniques de jeu

Ce document detaille toutes les mecaniques de jeu, en particulier celles dont le fonctionnement n'est pas evident a premiere vue.

---

## Table des matieres

1. [Systeme de combat](#1-systeme-de-combat)
2. [Espionnage](#2-espionnage)
3. [Production de ressources](#3-production-de-ressources)
4. [Cout et temps de construction](#4-cout-et-temps-de-construction)
5. [Systeme de bonus](#5-systeme-de-bonus)
6. [Flottes et deplacements](#6-flottes-et-deplacements)
7. [Pillage](#7-pillage)
8. [Debris et recyclage](#8-debris-et-recyclage)
9. [Reparation des defenses](#9-reparation-des-defenses)
10. [Mining (ceintures d'asteroides)](#10-mining-ceintures-dasteroides)
11. [Pirates (PvE)](#11-pirates-pve)
12. [Colonisation](#12-colonisation)
13. [Planetes et univers](#13-planetes-et-univers)
14. [Classement](#14-classement)

---

## 1. Systeme de combat

Un combat se deroule en **6 rounds maximum**. Il s'arrete plus tot si un camp est entierement detruit.

### Deroulement d'un round

1. Chaque attaquant tire sur un defenseur aleatoire
2. Chaque defenseur tire sur un attaquant aleatoire
3. Les boucliers de toutes les unites survivantes se regenerent a 100%

### Calcul des degats

Les stats de base de chaque unite (armes, bouclier, blindage) sont multipliees par les bonus de recherche du joueur :

```
armes_effectives  = armes_base  * multiplicateur_armes
bouclier_effectif = bouclier_base * multiplicateur_bouclier
blindage_effectif = blindage_base * multiplicateur_blindage
```

Quand une unite tire sur une cible :

1. **Regle du bounce** : si les degats < 1% du bouclier max de la cible, le tir n'inflige **aucun degat**. Cela empeche les unites tres faibles de grignoter les grosses unites.
2. Le bouclier absorbe les degats en premier
3. Les degats excedentaires passent sur le blindage (hull)
4. **Destruction rapide** : si le blindage tombe a 30% ou moins du max, l'unite est detruite immediatement (pas besoin d'atteindre 0)

### Regeneration des boucliers

A la fin de chaque round, **tous les boucliers remontent a 100%**. Seuls les degats infliges au blindage sont permanents. Cela signifie qu'un gros bouclier protege efficacement round apres round, mais qu'une fois perce, les degats sur le hull sont irreversibles.

### Rapid fire

Le rapid fire permet a une unite de **tirer plusieurs fois dans le meme round**.

**Donnee** : `rapidFire[attaquant][cible] = N`

Exemple : le croiseur a un rapid fire de 6 contre le chasseur leger.

**Mecanique** : apres chaque tir, l'attaquant a une probabilite de tirer a nouveau :

```
probabilite de re-tirer = (N - 1) / N
```

Avec N = 6 : probabilite = 5/6 = 83%. Le de est relance a chaque tir supplementaire. En moyenne, l'unite tire **N fois au total** dans le round.

**Details** :
- A chaque tir supplementaire, une **nouvelle cible vivante** est choisie aleatoirement
- Si la nouvelle cible est d'un type contre lequel l'attaquant n'a **pas** de rapid fire, la chaine s'arrete
- Les defenseurs beneficient aussi du rapid fire (pas seulement les attaquants)

**Table de rapid fire actuelle** :

| Attaquant | Cible | N | Tirs moyens | Probabilite |
|-----------|-------|---|-------------|-------------|
| Petit cargo | Sonde espionnage | 5 | 5 | 80% |
| Grand cargo | Sonde espionnage | 5 | 5 | 80% |
| Chasseur leger | Sonde espionnage | 5 | 5 | 80% |
| Chasseur lourd | Sonde espionnage | 5 | 5 | 80% |
| Chasseur lourd | Petit cargo | 3 | 3 | 67% |
| Croiseur | Sonde espionnage | 5 | 5 | 80% |
| Croiseur | Chasseur leger | 6 | 6 | 83% |
| Croiseur | Petit cargo | 3 | 3 | 67% |
| Croiseur | Lanceur de missiles | 10 | 10 | 90% |
| Vaisseau de bataille | Sonde espionnage | 5 | 5 | 80% |
| Vaisseau de bataille | Chasseur leger | 4 | 4 | 75% |
| Vaisseau de bataille | Petit cargo | 4 | 4 | 75% |
| Vaisseau de bataille | Grand cargo | 4 | 4 | 75% |
| Vaisseau de colonisation | Sonde espionnage | 5 | 5 | 80% |

### Issue du combat

- **Victoire attaquant** : tous les defenseurs detruits, au moins 1 attaquant survit
- **Victoire defenseur** : tous les attaquants detruits, au moins 1 defenseur survit
- **Match nul** : les deux camps ont encore des unites apres 6 rounds, ou les deux sont detruits

---

## 2. Espionnage

### Quantite d'information revelees

Le nombre de sondes envoyees et l'ecart technologique determinent ce que le rapport revele :

```
probInfo = nombre_de_sondes - (techEspionnage_defenseur - techEspionnage_attaquant)
```

| probInfo | Information revelee |
|----------|---------------------|
| >= 1 | Ressources |
| >= 3 | Flotte |
| >= 5 | Defenses |
| >= 7 | Batiments |
| >= 9 | Recherches |

Plus l'ecart de technologie est grand en faveur du defenseur, plus il faut de sondes pour obtenir les memes infos.

### Detection des sondes

Le defenseur a une chance de detecter (et detruire) les sondes :

```
chance_detection (%) = nombre_de_sondes * 2 - (techEspionnage_attaquant - techEspionnage_defenseur) * 4
```

La valeur est bornee entre 0% et 100%.

- Si les sondes sont detectees : elles sont toutes detruites, pas de retour
- Si elles ne sont pas detectees : elles reviennent normalement

**Consequence** : envoyer beaucoup de sondes donne plus d'infos mais augmente le risque de detection. Avoir une tech espionnage superieure reduit ce risque.

---

## 3. Production de ressources

### Formules de production (par heure)

| Ressource | Formule |
|-----------|---------|
| Minerai | `30 * niveau * 1.1^niveau * facteurProduction` |
| Silicium | `20 * niveau * 1.1^niveau * facteurProduction` |
| Hydrogene | `10 * niveau * 1.1^niveau * (1.36 - 0.004 * tempMax) * facteurProduction` |

**Hydrogene et temperature** : la formule inclut un terme `(1.36 - 0.004 * tempMax)`. Plus la planete est froide (tempMax bas), plus la production d'hydrogene est elevee. Une planete en position 13-15 (gazeuse, froide) produit significativement plus d'hydrogene qu'une planete en position 1-3 (volcanique, chaude).

### Energie et facteur de production

Chaque mine consomme de l'energie :

| Batiment | Consommation d'energie |
|----------|------------------------|
| Mine de minerai | `10 * niveau * 1.1^niveau` |
| Mine de silicium | `10 * niveau * 1.1^niveau` |
| Synthetiseur d'hydrogene | `20 * niveau * 1.1^niveau` |

La centrale solaire produit : `20 * niveau * 1.1^niveau`

**Facteur de production** :

```
Si energie_produite >= energie_consommee : facteur = 1.0 (production a 100%)
Si energie_produite <  energie_consommee : facteur = energie_produite / energie_consommee
```

Quand l'energie est insuffisante, **toutes les mines sont degradees proportionnellement**. C'est un goulot d'etranglement critique : negliger la centrale solaire reduit la production de toutes les ressources.

### Stockage

```
capacite = 5000 * floor(2.5 * e^(20 * niveau / 33))
```

La production s'arrete quand le stockage est plein. Chaque ressource a son propre entrepot.

---

## 4. Cout et temps de construction

### Batiments

```
cout      = cout_base * facteur_cout^(niveau - 1) * multiplicateur_phase(niveau)
temps (s) = temps_base * facteur_cout^(niveau - 1) * bonus_robotique * multiplicateur_phase(niveau)
```

Minimum : 1 seconde.

### Recherches

```
cout      = cout_base * facteur_cout^(niveau - 1) * multiplicateur_phase(niveau)
temps (s) = ((cout_minerai + cout_silicium) / 1000) * 3600 * bonus_labo * multiplicateur_phase(niveau)
```

### Vaisseaux et defenses

```
temps (s) = ((cout_minerai + cout_silicium) / 2500) * 3600 * bonus_chantier
```

Les couts des vaisseaux et defenses sont **fixes** (pas de facteur exponentiel comme les batiments).

### Multiplicateur de phase (acceleration early-game)

Les niveaux 1 a 7 beneficient d'une reduction de cout et de temps :

| Niveau | Multiplicateur | Reduction |
|--------|---------------|-----------|
| 1 | 0.35 | -65% |
| 2 | 0.45 | -55% |
| 3 | 0.55 | -45% |
| 4 | 0.65 | -35% |
| 5 | 0.78 | -22% |
| 6 | 0.90 | -10% |
| 7 | 0.95 | -5% |
| 8+ | 1.00 | aucune |

Cela permet un demarrage rapide tout en conservant la progression exponentielle a haut niveau.

---

## 5. Systeme de bonus

Les bonus proviennent des batiments et recherches. Ils sont **multiplicatifs** entre eux.

### Calcul

Pour chaque source de bonus applicable :

```
modificateur = max(0.01, 1 + (pourcentParNiveau / 100) * niveauSource)
```

Le multiplicateur final est le **produit** de tous les modificateurs applicables, avec un plancher a 0.01 (1%).

### Filtrage par categorie

Certains bonus ont une categorie (ex: `combustion`, `build_military`). Ils ne s'appliquent qu'aux entites de cette categorie. Les bonus sans categorie (`null`) s'appliquent a tout.

Exemple : le chantier naval donne -15%/niveau sur le temps de construction des vaisseaux industriels (`build_industrial`), tandis que le centre de commandement donne -15%/niveau sur les vaisseaux militaires (`build_military`).

### Liste des bonus

**Temps de construction :**

| Source | Stat | Effet/niveau | Categorie |
|--------|------|-------------|-----------|
| Usine de robots | building_time | -15% | toutes |
| Laboratoire | research_time | -15% | toutes |
| Chantier naval | ship_build_time | -15% | industriels |
| Centre de commandement | ship_build_time | -15% | militaires |
| Arsenal | defense_build_time | -15% | toutes |

**Combat :**

| Source | Stat | Effet/niveau |
|--------|------|-------------|
| Recherche armes | weapons | +10% |
| Recherche bouclier | shielding | +10% |
| Recherche blindage | armor | +10% |

**Vitesse des vaisseaux :**

| Source | Stat | Effet/niveau | Categorie |
|--------|------|-------------|-----------|
| Reacteur a combustion | ship_speed | +10% | combustion |
| Reacteur a impulsion | ship_speed | +20% | impulse |
| Propulsion hyperespace | ship_speed | +30% | hyperspaceDrive |

**Autres :**

| Source | Stat | Effet/niveau |
|--------|------|-------------|
| Technologie informatique | fleet_count | +1 flotte simultanee |
| Fracturation rocheuse | mining_duration | -10% (plancher -80% au niveau 8) |

---

## 6. Flottes et deplacements

### Vitesse de flotte

La flotte se deplace a la vitesse de son **vaisseau le plus lent** :

```
vitesse_flotte = min(vitesse_vaisseau pour chaque type present)
vitesse_vaisseau = vitesse_base * multiplicateur_propulsion
```

Ajouter un recycleur (vitesse 2000) a une flotte de croiseurs (vitesse 15000) ramene toute la flotte a 2000.

### Distance

La distance depend de la difference de coordonnees :

| Cas | Formule |
|-----|---------|
| Galaxies differentes | `20 000 * |diff_galaxie|` |
| Systemes differents (meme galaxie) | `2 700 + 95 * |diff_systeme|` |
| Positions differentes (meme systeme) | `1 000 + 5 * |diff_position|` |
| Meme position | `5` |

### Temps de trajet

```
temps (s) = 10 + (35 000 / vitesse) * sqrt((distance * 10) / vitesse_univers)
```

La vitesse de l'univers (defaut : 1) est un multiplicateur global.

### Consommation de carburant

```
Par type de vaisseau : conso_base * nombre * (distance / 35 000) * ((duree + 10) / (duree - 10))
Total = max(1, ceil(somme de toutes les consommations))
```

Le facteur `(duree + 10) / (duree - 10)` signifie que les trajets tres courts consomment proportionnellement plus de carburant (acceleration/deceleration).

Minimum : 1 unite de carburant, meme pour un trajet minime.

### Capacite de chargement

```
capacite_totale = somme(capacite_cargo * nombre) pour chaque type de vaisseau
```

---

## 7. Pillage

Quand l'attaquant gagne un combat, il pille les ressources de la planete.

### Distribution du butin

1. La capacite de cargo disponible des vaisseaux survivants est calculee
2. Le cargo est divise en **3 parts egales** (une par ressource)
3. Chaque ressource est pillee a hauteur de `min(ressource_disponible, 1/3 du cargo)`
4. Le cargo restant est rempli dans l'ordre : minerai, puis silicium, puis hydrogene

Ce systeme fait qu'avec suffisamment de cargo, on prend environ 1/3 de chaque ressource. Avec un cargo limite, les ressources les plus abondantes sont favorisees dans l'ordre.

**Note** : la production passive du defenseur est materialisee avant le pillage (les ressources generees pendant le vol sont pillables).

---

## 8. Debris et recyclage

### Generation de debris

Apres un combat, les vaisseaux detruits (des deux camps) generent un champ de debris :

```
debris_minerai  = floor(somme(cout_minerai_vaisseaux_detruits) * 0.30)
debris_silicium = floor(somme(cout_silicium_vaisseaux_detruits) * 0.30)
```

**Regles** :
- Seuls les **vaisseaux** generent des debris (pas les defenses)
- Seuls le **minerai** et le **silicium** sont recuperables (pas l'hydrogene)
- Le ratio par defaut est de **30%**
- Les debris s'accumulent aux memes coordonnees (plusieurs combats = un seul champ)

### Recyclage

La mission de recyclage ne peut etre effectuee que par des **recycleurs**.

1. Le cargo total de la flotte de recycleurs est calcule
2. Le minerai est collecte en premier (jusqu'a la limite du cargo)
3. Le silicium est collecte avec le cargo restant
4. Le champ de debris est mis a jour (supprime s'il est vide)

---

## 9. Reparation des defenses

Apres un combat, chaque defense detruite a **70% de chance** d'etre reparee automatiquement.

```
pour chaque defense detruite :
  si random() < 0.70 : la defense est restauree
```

Les pertes nettes du defenseur = defenses detruites - defenses reparees.

Les vaisseaux detruits ne sont **jamais** repares.

---

## 10. Mining (ceintures d'asteroides)

Les positions 8 et 16 de chaque systeme sont des **ceintures d'asteroides**. Elles contiennent des depots de ressources exploitables via des missions de mining.

### Conditions

- La flotte doit contenir au moins **1 prospecteur**
- La cible doit etre une position de ceinture d'asteroides (8 ou 16)

### Deroulement

La mission se deroule en deux phases :

**Phase 1 - Prospection** :

```
duree (min) = 5 + floor(quantite_totale_depot / 10 000) * 2
```

**Phase 2 - Extraction** :

```
duree (min) = max(5, 16 - niveau_centre_mission) * bonus_fracturation
```

Le bonus de fracturation rocheuse reduit la duree (-10%/niveau, plancher a 20% de la duree).

### Quantite extraite

```
extraction_base = 2 000 + 800 * (niveau_centre_mission - 1)
prospecteurs_effectifs = min(nombre_prospecteurs, 10)
extrait = min(extraction_base * prospecteurs_effectifs, capacite_cargo_flotte, quantite_restante_depot)
```

Au-dela de 10 prospecteurs, les supplementaires sont ignores.

### Pool de missions visibles

Le nombre de missions disponibles depend du niveau du centre de mission :

| Niveau centre | Missions visibles | Accumulation max |
|---------------|-------------------|------------------|
| 1-2 | 3 | 6 |
| 3-4 | 4 | 8 |
| 5-6 | 5 | 10 |
| 7+ | 6 | 12 |

---

## 11. Pirates (PvE)

Les missions pirates permettent de combattre des flottes PNJ pour obtenir des recompenses.

### Tiers de difficulte

| Tier | Niveau centre requis | Recompenses typiques |
|------|---------------------|----------------------|
| Facile | 3+ | 3K-6K minerai, 1.5K-4K silicium, 0.5K-1.5K hydrogene |
| Moyen | 4+ | 15K-20K minerai, 8K-12K silicium, 3K-5K hydrogene |
| Difficile | 6+ | 50K-100K minerai, 30K-60K silicium, 15K-30K hydrogene |

### Recompenses

- Le butin est **plafonne par la capacite de cargo** des vaisseaux survivants
- Si le butin total depasse le cargo : `butin_effectif = floor(butin * cargo / butin_total)`
- Certains templates de pirates offrent des **vaisseaux bonus** avec une probabilite (ex : 30% de chance de recuperer 2 chasseurs legers)

Le combat utilise exactement le meme moteur que le PvP. Les pirates ont des niveaux de technologie fixes definis par template.

---

## 12. Colonisation

### Conditions

- Seuls les **vaisseaux de colonisation** peuvent coloniser
- Maximum **9 planetes** par joueur
- Les positions **8 et 16** (ceintures d'asteroides) ne sont pas colonisables
- La position cible doit etre **libre**

### Fonctionnement

1. Le vaisseau de colonisation est **consomme** a l'arrivee
2. Une nouvelle planete est creee avec :
   - Un type determine par la position (volcanique, aride, temperee, glaciale, gazeuse)
   - Un diametre aleatoire dans la fourchette du type
   - Une temperature calculee selon la position avec une variation aleatoire de +/-20
   - Des champs max calcules a partir du diametre
   - 0 ressources de depart
3. Les vaisseaux restants de la flotte **retournent a l'origine**

---

## 13. Planetes et univers

### Configuration de l'univers

| Parametre | Valeur |
|-----------|--------|
| Galaxies | 9 |
| Systemes par galaxie | 499 |
| Positions par systeme | 16 (dont 8 et 16 = asteroides) |
| Planetes max par joueur | 9 |
| Vitesse univers | 1x |
| Ratio de debris | 30% |
| Ressources de depart | 500 minerai, 300 silicium, 100 hydrogene |

### Temperature

```
tempMax = 40 + (8 - position) * 30 + offset    (offset aleatoire entre -20 et +20)
tempMin = tempMax - 40
```

Les positions basses (1-3) sont chaudes, les positions hautes (13-15) sont froides.

### Types de planete

| Type | Positions | Bonus minerai | Bonus silicium | Bonus hydrogene | Bonus champs |
|------|-----------|---------------|----------------|-----------------|--------------|
| Volcanique | 1-3 | 1.0x | 1.2x | 0.7x | 1.1x |
| Aride | 4-6 | 1.2x | 1.1x | 0.8x | 0.9x |
| Temperee | 7, 9 | 1.0x | 1.0x | 1.0x | 1.0x |
| Glaciale | 10-12 | 0.8x | 1.0x | 1.3x | 0.9x |
| Gazeuse | 13-15 | 0.9x | 0.9x | 1.1x | 1.1x |

Les bonus de ressources s'appliquent a la production. Le bonus de champs affecte le nombre maximal de cases constructibles.

### Diametre et champs

```
champs_max = floor((diametre / 1000)^2 * bonus_champs)
```

Exemple : diametre 12 000, bonus 1.0 -> floor(144 * 1.0) = 144 champs.

### Boucliers planetaires

Les domes de bouclier (petit et grand) sont limites a **1 exemplaire de chaque par planete**.

---

## 14. Classement

Les points de classement sont calcules a partir du cout cumule de tout ce qu'un joueur a construit :

```
points_batiments  = floor(somme(couts_tous_niveaux_batiments) / 1000)
points_recherches = floor(somme(couts_tous_niveaux_recherches) / 1000)
points_flotte     = floor(somme(nombre_vaisseaux * cout_vaisseau) / 1000)
points_defenses   = floor(somme(nombre_defenses * cout_defense) / 1000)

points_totaux = points_batiments + points_recherches + points_flotte + points_defenses
```

Les couts pris en compte incluent le minerai, le silicium et l'hydrogene. Pour les batiments et recherches, c'est la somme des couts de chaque niveau de 1 au niveau actuel (avec le multiplicateur de phase).

**Consequence** : perdre des vaisseaux fait baisser les points de flotte. Les defenses reparees ne comptent pas comme perte de points.
