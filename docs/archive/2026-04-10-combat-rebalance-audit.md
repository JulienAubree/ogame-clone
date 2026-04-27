> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Note d'equilibrage -- Audit de la proposition de reequilibrage

Ce document est un auto-audit de `combat-rebalance-proposal.md`. Il identifie les desequilibres que la proposition introduirait et propose des corrections.

---

## 1. Ce qui fonctionne

Avant de lister les problemes, les concepts fondamentaux de la proposition sont sains :

- **Armement multiple** : donner plusieurs batteries a un vaisseau pour diversifier son ciblage est une bonne idee. Ca cree de la composition et du choix.
- **Rafale** : les relations de predateur/proie entre categories sont exactement ce qui manque au systeme actuel.
- **Coup critique** : simple, ajout de variance maitrise, rien a redire.
- **Armure dynamique** : le principe de faire echelle l'armure est necessaire.

Les problemes sont dans les **chiffres** et les **interactions entre mecaniques**, pas dans les concepts.

---

## 2. FAILLE CRITIQUE : les batteries secondaires sont verrouillees par les boucliers

C'est le probleme le plus grave de la proposition. Il rend les batteries secondaires et la rafale **quasi-inoperantes**.

### Demonstration

Le code de `fireShot` (combat.ts:218) :
```typescript
if (target.shield >= damage) {
    target.shield -= damage;
    return; // tir absorbe, aucun degat de coque
}
```

Regardons les matchups proposes :

| Attaquant (batterie secondaire) | Degats | Cible          | Bouclier cible | Resultat        |
|---------------------------------|-------:|----------------|:--------------:|-----------------|
| Croiseur bat. 2                 |      5 | Intercepteur   |              8 | **Absorbe**     |
| Croiseur bat. 2                 |      5 | Lanceur missiles|              8 | **Absorbe**     |
| Croiseur bat. 2                 |      5 | Laser leger    |              8 | **Absorbe**     |
| Cuirasse bat. 2                 |     10 | Fregate        |             16 | **Absorbe**     |
| Cuirasse bat. 2                 |     10 | Laser lourd    |             18 | **Absorbe**     |
| Fregate bat. 2                  |      6 | Intercepteur   |              8 | **Absorbe**     |

**Aucune batterie secondaire ne peut percer le bouclier de sa cible designee.** Chaque tir est integralement absorbe.

### Pourquoi le nombre de tirs ne sauve pas la situation

On pourrait penser que la rafale compense : avec 8 tirs a 5 degats contre 10 intercepteurs, certains intercepteurs seront touches plusieurs fois, non ?

Le code de `selectTarget` choisit une cible **aleatoire** dans la categorie a chaque tir. Avec 10 intercepteurs, chaque tir a 1/10 de chance de tomber sur le meme. En moyenne :
- 8 tirs disperses sur 10 cibles = 0.8 tirs par intercepteur
- Probabilite que 2 tirs touchent le meme intercepteur : ~25% par paire
- Resultat : 1-2 intercepteurs touches deux fois, les autres une seule

Pour un intercepteur touche deux fois :
- Tir 1 : 5 degats, shield 8 -> 3. Absorbe.
- Tir 2 : 5 degats, shield 3 < 5, surplus = 2, armure 1, hull damage = max(2-1, 1) = **1 point de coque**.

Un intercepteur a 12 de coque. Avec le meilleur scenario, la batterie secondaire du croiseur inflige **1 PV de coque** a 1-2 intercepteurs par round sur 10. Les boucliers se regenerent au round suivant. **C'est negligeable.**

### Interaction avec la recherche : ca ne s'ameliore jamais

La recherche Armes multiplie les degats ET la recherche Bouclier multiplie les boucliers. Les deux echellent lineairement :

| Recherche | Croiseur bat. 2 | Intercepteur shield | Resultat    |
|-----------|:---------------:|:-------------------:|-------------|
| 0         | 5               | 8                   | Absorbe     |
| 5         | 7.5             | 12                  | Absorbe     |
| 10        | 10              | 16                  | Absorbe     |
| 15        | 12.5            | 20                  | Absorbe     |

Le ratio degats/bouclier reste **constant** a tout niveau de recherche. La batterie secondaire ne sera **jamais** efficace.

### Consequence en cascade

La rafale x4 du croiseur (sa mecanique signature) genere en moyenne 8 tirs par round contre les legers. Si chacun de ces 8 tirs est absorbe par le bouclier : **la rafale produit 0 degats de coque**. Elle ne fait que gratter les boucliers qui se regenerent au round suivant.

La mecanique est mathematiquement morte.

---

## 3. DESEQUILIBRE MAJEUR : l'armure dynamique aggrave le fosse lourd vs leger

### Le probleme

L'armure qui echelle avec la recherche Protection est un bon principe, mais elle creuse l'ecart entre les unites a haute armure de base (lourds) et celles a faible armure (legers).

**Calcul : intercepteur vs cuirasse a recherche 10**

Stats avec recherche 10 (multiplicateur x2.0) :
- Intercepteur : 8 degats (4*2), 3 tirs
- Cuirasse : 80 shield (40*2), 200 hull (100*2), **12 armure** (6*2)

1. Phase bouclier : 3 tirs a 8 degats = 24 degats. Shield 80 -> 56. Il faut **10 intercepteurs tirant 1 round complet** juste pour epuiser le bouclier d'UN cuirasse.

2. Phase coque (shield epuise) : par tir : max(8 - 12, 1) = **1 degat** (minimum). Avec 200 de coque, il faut **200 tirs** pour le tuer.

**Avant la proposition (armure fixe a 6)** : max(8 - 6, 1) = **2 degats** par tir. 100 tirs pour tuer. L'armure dynamique **double** la survie du cuirasse contre les intercepteurs.

### Interaction perverse avec la rafale

On propose que le croiseur ait rafale vs light et le cuirasse rafale vs medium. Pendant ce temps, les unites legeres deviennent AUSSI moins efficaces offensivement contre les lourds (armure scaled). Le joueur leger est frappe des deux cotes :
- Il meurt plus vite (rafale)
- Il fait moins de degats (armure)

Le desequilibre lourd > leger, qu'on cherchait a corriger, **empire**.

### Ce qu'il faudrait

L'armure dynamique est bonne mais necessite un plafond ou un rendement decroissant :

**Option : racine carree**
```
armure_effective = baseArmor * sqrt(multiplicateur_armor)
```

| Recherche | Multiplicateur | Armure cuirasse (lineaire) | Armure cuirasse (racine) |
|-----------|:--------------:|:--------------------------:|:------------------------:|
| 0         | 1.0            | 6                          | 6.0                      |
| 5         | 1.5            | 9.0                        | 7.3                      |
| 10        | 2.0            | 12.0                       | 8.5                      |
| 15        | 2.5            | 15.0                       | 9.5                      |

Avec la racine, a recherche 10 le cuirasse a 8.5 d'armure. Degats de l'intercepteur : max(8 - 8.5, 1) = 1. Toujours minimum. Hmm.

**Option plus souple : echelle fractionnaire**
```
armure_effective = baseArmor * (1 + 0.05 * niveau_recherche)   // +5% au lieu de +10%
```

| Recherche | Armure cuirasse | Intercepteur dmg (8) post-armure |
|-----------|:---------------:|:--------------------------------:|
| 0         | 6.0             | 2                                |
| 5         | 7.5             | 1 (minimum)                      |
| 10        | 9.0             | 1 (minimum)                      |

Meme a +5% par niveau, l'intercepteur tombe au minimum a recherche 5. Le probleme de fond : **4 degats de base vs 6 armure de base est deja presque au plancher**. L'armure dynamique ne fait qu'empirer un ratio deja critique.

**La vraie solution** : l'armure dynamique est viable MAIS uniquement si les degats des petites unites restent au-dessus du seuil. Voir la section corrections.

---

## 4. DESEQUILIBRE MOYEN : le croiseur devient l'unite universelle

### Cout/efficacite avant et apres

**Avant la proposition :**

| Unite        | Cout   | DPS | Ratio DPS/cout |
|--------------|-------:|----:|:--------------:|
| Intercepteur | 4 000  |  12 | 3.00           |
| Fregate      | 10 000 |  24 | 2.40           |
| Croiseur     | 29 000 |  45 | 1.55           |
| Cuirasse     | 60 000 |  70 | 1.17           |

L'intercepteur a le meilleur ratio DPS/cout brut. La progression est coherente : les unites cheres sont plus puissantes par unite mais moins rentables par ressource.

**Apres la proposition (DPS effectif moyen avec rafale) :**

| Unite        | Cout   | DPS vs mixed fleet | Ratio DPS/cout |
|--------------|-------:|-------------------:|:--------------:|
| Intercepteur | 4 000  |                 12 | 3.00           |
| Fregate      | 10 000 |                 24 | 2.40           |
| Croiseur     | 29 000 |             **75** | **2.59**       |
| Cuirasse     | 60 000 |            **110** | **1.83**       |

Le croiseur passe de 1.55 a 2.59 de ratio, depassant la fregate. Il devient **l'unite la plus rentable** dans les combats mixtes, tout en etant la plus puissante par unite. Il n'y a plus de trade-off : le croiseur est superieur en absolu ET en relatif.

### Pourquoi c'est un probleme

La meta optimale devient : "construis des croiseurs, rien que des croiseurs." C'est exactement le probleme de mono-composition qu'on voulait resoudre.

---

## 5. PERTE DE CONTROLE : suppression du choix de ciblage

### Ce qui est retire

Aujourd'hui, le joueur choisit une **priorite de ciblage** (ex: "cible les lourds d'abord") pour toute sa flotte. La proposition supprime ce choix au profit du ciblage automatique par batterie.

### Cas problematiques

**Scenario : attaque avec objectif de pillage**
Le joueur veut detruire les defenses rapidement pour piller. Actuellement, il met la priorite sur "defense". Avec les batteries fixes, son croiseur tire :
- Bat. principale (35 degats) sur les lourds (s'il y en a) ou fallback
- Bat. secondaire (5 degats) sur les legers

Il ne peut pas forcer toutes ses armes sur les defenses. Le combat dure plus longtemps, le pillage est retarde.

**Scenario : focus-fire sur le flagship ennemi**
Le joueur veut concentrer le feu sur le flagship adverse. Impossible -- chaque batterie disperse ses tirs sur sa categorie naturelle.

### Impact

La perte de controle strategique est un recul de gameplay significatif. Les joueurs experimentaux qui optimisaient leur ciblage selon le contexte perdent cet outil.

---

## 6. MECANIQUE DECORATIVE : l'enchainement se declenche rarement

### Condition de declenchement

L'enchainement se declenche quand un tir **detruit** sa cible. Pour detruire en un tir, il faut :
1. Que le tir perce le bouclier (degats > bouclier restant)
2. Que les degats post-armure depassent la coque restante

### Analyse par matchup

| Attaquant (enchainement) | Degats | Cible          | Shield | Hull | One-shot ? |
|--------------------------|-------:|----------------|-------:|-----:|:----------:|
| Intercepteur             |      4 | Intercepteur   |      8 |   12 | **Non** (absorbe) |
| Intercepteur             |      4 | Sonde espion   |      0 |    3 | **Oui**    |
| Intercepteur             |      4 | Satellite      |      1 |    6 | Non        |
| Lanceur de missiles      |      6 | Intercepteur   |      8 |   12 | **Non**    |
| Laser leger              |      7 | Intercepteur   |      8 |   12 | **Non**    |

L'enchainement ne se declenche que contre les sondes d'espionnage (0 shield, 3 hull) ou des unites deja endommagees. En pratique :

- **Round 1** : quasi-impossible. Les boucliers sont pleins, aucune unite n'est one-shottable.
- **Rounds 2-4** : les boucliers se regenerent entre les rounds. Meme les unites endommagees retrouvent leur bouclier.
- **Exception** : une unite dont la coque est passee sous le seuil de one-shot ET qui a pris assez de shield damage dans le meme round pour ne plus bloquer.

L'enchainement est donc une mecanique de niche qui se declenche occasionnellement en fin de combat, quand des unites sont presque mortes. Ca ne change pas les decisions strategiques du joueur.

---

## 7. Proposition V2 : corrections

### 7.1 Corriger les batteries secondaires : seuil de percee

**Le principe** : les degats d'une batterie secondaire doivent etre **superieurs au bouclier de base** de la categorie ciblee. Sinon la batterie est un poids mort.

Seuils de bouclier par categorie :
- Light : intercepteur 8, lanceur 8, laser leger 8
- Medium : fregate 16, laser lourd 18
- Heavy : croiseur 28, cuirasse 40

**Regle de design : degats secondaires >= shield le plus bas de la categorie ciblee + 1**

Nouveaux profils d'armes :

| Unite        | Bat. principale           | Bat. secondaire              | DPS total |
|--------------|---------------------------|------------------------------|----------:|
| Intercepteur | 4 degats x3, cible light  | --                           |        12 |
| Fregate      | 14 degats x1, cible medium| 10 degats x1, cible light   |        24 |
| Croiseur     | 25 degats x1, cible heavy | 10 degats x2, cible light   |        45 |
| Cuirasse     | 30 degats x1, cible heavy | 20 degats x2, cible medium  |        70 |

**Verifications :**

| Batterie secondaire | Degats | Cible cible   | Shield | Perce ? | Surplus apres shield |
|---------------------|-------:|---------------|-------:|:-------:|---------------------:|
| Fregate bat. 2      |     10 | Intercepteur  |      8 | **Oui** | 2 (- 1 armure = 1 hull) |
| Croiseur bat. 2     |     10 | Intercepteur  |      8 | **Oui** | 2 (- 1 armure = 1 hull) |
| Cuirasse bat. 2     |     20 | Fregate       |     16 | **Oui** | 4 (- 2 armure = 2 hull) |

Les batteries secondaires font maintenant du vrai degat. Ce n'est pas enorme (1-2 PV de coque par tir), mais c'est reel, et la rafale multiplie ces petits degats en quelque chose de significatif.

**Verification de la rafale corrigee :**
Croiseur bat. 2 (10 degats x2, rafale x4 vs light) contre 10 intercepteurs :
- 2 tirs de base + en moyenne 6 bonus = 8 tirs a 10 degats
- Chaque tir contre un intercepteur (8 shield) : surplus 2, -1 armure = 1 hull damage
- 8 tirs repartis sur 10 intercepteurs : ~8 PV de coque infliges au total
- Un intercepteur a 12 PV de coque. Pas de one-shot, mais en combinaison avec la bat. principale et d'autres croiseurs, les intercepteurs tombent en 2-3 rounds.

C'est un impact modeste mais **reel**. La rafale a un vrai role.

**Compromis accepte** : les DPS des batteries principales baissent pour maintenir le total. Le croiseur passe de 35 a 25 sur son canon principal. Contre un cuirasse (40 shield), les 25 degats sont absorbes par le bouclier. Ca veut dire que **le croiseur seul ne menace pas les cuirasses** -- il lui faut du volume ou des cuirasses allies pour casser les shields. C'est un trade-off voulu : le croiseur est un tueur de legers, pas un anti-lourd.

### 7.2 Corriger l'armure : demi-echelle

Au lieu de `baseArmor * multiplier_armor`, utiliser **la moitie** du bonus de recherche :

```
armure_effective = baseArmor * (1 + 0.05 * niveau_recherche_armor)
```

C'est +5% par niveau au lieu de +10%. L'armure progresse mais ne double jamais.

| Recherche | Multi armor (coque) | Multi armor (armure) | Cuirasse armure | Inter. degats | Post-armure |
|-----------|:-------------------:|:--------------------:|:---------------:|:-------------:|:-----------:|
| 0         | 1.0                 | 1.0                  | 6.0             | 4             | 1 (min)     |
| 5         | 1.5                 | 1.25                 | 7.5             | 6             | 1 (min)     |
| 10        | 2.0                 | 1.5                  | 9.0             | 8             | 1 (min)     |

Meme avec +5% l'intercepteur tombe au minimum (ses degats sont trop proches de l'armure de base). Mais l'ecart avec l'armure lineaire (12.0 vs 9.0 a recherche 10) signifie que les **unites moyennes** (fregate a 12 degats) gardent une marge :

| Recherche | Fregate degats | Cuirasse armure (lineaire) | Post-armure lin. | Cuirasse armure (1/2) | Post-armure 1/2 |
|-----------|:--------------:|:--------------------------:|:----------------:|:---------------------:|:---------------:|
| 10        | 24             | 12.0                       | 12               | 9.0                   | 15              |

25% de degats en plus pour la fregate avec la demi-echelle vs la pleine echelle. Ca compte.

### 7.3 Corriger le croiseur : ajuster la rafale

Le croiseur ne doit pas etre l'unite universelle. Deux leviers :

**Reduire la rafale de x4 a x3** :
- x4 = 75% chance, ~4 tirs par tir de base, 8 tirs totaux avec la bat. secondaire
- x3 = 67% chance, ~3 tirs par tir de base, 6 tirs totaux

DPS effectif vs fleet mixte :
- Rafale x4 : 25 + 10*8 = 105 --> ratio 3.62/1000 de cout
- Rafale x3 : 25 + 10*6 = 85 --> ratio 2.93/1000 de cout

Avec x3, le croiseur descend sous la fregate en ratio brut (2.40). **L'equilibre est restaure** entre tiers.

| Unite        | Cout   | DPS effectif mixte (V2) | Ratio DPS/cout |
|--------------|-------:|------------------------:|:--------------:|
| Intercepteur | 4 000  |                      12 | 3.00           |
| Fregate      | 10 000 |                      24 | 2.40           |
| Croiseur     | 29 000 |                  **85** | **2.93**       |
| Cuirasse     | 60 000 |                 **130** | **2.17**       |

Hmm, le croiseur reste au-dessus de la fregate. Mais ce DPS effectif ne s'applique **que** contre des flottes avec des legers. Contre une flotte 100% medium/heavy, le croiseur fait :
- Bat. 1 : 25 vs heavy (absorbe par shield si cuirasse, passe si croiseur)
- Bat. 2 : 10 x2 vs light -> fallback medium/heavy. 20 DPS sans rafale.
- Total : 45 DPS, ratio 1.55. Retour au baseline.

La rafale ne s'active QUE si l'adversaire amene des legers. C'est un bonus conditionnel, pas absolu. **Le ratio de 2.93 est un maximum theorique**, pas le cas moyen.

**C'est exactement le bon comportement** : le joueur est recompense pour avoir lu la composition adverse et adapte la sienne, pas pour avoir spamme une seule unite.

### 7.4 Conserver le choix de ciblage du joueur

Ne pas supprimer la priorite de ciblage. A la place, la combiner avec le ciblage par batterie :

**Regle** : chaque batterie cible **en priorite** sa categorie naturelle. Mais si le joueur a defini une priorite globale, elle sert de **premier fallback** avant l'ordre standard.

Ordre de ciblage d'une batterie :
1. Categorie naturelle de la batterie (ex: "light" pour la tourelle secondaire)
2. Priorite du joueur (ex: "defense" si le joueur veut focus les defenses)
3. Fallback standard (light > medium > heavy > shield > defense > support)

Le joueur garde le controle quand il le veut, et le ciblage naturel ajoute de la profondeur quand il ne specifie rien.

### 7.5 Rendre l'enchainement viable : declenchement sur bouclier epuise

Le probleme : l'enchainement necessite un kill, qui est quasi-impossible au round 1 a cause des boucliers.

**Alternative : "Perforation"**
> *"Si un tir met le bouclier d'une cible a 0, le tireur gagne un tir bonus contre une autre cible de la meme categorie."*

Difference cruciale : il ne faut plus tuer la cible, juste **vider son bouclier**. C'est beaucoup plus frequent.

Intercepteur (4 degats) vs intercepteur (8 shield) :
- Tir 1 : shield 8 -> 4. Pas a 0, pas de bonus.
- Tir 2 : shield 4 -> 0. **Bouclier epuise, bonus declenche.**
- Tir bonus : touche un autre intercepteur, shield 8 -> 4.
- Tir 3 : tir normal restant.

L'intercepteur a maintenant un gameplay : il "casse" les boucliers et enchaine. Contre un essaim, ses 3 tirs + 1 bonus font 4 tirs par round au lieu de 3. C'est un boost de ~33% qui se declenche regulierement.

**Nom en jeu** : "Perforation" (plus intuitif que "enchainement" pour un joueur).

---

## 8. Bilan comparatif V1 vs V2

### Problemes resolus

| Probleme identifie                        | V1 (proposition initiale)                        | V2 (corrigee)                                  |
|-------------------------------------------|---------------------------------------------------|-------------------------------------------------|
| Batteries secondaires shield-locked       | Oui -- degats trop bas, 0 impact reel            | Corrige -- degats >= shield de la cible         |
| Armure aggrave le fosse lourd/leger       | Oui -- echelle lineaire, double la survie lourds | Atenue -- demi-echelle (+5%/niv)                |
| Croiseur unite universelle               | Oui -- rafale x4 le rend dominant                | Atenue -- rafale x3, DPS conditionnel           |
| Perte du choix de ciblage                | Oui -- choix du joueur supprime                   | Corrige -- priorite joueur = premier fallback   |
| Enchainement decoratif                   | Oui -- kill impossible round 1                    | Corrige -- perforation (trigger sur shield = 0) |

### Profils d'armes V2 (chiffres finaux)

| Unite        | Bat. principale              | Bat. secondaire              | DPS total | Trait offensif              |
|--------------|------------------------------|------------------------------|----------:|-----------------------------|
| Intercepteur | 4 dmg x3, cible light        | --                           |        12 | Perforation                 |
| Fregate      | 14 dmg x1, cible medium      | 10 dmg x1, cible light      |        24 | --                          |
| Croiseur     | 25 dmg x1, cible heavy       | 10 dmg x2, cible light      |        45 | Rafale x3 vs light (bat. 2)|
| Cuirasse     | 30 dmg x1, cible heavy       | 20 dmg x2, cible medium     |        70 | Rafale x3 vs medium (bat. 2)|

### Defenses V2

| Defense              | Armement                    | DPS | Stat changes              | Trait           |
|----------------------|-----------------------------|----:|---------------------------|-----------------|
| Lanceur de missiles  | 6 dmg x2, cible light       |  12 | shield 8, hull 14         | Perforation     |
| Laser leger          | 7 dmg x3, cible light       |  21 | inchange                  | Perforation     |
| Laser lourd          | 15 dmg x2, cible medium     |  30 | inchange                  | --              |
| Canon EM             | 55 dmg x1, cible heavy      |  55 | shield 35, hull 70        | --              |
| Artillerie a ions    | 90 dmg x1, cible heavy      |  90 | shield 60, hull 140       | --              |

### Matrice de matchups V2 (DPS effectif moyen, base stats, sans recherche)

```
                    DEFENSEUR
                    Intercepteurs  Fregates  Croiseurs  Cuirasses  Mix light+heavy
ATTAQUANT
Intercepteurs       12             12*       12*        12*        12
Fregates            24             14*       14*        14*        24
Croiseurs           25+60=85       25+20=45  25+20=45   25+20=45   85
Cuirasses           30+40=70       30+120=150 30+40=70  30+40=70   110

* = bat. principale en fallback sur mauvaise categorie
```

**Lectures cles :**
- Croiseurs dominent les intercepteurs (85 vs 12 effectif). **Relation de counter confirmee.**
- Cuirasses dominent les fregates (150 vs 14 effectif). **Relation de counter confirmee.**
- Intercepteurs en masse restent rentables (12 DPS pour 4k, ratio imbattable) tant que l'adversaire n'a pas de croiseurs.
- Croiseur vs cuirasse pur : 45 DPS vs 70 DPS. Le cuirasse gagne au DPS ET en survie. **Le tier superieur gagne le 1v1**, comme attendu.

**Chaine de counters :**
```
Intercepteurs (masse)  ───domines par───>  Croiseurs (rafale x3 vs light)
         ^                                        |
         |                                        v
    efficaces contre                    vulnerables aux
         |                                        |
         v                                        ^
Cuirasses (cout eleve)  <───domines par───  Essaims de fregates/inter (volume)
         |
    dominent par
         v
Fregates (rafale x3 vs medium)
```

Le cercle n'est pas parfait (les cuirasses n'ont pas de faiblesse directe), mais il est meilleur que le systeme actuel ou rien ne contrecarre rien.

---

## 9. Risques residuels

### R1 -- Le cuirasse reste sans counter naturel

Le cuirasse n'a pas de predateur. Aucune unite n'a de rafale "vs heavy". C'est un choix delibere (le cuirasse est l'unite la plus chere, il DOIT etre fort), mais ca signifie que la course au cuirasse reste la meta de fin de partie.

**Surveillance** : si les playtests montrent que le cuirasse monopolise le late-game, envisager une 5e unite militaire (destroyeur ?) avec rafale vs heavy, ou un bonus de defense planetaire specifique anti-lourd.

### R2 -- La bat. principale du croiseur (25 degats) ne perce pas le shield cuirasse (40)

25 < 40 : un croiseur seul ne menace pas un cuirasse par sa bat. principale. Il faut que la bat. secondaire (en fallback) ou d'autres croiseurs epuisent le shield d'abord. En pratique, 2+ croiseurs combinant leurs tirs sur le meme cuirasse finiront par percer.

Ce n'est pas un bug, c'est un trade-off voulu : le croiseur est anti-leger, pas anti-lourd. Mais il faut que le joueur le comprenne. **A documenter clairement dans le guide de combat.**

### R3 -- La perforation sur le laser leger (7 dmg x3) est tres puissante

Le laser leger fait 7 degats, l'intercepteur a 8 de shield. Tir 1 : shield 8 -> 1. Tir 2 : shield 1 -> 0, surplus 6, -1 armure = 5 hull damage. **Perforation declenchee** : tir bonus sur un autre intercepteur.

En 3 tirs + 1 bonus, un laser leger inflige ~5 hull damage a un intercepteur et commence a travailler le shield d'un deuxieme. C'est puissant mais pas desequilibre : le laser leger coute 2 000 et l'intercepteur 4 000. Le defenseur DEVRAIT avoir l'avantage cout/efficacite pour compenser l'avantage strategique de l'attaquant (initiative, choix de la cible).

### R4 -- Impact sur le PvE

Les templates pirates sont definis en nombre d'unites fixes (pas en FP). Le reequilibrage ne change pas leur composition. Mais les nouvelles mecaniques (perforation, rafale) pourraient rendre les combats PvE plus faciles, surtout les templates "easy" qui sont des essaims d'intercepteurs -- exactement la cible des croiseurs avec rafale.

**A surveiller** : revalider les templates pirates apres implementation.

### R5 -- Complexite UI

Le systeme passe de 3 stats offensives (armes, tirs, priorite) a un modele multi-batteries avec traits. La fiche d'un croiseur affiche desormais :

```
Canon principal    25 x1    Lourd
Tourelles defense  10 x2    Leger    [Rafale x3]
                                     [Crit 5%]
```

C'est plus d'information, mais chaque element est simple. Le risque est l'**accumulation** : un joueur debutant qui voit "25 x1 Lourd / 10 x2 Leger / Rafale x3 / Crit 5% / Perforation" peut etre submerge.

**Mitigation** : implementer les mecaniques en phases (batteries d'abord, puis traits) et n'afficher les traits que dans une vue detaillee, pas dans le listing principal.

---

## 10. Synthese

| Element                   | Verdict V1             | Verdict V2 (corrigee)    |
|---------------------------|------------------------|--------------------------|
| Batteries d'armes         | Concept bon, chiffres casses | Viable avec degats >= shield |
| Rafale                    | Inutile (shield-locked)| Fonctionnelle, conditionnelle|
| Perforation (ex-enchainement) | Decorative (kill-only) | Reguliere, role clair   |
| Coup critique             | OK tel quel            | OK tel quel               |
| Armure dynamique          | Aggrave le fosse       | Acceptable en demi-echelle |
| Buff defenses             | Correct                | Correct                   |
| Bouclier planetaire       | Correct                | Correct                   |
| Choix du joueur           | Supprime               | Conserve comme fallback   |
| Equilibre croiseur        | Dominant               | Conditionnel, acceptable  |
| Equilibre cuirasse        | Sans counter           | A surveiller              |

**La proposition V1 a un probleme fondamental** (batteries secondaires inutiles) qui invalide deux de ses quatre mecaniques. La V2 corrige ce probleme en redessinant les profils de degats et en remplacant l'enchainement par la perforation. Le resultat est un systeme ou la composition de flotte compte reellement.
