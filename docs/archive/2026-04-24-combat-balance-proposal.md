> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Analyse d'équilibrage combat + Propositions

_Date : 2026-04-24 · Basé sur 200 simulations par scénario, 24 scénarios, multiplicateurs neutres (1×1×1)._
_Rapport brut : [`combat-balance-analysis-2026-04-24.md`](./combat-balance-analysis-2026-04-24.md)_

## 1. État des lieux — ce qui est cassé

### 1.1 L'attaque est sévèrement punitive

**Constat brutal** : même en victoire, l'attaquant perd une fortune. Exemples réels tirés des simulations :

| Scénario | Win att. | Att. perd | Déf. perd | Ratio att/déf |
|---|---|---|---|---|
| 100k attaque vs 100k défenses mix | **0%** | 100% | 0.7% | **122×** |
| 300k attaque vs 300k défenses équilibrées | **0%** | 100% | 1.9% | **54×** |
| 1.18M attaque vs 485k défenses + shield L6 | **0%** | 83% | 9% | **22×** |
| 4.15M attaque vs 2.72M défenses + shield L10 | **0% (100% draw)** | 64% | 7.5% | **13×** |

→ **À coût égal, la défense gagne à 100% et l'attaquant perd presque tout.** Pour raser une planète moyennement défendue, il faut **3× à 5× la valeur défensive**, et même là ça se termine souvent en draw.

### 1.2 Les mirror matches sont des draws

| Scénario mirror | Win att. | Draw | Win déf. |
|---|---|---|---|
| 50 intercepteurs × 50 intercepteurs | 48% | 2% | 51% |
| 20 frégates × 20 frégates | 3% | **95%** | 3% |
| 10 croiseurs × 10 croiseurs | 4% | **89%** | 8% |
| 5 cuirassés × 5 cuirassés | 12% | **76%** | 13% |

→ Les vaisseaux lourds ne peuvent pas se percer entre eux en 4 rounds. Le shield régénère à 100% chaque round et bloque la moitié des dégâts. Seuls les intercepteurs (multi-shot) ont une chance.

### 1.3 La hiérarchie "plus gros = plus fort" est cassée (à coût égal)

| Matchup (équivalent coût) | Gagnant |
|---|---|
| 15 intercepteurs vs 6 frégates | **Frégate 70%** |
| 15 intercepteurs vs 2 croiseurs | Draw 99% |
| 6 frégates vs 2 croiseurs | **Frégate 98%** |
| 2 croiseurs vs 1 cuirassé | **Croiseur 73%** |
| 15 intercepteurs vs 1 cuirassé | **Intercepteur 100%** |

→ Les gros vaisseaux (croiseur, cuirassé) sont **moins rentables** que les vaisseaux moyens (frégate). Le cuirassé se fait exploser par des intercepteurs à coût égal. Pas de pyramide de force claire.

### 1.4 Les défenses sont sur-efficaces en cost-per-damage

Budget 50k en défenses vs 348k en croiseurs attaquants :

| Défense (50k) | Pertes att. | Pertes déf. net | Efficacité (dmg/coût) |
|---|---|---|---|
| 25 × Lanceur missiles | 0 | 15k | Très forte |
| 25 × Laser léger | 0 | 15k | Très forte |
| 6 × Laser lourd (48k) | 0 | 14k | Très forte |
| 1 × Canon EM (37k) | 0 | 10k | Moyenne |
| 1 × Artillerie ions (130k) | 29k | 40k | Excellente |

→ Même à 7× sous-budget, les défenses absorbent 12 croiseurs sans pertes attaquant. Le laser léger en particulier est écrasant : 25 unités à 50k tanking une flotte 7× plus chère.

### 1.5 Le bouclier planétaire est trop fort couplé aux défenses

Le shield planétaire régénère à 100% chaque round. Sur 4 rounds, il absorbe `4 × capacité` de dégâts avant que les défenses soient touchées. Combiné au repair 70% des défenses, le défenseur est virtuellement invincible dès qu'il dépasse ~50% du coût attaquant.

## 2. Causes identifiées

1. **`defenseRepairRate = 70%`** : le défenseur ne perd que 30% réels de ses défenses détruites. Ses pertes nettes sont quasi nulles.
2. **`maxRounds = 4`** : combat se termine en draw alors qu'il aurait fallu 6-8 rounds pour un côté de gagner.
3. **Bouclier planétaire régén 100%** par round : protège 4× la capacité par combat.
4. **Shield d'unités régén 100%** par round : perçable uniquement avec dégâts massifs.
5. **`minDamagePerHit = 1`** : les intercepteurs passent toujours 1 dmg, les rendant inarrêtables en nombre.
6. **Coûts défenses trop bas** : rocketLauncher (2000) et lightLaser (2000) ont un ratio DPS/coût 2-3× supérieur aux vaisseaux équivalents.
7. **Batteries secondaires mal ciblées** : le cuirassé a sa rafale vs medium, inutile contre un essaim léger. Pourtant c'est le scénario où il meurt.

## 3. Propositions d'équilibrage

Objectif : passer d'un méta **80% défense / 20% attaque** à **55% défense / 45% attaque**. L'attaque doit rester coûteuse (gameplay OGame-like), mais pas impossible.

### 3.1 Config combat (priorité haute — effet immédiat)

| Paramètre | Actuel | Proposé | Impact |
|---|---|---|---|
| `combat_defense_repair_rate` | **0.7** | **0.4** | Défenseur paie vraiment ses pertes |
| `combat_max_rounds` | **4** | **6** | Moins de draws, plus de conclusions |
| `combat_debris_ratio` | **0.3** | **0.35** | Légère récompense pour l'attaquant |

Ces 3 paramètres sont en DB (`universe_config`) → changement sans migration, juste seed.

### 3.2 Coûts défenses (nerf cost-efficiency)

| Défense | Coût actuel (total) | Proposé | % |
|---|---|---|---|
| Lanceur missiles | 2 000 | 3 000 | +50% |
| Laser léger | 2 000 | 3 000 | +50% |
| Laser lourd | 8 000 | 10 000 | +25% |
| Canon EM | 37 000 | 40 000 | +8% |
| Artillerie ions | 130 000 | 130 000 | = |

Les défenses haut de gamme (EM, ions) restent cost-efficient — c'est leur rôle. Ce sont les défenses légères qu'il faut nerfer car elles dominent le méta.

### 3.3 Rééquilibrage vaisseaux (hiérarchie de force)

#### Croiseur (renforcer le rôle "anti-spam léger")
- Bat. secondaire passe de `5×2 light` à `6×2 light` (+20% DPS sur light) → rafale 6 = `48 DPS vs light`
- Shield : 28 → 32 (+14%)
- Coût inchangé

#### Cuirassé (meilleur anti-tout)
- Bat. secondaire change de cible : `10×2 medium` → `8×2 light` (supprime la rafale 4 vs medium, la remplace par `rafale 3 light`)
  - Total vs light : 8 + 8×3 = 32 DPS (meilleur que croiseur)
  - vs medium : juste la bat principale 50 DPS si pas de heavy
- Hull : 100 → 120 (+20%)
- Justification : le cuirassé doit être le roi du combat, actuellement il se fait piéger par les intercepteurs.

#### Intercepteur (nerf marginal pour casser l'invincibilité du spam)
- hasChainKill : supprimer (les intercepteurs ne "nettoient" plus automatiquement)
- Dégât : 4 → 4 (inchangé)
- Shield : 8 → 6 (-25%) → plus fragile au multi-shot
- Justification : actuellement 15 interceptors one-shot un cuirassé avec enchaînement. Il faut casser cette dominance.

#### Frégate (laisser telle quelle)
- Pas de changement majeur, elle est correctement positionnée au milieu.

### 3.4 Ajustement bouclier planétaire

- **Régén du bouclier planétaire : 100% → 50% par round**
  - Round 1 : absorbe `capacity`
  - Round 2 : absorbe `capacity × 0.5` (régén seulement 50% du capacity)
  - Etc.
  - Capacité totale absorbée sur 6 rounds : `capacity × (1 + 0.5 + 0.5 + 0.5 + 0.5 + 0.5) = capacity × 3.5` au lieu de `capacity × 6`
- Alternative plus simple : **le bouclier planétaire ne régénère PAS** entre rounds → une fois percé, les défenses prennent les coups.

### 3.5 Récompense de victoire

- `pillage_ratio` 33% → 40% : l'attaquant recupère plus de ressources si victoire
  (à confirmer selon l'économie actuelle)

## 4. Feuille de route d'implémentation

### Phase A — Ajustements de paramètres (1h)
Seed only, pas de migration :
- `universe_config` : repair 0.4, maxRounds 6, debris 0.35
- Coûts défenses : 5 lignes modifiées dans `DEFENSES`
- Stats unités : 5 lignes modifiées dans `SHIPS` + `weaponProfiles`

→ Commit + re-seed + deploy.

### Phase B — Bouclier planétaire régén 50% (2h)
Code change dans `combat.ts` au niveau de la régénération du shield:
```ts
// Au lieu de :
if (unit.shipType === '__planetaryShield__' && unit.destroyed) {
  unit.shield = unit.maxShield; // 100%
}
// Faire :
if (unit.shipType === '__planetaryShield__') {
  const regen = unit.destroyed ? unit.maxShield * 0.5 : Math.min(unit.maxShield, unit.shield + unit.maxShield * 0.5);
  unit.destroyed = false;
  unit.shield = Math.floor(regen);
  unit.hull = unit.maxHull;
}
```

Tests snapshots à revalider + mise à jour du guide de combat.

### Phase C — Re-simulation + ajustements fins (30 min)
Relancer l'analyse après Phase A/B, itérer sur les chiffres si nécessaire.

## 5. Ce que je ne propose PAS (et pourquoi)

- **Supprimer l'enchaînement des intercepteurs** — c'est la seule raison pour laquelle ils sont intéressants tactiquement. Je préfère les nerfer sur le shield pour rester fragiles.
- **Toucher à la formule de dégâts** (armor, min damage) — c'est robuste, pas besoin de changer.
- **Refonte du targetCategory** — le système multi-batteries fonctionne bien, c'est juste les assignments qu'il faut tweaker.
- **Supprimer les défenses low-tier** — elles doivent juste coûter plus cher.

## 6. Questions ouvertes pour toi

1. **Repair 40%** ou **30%** ? 40% garde un avantage au défenseur, 30% est plus brutal.
2. **6 rounds** ou **8 rounds** ? Impact sur la durée perçue des combats.
3. **Bouclier planétaire 50% régén** ou **pas de régén du tout** ? Plus dur = combats plus courts.
4. **Nerf intercepteur** via shield (proposé) ou via coût (-20%, le rendre encore plus spammable) ?
5. **Rôle du cuirassé** : plutôt "tank anti-heavy" (bat. sec. vs medium comme actuel) ou "anti-tout y compris swarm" (bat. sec. vs light comme proposé) ?

---

_Dès que tu valides les paramètres, je fais Phase A + simulation de validation + déploiement en 1 commit._
