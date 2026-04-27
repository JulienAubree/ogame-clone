# Étude des bâtiments Exilium — propositions d'évolution

**Date :** 2026-04-26
**Statut :** Brainstorm initial, à valider avant implémentation

## 1. État des lieux

**21 bâtiments / 10 catégories**, `costFactor` entre 1.5 et 2.0, `maxLevel = null` partout. Phase multiplier en plateau dès niv 8 (1.0 = scaling pur exponentiel). Bonus *building* en diminishing returns (`1/(1+lvl)`), bonus *recherche* linéaires, bonus *biomes* additifs.

### Tensions majeures

- **Trio robotics/shipyard/arsenal/commandCenter redondants** : 3 bâtiments distincts pour le même mécanisme `-15%/niv build_time` mais sur sous-domaines (vaisseaux indus, défenses, vaisseaux militaires). Joueur force à monter 3 chaînes parallèles avec la même UX. Pas de différenciation gameplay.
- **5 labs annexes = même mécanique** : tous coûtent 8000/16000/8000 base, costFactor 2.0, baseTime 3600s, donnent tous `-5%/niv research_time` + 1 recherche unique. **Strictement copier-coller** sauf la recherche débloquée. Aucune raison gameplay de structurer différemment l'exploitation d'une planète aride vs glaciale.
- **Stockage exponentiel runaway** : `5000 × floor(2.5 × e^(20×lvl/33))` → niv 20 = millions d'unités. Production de mines reste linéaire×1.1^lvl, donc le stockage **dépasse de 10-100×** la prod réelle. Bâtiments purement "anti-pillage" mid-late game, pas une vraie ressource d'optimisation.
- **`galacticMarket` mort** : 5000/5000/1000 pour débloquer une UI, pas d'effet par niveau. Niveau 1 = niveau 100. Aucune raison de monter au-delà.
- **`missionCenter` plafonne au niv 6** : `cooldown = max(1h, 6h - lvl×1h)`. Niveau 7+ strictement inutile, sans message UI.
- **`planetaryShield` 7200s = 2h de build** : pour un effet linéaire `(50+10×lvl) × shielding_research`. Shielding research fait double emploi avec le bâtiment.
- **`hydrogeneSynth` puni 2.5×** sur planètes chaudes (formule `1.36 - 0.004×maxTemp`), force monoculture glacier/gaseous.
- **`imperialPowerCenter`** : effet exact (cap colonies) non exposé en UI. Joueur découvre par échec.
- **`researchLab` homeworld-only** : récent (avril 2026). Bon en théorie, mais SPOF — homeworld attaqué = recherche empire freeze.
- **Pas de maxLevel + costFactor 2.0** : divergence runaway entre vétérans et nouveaux.

---

## 2. Ajustements quick-win (1-3 jours)

| # | Item | Détail |
|---|---|---|
| 1 | **`maxLevel` par défaut = 25** + `costFactor` différencié | mines/storage 1.5, manufactures 1.8, labs 2.0 |
| 2 | **`missionCenter` : cap level 6 avec UI claire** | bouton grisé "cooldown minimum atteint" + ajouter effet niv 7+ (variance gisement, +taille) |
| 3 | **`galacticMarket` : ajouter scaling** | -1% commission par niveau (cap -5%) ou +1 slot d'offres |
| 4 | **Stockage : recapping** | `5000 × lvl × 1.5^lvl` au lieu de l'exponentiel, ou cap à ~10× prod horaire |
| 5 | **`imperialPowerCenter` cap colonies en UI** | détail bâtiment : "Niveau X : Y colonies max" + tooltip pénalité gouvernance |
| 6 | **Énergie en déficit visible** | quand `productionFactor < 1.0`, badge rouge sur prod mines + tooltip explicite |

---

## 3. Refontes structurelles

### A. Fusionner robotics/shipyard/arsenal/commandCenter

3 chaînes parallèles font la même chose.

| Avant | Après |
|---|---|
| `robotics` (-15% all building_time) | `robotics` conservé : -15% all building_time |
| `shipyard` (indus) + `arsenal` (défenses) + `commandCenter` (militaire) | **`industrialComplex`** : -15% indus ships + -15% défenses ; **`militaryDocks`** : -15% mil ships + débloque vaisseaux lourds |

Réduit le tax cognitif, libère 1 slot pour nouveaux concepts.

### B. Différencier les 5 labs annexes par bonus passif

Bonus passif unique lié au biome (en plus de la recherche débloquée) :

| Lab annexe | Bonus passif unique |
|---|---|
| `labVolcanic` | +5%/niv production minerai sur **toutes** les volcaniques de l'empire |
| `labArid` | +5%/niv stockage sur **toutes** les arides |
| `labTemperate` | -2%/niv conso énergétique empire-wide |
| `labGlacial` | +5%/niv production hydrogène sur **toutes** les glaciales |
| `labGaseous` | +5%/niv vitesse vaisseaux empire-wide |

Crée une vraie stratégie d'expansion par biome.

### C. Doctrine de colonie

Au moment de la colonisation, choix d'une **doctrine** mutuellement exclusive (économique / militaire / scientifique / commerciale) :
- -25% coût des bâtiments de la catégorie
- +25% coût des autres
- Débloque 1 bâtiment unique par doctrine

Planètes identitaires au lieu de fac-similés.

### D. Stockage modulable

1 seul `Entrepôt` dont chaque niveau ajoute des "modules" assignables aux 3 ressources. Réallocation gratuite ou coûteuse en silicium. Réduit le pavé de 3 bâtiments redondants, ajoute du choix actif.

### E. ResearchLab partiellement décentralisé

Garder `researchLab` homeworld-only mais permettre des "Centres de recherche secondaires" sur les planètes à annexe (label sur le lab annexe lui-même). Ces centres peuvent porter **1 recherche en parallèle** du labo principal.

---

## 4. Idées out-of-the-box

1. **Bâtiments construits par activité** : "Académie" ne se monte pas avec des ressources mais avec de l'**XP de combat / extraction / exploration**. Récompense les actions, pas l'attente.
2. **Bâtiments à effet *intra-système*** : "Phare gravitationnel" boost +X% les bâtiments des **autres planètes du même système solaire** (rayon 7 positions). Encourage hubs territoriaux.
3. **Wonders / Merveilles** : 1 bâtiment unique par alliance, construction collective 4 semaines, effet game-changer (ex. "Portail de translation" = -50% temps voyage entre planètes alliées). Endgame social.
4. **Sabotage / dégradation** : nouvelle mission espionnage avancée peut "dégrader" 1 bâtiment ennemi de 1 niveau pendant 24h. Bâtiments haute valeur protégeables via bouclier. Layer asymétrique au PvP.
5. **Bâtiments v2 / Cycles de renouvellement** : un bâtiment au niveau 10 marqué "v1" débloque un "v2" qui le remplace (ex. `mineraiMine v1` lvl 10 → `quantumMineraiExtractor v2` 1-10 avec effets différents). Cycles plutôt qu'accumulation infinie.
6. **Architecture émergente** : footprint limité par planète (ex. 25 slots). Le joueur choisit, pas tout. Force des trade-offs prod/militaire/recherche.
7. **Effets de voisinage** : bâtiments adjacents (mine + lab + storage côte-à-côte) → bonus de synergie (+2-5%). Couche puzzle simple style Anno.

---

## 5. Roadmap suggérée

| Priorité | Item | Effort | Impact |
|---|---|---|---|
| P0 | Quick-wins 1-6 (caps + UI + scalings morts) | 2-3j | Stabilise et clarifie |
| P1 | Refonte annexes (3.B — bonus passifs uniques) | 4-5j | Identité aux biomes |
| P1 | Architecture émergente / slot limité (4.6) | 1 sem | Trade-off réel |
| P2 | Doctrines de colonie (3.C) | 1-2 sem | Métagame planète |
| P2 | Fusion robotics/shipyard/arsenal (3.A) | 1 sem | Simplifie cognitif |
| P3 | Wonders alliance (4.3) | 2 sem | Endgame social |
| P3 | Bâtiments v2 / cycles (4.5) | 2 sem | Renewal mécanique |

**Recommandation** : P0 d'abord, puis trancher sur **annexes différenciées + slots limités** (P1) — deux plus gros leviers d'identité et décision sans trop de contenu nouveau à créer.

---

## 6. Notes pour reprise ultérieure

- Les bâtiments sont définis dans `packages/db/src/seed-game-config.ts` (`BUILDINGS = [`).
- Formules de production/coût/temps : `packages/game-engine/src/formulas/production.ts` et `building-cost.ts`.
- UI : `apps/web/src/pages/Buildings.tsx` + `apps/web/src/components/entity-details/BuildingDetailContent.tsx`.
- Bonus appliqués via `resolveBonus()` dans `packages/game-engine/src/formulas/bonus.ts`.
- Phase multiplier : `phase_multiplier` dans `universe_config` (palier niv 8).
- Avant tout chantier, vérifier patchnotes `docs/patchnotes/` (refontes combat avril 2026 ont touché côté défenses/temps build).
