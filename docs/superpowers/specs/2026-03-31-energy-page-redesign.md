# Page Énergie — Refonte complète

## Contexte

La page "Ressources" actuelle (`/resources`) affiche la production des 3 ressources et la gestion de l'énergie via des sliders HTML range (0-100%, pas de 10%). Les problèmes identifiés :

- **Visuel** : sliders basiques, pas dans l'univers du jeu
- **Interaction** : sliders difficiles à manipuler sur mobile
- **Fluidité** : les paliers de 10% cassent la granularité
- **Contexte** : aucune info sur la planète en cours

La page est renommée **"Énergie"** car c'est le sujet principal : gérer la production et la distribution d'énergie, avec visibilité sur l'impact ressources.

## Route

- Ancienne : `/resources`
- Nouvelle : `/energy`
- Mettre à jour la sidebar, le routeur, et les liens internes

## Structure de la page

Layout une seule colonne, max-width ~960px. Sections empilées verticalement :

1. Carte planète (header)
2. Onglets Flux / Tableau
3. Contenu de la vue active
4. Bilan énergétique
5. Impact sur les ressources

Les sections 4 et 5 sont communes aux deux vues.

## 1. Carte planète (header)

Toujours visible en haut de page. Affiche :

- **Icône planète** : rond avec gradient basé sur la classe de la planète
- **Nom** : typographie Orbitron (ex: KEPLER-442b)
- **Classe + température** : texte secondaire (ex: Classe M · Tempérée · 38°C)
- **Tags bonus/malus** : badges colorés (vert = bonus, rouge = malus) pour les modificateurs de production d'énergie et de ressources

Les bonus proviennent de `planetClassId` et `maxTemp` déjà disponibles dans l'API `resource.production`. Les bonus de classe planétaire sont résolus via `useGameConfig`.

## 2. Onglets Flux / Tableau

Deux boutons dans un conteneur pill (style existant dans les mockups). L'onglet actif a un fond teinté vert avec glow. Le contenu bascule sans rechargement (état React local).

## 3a. Vue Flux

De haut en bas :

### Sources centralisées
2 cartes côte à côte :
- **Centrale Solaire** : icône ☀️, nom, énergie produite (ex: 385), niveau
- **Satellites Solaires** : icône 🛰️, nom, énergie produite (ex: 135), nombre d'unités × production unitaire

Sur mobile : empilées verticalement.

### Hub central
Pastille arrondie affichant la production totale d'énergie (somme des sources).

### Lignes de flux animées
SVG avec branches partant du hub vers chaque consommateur. Animation CSS de particules descendantes (pulse/glow). L'opacité des lignes reflète le % d'allocation de chaque consommateur.

Sur mobile (grille 2 colonnes) : les branches SVG s'adaptent au layout.

### Cartes consommateurs
Grille 4 colonnes desktop, 2 colonnes mobile. Chaque carte :
- Icône + nom du bâtiment
- **Knob circulaire** (72px) : arc SVG coloré proportionnel au %, valeur au centre
- Barre de consommation d'énergie
- Production résultante (taux /h pour mines/synth, capacité /tour pour bouclier)
- Liseré de couleur en haut de la carte (minerai = orange, silicium = bleu, hydrogène = violet, bouclier = cyan)

Le bouclier n'apparaît que si son niveau > 0 (comportement existant conservé).

## 3b. Vue Tableau

Tableau structuré en sections :

### En-tête
Colonnes : Bâtiment | Alloc. | Énergie | Production | Stock

### Section Sources (fond teinté vert subtil)
- Centrale Solaire : badge "source", énergie en vert (+385)
- Satellites Solaires : badge "source", énergie en vert (+135)
- Colonnes Alloc./Production/Stock : "—"

### Section Consommateurs
Une ligne par bâtiment :
- **Bâtiment** : icône + nom + niveau
- **Alloc.** : mini-knob (44px), même interaction que les grands
- **Énergie** : consommation en rouge (ex: −112)
- **Production** : valeur colorée par ressource + unité
- **Stock** : quantité actuelle + mini-jauge + capacité max

Le bouclier affiche "—" dans la colonne Stock.

### Ligne Bilan
En bas du tableau : label "BILAN", surplus d'énergie, facteur de production, barre visuelle.

### Mobile
La colonne Stock est masquée. L'info reste accessible dans la section "Impact ressources" en dessous.

## 4. Bilan énergétique

Carte dédiée, commune aux deux vues :
- En-tête : "Bilan Énergétique" + valeurs produit/consommé
- Barre de progression : remplissage vert, ratio consommé/produit
- Facteur de production (100% si surplus, sinon `energyProduced / energyConsumed`)
- Surplus en texte
- **Alerte** si facteur < 100% : bandeau d'avertissement (comportement existant conservé)

## 5. Impact sur les ressources

3 cartes en grille (1 colonne sur mobile), communes aux deux vues :
- **Minerai** (orange), **Silicium** (bleu), **Hydrogène** (violet)
- Chaque carte : icône + nom, taux /h, jauge de stockage (quantité / capacité)
- Mise à jour temps réel via `useResourceCounter` (interpolation côté client existante)

## Interaction Knob

### Comportement
- **Desktop** : clic + drag vertical ou circulaire sur le knob
- **Mobile** : touch + drag vertical (haut = augmente, bas = diminue)
- **Tap** sur le knob : ouvre un input numérique en overlay pour saisie directe
- **Plage** : 0-100% en entiers, sans palier (chaque % est accessible)

### Feedback temps réel
- Pendant le drag : le flux SVG, le bilan, et les productions se mettent à jour instantanément (calcul côté client)
- Au relâchement : appel API debounced pour persister la nouvelle valeur
- Les mutations existantes `setProductionPercent` et `setShieldPercent` sont utilisées

## Changements backend

### Validation
- `resource.setProductionPercent` : supprimer la contrainte "divisible par 10". Accepter tout entier de 0 à 100.
- `resource.setShieldPercent` : idem.

### Schéma DB
Aucune migration nécessaire. Les colonnes `mineraiMinePercent`, `siliciumMinePercent`, `hydrogeneSynthPercent`, `shieldPercent` sont déjà des `smallint` (0-100).

### Query `resource.production`
Vérifier que les données nécessaires à la carte planète sont retournées (nom, classe, bonus). Ajouter si manquant.

### Pas de nouvel endpoint, pas de nouveau modèle de données.

## Composants à créer

- `EnergyPage` : page principale (remplace `Resources`)
- `PlanetCard` : carte d'identité de la planète
- `EnergyTabs` : conteneur onglets flux/tableau
- `FluxView` : vue flux complète (sources + hub + branches SVG + consommateurs)
- `TableView` : vue tableau complète
- `Knob` : composant réutilisable de contrôle circulaire (gère drag, touch, tap-to-edit)
- `MiniKnob` : variante compacte pour le tableau
- `EnergyBalance` : section bilan énergétique
- `ResourceImpact` : section impact sur les ressources

## Composants existants à supprimer

- `Resources.tsx` (l'ancienne page)

## Design tokens

Couleurs cohérentes avec le système existant :
- Minerai : `text-minerai` (orange/amber)
- Silicium : `text-silicium` (bleu)
- Hydrogène : `text-hydrogene` (violet)
- Énergie : `text-energy` (vert)
- Bouclier : `text-shield` / cyan
- Danger : rouge pour les consommations et alertes
