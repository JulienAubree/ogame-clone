> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Analyse d'equilibrage -- Systeme de combat Exilium

## 1. Analyse des ratios cout/efficacite

### Metriques par unite (sans recherche)

Pour comparer les unites, on calcule :
- **DPS** = weapons * shotCount (degats par round)
- **Durabilite** = shield + hull (total d'absorption avant destruction)
- **Efficacite** = DPS * durabilite (puissance brute)
- **Cout total** = minerai + silicium + hydrogene
- **Ratio cout/efficacite** = efficacite / cout (plus c'est haut, mieux c'est)

#### Vaisseaux militaires

| Unite        | DPS | Durabilite | Efficacite | Cout total | Ratio  |
|--------------|----:|----------:|-----------:|-----------:|-------:|
| Intercepteur |  12 |        20 |        240 |      4 000 | 0.060  |
| Fregate      |  24 |        46 |      1 104 |     10 000 | 0.110  |
| Croiseur     |  45 |        83 |      3 735 |     29 000 | 0.129  |
| Cuirasse     |  70 |       140 |      9 800 |     60 000 | 0.163  |

#### Defenses planetaires

| Unite                  | DPS | Durabilite | Efficacite | Cout total | Ratio  |
|------------------------|----:|----------:|-----------:|-----------:|-------:|
| Lanceur de missiles    |  10 |        16 |        160 |      2 000 | 0.080  |
| Laser leger            |  21 |        20 |        420 |      2 000 | 0.210  |
| Laser lourd            |  30 |        53 |      1 590 |      8 000 | 0.199  |
| Canon electromagnetique|  50 |        90 |      4 500 |     37 000 | 0.122  |
| Artillerie a ions      |  80 |       170 |     13 600 |    130 000 | 0.105  |

### FP par unite (formule officielle)

```
FP = round((weapons * shotCount^1.5) * (shield + hull) / 100)
```

| Unite        | FP  | Cout  | Cout par FP |
|--------------|----:|------:|------------:|
| Intercepteur |  10 | 4 000 |         400 |
| Fregate      |  21 | 10 000|         476 |
| Croiseur     |  37 | 29 000|         784 |
| Cuirasse     |  98 | 60 000|         612 |

| Defense                 | FP  | Cout   | Cout par FP |
|-------------------------|----:|-------:|------------:|
| Lanceur de missiles     |   2 |  2 000 |       1 000 |
| Laser leger             |   7 |  2 000 |         286 |
| Laser lourd             |  22 |  8 000 |         364 |
| Canon electromagnetique |  45 | 37 000 |         822 |
| Artillerie a ions       | 136 |130 000 |         956 |

---

## 2. Problemes identifies

### P1 -- L'intercepteur est sous-performant en rapport cout/efficacite

L'intercepteur a le ratio cout/efficacite **le plus bas** de tous les vaisseaux militaires (0.060 vs 0.163 pour le cuirasse). C'est normal qu'il soit moins efficace (c'est le tier d'entree), mais l'ecart est **trop grand** : un joueur n'a jamais interet a construire des intercepteurs une fois les fregates disponibles.

**Cependant**, son **cout par FP est le meilleur** (400 vs 784 pour le croiseur). Cela est du a son shotCount de 3 qui est fortement valorise par l'exposant 1.5 dans la formule FP, mais qui en combat reel se disperse sur des cibles aleatoires et gaspille de l'overkill sur des unites fragiles.

**Symptome** : le FP surestime la puissance des intercepteurs par rapport a leur performance reelle en combat.

### P2 -- Le cuirasse a un rapport qualite/prix disproportionne

Le cuirasse coute 6x l'intercepteur mais est ~41x plus efficace. Les unites de haut tier dominent completement sans contre-jeu reel.

Le systeme actuel ne possede **aucun mecanisme de counter** : pas de bonus de type (leger vs lourd), pas de rapidfire, pas d'avantage positionnel. Le plus gros portefeuille gagne toujours.

### P3 -- Le laser leger est la defense la plus rentable, de loin

Avec un ratio de 0.210 et un cout par FP de 286, le laser leger surpasse toutes les autres defenses en efficacite. Le lanceur de missiles (0.080, cout/FP 1000) est particulierement mauvais.

**Consequence** : un joueur rationnel ne construira que des lasers legers en masse. Les defenses lourdes ne sont jamais rentables.

### P4 -- L'armure (baseArmor) est trop faible pour compter

L'armure est une reduction flat qui n'echelle pas avec la recherche. A haut niveau, quand les degats atteignent des dizaines voire centaines, une armure de 1-7 est negligeable. Le systeme d'armure est essentiellement decoratif.

**Chiffres** : contre un cuirasse (70 degats), l'armure 6 du cuirasse defenseur ne reduit que 8.6% des degats post-bouclier. Contre un intercepteur (4 degats par tir), l'armure 1 reduit 25% -- mais seulement si le tir perce le bouclier.

### P5 -- Le bouclier planetaire est trop faible aux niveaux bas

Au niveau 1, le bouclier planetaire a une capacite de **30**. Un seul intercepteur fait 4 degats * 3 tirs = 12 degats par round. Cinq intercepteurs percent le bouclier en un round (60 vs 30).

Aux niveaux eleves (8+), la croissance exponentielle compense, mais les premiers niveaux donnent un faux sentiment de securite.

### P6 -- Les vaisseaux support sont des victimes passives

Les vaisseaux support (cargo, prospecteur, recycleur) n'ont aucune survivabilite en combat. Ils ne sont cibles qu'en dernier (categorie non-targetable), mais quand ils le sont, ils meurent instantanement. Un joueur qui envoie une flotte de transport dans une zone de combat perd tout sans recours.

Ce n'est pas necessairement un probleme (c'est logique thematiquement), mais le joueur doit etre clairement informe de ce risque.

### P7 -- Le systeme de ciblage par priorite manque de profondeur

L'attaquant choisit **une seule categorie prioritaire** pour tout le combat. Il n'y a pas de logique de focus-fire (concentrer les tirs sur une cible), pas de formations, pas de moyen de dire "les intercepteurs ciblent les defenses, les croiseurs ciblent les lourds".

La selection aleatoire dans la categorie disperse les degats et genere de l'overkill, surtout avec les unites a haut shotCount.

---

## 3. Propositions d'ajustements

### A1 -- Reequilibrer l'intercepteur (urgence : basse)

**Option a)** Augmenter legerement ses stats pour qu'il reste viable en masse :
- weapons: 4 -> 5, hull: 12 -> 15

**Option b)** Reduire son cout pour reflechir son role de chair a canon :
- costMinerai: 3000 -> 2000

**Option c)** Ne rien changer -- l'intercepteur remplit son role d'unite debloquee tot, temporaire par design.

**Recommandation** : option c) pour l'instant. L'intercepteur est la premiere unite, il est naturellement remplace. Ce n'est un probleme que si les joueurs n'ont pas rapidement acces a la fregate.

### A2 -- Reequilibrer les defenses (urgence : moyenne)

Le lanceur de missiles est trop mauvais, le laser leger trop bon.

**Proposition :**
| Defense             | Actuel         | Propose           | Justification              |
|---------------------|----------------|-------------------|-----------------------------|
| Lanceur de missiles | 5W / 6S / 10H  | 6W / 8S / 12H     | Aligner le ratio sur le laser leger |
| Laser leger         | 7W / 8S / 12H  | 7W / 8S / 12H     | Inchange (reference)        |
| Canon electromagnetique | 50W / 30S / 60H | 55W / 35S / 70H | Ameliorer le ratio cout/efficacite |
| Artillerie a ions   | 80W / 50S / 120H| 90W / 55S / 130H | Idem -- trop cher pour ce que ca fait |

### A3 -- Faire echelle l'armure avec la recherche (urgence : haute)

Actuellement, l'armure est flat et stagne. Deux options :

**Option a)** L'armure beneficie du multiplicateur de recherche `armor`, comme la coque :
```
armor_effective = baseArmor * multiplicateur_armor
```
Au niveau de recherche 5, une armure de 6 deviendrait 9. Au niveau 10, elle deviendrait 12.

**Option b)** Creer une recherche dediee "Technologie de blindage" qui booste l'armure separement.

**Recommandation** : option a). Simple, coherent, et donne enfin un role a l'armure a haut niveau sans ajouter de complexite.

### A4 -- Ajuster la courbe du bouclier planetaire (urgence : basse)

**Proposition :** Augmenter la capacite de base de 30 a 50.

| Niveau | Actuel | Propose (base 50) |
|--------|-------:|-------------------:|
| 1      |     30 |                 50 |
| 2      |     39 |                 65 |
| 3      |     51 |                 85 |
| 5      |     86 |                143 |
| 8      |    189 |                314 |
| 10     |    319 |                531 |

Cela donne une protection utile des les premiers niveaux sans changer l'exponentielle.

**Alternative :** Garder la base a 30 mais passer le facteur de 1.3 a 1.35 pour accroitre la croissance.

### A5 -- Ajouter un mecanisme de rapidfire (urgence : basse, complexite haute)

Inspiration : OGame. Certaines unites auraient une chance de tirer un coup supplementaire contre des types specifiques (ex: le croiseur a 33% de rapidfire contre les intercepteurs).

**Avantages :**
- Cree des relations de counter naturelles
- Donne un role aux petites unites (elles forcent l'adversaire a diversifier)
- Ajoute de la profondeur strategique

**Inconvenients :**
- Complexifie le moteur de combat
- Necessite un reequilibrage complet
- Plus difficile a expliquer au joueur

**Recommandation :** A considerer pour une v2 du systeme de combat, pas pour maintenant.

### A6 -- Rendre la formule FP plus representative (urgence : moyenne)

La formule actuelle surestime l'impact du shotCount a cause de l'exposant 1.5. En realite, un shotCount eleve est penalise par la dispersion des tirs et l'overkill.

**Proposition :** Reduire l'exposant de 1.5 a 1.2 ou 1.3.

Impact sur le FP :

| Unite        | FP actuel (exp 1.5) | FP propose (exp 1.2) | FP propose (exp 1.3) |
|--------------|---------------------:|---------------------:|---------------------:|
| Intercepteur |                   10 |                    7 |                    8 |
| Fregate      |                   21 |                   17 |                   18 |
| Croiseur     |                   37 |                   37 |                   37 |
| Cuirasse     |                   98 |                   98 |                   98 |
| Laser leger  |                    7 |                    5 |                    6 |

Cela rapprocherait le FP de la realite pour les unites a shotCount eleve, sans affecter les unites a 1 shot.

---

## 4. Resume des priorites

| Ref | Ajustement                    | Urgence  | Complexite | Impact |
|-----|-------------------------------|----------|------------|--------|
| A1  | Reequilibrer l'intercepteur   | Basse    | Triviale   | Faible |
| A2  | Reequilibrer les defenses     | Moyenne  | Faible     | Moyen  |
| A3  | Faire echelle l'armure        | Haute    | Faible     | Fort   |
| A4  | Ajuster le bouclier planetaire| Basse    | Triviale   | Faible |
| A5  | Systeme de rapidfire          | Basse    | Haute      | Fort   |
| A6  | Ajuster la formule FP         | Moyenne  | Triviale   | Moyen  |

### Ordre recommande

1. **A3** -- Armure qui echelle : changement simple avec gros impact, corrige un systeme actuellement inutile
2. **A2** -- Reequilibrage defenses : donne un vrai choix au joueur
3. **A6** -- Formule FP : ameliore la lisibilite pour le joueur
4. **A4** -- Bouclier planetaire : amelioration de confort
5. **A1** -- Intercepteur : faible priorite, se corrige naturellement
6. **A5** -- Rapidfire : complexe, a planifier separement
