# Patch Note — Biomes, Exploration & Marche de Rapports

## Exploration planetaire

### Brouillard de guerre
Chaque position dans un systeme solaire est masquee par defaut. Vous devez envoyer des **vaisseaux d'exploration** pour decouvrir ce qui s'y cache : type de planete, biomes et leurs effets.

Les positions non-decouvertes apparaissent en gris sur la carte orbitale. Une fois explorees, elles revelent leur type de planete et les biomes decouverts s'affichent sous forme de **points colores par rarete** dans le bandeau lateral.

### Decouverte progressive des biomes
L'exploration est probabiliste : chaque mission a une chance de reveler un ou plusieurs biomes. Les biomes rares et legendaires sont plus difficiles a decouvrir. Ameliorez votre **recherche Exploration planetaire** et envoyez plus de vaisseaux pour augmenter vos chances.

Quand une position est partiellement exploree, le panneau de detail affiche les biomes deja decouverts et un indicateur **"Exploration incomplete"**. Quand tous les biomes sont reveles : **"Tous les biomes ont ete reveles"**.

### Rapport d'exploration enrichi
Apres chaque mission d'exploration, un rapport detaille est genere par votre equipe scientifique. Il comprend :
- Un **visuel de la planete** exploree
- Un **rapport scientifique** dont le ton s'adapte aux decouvertes (sans resultat, resultats preliminaires, prometteurs, exceptionnels, cartographie complete)
- La **liste des biomes decouverts** avec rarete et effets
- Des **boutons d'action** : Coloniser, Explorer a nouveau, Vendre le rapport

---

## Biomes actifs a la colonisation

### Nouvelle regle
Quand vous colonisez une planete, **seuls les biomes que vous avez decouverts via l'exploration** deviennent actifs. Les biomes non-decouverts sont presents mais **inactifs** : ils n'appliquent aucun bonus de production et sont invisibles dans l'interface.

**Exemple** : une planete a 4 biomes. Vous en avez decouvert 2 avant de coloniser. Votre planete n'aura que 2 biomes actifs. Les 2 autres existent en base mais ne produisent rien.

### Impact strategique
Cela rend l'exploration **indispensable avant la colonisation**. Un joueur qui colonise a l'aveugle perd potentiellement des bonus importants. Prenez le temps d'explorer — ou achetez un rapport d'exploration a un autre joueur.

### Planetes existantes
Les planetes deja colonisees ne sont pas affectees. Tous leurs biomes restent actifs. Cette regle ne s'applique qu'aux **nouvelles colonisations**.

---

## Marche de rapports d'exploration

### Concept
Les joueurs qui investissent dans l'exploration peuvent desormais **monetiser leurs decouvertes**. Un nouveau type de marchandise arrive sur le Marche Galactique : les **rapports d'exploration**.

Un rapport d'exploration contient toutes les informations qu'un joueur a decouvertes sur une position : type de planete, biomes et leurs effets. L'acheteur recoit instantanement ces connaissances sans avoir a envoyer ses propres explorateurs.

### Creer un rapport vendable
Depuis la **vue galaxie**, selectionnez une position que vous avez exploree et cliquez sur **"Vendre le rapport"**. Le rapport est cree instantanement (gratuit) et vous etes redirige vers le marche pour fixer votre prix.

Conditions :
- Vous devez avoir **explore la position vous-meme** (les donnees acquises via un rapport achete ne peuvent pas etre revendues)
- La position ne doit **pas etre deja colonisee**
- Vous ne pouvez avoir qu'**un seul rapport actif par position**

Le bouton "Vendre le rapport" est egalement disponible dans les **rapports d'exploration** de la page Rapports.

### Le Marche Galactique redesigne
Le marche a ete restructure avec une **navigation par sections** :

**Desktop** : une barre laterale a gauche avec deux groupes clairement separes :
- **Ressources** (accent orange) : Acheter / Vendre / Mes offres
- **Rapports** (accent violet) : Acheter / Mes rapports

**Mobile** : deux lignes d'onglets — un selecteur de section (Ressources / Rapports) et des sous-onglets contextuels.

### Acheter un rapport
Dans l'onglet **Rapports > Acheter**, parcourez les offres disponibles. Chaque rapport affiche :
- Les coordonnees partielles **[g:s:?]** (la position exacte est revelee apres achat)
- Le **type de planete** avec un visuel
- Le **nombre de biomes** contenus
- Un **badge de rarete maximale** (commun a legendaire)
- Un indicateur **"Complet"** ou **"Partiel"**
- Le nombre de **biomes que vous connaissez deja** pour cette position

L'achat fonctionne comme les ressources : vous envoyez un **cargo avec le paiement** vers la planete du vendeur. A l'arrivee de la flotte, les biomes sont transferes dans vos connaissances et un **rapport de commerce** est genere.

### Gestion de vos rapports
L'onglet **Rapports > Mes rapports** affiche vos rapports en inventaire, en vente et vendus. Chaque carte est **cliquable** pour voir le detail des biomes et leurs effets — avec un systeme d'**etoiles de valeur** (1 a 5) base sur la rarete moyenne.

Quand un acheteur reserve votre rapport (flotte en route), la vente est **verrouillee** : ni vous ni l'acheteur ne pouvez annuler.

### Notifications
Toutes les etapes sont couvertes par le systeme de notification :
- **Offre reservee** : un acheteur a ete trouve, cargo en route
- **Rapport vendu** : paiement recu
- **Rapport achete** : biomes reveles

Ces notifications apparaissent en **toast temps reel** et dans l'**historique de la cloche** (persistantes).

### Rapport de commerce
Quand vous achetez un rapport, un **rapport de commerce** est genere dans votre page Rapports. Il affiche :
- Le visuel de la planete acquise
- Un resume de la transaction (vendeur, nombre de biomes)
- La liste complete des biomes obtenus dans une grille coloree par rarete
- Les coordonnees cliquables pour acceder directement a la position dans la vue galaxie

---

## Ameliorations de la vue galaxie

### Carte orbitale
- Les orbites sont desormais des **cercles complets** (plus de demi-arcs)
- Le **selecteur de galaxie/systeme** est integre directement dans la carte (overlay en haut a gauche)
- Plus de cadre "Systeme solaire" — la vue prend tout l'espace disponible
- Le **zoom minimum est fixe a 1x** : impossible de dezoomer au-dela de la vue globale du systeme
- Le zoom avant (jusqu'a 4x) et le deplacement par glisser-deposer restent disponibles

### Bandeau lateral (ribbon)
- Les positions vides explorees affichent des **points colores par rarete** des biomes decouverts (au lieu de "Vide")
- Un point dore = biome legendaire, bleu = rare, etc. — reperage visuel instantane des positions interessantes

### Panneau de detail
- **Image reelle** des planetes colonisees (photo WebP du type de planete)
- **Champs de debris** affiches dans une carte bordee orange avec l'icone SVG animee
- **Boutons d'action enrichis** : Espionner, Attaquer, Recycler, Message, Coloniser, Explorer — tous avec un **etat desactive** clair (grise + popover explicatif au survol) quand le vaisseau requis n'est pas disponible
- Le bouton **"Vendre le rapport"** se grise automatiquement avec un message precis :
  - *"Position deja colonisee"*
  - *"Un rapport pour cette position est deja en vente sur le marche"*
  - *"Vous devez avoir explore cette position vous-meme"*

### Tooltip au survol
- Les planetes sur la carte affichent un **popover au survol** avec le nom, le proprietaire et le visuel — qui ne zoome pas avec la carte

### Coordonnees cliquables
Dans tous les rapports (exploration, commerce, transport, recyclage, espionnage, combat), les coordonnees **[g:s:p]** sont desormais des **liens cliquables** qui vous emmenent directement a la position dans la vue galaxie.

---

## Rapports de mission

### Nouveau : Rapport de transport
Les missions de transport generent desormais un **rapport dedie** avec :
- Un bandeau vert "Livraison effectuee" (ou rouge en cas d'echec)
- Des **barres de progression colorees** par ressource (orange minerai, vert silicium, bleu hydrogene)
- Le total livre

### Icones SVG dans la liste des rapports
Les emojis ont ete remplaces par les **icones SVG du jeu**, colorees selon la configuration de chaque type de mission.

### Filtres ameliores
Deux nouveaux filtres sur la page Rapports :
- **Commerce** : rapports d'achat de rapports d'exploration
- **Transport** : rapports de livraison de ressources
