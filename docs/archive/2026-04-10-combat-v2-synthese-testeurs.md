> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

### Refonte du systeme de combat -- Proposition V2

*Document de synthese a destination des testeurs. Objectif : recueillir vos retours avant implementation.*

---

### Pourquoi ces changements ?

Le systeme de combat actuel a un probleme central : **la composition de flotte n'a pas d'importance**. Le joueur qui a le plus de ressources gagne, peu importe ce qu'il construit. Spammer des croiseurs ou des lasers legers est toujours la meilleure strategie. Il n'y a aucun "counter" -- aucune unite qui en contrecarre une autre.

Cette proposition vise a rendre les choix de composition significatifs en introduisant des relations de force/faiblesse entre categories d'unites, sans complexifier l'experience au-dela du raisonnable.

---

### Ce qui change

#### 1. Les vaisseaux avances ont deux batteries d'armes

Actuellement, chaque vaisseau a un seul type d'arme qui tire sur une seule categorie de cible. On introduit des **batteries secondaires** sur les vaisseaux de rang fregate et au-dessus.

Concretement :

- **Intercepteur** -- Arme principale : 4 degats x3 tirs, cible Leger. Pas d'arme secondaire.
- **Fregate** -- Arme principale : 14 degats x1, cible Moyen. Arme secondaire : 10 degats x1, cible Leger.
- **Croiseur** -- Arme principale : 25 degats x1, cible Lourd. Arme secondaire : 10 degats x2, cible Leger.
- **Cuirasse** -- Arme principale : 30 degats x1, cible Lourd. Arme secondaire : 20 degats x2, cible Moyen.

**Ce que ca veut dire en jeu :** un croiseur tire son canon principal sur les vaisseaux lourds ennemis tout en utilisant ses tourelles pour canarder les intercepteurs. Il ne gaspille plus un obus de 45 degats sur un chasseur a 12 PV.

Les defenses planetaires gardent une seule batterie -- elles sont specialisees par nature.

> **Le DPS total de chaque unite est inchange.** On redistribue les degats, on n'augmente ni ne diminue la puissance globale.

---

#### 2. Trois nouveaux traits de combat

Chaque trait s'explique en une phrase.

**Perforation**

> *Quand un tir vide completement le bouclier d'une cible, le tireur gagne un tir bonus sur une autre cible de la meme categorie.*

C'est le trait des unites legeres (intercepteurs, lanceurs de missiles, lasers legers). Il recompense le fait de "casser" les boucliers ennemis et donne aux petites unites un avantage reel en essaim : plus il y a de boucliers a percer, plus elles tirent.

*Exemple :* un intercepteur fait 4 degats, 3 tirs. Il touche un intercepteur ennemi (8 bouclier). Tir 1 : bouclier 8 -> 4. Tir 2 : bouclier 4 -> 0, le surplus perce la coque. Perforation declenchee : tir bonus sur un autre ennemi. Le chasseur a tire 4 fois au lieu de 3.

**Rafale**

> *Contre une categorie specifique d'ennemis, chaque tir a une chance de declencher un tir supplementaire. Ce bonus peut lui-meme declencher une rafale.*

C'est le trait des vaisseaux lourds sur leur batterie secondaire. Il cree les relations de **predateur/proie** :

- **Croiseur** -- Rafale x3 vs Leger (bat. secondaire) : 67% de chance de tir bonus contre les chasseurs.
- **Cuirasse** -- Rafale x3 vs Moyen (bat. secondaire) : 67% de chance de tir bonus contre les fregates.

*Exemple :* un croiseur tire ses tourelles (10 degats x2) sur des intercepteurs. Tir 1 : touche. Rafale ? 67% -> oui, tir bonus. Bonus 1 : touche. Rafale ? 67% -> oui. Bonus 2 : touche. Rafale ? 67% -> non. Total : 4 tirs au lieu de 2.

En moyenne, la rafale x3 triple le nombre de tirs de la batterie secondaire contre sa cible designee.

**Coup critique**

> *Chaque tir a 5% de chance d'infliger 150% de degats.*

Simple, universel, identique pour toutes les unites. Ajoute des moments de tension dans les replays de combat sans changer l'equilibre strategique (la variance s'annule sur de grands nombres).

---

#### 3. L'armure progresse avec la recherche

Actuellement, l'armure est un chiffre fixe (1 a 7) qui ne bouge jamais. A haut niveau, quand les armes font des dizaines de degats, l'armure est negligeable.

**Changement :** l'armure beneficie de la recherche Protection, a la moitie du taux normal (+5% par niveau au lieu de +10%).

- **Recherche niv. 0** : Cuirasse 6 d'armure, Fregate 2
- **Recherche niv. 5** : Cuirasse 7.5, Fregate 2.5
- **Recherche niv. 10** : Cuirasse 9, Fregate 3

L'armure monte doucement sans jamais devenir ecrasante. Les unites lourdes en profitent le plus (elles ont la plus haute armure de base), ce qui renforce leur identite de "tank".

---

#### 4. Reequilibrage des defenses

Les defenses faibles sont buffees pour que le joueur ait un vrai choix au lieu de spammer des lasers legers.

- **Lanceur de missiles** : degats 5->6, bouclier 6->8, coque 10->14
- **Laser leger** : inchange (reste la reference)
- **Laser lourd** : inchange
- **Canon electromagnetique** : degats 50->55, bouclier 30->35, coque 60->70
- **Artillerie a ions** : degats 80->90, bouclier 50->60, coque 120->140

---

#### 5. Bouclier planetaire renforce aux premiers niveaux

La capacite de base passe de 30 a 50. Le bouclier est maintenant utile des le niveau 1 au lieu de se faire percer par 5 chasseurs.

- **Niveau 1** : 30 -> 50
- **Niveau 3** : 51 -> 85
- **Niveau 5** : 86 -> 143
- **Niveau 8** : 189 -> 314

---

### Qui bat qui ? Les nouvelles relations de force

C'est le changement le plus important pour le gameplay.

```
                    Intercepteurs
                    (masse, pas cher)
                         |
                    domines par
                         |
                         v
  Cuirasses ---------> Croiseurs
  (puissance brute)    (anti-leger, polyvalent)
       |
  dominent par rafale
       |
       v
    Fregates
    (mid-tier, equilibrees)
```

**En mots simples :**
- Les **croiseurs** detruisent les essaims d'intercepteurs grace a la rafale x3
- Les **cuirasses** ecrasent les fregates grace a la rafale x3 vs moyen
- Les **intercepteurs en masse** restent les plus rentables par ressource tant que l'ennemi n'a pas de croiseurs
- Contre une flotte lourde, il faut **du volume** (beaucoup d'unites moins cheres) pour submerger les shields

**Le joueur doit maintenant se poser la question : "qu'est-ce que mon adversaire va construire ?"** C'est la piece manquante du systeme actuel.

---

### Ce qui ne change PAS

- Le deroulement general du combat (rounds simultanes, max 4, boucliers regeneres)
- Le systeme de debris (30% du cout des vaisseaux detruits)
- La reparation des defenses (70% de chance)
- Le pillage (33% des ressources non protegees)
- Les missions pirates (memes templates, memes recompenses)
- Le flagship et ses talents
- Les couts de construction de toutes les unites

---

### Questions pour les testeurs

1. **Lisibilite** : les deux batteries d'armes sont-elles claires quand vous regardez la fiche d'un vaisseau, ou est-ce trop d'information ?

2. **Perforation** : le concept de "tir bonus quand on vide un bouclier" est-il intuitif ? Preferez-vous l'ancien concept (tir bonus quand on detruit une cible) meme s'il se declenche moins souvent ?

3. **Rafale** : est-ce que les relations croiseur > intercepteur et cuirasse > fregate vous semblent naturelles ? Y a-t-il un matchup qui vous parait injuste ou contre-intuitif ?

4. **Coup critique** : 5% de chance, 150% de degats -- trop ? pas assez ? pas necessaire ?

5. **Cuirasse sans counter** : le cuirasse est l'unite la plus chere et n'a pas de predateur naturel. Est-ce acceptable (il faut juste plus de volume pour le battre) ou faudrait-il une 5e unite militaire qui le contrecarre ?

6. **Complexite generale** : est-ce que l'ensemble (batteries + perforation + rafale + critique) vous semble digeste, ou y a-t-il une mecanique de trop ?

7. **Defenses** : les buffs proposes sur le lanceur de missiles, le canon EM et l'artillerie a ions changent-ils votre facon de voir la defense planetaire ?

---

*Merci pour vos retours. Chaque point souleve sera pris en compte avant implementation.*
