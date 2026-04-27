# Étude des recherches Exilium — propositions d'évolution

**Date :** 2026-04-26
**Statut :** Brainstorm initial, à valider avant implémentation

## 1. État des lieux

**21 techs / 4 catégories** : 7 fondatrices, 6 utilitaires, 4 détection/espionnage, 5 annexes biomes.

| Caractéristique | Valeur actuelle |
|---|---|
| `costFactor` | **2.0 uniforme** sur les 21 recherches |
| `maxLevel` | **`null`** sur 21/21 (aucun cap) |
| Scaling % bonus combat/propulsion | **+10%/niv linéaire** |
| Lab principal | `1/(1+lvl)` (diminishing returns) |
| Annexes biomes | `-5%/niv` (linéaire, max 5 annexes en stack) |

### Tensions identifiées

- **Scaling infini + linéaire** : niv 20 weapons = +200% dégâts, sans plafond → écart vétéran/nouveau divergent.
- **Annexes = duplicates des bases** : `volcanicWeaponry`/`aridArmor`/`glacialShielding`/`gaseousPropulsion` donnent **exactement le même bonus** que leurs parents (`+10%` weapons/armor/shield/speed). Mécanique géographique sans mécanique gameplay distincte.
- **3 techs "fantômes"** : `computerTech` (+1 flotte invisible UI), `sensorNetwork`/`stealthTech` (pas de chiffre numérique).
- **`deepSpaceRefining` exception non documentée** : seule recherche multiplicative (`0.85^N`), implémentée en dur dans `pve.ts` au lieu de `bonus_definitions`.
- **`energyTech` pivot incohérent** : prérequise par shielding mais PAS par weapons (qui devrait l'être lore-wise pour les armes énergétiques).
- **Overlap talents flagship** : `research_time`, `combat_weapons`, etc. dupliquent les recherches sans synergie claire.
- **Pas de respec / pas de choix mutuellement exclusifs** : aucune décision irréversible, donc pas d'identité de build.

---

## 2. Ajustements quick-win (1-3 jours)

| # | Item | Détail |
|---|---|---|
| 1 | **`maxLevel` par défaut = 20** + `costFactor` différencié | early 1.6, mid 1.9, late 2.2 → garde la progression, supprime le runaway |
| 2 | **Soft-cap sur les +%** | `bonus = base × (1 - exp(-k×lvl))` (asymptote ~+150%) pour weapons/shielding/armor |
| 3 | **Afficher numériquement les techs "fantômes"** | `computerTech` (fleet slots), `sensor`/`stealthTech` (score furtivité) dans la card de recherche |
| 4 | **Buff `armoredStorage`** | 5% → 8% par niveau, ou repenser comme % des coûts de bâtiments/flotte au lieu de stockage seul |
| 5 | **Standardiser `deepSpaceRefining`** | exposer formule en UI ou la migrer dans `bonus_definitions` avec une mécanique commune |

---

## 3. Refontes structurelles

### A. Différencier les annexes de leurs parents

Aujourd'hui c'est un doublon ; donner à chacune un effet **qualitatif** distinct :

| Annexe | Effet actuel | Effet proposé |
|---|---|---|
| `volcanicWeaponry` | +10% dégâts | Ignore X% blindage (AP) |
| `aridArmor` | +10% coque | Regen 5% hull/round en milieu de combat |
| `glacialShielding` | +10% bouclier | Bouclier persiste 1 round après destruction |
| `gaseousPropulsion` | +10% vitesse | -10% conso hydrogène (au lieu de +vitesse, déjà couvert par hyperspace) |
| `temperateProduction` | +2% production | Conserver (déjà OK) |

### B. Trees branchés à choix exclusif

À partir du tier 5 d'une tech, choix entre 2 spécialisations (ex. `weapons` → kinetic vs. plasma, `armor` → reactive vs. composite). Crée une vraie identité de build, encourage le respec premium.

### C. Reset/respec via Exilium

Coûteux mais possible : ouvre la porte aux pivots stratégiques late game et donne du sens à la ressource Exilium.

### D. Découpler `energyTech`

Split en `civilEnergy` (production) et `militaryEnergy` (boucliers/armes) — résout l'incohérence et crée 2 chemins économique vs militaire.

---

## 4. Idées out-of-the-box

1. **Joint Alliance Research** : techs d'alliance contribuées collectivement (chaque membre paie une part), bonus partagé. Crée une raison **gameplay** d'être en alliance au-delà du social.
2. **Lost Technologies via biomes Précurseurs** : le biome `precursor_relics` débloque une tech unique non-obtainable autrement (ex. "Pulse drive" : téléportation flotte 1×/24h sur courte distance). Récompense l'exploration de fond.
3. **Tech Leak via espionnage avancé** : sondes lvl 8+ peuvent voler 1 niveau d'une recherche cible (avec cooldown / risk). Crée un vrai conflit autour de l'espionnage, qui aujourd'hui est sous-utilisé.
4. **Catalysts** (drops pirate/exilium) : items rares qui multiplient l'effet d'une recherche pour N niveaux (ex. "Cristal de plasma" → x2 effet weapons sur ce niveau). Layer roguelike léger.
5. **Quantum Lab** (bâtiment niveau 10+) : permet **2 recherches en parallèle**. Devient un gros gold-sink de fin de jeu et résout la frustration "labo bloqué".
6. **Doctrines** : choisir 1 doctrine sur 4 (Économique/Militaire/Scientifique/Furtive) qui réduit -25% le coût d'une catégorie mais +25% les autres. Décision lourde de mid-game, change le métagame entre joueurs.
7. **Research insights passifs** : chaque combat/exploration/extraction génère de l'XP qui débloque aléatoirement de petits insights permanents (+1% vitesse construction, +0.5% production, etc.). Récompense l'activité au-delà de la grind.

---

## 5. Roadmap suggérée

| Priorité | Item | Effort | Impact |
|---|---|---|---|
| P0 | Ajustements 1-5 (caps + UI) | 2-3j | Stabilise progression |
| P1 | Refonte annexes (3.A) | 4-5j | Différenciation gameplay |
| P1 | Quantum Lab (4.5) | 3j | Résout pain point UX |
| P2 | Joint Alliance Research (4.1) | 1 sem | Boost alliance gameplay |
| P3 | Doctrines (4.6) | 1-2 sem | Métagame |
| P3 | Tech Leak / Lost Tech (4.2-4.3) | 1 sem | Espionnage + exploration |

**Recommandation** : commencer par **P0** (ajustements low-risk qui rendent le système lisible et borné). Puis trancher sur **Quantum Lab + refonte annexes** pour le prochain cycle. Garder doctrines/tech leak pour quand on aura validé les bases.

---

## 6. Notes pour reprise ultérieure

- Tous les chiffres et formules de scaling sont dans `packages/db/src/seed-game-config.ts` (lignes 106-130 pour le RESEARCH array, 395-420 pour BONUS_DEFINITIONS).
- Les formules d'application sont dans `packages/game-engine/src/formulas/bonus.ts` (`resolveBonus`, `researchAnnexBonus`, `researchBiomeBonus`) et `research-cost.ts`.
- L'UI est dans `apps/web/src/pages/Research.tsx`.
- Les talents qui overlap sont dans le système flagship (`packages/db/src/seed-game-config.ts` autour de `TALENT_DEFINITIONS`).
- Avant tout chantier ici, vérifier que les patchnotes `docs/patchnotes/` n'ont pas déjà bougé certains chiffres depuis cette étude.
