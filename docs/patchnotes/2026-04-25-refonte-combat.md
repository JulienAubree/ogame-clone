# Refonte du systeme de combat

## Une nouvelle facon de penser vos flottes

Le systeme de combat est entierement repense. Fini le "le plus gros portefeuille gagne" : chaque type de vaisseau a maintenant un role precis, des forces et des faiblesses. La composition de flotte devient un vrai choix strategique.

---

## Armement multi-batteries

Les vaisseaux militaires possedent desormais **une ou deux batteries d'armes**, chacune avec son propre profil :

- **Canon principal** : gros degats, cible une categorie precise (Leger / Moyen / Lourd)
- **Batterie secondaire** : degats plus faibles mais plus de tirs, vise une autre categorie

Chaque batterie tire en parallele dans le round. Plus besoin de choisir une priorite de cible — chaque arme a sa cible naturelle.

### Profils des vaisseaux militaires

| Vaisseau | Canon principal | Batterie secondaire |
|---|---|---|
| **Intercepteur** | 4 dmg ×3 vs Leger + Enchainement | — |
| **Fregate** | 12 dmg ×1 vs Moyen | 6 dmg ×2 vs Leger |
| **Croiseur** | 35 dmg ×1 vs Lourd | 6 dmg ×2 vs Leger + Rafale 6 |
| **Cuirasse** | 50 dmg ×1 vs Lourd | 10 dmg ×2 vs Moyen + Rafale 4 |

### Profils des defenses planetaires

| Defense | Armement |
|---|---|
| Lanceur de missiles | 6 dmg ×2 vs Leger + Enchainement |
| Laser leger | 7 dmg ×3 vs Leger + Enchainement |
| Laser lourd | 15 dmg ×2 vs Moyen |
| Canon electromagnetique | 55 dmg ×1 vs Lourd |
| Artillerie a ions | 90 dmg ×1 vs Lourd |

---

## Nouveaux traits de combat

### Rafale N Categorie

Quand une batterie tire sur sa categorie de predilection, elle effectue **N coups supplementaires** (en plus de ses tirs de base).

**Exemple** : la batterie secondaire du croiseur a `Rafale 6 Leger`. Elle tire normalement 2 coups, mais quand sa cible est un vaisseau leger, elle tire **8 coups** (2 + 6 bonus).

C'est entierement deterministe : pas de RNG, pas de chaine. Le bonus s'applique uniquement quand la cible matche la categorie.

### Enchainement

Quand un tir detruit sa cible, l'unite tire **un coup bonus** sur une autre unite de la meme categorie. Maximum un bonus par tir de base — pas de chaine infinie.

C'est l'identite des unites legeres : intercepteur, lanceur de missiles, laser leger. Elles excellent a nettoyer les essaims de cibles fragiles.

### Affichage en jeu

Dans la fiche de chaque vaisseau, les batteries et leurs traits sont affiches avec des badges colores. Survolez un trait avec la souris pour afficher un popover explicatif avec exemple concret.

---

## Relations de counter-play

La pyramide de force est claire :

```
Intercepteurs ──domines par──> Croiseurs (Rafale 6 Leger)
Fregates      ──dominees par──> Cuirasses (Rafale 4 Moyen)
Cuirasses     ──submerges par──> Essaims d'intercepteurs
```

Le joueur qui spam un seul type d'unite est punissable. La diversification est recompensee. Une flotte qui mixe intercepteurs + frégates + croiseurs est plus solide qu'une mono-composition de meme valeur.

---

## Recherche Protection ameliore aussi le blindage

La recherche **Technologie Protection** (et son extension **Blindage composite** sur Laboratoire Aride) augmentait deja la coque. Elle augmente desormais aussi le **blindage** (la reduction plate de degats).

Concretement, vos vaisseaux deviennent plus resistants aux tirs faibles. Un cuirasse au niveau 10 de Protection a 12 d'armure au lieu de 6 — il bloque deux fois plus de degats par tir percant.

L'effet est visible dans la fiche de chaque vaisseau et defense : le blindage affiche son bonus actif comme la coque et le bouclier.

---

## Bouclier planetaire renforce

### Capacite de base augmentee

La capacite du bouclier planetaire au niveau 1 passe de **30 a 50**. Aux niveaux superieurs, la progression suit le meme facteur de croissance, ce qui rend le bouclier utile des l'early-game.

| Niveau | Capacite avant | Capacite apres |
|---|---:|---:|
| 1 | 30 | **50** |
| 3 | 51 | **85** |
| 5 | 86 | **143** |
| 10 | 319 | **530** |

### Bonus de recherche applique

Le bouclier planetaire beneficie maintenant du **multiplicateur de recherche Blindage** comme tous les autres boucliers. Un defenseur avec recherche Blindage 5 (+50%) voit la capacite effective de son bouclier augmenter d'autant.

La capacite effective est affichee directement dans le bandeau du bouclier sur la page Defense, avec l'indicateur de bonus a cote.

### Description revue

La fiche du batiment mentionne explicitement que la recherche Blindage augmente la capacite en combat — fini les surprises sur la valeur reelle.

---

## Defenses planetaires rebalancees

Les defenses lourdes etaient sous-utilisees. Leurs stats ont ete ajustees pour les rendre comparables aux defenses legeres en termes de DPS par credit :

| Defense | Avant | Apres |
|---|---|---|
| Lanceur de missiles | 5 dmg ×2, 6 shield, 10 hull | **6 dmg ×2, 8 shield, 14 hull** |
| Canon electromagnetique | 50 dmg, 30 shield, 60 hull | **55 dmg, 35 shield, 70 hull** |
| Artillerie a ions | 80 dmg, 50 shield, 120 hull | **90 dmg, 60 shield, 140 hull** |

Le laser leger et le laser lourd restent inchanges en stats — ils etaient deja correctement positionnes.

---

## Equilibrage post-simulation

Apres 200 simulations × 24 scenarios, on a constate que la defense etait sur-puissante (meta 80/20 defense/attaque). Plusieurs ajustements remetent les pendules a l'heure :

### Config combat

| Parametre | Avant | Apres |
|---|---:|---:|
| Taux de reparation des defenses post-combat | 70% | **50%** |
| Nombre de rounds maximum | 4 | **6** |
| Champ de debris | 30% | **35%** |

Le defenseur paie maintenant 50% de ses defenses detruites au lieu de 30% — l'anti-harcelement reste preserve mais l'invincibilite economique disparait. Les combats de flottes equivalentes se concluent au lieu de finir en match nul.

### Stats vaisseaux militaires

| Vaisseau | Stat | Avant | Apres |
|---|---|---:|---:|
| Intercepteur | bouclier | 8 | **6** |
| Croiseur | bouclier | 28 | **32** |
| Croiseur | bat. sec. dmg | 5 | **6** |
| Cuirasse | coque | 100 | **120** |

L'intercepteur perd un peu de survie pour casser l'invincibilite du spam. Le croiseur gagne en resistance et en DPS contre les legers (Rafale x6 sur 6 dmg = 48 DPS vs leger). Le cuirasse devient un vrai tank avec +20% de coque.

### Coûts defenses (nerf cost-efficiency)

| Defense | Coût avant | Coût apres |
|---|---:|---:|
| Lanceur de missiles | 2 000 | **3 000** |
| Laser leger | 2 000 | **3 000** |
| Laser lourd | 8 000 | **7 500** |
| Canon EM | 37 000 | **30 000** |
| Artillerie a ions | 130 000 | **97 500** |

Les defenses legeres etaient 2-3× plus rentables au DPS/credit que les vaisseaux equivalents — d'ou la dominance defensive. Leur cout est revalue pour rester accessible mais sans ecraser la concurrence.

---

## Construction acceleree et plus accessible

Les temps de construction late-game etaient un blocker (24h pour un cuirasse, 40h pour une artillerie a ions). La majorite des coûts d'unites ont ete reduits de 25%, et la formule de temps a ete revisee.

### Coûts vaisseaux (-25%)

| Vaisseau | Coût avant | Coût apres |
|---|---:|---:|
| Intercepteur | 4 000 | **3 000** |
| Fregate | 10 000 | **7 500** |
| Croiseur | 29 000 | **21 750** |
| Cuirasse | 60 000 | **45 000** |
| Petit transporteur | 4 000 | **3 000** |
| Grand transporteur | 12 000 | **9 000** |
| Recycleur | 18 000 | **13 500** |
| Vaisseau de colonisation | 40 000 | **30 000** |
| Sonde d'espionnage | 1 000 | **750** |

Les defenses legeres restent au prix post-rebalance pour ne pas annuler le nerf cost-efficiency.

### Nouveaux temps de construction

Le multiplicateur de temps global a ete augmente. Resultat : ~58% de temps en moins pour la majorite des unites.

| Unite | Temps avant | Temps apres |
|---|---:|---:|
| Intercepteur | 1h36 | **40 min** |
| Fregate | 4h00 | **1h40** |
| Croiseur | 10h48 | **4h30** |
| Cuirasse | 24h00 | **10h00** |
| Lanceur de missiles | 1h12 | **40 min** |
| Laser leger | 1h12 | **40 min** |
| Canon electromagnetique | 15h12 | **6h20** |
| Artillerie a ions | 40h00 | **16h40** |

Construction de flottes beaucoup plus fluide. La reconstruction post-combat n'est plus un parcours d'obstacles.

---

## Disparition de la priorite de cible joueur

Le toggle "Priorité de cible" sur la page Flotte a ete retire. Avec le systeme multi-batteries, chaque arme a deja sa cible naturelle — il n'y a plus rien a choisir.

Si vous aviez l'habitude de selectionner "Lourd" pour cibler les vaisseaux ennemis specifiques, sachez que vos batteries principales ciblent automatiquement les vaisseaux lourds en priorite (canon principal du croiseur et du cuirasse).

---

## Guide de combat actualise

La page **Guide de combat** a ete reecrite pour refleter le nouveau systeme :
- Section "Stats d'un vaisseau" reformulee avec les batteries
- Nouvelle section **"Traits de combat"** avec badges Rafale/Enchainement et exemples
- Phrases de counter-play pour vous aider a composer vos flottes
- Formule du Facteur de Puissance simplifiee (DPS × durabilite)

---

## En resume

| Avant | Apres |
|---|---|
| Une seule arme par vaisseau | Une ou deux batteries selon le vaisseau |
| Une seule cible par tir | Chaque batterie cible sa categorie naturelle |
| Combats previsibles | Counter-play actif (croiseur > intercepteur, cuirasse > fregate) |
| Defense quasi-invincible economiquement | Defense forte mais payante en cas de breche |
| 24h pour construire un cuirasse | 10h pour construire un cuirasse |
| Bouclier planetaire faible et statique | Bouclier renforce et boostable par recherche |

La fenetre d'attaque rentable s'ouvre a partir de **3× le budget defensif** au lieu de 13× auparavant. La defense reste avantageuse — c'est l'esprit du jeu — mais elle n'est plus une forteresse imprenable.

A vous de jouer.
