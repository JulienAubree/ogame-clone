# Étude Usine de robots Exilium — propositions de refonte

**Date :** 2026-04-28
**Statut :** Brainstorm initial, à valider avant implémentation
**Lié à :** [2026-04-26-buildings-rebalance.md](./2026-04-26-buildings-rebalance.md) (section 3.A "Fusion robotics/shipyard/arsenal/commandCenter")

## 1. État des lieux factuel

### Définition (`packages/db/src/seed-game-config.ts:71`)
- **id** : `robotics` — *Usine de robots*
- **Coûts base** : 400 minerai / 120 silicium / 200 hydrogène
- **Scaling** : `costFactor = 2` × `phaseMultiplier(level)`
- **Temps base** : 60 s, doublement par niveau
- **Prérequis** : aucun (early-game)
- **Catégorie** : Industrie, sortOrder 0 (premier de sa famille)
- **Description IG** : "Réduit le temps de construction des bâtiments."

### Effet unique (`packages/db/src/seed-game-config.ts:397`)
```
robotics__building_time : sourceType=building, stat=building_time,
percentPerLevel=-15, category=null
```
Formule appliquée (`packages/game-engine/src/formulas/bonus.ts:37`) : `modifier = 1 / (1 + level)`.

| Niveau | Multiplicateur temps | Réduction |
|---|---|---|
| 1 | 0.500 | **−50 %** |
| 2 | 0.333 | −67 % |
| 3 | 0.250 | −75 % |
| 5 | 0.167 | −83 % |
| 10 | 0.091 | −91 % |
| 20 | 0.048 | −95 % |

### Rôle de gate progression
- `shipyard` : prérequis robotics **niv 1**
- `arsenal` : prérequis robotics **niv 2**
- `imperialPowerCenter` : prérequis robotics **niv 4**
- `commandCenter` : prérequis robotics **niv 4** (+ shipyard 2)
- Quête narrative `quest_6` "Mains mécaniques" déclenche à niv 1

### UI exposée au joueur
- Liste bâtiments (`Buildings.tsx`) : carte standard
- `BuildingDetailContent.tsx:258-292` : tableau "Bonus : Temps de construction" avec progression
- `BuildingQueuePanel.tsx:89-93` : badge "−X% vitesse" sur la file
- Aucun affichage de l'effet de cumul avec talents/gouvernance

---

## 2. Problèmes identifiés

### P1 — Mono-effet sans saveur
Un seul bonus passif numérique. Le joueur monte le bâtiment **par obligation** (gate des autres bâtiments), pas par décision tactique. Le nom *"Usine de robots"* promet une thématique forte (drones, automation, essaim) mais le contenu se réduit à une multiplication.

### P2 — Courbe trop violente en early
**−50 % au niveau 1** est massif. Sur les 5 premiers niveaux le joueur a déjà capté 83 % du gain total. Tous les builds optimaux convergent vers "monter robotics 4-5 le plus tôt possible" → décision triviale, pas de choix d'opportunité.

### P3 — Redondance avec ses voisins (déjà noté)
`shipyard`, `arsenal`, `commandCenter`, `researchLab` appliquent **la même formule** `−15%/niv` (`1/(1+n)`) sur des sous-domaines. 4 bâtiments = 4 fois la même UX. Voir buildings-rebalance §3.A.

### P4 — Pas d'interaction avec d'autres systèmes
- Pas d'effet sur la recherche, la production, le stockage, la défense, les missions PvE.
- Pas de synergie avec talents (le multiplicateur talent s'applique en parallèle, sans bonus croisé).
- Pas de pénalité ou trade-off (chaque niveau est strictement bénéfique).
- Le talent gouvernance pénalise le temps build mais robotics ne contre pas spécifiquement la pénalité.

### P5 — Description IG pauvre
"Réduit le temps de construction des bâtiments." Aucune indication chiffrée à l'achat, aucun contexte du diminishing return. Le joueur découvre le 1/(1+n) en lisant le tableau du détail.

### P6 — Aucune fin de progression
`maxLevel = null`. Niveau 30 = −97 %, niveau 50 = −98 %. Le bâtiment continue de coûter exponentiellement pour des gains < 1 %. Pure perte de ressources tardive.

---

## 3. Pistes d'ajustement (quick wins, 1-3 jours)

| # | Item | Détail technique |
|---|---|---|
| 1 | **Cap niveau** à 15 ou 20 | `maxLevel: 15` dans seed → coupe le farm vide en late game. Affichage UI "Niveau max atteint" |
| 2 | **Adoucir la courbe** | Passer de `1/(1+n)` à `1/(1+0.6×n)` → niv1=−37 %, niv5=−75 %, niv10=−86 %. Garde le punch sans trivialiser |
| 3 | **Description chiffrée** | Description IG dynamique : "Niveau {n} → temps × {x}, prochain niveau → × {y}" |
| 4 | **Bonus secondaire faible** | Ajouter `−2 %/niv` coût en silicium des bâtiments (capacité produit du circuit). Petit, mais donne un second levier identitaire |
| 5 | **Cohérence des prérequis** | Si shipyard niv 1 = robotics 1, supprimer le requis (robotics est déjà obligatoire). Sinon pousser à robotics 2 pour vrai gate |

---

## 4. Refontes structurelles

### A. Capacité "robots" assignables — usine vraiment active

L'usine produit une **capacité d'unités robotiques** (compteur empire-wide ou par planète) :
- Niveau N → `floor(2 × N)` robots disponibles
- Le joueur **assigne** ses robots à des **slots** d'effet :
  - **Slot bâtiment** : 1 robot = +5 % vitesse construction sur **un bâtiment précis** en cours
  - **Slot mine** : 1 robot = +1 %/h prod ressource
  - **Slot défense** : 1 robot = +0.5 % HP régen défense de la planète
  - **Slot exploration** : 1 robot = −2 % temps mission PvE
- Réassignation gratuite ou cooldown 5 min
- Les robots non-assignés ne font rien

Transforme le bâtiment passif en **outil de pilotage**. Crée une vraie boucle de décision quotidienne. Conserve le bonus "temps de construction" mais en l'arbitrant.

### B. Spécialisation par paliers (3 modes)

À niveau 1, choix d'un *blueprint* mutuellement exclusif (changeable contre coût) :

| Blueprint | Effet principal | Effet secondaire |
|---|---|---|
| **Ouvriers** | −15 %/niv temps bâtiments (actuel) | +1 %/niv stockage |
| **Techniciens** | −10 %/niv temps **+ −5 %/niv coût** bâtiments | aucun |
| **Ingénieurs** | −8 %/niv temps tous + bonus à la **recherche locale** | +3 %/niv exp recherches sur planète |

Reste une seule entité bâtiment, mais 3 façons de jouer. Les serveurs/builds divergent.

### C. Source de production passive : composants

L'usine produit une 4e ressource **"composants"** consommée en plus des coûts standards par les **bâtiments tier 2+** et les **vaisseaux industriels**. Stock plafonné (capacité d'usine), production lente (1/min × niv). Devient une **ressource ratelimit** sans introduire de friction sur les ressources de base.

Implication : convertit l'usine en **bottleneck d'expansion** — les joueurs doivent investir tôt sinon ils se font rattraper. Risque : tax cognitif d'une 4e ressource à gérer (à arbitrer).

### D. Robots = unité tactique légère

Vraiment "construire" des robots comme on construit des vaisseaux légers :
- Coût par robot dans l'usine, temps court (qq minutes)
- Stat : faible HP, pas de combat actif, **rôle utilitaire**
- Affectables à : flotte d'attaque (+petit bonus loot PvE — synergie *mission relay*), garnison (régen défense), expédition (+temps réduit)
- Lien avec mission relay : robots affectés à une flotte PvE → +X % loot ressource selon biome

Cohérent avec [project_mission_relay_design](mission_relay_design.md) déjà en cours.

### E. Fusion avec autres bâtiments industriels (cf. buildings-rebalance §3.A)

Garder `robotics` comme infrastructure commune à toute l'industrie :
- Robotics conserve le bonus −X %/niv build_time **global**
- Shipyard/Arsenal/CommandCenter fusionnent en `industrialComplex` + `militaryDocks`
- Robotics devient le **socle** des deux

Réduit la redondance, simplifie l'arbre de prérequis, mais aplatit la diversité.

### F. Refonte UI : panneau "Atelier"

Indépendamment de la mécanique, le détail bâtiment doit afficher :
- Réduction actuelle vs prochain niveau (delta absolu en secondes sur 1-2 bâtiments d'exemple)
- Coût d'opportunité du niveau suivant (combien de temps de build économisé sur les 24 h prochaines)
- Cumul effectif avec gouvernance + talents
- ROI estimé en heures (temps épargné / temps construction)

Convertit "−15 %/niv abstrait" en **gain concret sur la session**.

---

## 5. Idées out-of-the-box

1. **Auto-recyclage** : un % de débris de combat (sur la planète attaquée) convertis directement en ressources, scaling avec le niveau de l'usine.
2. **Maintenance auto** : tant que l'usine est niveau ≥ N, les défenses détruites en combat ont X % de chance d'être **reconstruites gratuitement** dans les 24 h.
3. **Production parallèle** : à partir de niveau N, la file de construction de **bâtiments** passe de 1 → 2 slots simultanés (vraie révolution de gameplay, gros impact).
4. **Robots espions** : niveau 10+ débloque des "infiltrateurs" lents qui collectent du **renseignement passif** sur planètes voisines (probe lite mais sans temps voyage).
5. **Bâtiment évolutif** : niveau 10 = "Usine de robots" → niveau 11 transformation en "Complexe de nanites" (rebrand + saut quanta dans les effets : ajoute -X % temps recherche).
6. **Robots = stat de pillage** : attaquer un système avec robots embarqués → +X % loot non-ressource (technologies, fragments artefacts).
7. **Conflit thermique** : usine consomme passivement énergie ; au-delà d'un certain ratio production/conso, les robots tombent en panne (régulation par énergie, pas que par construction).

---

## 6. Recommandation pragmatique

Ordre suggéré, par effort × impact :

| Priorité | Item | Effort | Impact |
|---|---|---|---|
| P0 | Quick-wins 1+2+3 (cap, courbe adoucie, description chiffrée) | 0.5 j | Stabilise et clarifie |
| P0 | Refonte UI §F (panneau "Atelier") | 1 j | Donne enfin du sens à la décision joueur |
| P1 | Pile A (capacité robots assignables) | 4-5 j | Transforme passif → actif, change l'expérience |
| P1 | Spécialisation §B (3 blueprints) | 2-3 j | Diversité de builds sans contenu nouveau |
| P2 | Idée 3 out-of-box (file 2 slots après niv N) | 2 j | Game-changer mais à arbitrer (bouleverse économie) |
| P2 | Lien missions §D (robots embarqués) | 1 sem | Synergie avec roadmap mission relay |
| P3 | Fusion industrielle §E | 1 sem | Cohérent buildings-rebalance, à packagier ensemble |

**Conseil :** commencer par P0 (mineur, déblocant pédagogiquement), puis trancher entre **A (capacité assignable)** et **B (blueprints)**. A est plus innovant mais demande de gros chantiers UI ; B est plus simple et reste lisible. Personnellement, **A** est la meilleure bouchée — l'usine devient un bâtiment qu'on **utilise** plutôt qu'on **subit**.

À éviter : empiler les pistes (A + B + C + D simultanées) → risque de complexification opaque. Une refonte forte vaut mieux que cinq additions bancales.

---

## 7. Notes pour reprise

- Définition bâtiment : `packages/db/src/seed-game-config.ts:71`
- Bonus : `packages/db/src/seed-game-config.ts:397`
- Formule appliquée : `packages/game-engine/src/formulas/bonus.ts:37`
- Application service : `apps/api/src/modules/building/building.service.ts:90`
- UI détail : `apps/web/src/components/entity-details/BuildingDetailContent.tsx:258-292`
- UI file : `apps/web/src/components/common/BuildingQueuePanel.tsx:89-93`
- Quête liée : `quest_6` "Mains mécaniques" (chapter 2)
- Avant tout chantier, vérifier patchnotes `docs/patchnotes/` (refontes combat avril 2026 ont touché côté défenses/temps build).
- Coordonner avec `project_mission_relay_design` si on prend la piste D.
