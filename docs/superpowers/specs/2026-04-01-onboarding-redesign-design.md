# Refonte de l'onboarding — Journal de bord & chapitres

## Contexte

L'onboarding actuel est une sequence de 16 quetes lineaires avec des textes basiques et des recompenses en ressources. Les joueurs se sentent perdus, il n'y a pas de narration ni de guidage visuel. Le systeme auto-complete les quetes deja satisfaites, ce qui fait sauter des etapes.

Cette refonte transforme l'onboarding en une experience narrative structuree en chapitres, avec un journal de bord immersif, des objectifs clairs avec progression visible, un guidage visuel (surbrillance), et une validation manuelle pour chaque quete.

## Structure en chapitres

### 4 chapitres, 23 quetes total

**Chapitre 1 : L'atterrissage** (quetes 1-5)
Intro : *"Le vaisseau est en miettes. Les systemes de survie tiennent a peine. Les scanners detectent une planete habitable a proximite. C'est notre seule chance."*

| # | ID | Titre | Journal | Objectif | Condition | Target | Value | Recompense |
|---|---|-------|---------|----------|-----------|--------|-------|------------|
| 1 | quest_1 | Signal de vie | "Jour 1 — L'impact a ete violent. La coque est fissuree de partout mais les capteurs detectent du minerai brut a quelques centaines de metres. Il faut commencer a extraire si on veut reparer quoi que ce soit." | Construire la Mine de minerai Nv.1 | building_level | mineraiMine | 1 | 100 Fe |
| 2 | quest_2 | Composants critiques | "Jour 3 — Le minerai ne suffira pas. Les circuits de l'ordinateur de bord sont grilles. Il nous faut du silicium pour fabriquer les composants de base." | Construire la Mine de silicium Nv.1 | building_level | siliciumMine | 1 | 100 Si |
| 3 | quest_3 | Courant vital | "Jour 5 — Les batteries sont presque a plat. Sans energie, les mines s'arreteront. J'ai repere un emplacement ideal pour une centrale solaire." | Construire la Centrale solaire Nv.1 | building_level | solarPlant | 1 | 100 Fe, 75 Si |
| 4 | quest_4 | Reserves | "Jour 8 — La production tourne, mais le minerai s'accumule a meme le sol. On perd des ressources a chaque tempete. Il faut un hangar digne de ce nom." | Construire le Hangar minerai Nv.2 | building_level | storageMinerai | 2 | 150 Fe, 75 Si |
| 5 | quest_5 | Cadence | "Jour 12 — La colonie prend forme. Mais a ce rythme, on mettra des mois a reparer le vaisseau. Il faut augmenter la cadence d'extraction." | Ameliorer la Mine de minerai Nv.3 | building_level | mineraiMine | 3 | 200 Fe, 100 Si |

Recompense chapitre 1 : 350 Fe, 200 Si, 75 H

---

**Chapitre 2 : La colonie** (quetes 6-10)
Intro : *"Les fondations sont la. On ne survivra pas longtemps en se contentant de creuser. Il est temps de penser plus grand — automatisation, recherche, construction."*

| # | ID | Titre | Journal | Objectif | Condition | Target | Value | Recompense |
|---|---|-------|---------|----------|-----------|--------|-------|------------|
| 6 | quest_6 | Mains mecaniques | "Jour 18 — Mes bras n'en peuvent plus. L'ingenieure a dessine les plans d'un systeme robotique. Ca devrait accelerer toutes les constructions futures." | Construire l'Usine de robots Nv.1 | building_level | robotics | 1 | 275 Fe, 175 Si, 100 H |
| 7 | quest_7 | Savoirs perdus | "Jour 22 — On a trouve des fragments de donnees dans l'epave. Avec un laboratoire, on pourrait decoder ces technologies et les adapter." | Construire le Laboratoire de recherche Nv.1 | building_level | researchLab | 1 | 175 Fe, 300 Si, 150 H |
| 8 | quest_8 | Rendement | "Jour 28 — Le labo est operationnel. Premiere priorite : optimiser notre consommation energetique. Chaque watt compte." | Rechercher Technologie Energie Nv.1 | research_level | energyTech | 1 | 150 Fe, 275 Si, 150 H |
| 9 | quest_9 | Propulsion | "Jour 35 — Les donnees de l'epave contiennent des schemas de moteurs a combustion. Si on les reconstitue, on pourra peut-etre envoyer quelque chose en orbite." | Rechercher Combustion Nv.1 | research_level | combustion | 1 | 350 Fe, 175 Si, 200 H |
| 10 | quest_10 | Premier chantier | "Jour 42 — Le moment est venu. Avec les moteurs et les materiaux, on peut construire un chantier spatial. Notre premier pas vers les etoiles." | Construire le Chantier spatial Nv.1 | building_level | shipyard | 1 | 400 Fe, 250 Si, 150 H |

Recompense chapitre 2 : 350 Fe, 350 Si, 200 H, 5 Exilium

---

**Chapitre 3 : L'espace** (quetes 11-17)
Intro : *"Le chantier spatial est operationnel. L'espace est immense, dangereux, et plein de debris. Mais c'est la que se trouvent les ressources dont on a besoin pour grandir."*

| # | ID | Titre | Journal | Objectif | Condition | Target | Value | Recompense |
|---|---|-------|---------|----------|-----------|--------|-------|------------|
| 11 | quest_11 | Bapteme | "Jour 48 — L'equipe a restaure une vieille coque de reconnaissance trouvee dans l'epave. C'est rudimentaire, mais c'est NOTRE vaisseau amiral. Il merite un nom." | Nommer le vaisseau amiral | flagship_named | any | 1 | 500 Fe, 275 Si, 150 H |
| 12 | quest_12 | Cargaison perdue | "Jour 52 — Les scanners ont detecte des conteneurs de fret derives en [{galaxy}:{system}:8]. Ca ressemble a de la cargaison abandonnee. Si on envoie une equipe, on pourrait recuperer le tout." | Envoyer une flotte de transport | fleet_return | any | 1 | 625 Fe, 350 Si, 175 H |
| 13 | quest_13 | Chantier avance | "Jour 58 — Le premier vol a revele l'ampleur des debris en orbite. Pour en tirer profit, il faut agrandir le chantier et construire des vaisseaux specialises." | Ameliorer le Chantier spatial Nv.4 | building_level | shipyard | 4 | 700 Fe, 400 Si, 150 H |
| 14 | quest_14 | Chasseur d'epaves | "Jour 63 — Les plans du recuperateur sont prets. Un petit vaisseau pas cher, parfait pour aller gratter les champs de debris avant qu'ils ne se dispersent." | Construire 1 Recuperateur | ship_count | explorer | 1 | 825 Fe, 500 Si, 175 H |
| 15 | quest_15 | Premier prospecteur | "Jour 68 — Les debris, c'est bien. Mais les ceintures d'asteroides, c'est mieux. Un prospecteur pourrait en extraire des tonnes de ressources brutes." | Construire 1 Prospecteur | ship_count | prospector | 1 | 950 Fe, 550 Si, 200 H |
| 16 | quest_16 | Oreilles ouvertes | "Jour 72 — On capte de plus en plus de signaux en provenance du systeme. Un centre de missions nous permettrait d'analyser ces donnees et de localiser les opportunites — gisements, epaves, anomalies." | Construire le Centre de missions Nv.1 | building_level | missionCenter | 1 | 1050 Fe, 550 Si, 200 H |
| 17 | quest_17 | Premiere recolte | "Jour 75 — Le prospecteur est pret. Les scanners ont repere un gisement prometteur. C'est l'heure d'envoyer notre premiere mission de minage." | Completer une mission de minage | mission_complete | mine | 1 | 1100 Fe, 625 Si, 250 H |

Recompense chapitre 3 : 2 Recuperateurs, 1 Prospecteur, 10 Exilium

---

**Chapitre 4 : La menace** (quetes 18-23)
Intro : *"Jour 80 — Les capteurs longue portee ont capte des signaux non identifies. Des vaisseaux, nombreux, en patrouille. On n'est pas seuls ici. Et ils n'ont pas l'air amicaux."*

| # | ID | Titre | Journal | Objectif | Condition | Target | Value | Recompense |
|---|---|-------|---------|----------|-----------|--------|-------|------------|
| 18 | quest_18 | Etat d'alerte | "Jour 82 — J'ai convoque un conseil d'urgence. On a besoin d'un centre de commandement pour coordonner nos defenses. C'est la priorite absolue." | Construire le Centre de commandement Nv.1 | building_level | commandCenter | 1 | 1250 Fe, 700 Si, 275 H |
| 19 | quest_19 | Premiere ligne | "Jour 86 — Le centre de commandement est operationnel. Les ingenieurs ont finalise les plans des intercepteurs. Rapides, maniables, pas chers — exactement ce qu'il nous faut." | Construire 3 Intercepteurs | ship_count | interceptor | 3 | 1400 Fe, 825 Si, 275 H |
| 20 | quest_20 | Puissance de feu | "Jour 90 — Les intercepteurs sont en vol d'essai. Mais leurs armes sont trop faibles. La recherche en armement pourrait changer la donne." | Rechercher Armement Nv.1 | research_level | weapons | 1 | 1050 Fe, 1050 Si, 350 H |
| 21 | quest_21 | Blindage | "Jour 95 — Les tirs de nos intercepteurs sont plus precis, mais ils ne tiennent pas les impacts. Il faut renforcer les boucliers." | Rechercher Bouclier Nv.1 | research_level | shielding | 1 | 1050 Fe, 1050 Si, 350 H |
| 22 | quest_22 | Forteresse | "Jour 100 — On ne peut pas tout miser sur la flotte. Des tourelles au sol protegeraient la colonie meme en notre absence." | Construire 4 Artilleries laser legeres | defense_count | laserTurret | 4 | 1400 Fe, 700 Si, 350 H |
| 23 | quest_23 | Bapteme du feu | "Jour 105 — Un repaire pirate a ete localise. C'est le moment de tester notre preparation. Si on survit a ca, on survivra a tout." | Completer une mission pirate | mission_complete | pirate | 1 | 1750 Fe, 1050 Si, 500 H |

Recompense chapitre 4 : 5 Intercepteurs, 15 Exilium

## Mecanique de validation manuelle

### Probleme actuel

Le systeme auto-complete les quetes deja satisfaites via une boucle `while` dans `checkCompletion()`. Un joueur qui a deja mine Nv.3 avant de commencer le tutorial verrait les quetes 1-5 defiler instantanement, perdant toute la narration.

### Nouveau comportement

1. Quand une condition est remplie, la quete passe en etat **"pending completion"** (completee mais en attente de validation joueur)
2. Le panneau affiche : barre de progression complete (vert) + bouton **"Suivant"**
3. Le joueur clique "Suivant" → le frontend appelle `tutorial.completeQuest`
4. Le backend distribue la recompense, avance a la quete suivante, et verifie si la nouvelle quete est aussi deja satisfaite → si oui, elle repasse en "pending" immediatement
5. Le joueur doit cliquer "Suivant" pour chaque quete, meme si deja satisfaite

### Implementation

**Nouveau champ** dans `tutorialProgress` : `pendingCompletion: boolean` (default false)

**Nouveau endpoint** : `tutorial.completeQuest` (mutation protegee)
- Verifie que `pendingCompletion` est true
- Distribue la recompense de la quete
- Si c'est la derniere quete du chapitre, distribue aussi la recompense chapitre
- Avance `currentQuestId` a la quete suivante (ou marque `isComplete`)
- Re-evalue la nouvelle quete : si deja satisfaite, set `pendingCompletion = true`
- Retourne le nouvel etat

**Modification de `checkAndComplete`** : au lieu de completer la quete, set `pendingCompletion = true` et stop (pas de boucle).

**Modification de `checkCompletion`** (auto-check au chargement) : verifie uniquement la quete courante. Si satisfaite, set `pendingCompletion = true`. Pas de boucle while.

## Guidage visuel — surbrillance

### Principe

Quand la quete en cours cible un element sur une page (batiment, recherche, vaisseau, defense), cet element est mis en surbrillance avec un contour anime ambre/or.

### Implementation

**Hook `useTutorialHighlight(itemId: string)`** : retourne `true` si l'item correspond a la cible de la quete courante.

Le hook lit les donnees du tutorial (via `trpc.tutorial.getCurrent`) et compare :
- `conditionType === 'building_level'` et `conditionTarget === itemId` → highlight sur la page Batiments
- `conditionType === 'research_level'` et `conditionTarget === itemId` → highlight sur la page Recherche
- `conditionType === 'ship_count'` et `conditionTarget === itemId` → highlight sur la page Chantier
- `conditionType === 'defense_count'` et `conditionTarget === itemId` → highlight sur la page Defense

**Style** : `border-color: amber-500, box-shadow: glow ambre, animation: pulse 2s` + badge "Objectif" en haut a droite de la card.

**Pages concernees** : Buildings.tsx, Research.tsx, Shipyard.tsx, CommandCenter.tsx, Defense.tsx. Chaque card recoit un `cn()` conditionnel base sur le hook.

## Panneau tutorial redesigne

### Etat minimise

Pastille flottante en bas a droite avec icone etoile + numero du chapitre. Clic pour ouvrir.

### Etat ouvert

1. **Header** : "Chapitre N : Titre" + barre de progression chapitre (X/Y)
2. **Journal** : texte narratif en italique, borde a gauche par une ligne ambre
3. **Objectif** : encadre avec icone + nom de l'element + barre de progression (current/target)
4. **Recompenses** : icones ressources avec montants
5. **Lien action** : "Aller aux Batiments →" (quand applicable, redirige vers la page cible)
6. **Bouton "Suivant"** : visible uniquement quand `pendingCompletion === true`. Remplace le lien action.

### Intro de chapitre

Quand le joueur entre dans un nouveau chapitre, le panneau affiche le texte d'intro du chapitre avant la premiere quete. Bouton "Commencer" pour passer a la premiere quete.

### Completion de chapitre

Ecran special dans le panneau : "Chapitre termine !" avec recap des recompenses (ressources + unites + Exilium). Bouton "Chapitre suivant" pour continuer.

### Completion du tutorial

Quand la quete 23 est validee et le chapitre 4 termine, le panneau affiche un message final et disparait. `isComplete = true`.

## Backend — modifications

### Nouvelles tables / modifications

**Table `tutorialChapters`** (nouvelle, seedee) :
- `id` : string (ex: "chapter_1")
- `title` : string (ex: "L'atterrissage")
- `journalIntro` : text (intro narrative du chapitre)
- `order` : smallint
- `rewardMinerai`, `rewardSilicium`, `rewardHydrogene` : integer
- `rewardExilium` : integer
- `rewardUnits` : JSONB (ex: `[{ "shipId": "explorer", "quantity": 2 }]`)

**Table `tutorialQuestDefinitions`** (modifiee) :
- Ajout : `chapterId` (string, FK vers tutorialChapters)
- Ajout : `journalEntry` (text, narration journal de bord)
- Ajout : `objectiveLabel` (string, ex: "Mine de minerai")
- Les champs existants restent : id, title, description, conditionType, conditionTarget, conditionValue, rewardMinerai, rewardSilicium, rewardHydrogene, sortOrder

**Table `tutorialProgress`** (modifiee) :
- Ajout : `pendingCompletion` (boolean, default false)

### Nouveau type de condition : `defense_count`

Fonctionne comme `ship_count` mais query `planetDefenses` au lieu de `planetShips`. Utilise le `countColumn` de la defense dans la config.

### Hook recherche manquant (bugfix)

Le worker `build-completion` doit appeler `tutorialService.checkAndComplete()` pour les completions de type `research`. Actuellement absent → les quetes 8, 9, 20, 21 ne se completent pas automatiquement.

### Endpoints

- `tutorial.getCurrent` (existant, modifie) : retourne en plus `pendingCompletion`, `chapter` (id, title, intro, progress), `currentProgress` (valeur actuelle pour la barre), `targetValue`
- `tutorial.completeQuest` (nouveau, mutation) : valide la quete pending, distribue recompenses, avance

### Seed data

Remplacer les 16 quetes actuelles par les 23 nouvelles dans `seed-game-config.ts`. Ajouter les 4 chapitres.

### Migration

Les joueurs existants qui ont un `currentQuestId` parmi les anciens IDs (quest_1 a quest_16) doivent etre mappes vers les nouveaux IDs (meme IDs quest_1 a quest_16, mais quest_17+ sont nouveaux). Les joueurs deja `isComplete = true` ne sont pas affectes. Les joueurs en cours gardent leur progression — les quetes 1-16 ont les memes IDs, seul le contenu change.

## Frontend — modifications

### Fichiers concernes

| Fichier | Modification |
|---------|-------------|
| `components/tutorial/TutorialPanel.tsx` | Refonte complete : chapitres, journal, objectif avec progression, bouton Suivant, intro chapitre, completion chapitre |
| `pages/Buildings.tsx` | Ajouter highlight conditionnel via `useTutorialHighlight` |
| `pages/Research.tsx` | Idem |
| `pages/Shipyard.tsx` | Idem |
| `pages/CommandCenter.tsx` | Idem |
| `pages/Defense.tsx` | Idem |
| `hooks/useTutorialHighlight.ts` | Nouveau hook |

### Invalidation du cache

`tutorial.getCurrent` doit etre invalide apres :
- `tutorial.completeQuest` (evidemment)
- `building.upgrade` / `building.cancel`
- `research.start` / `research.cancel`
- `shipyard.buildShip` / `shipyard.buildDefense`
- `fleet.send` / `fleet.recall`
- `flagship.create`

Cela permet a la barre de progression (current/target) de se mettre a jour en temps reel.

## Scope

**Inclus** :
- 4 chapitres avec 23 quetes, narration journal de bord
- Recompenses : ressources + unites + Exilium
- Validation manuelle (bouton Suivant)
- Guidage visuel (surbrillance ambre sur les cards cibles)
- Panneau tutorial redesigne avec progression, journal, objectif
- Nouveau type de condition `defense_count`
- Fix du hook recherche manquant
- Intros et completions de chapitre

**Exclu** :
- Tutoriels interactifs contextuels (phase 2)
- Voix off / audio
- Cinematiques
- Achievements / badges
