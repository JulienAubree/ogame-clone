> **⚠️ Section combat partiellement obsolète** — la [refonte combat du 2026-04-25](../patchnotes/2026-04-25-refonte-combat.md) a remplacé le système (rapidfire, bounce rule, priorité de cible) par un système multi-batteries avec catégories (Léger/Moyen/Lourd) et traits (Rafale, Enchaînement). Le reste du document (production, recherche, fleet, pillage, etc.) reste à jour.

# Exilium — Documentation du moteur de jeu

Ce document explique toutes les mecaniques du jeu, les formules utilisees et comment les administrer via le panneau admin.

---

## Table des matieres

1. [Ressources et production](#1-ressources-et-production)
2. [Batiments](#2-batiments)
3. [Recherches](#3-recherches)
4. [Chantier spatial — Vaisseaux](#4-chantier-spatial--vaisseaux)
5. [Defenses](#5-defenses)
6. [Combat](#6-combat)
7. [Flottes et deplacements](#7-flottes-et-deplacements)
8. [Espionnage](#8-espionnage)
9. [Classement](#9-classement)
10. [Planetes](#10-planetes)
11. [Administration](#11-administration)

---

## 1. Ressources et production

Le jeu comporte 3 ressources (metal, cristal, deuterium) et 1 pseudo-ressource (energie).

### Production des mines

Chaque mine produit des ressources par heure selon la formule :

```
production/h = base_production × niveau × exposant^niveau × facteur_production
```

| Mine | base_production | exposant | Exemple niv 10 |
|------|----------------|----------|----------------|
| Mine de metal | 30 | 1.1 | 778/h |
| Mine de cristal | 20 | 1.1 | 518/h |
| Synthetiseur de deuterium | 10 | 1.1 | 259/h* |

*Le deuterium depend aussi de la temperature de la planete :
```
deut/h = 10 × niveau × 1.1^niveau × (1.36 - 0.004 × tempMax) × facteur_production
```
Les planetes froides (positions 13-15) produisent plus de deuterium.

### Energie

La **centrale solaire** produit de l'energie :
```
energie = 20 × niveau × 1.1^niveau
```

Chaque mine **consomme** de l'energie :

| Mine | Formule conso energie |
|------|-----------------------|
| Mine de metal | `10 × niveau × 1.1^niveau` |
| Mine de cristal | `10 × niveau × 1.1^niveau` |
| Synthetiseur de deut | `20 × niveau × 1.1^niveau` |

### Facteur de production

Si l'energie produite est insuffisante, **toutes les mines sont ralenties** :
```
facteur_production = energie_produite / energie_consommee
```
- Si energie suffisante : facteur = 1.0 (100%)
- Si energie insuffisante : facteur < 1.0 (production reduite proportionnellement)
- Chaque mine peut aussi avoir un pourcentage de production individuel (0-100%)

### Stockage

Les hangars limitent la quantite de ressources accumulables :
```
capacite = 5000 × floor(2.5 × e^(20 × niveau / 33))
```

| Niveau | Capacite |
|--------|----------|
| 0 | 10 000 |
| 1 | 12 500 |
| 2 | 17 500 |
| 3 | 25 000 |
| 5 | 50 000 |
| 10 | 325 000 |

Les 3 hangars (metal, cristal, deuterium) utilisent la meme formule.

### Production paresseuse (lazy)

Les ressources ne sont pas calculees en temps reel. Elles sont **materialisees** a chaque action du joueur (construction, envoi de flotte, etc.) :
```
ressources_actuelles = ressources_stockees + (production/h × heures_ecoulees)
```
Le tout est plafonne par la capacite de stockage.

---

## 2. Batiments

### Cout de construction

```
cout_niveau = cout_base × facteur^(niveau - 1)
```

| Batiment | Cout base (M/C/D) | Facteur | Prerequis |
|----------|-------------------|---------|-----------|
| Mine de metal | 60 / 15 / 0 | 1.5 | — |
| Mine de cristal | 48 / 24 / 0 | 1.6 | — |
| Synthetiseur de deut | 225 / 75 / 0 | 1.5 | — |
| Centrale solaire | 75 / 30 / 0 | 1.5 | — |
| Usine de robots | 400 / 120 / 200 | 2.0 | — |
| Chantier spatial | 400 / 200 / 100 | 2.0 | Robotics 2 |
| Laboratoire de recherche | 200 / 400 / 200 | 2.0 | — |
| Hangar de metal | 1000 / 0 / 0 | 2.0 | — |
| Hangar de cristal | 1000 / 500 / 0 | 2.0 | — |
| Reservoir de deuterium | 1000 / 1000 / 0 | 2.0 | — |

**Facteur 1.5** = croissance moderee (mines). Les couts doublent environ tous les 2 niveaux.
**Facteur 2.0** = croissance rapide (batiments utilitaires). Les couts doublent a chaque niveau.

### Temps de construction

```
temps_secondes = (cout_metal + cout_cristal) / (2500 × (1 + niveau_robotics)) × 3600
```

L'**usine de robots** est le seul batiment qui reduit le temps de construction de tous les autres batiments. Chaque niveau de robotics divise le temps par `(1 + niveau_robotics)`.

| Niveau robotics | Effet sur le temps |
|----------------|-------------------|
| 0 | ×1 (normal) |
| 1 | ×0.5 (2× plus rapide) |
| 2 | ×0.33 (3× plus rapide) |
| 5 | ×0.17 (6× plus rapide) |
| 10 | ×0.09 (11× plus rapide) |

### Emplacements (slots)

Chaque planete a un nombre limite d'emplacements, determine par son diametre :
```
emplacements_max = floor((diametre / 1000)^2)
```
Chaque niveau de batiment occupe 1 emplacement. Si tous les slots sont utilises, plus aucun batiment ne peut etre ameliore.

### Regles
- **Un seul batiment** peut etre en construction a la fois par planete
- La construction peut etre **annulee** (remboursement partiel)
- Les prerequis doivent etre remplis avant de pouvoir ameliorer

---

## 3. Recherches

### Cout de recherche

Meme formule que les batiments :
```
cout_niveau = cout_base × facteur^(niveau - 1)
```

Toutes les recherches ont un facteur de **2.0** (les couts doublent a chaque niveau).

| Recherche | Cout base (M/C/D) | Prerequis |
|-----------|-------------------|-----------|
| Espionnage | 200 / 1000 / 200 | Labo 3 |
| Ordinateur | 0 / 400 / 600 | Labo 1 |
| Energie | 0 / 800 / 400 | Labo 1 |
| Reacteur a combustion | 400 / 0 / 600 | Labo 1, Energie 1 |
| Reacteur a impulsion | 2000 / 4000 / 600 | Labo 2, Energie 1 |
| Propulsion hyperespace | 10000 / 20000 / 6000 | Labo 7, Energie 5, Bouclier 5 |
| Armes | 800 / 200 / 0 | Labo 4 |
| Bouclier | 200 / 600 / 0 | Labo 6, Energie 3 |
| Protection (coque) | 1000 / 0 / 0 | Labo 2 |

### Temps de recherche

```
temps_secondes = (cout_metal + cout_cristal) / (1000 × (1 + niveau_labo)) × 3600
```

Le **laboratoire de recherche** reduit le temps de recherche. Meme logique que la robotics pour les batiments.

### Effets des recherches

| Recherche | Effet |
|-----------|-------|
| Espionnage | Ameliore les sondes d'espionnage (voir section 8) |
| Ordinateur | Augmente le nombre de flottes simultanees |
| Energie | Prerequis pour d'autres technologies |
| Combustion | +10% vitesse par niveau pour les vaisseaux a combustion |
| Impulsion | +20% vitesse par niveau pour les vaisseaux a impulsion |
| Hyperespace | +30% vitesse par niveau pour les vaisseaux hyperespace |
| Armes | +10% degats par niveau |
| Bouclier | +10% bouclier par niveau |
| Protection | +10% coque par niveau |

---

## 4. Chantier spatial — Vaisseaux

### Role du chantier spatial

Le **chantier spatial** permet de construire vaisseaux et defenses. Son niveau :
- Debloque l'acces aux unites plus avancees (prerequis)
- Reduit le temps de construction des unites

```
temps_unite = (cout_metal + cout_cristal) / (2500 × (1 + niveau_chantier)) × 3600
```

| Niveau chantier | Effet |
|----------------|-------|
| 1 | Debloque : Chasseur leger, Lanceur missiles, Petit bouclier |
| 2 | Debloque : Petit transporteur, Artillerie laser legere |
| 3 | Debloque : Chasseur lourd, Sonde espionnage |
| 4 | Debloque : Grand transporteur, Vaisseau colonisation, Recycleur, Grand bouclier, Artillerie laser lourde |
| 5 | Debloque : Croiseur |
| 6 | Debloque : Canon de Gauss |
| 7 | Debloque : Vaisseau de bataille |
| 8 | Debloque : Artillerie a ions (plasma) |

### Liste des vaisseaux

| Vaisseau | Cout (M/C/D) | Vitesse | Cargo | Conso | Moteur |
|----------|-------------|---------|-------|-------|--------|
| Petit transporteur | 2000/2000/0 | 5 000 | 5 000 | 10 | Combustion |
| Grand transporteur | 6000/6000/0 | 7 500 | 25 000 | 50 | Combustion |
| Chasseur leger | 3000/1000/0 | 12 500 | 50 | 20 | Combustion |
| Chasseur lourd | 6000/4000/0 | 10 000 | 100 | 75 | Impulsion |
| Croiseur | 20000/7000/2000 | 15 000 | 800 | 300 | Impulsion |
| Vaisseau de bataille | 45000/15000/0 | 10 000 | 1 500 | 500 | Hyperespace |
| Sonde d'espionnage | 0/1000/0 | 100 000 000 | 0 | 1 | Combustion |
| Vaisseau de colonisation | 10000/20000/10000 | 2 500 | 7 500 | 1 000 | Impulsion |
| Recycleur | 10000/6000/2000 | 2 000 | 20 000 | 300 | Combustion |

### Stats de combat des vaisseaux

| Vaisseau | Armes | Bouclier | Coque |
|----------|-------|----------|-------|
| Petit transporteur | 5 | 10 | 4 000 |
| Grand transporteur | 5 | 25 | 12 000 |
| Chasseur leger | 50 | 10 | 4 000 |
| Chasseur lourd | 150 | 25 | 10 000 |
| Croiseur | 400 | 50 | 27 000 |
| Vaisseau de bataille | 1 000 | 200 | 60 000 |
| Sonde d'espionnage | 0 | 0 | 1 000 |
| Vaisseau de colonisation | 50 | 100 | 30 000 |
| Recycleur | 1 | 10 | 16 000 |

Les stats de combat sont ameliorees par les technologies :
```
armes_effectives = armes_base × (1 + 0.1 × niveau_tech_armes)
bouclier_effectif = bouclier_base × (1 + 0.1 × niveau_tech_bouclier)
coque_effective = coque_base × (1 + 0.1 × niveau_tech_protection)
```

### File de construction

Les vaisseaux et defenses sont construits en **file** : on peut lancer plusieurs unites et elles sont construites une par une. Le chantier spatial est occupe tant que la file n'est pas vide.

---

## 5. Defenses

### Liste des defenses

| Defense | Cout (M/C/D) | Armes | Bouclier | Coque | Max/planete |
|---------|-------------|-------|----------|-------|-------------|
| Lanceur de missiles | 2000/0/0 | 80 | 20 | 2 000 | illimite |
| Artillerie laser legere | 1500/500/0 | 100 | 25 | 2 000 | illimite |
| Artillerie laser lourde | 6000/2000/0 | 250 | 100 | 8 000 | illimite |
| Canon de Gauss | 20000/15000/2000 | 1 100 | 200 | 35 000 | illimite |
| Artillerie a ions | 50000/50000/30000 | 3 000 | 300 | 100 000 | illimite |
| Petit bouclier | 10000/10000/0 | 1 | 2 000 | 2 000 | **1** |
| Grand bouclier | 50000/50000/0 | 1 | 10 000 | 10 000 | **1** |

### Prerequis des defenses

| Defense | Prerequis |
|---------|-----------|
| Lanceur de missiles | Chantier 1 |
| Artillerie laser legere | Chantier 2, Energie 1 |
| Artillerie laser lourde | Chantier 4, Energie 3, Bouclier 1 |
| Canon de Gauss | Chantier 6, Energie 6, Armes 3, Bouclier 1 |
| Artillerie a ions | Chantier 8, Energie 8, Armes 7 |
| Petit bouclier | Chantier 1, Bouclier 2 |
| Grand bouclier | Chantier 4, Bouclier 6 |

### Reparation des defenses

Apres un combat, les defenses detruites ont **70% de chances** d'etre reparees automatiquement. Les vaisseaux detruits sont perdus definitivement.

---

## 6. Combat

### Deroulement

Le combat se deroule en **maximum 6 rounds**. A chaque round :

1. Chaque unite tire sur une cible aleatoire
2. Les degats sont appliques selon l'ordre : bouclier → coque
3. Si les degats < 1% du bouclier max de la cible, le tir **rebondit** (aucun degat)
4. Si la coque tombe a 30% ou moins de sa valeur max, l'unite est **detruite**
5. Les boucliers se **regenerent** a la fin de chaque round
6. Le combat s'arrete si un camp est entierement detruit

### Tir rapide (Rapid Fire)

Certains vaisseaux ont un bonus de tir rapide : apres avoir tire, ils ont une chance de tirer a nouveau sur une autre cible.

```
probabilite_tir_supplementaire = (valeur_rf - 1) / valeur_rf
```

Exemple : Croiseur vs Chasseur leger (RF = 6) → probabilite de 83% de tirer a nouveau.

| Attaquant | Cible | Tir rapide |
|-----------|-------|------------|
| Petit transporteur | Sonde espionnage | 5× |
| Grand transporteur | Sonde espionnage | 5× |
| Chasseur leger | Sonde espionnage | 5× |
| Chasseur lourd | Sonde espionnage | 5× |
| Chasseur lourd | Petit transporteur | 3× |
| Croiseur | Sonde espionnage | 5× |
| Croiseur | Chasseur leger | 6× |
| Croiseur | Petit transporteur | 3× |
| Croiseur | Lanceur de missiles | 10× |
| Vaisseau de bataille | Sonde espionnage | 5× |
| Vaisseau de bataille | Chasseur leger | 4× |
| Vaisseau de bataille | Petit transporteur | 4× |
| Vaisseau de bataille | Grand transporteur | 4× |
| Vaisseau de colonisation | Sonde espionnage | 5× |

### Debris

Les vaisseaux detruits en combat generent un **champ de debris** :
```
debris_metal = somme(cout_metal_vaisseaux_detruits) × 0.30
debris_cristal = somme(cout_cristal_vaisseaux_detruits) × 0.30
```
Le ratio de debris est de **30%** (configurable dans l'admin : univers → debrisRatio).

Seuls les vaisseaux generent des debris, pas les defenses.

### Pillage

L'attaquant vainqueur pille les ressources du defenseur. La capacite de pillage est limitee par le fret total de la flotte attaquante survivante. Les ressources sont prelevees en proportions egales (1/3 metal, 1/3 cristal, 1/3 deuterium).

---

## 7. Flottes et deplacements

### Vitesse de la flotte

La vitesse de la flotte est celle du **vaisseau le plus lent** :
```
vitesse_vaisseau = vitesse_base × (1 + bonus_moteur × niveau_tech)
```

| Type de moteur | Bonus par niveau de tech |
|---------------|-------------------------|
| Combustion | +10% |
| Impulsion | +20% |
| Hyperespace | +30% |

### Distance

| Situation | Formule |
|-----------|---------|
| Galaxies differentes | `20 000 × |diff_galaxie|` |
| Meme galaxie, systemes differents | `2 700 + 95 × |diff_systeme|` |
| Meme systeme, positions differentes | `1 000 + 5 × |diff_position|` |
| Meme position | `5` |

### Temps de trajet

```
temps_secondes = 10 + (35 000 / vitesse_flotte) × sqrt((distance × 10) / vitesse_univers)
```

La **vitesse de l'univers** (configurable dans admin) multiplie la vitesse globale.

### Consommation de carburant

```
conso = somme(conso_unitaire × nombre × (distance / 35000) × ((duree + 10) / (duree - 10)))
```
Minimum 1 unite de deuterium.

### Missions disponibles

| Mission | Description |
|---------|-------------|
| Transport | Livre des ressources sur la planete cible |
| Stationner | Transfere des vaisseaux definitivement |
| Attaquer | Combat + pillage |
| Espionner | Envoie des sondes, genere un rapport |
| Coloniser | Cree une nouvelle planete (max 9) |
| Recycler | Collecte un champ de debris |

### Nombre de flottes simultanees

Le nombre maximum de flottes en vol est determine par la **technologie ordinateur** :
```
flottes_max = 1 + niveau_tech_ordinateur
```

---

## 8. Espionnage

### Sondes d'espionnage

Envoyer des sondes genere un rapport dont le detail depend du nombre de sondes et de la difference de tech espionnage :

```
valeur_info = nombre_sondes - (tech_espionnage_defenseur - tech_espionnage_attaquant)
```

| valeur_info | Informations visibles |
|-------------|----------------------|
| >= 1 | Ressources |
| >= 3 | Flotte |
| >= 5 | Defenses |
| >= 7 | Batiments |
| >= 9 | Recherches |

### Detection

Le defenseur a une chance de detecter les sondes :
```
chance_detection = nombre_sondes × 2 - (tech_espionnage_attaquant - tech_espionnage_defenseur) × 4
```
La chance est entre 0% et 100%. Si detecte, les sondes sont **detruites**.

---

## 9. Classement

Les points sont calcules par categorie :

### Points de batiments
```
points = somme(total_ressources_investies_par_batiment) / 1000
```
Pour chaque batiment, on additionne le cout de chaque niveau (1 → niveau actuel).

### Points de recherche
Meme formule que les batiments, appliquee aux niveaux de recherche.

### Points de flotte
```
points = somme(nombre_vaisseaux × (cout_metal + cout_cristal + cout_deut)) / 1000
```

### Points de defense
Meme formule que la flotte, appliquee aux defenses.

### Points totaux
```
total = batiments + recherche + flotte + defense
```

---

## 10. Planetes

### Generation

Chaque planete est generee selon sa position dans le systeme (1-15) :

| Position | Diametre (km) | Temperature max |
|----------|--------------|-----------------|
| 1-3 | 5 800 – 9 800 | ~250°C (chaud) |
| 4-6 | 9 000 – 14 400 | ~160°C |
| 7-9 | 10 000 – 15 600 | ~70°C |
| 10-12 | 7 500 – 12 200 | ~0°C |
| 13-15 | 5 000 – 9 400 | -40°C (froid) |

```
temp_max = 40 + (8 - position) × 30 + aleatoire(-20 a +20)
temp_min = temp_max - 40
diametre = aleatoire dans la fourchette de la position
emplacements_max = floor((diametre / 1000)^2)
```

### Strategies de positionnement

- **Positions 7-9** : Plus grosses planetes (plus d'emplacements)
- **Positions 13-15** : Meilleures pour le deuterium (planetes froides)
- **Positions 1-3** : Plus chaudes, moins de deuterium, petites planetes

### Limites

- Maximum **9 planetes** par joueur (configurable : univers → maxPlanetsPerPlayer)
- Univers : 9 galaxies × 499 systemes × 15 positions

---

## 11. Administration

### Panneau admin (admin.exilium-game.com)

#### Config Batiments
- Modifier les couts de base, le facteur de cout, le temps de base
- Voir la progression niveau par niveau (tableau depliable)
- Modifier les prerequis

#### Config Recherches
- Memes possibilites que les batiments
- Le facteur de cout controle la vitesse de doublement

#### Config Vaisseaux
- Couts, stats de combat (armes/bouclier/coque), stats de deplacement (vitesse/cargo/conso)
- Prerequis (batiments + recherches)

#### Config Defenses
- Couts, stats de combat, limite par planete
- Prerequis

#### Tir rapide (Rapid Fire)
- Matrice attaquant × cible
- Modifier/ajouter des entrees de tir rapide

#### Config Production
- `base_production` : multiplicateur de base (30 pour metal, 20 pour cristal...)
- `exposant` : controle la courbe de croissance (1.1 = standard Exilium)
- `conso_energie` : multiplicateur de consommation energetique
- `stockage_base` : base de calcul de la capacite de stockage

#### Config Univers
- `speed` : vitesse de l'univers (multiplie les temps de trajet)
- `galaxies` / `systems` / `positions` : taille de l'univers
- `maxPlanetsPerPlayer` : limite de planetes
- `debrisRatio` : pourcentage de ressources transformees en debris (0.3 = 30%)
- `lootRatio` : ratio de pillage

#### Gestion Joueurs
- Voir tous les joueurs, leurs planetes, ressources, niveaux
- Modifier directement les ressources d'un joueur
- Modifier les niveaux de batiments et recherches
- Bannir / debannir / supprimer un joueur

### Conseils de balancing

| Levier | Effet |
|--------|-------|
| Augmenter `base_production` des mines | Jeu plus rapide, ressources plus abondantes |
| Reduire le `costFactor` des batiments | Progression moins chere, plus accessible |
| Augmenter `speed` univers | Trajets plus courts, jeu plus dynamique |
| Modifier `debrisRatio` | Plus de debris = plus d'incitation au combat |
| Modifier tir rapide | Change l'equilibre entre types de vaisseaux |
| Augmenter `conso_energie` | Force a investir plus dans les centrales |
