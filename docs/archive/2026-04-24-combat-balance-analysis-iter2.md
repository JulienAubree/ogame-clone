> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Analyse d'équilibrage combat — Exilium

_Série de 200 combats simulés par scénario (seeds variés, multiplicateurs neutres 1×1×1)._

## Résumé

| Scénario | Win att. | Ratio coût att/def | Rounds moy. |
|---|---:|---:|---:|
| 1v1 — Intercepteur × 15 vs Frégate × 6 (≈ équivalent coût) | 0% | 27.27 | 4.0 |
| 1v1 — Intercepteur × 15 vs Croiseur × 2 (≈ équivalent coût) | 0% | ∞ | 4.0 |
| 1v1 — Frégate × 6 vs Croiseur × 2 (≈ équivalent coût) | 92% | 0.44 | 4.0 |
| 1v1 — Croiseur × 2 vs Cuirassé × 1 (≈ équivalent coût) | 84% | 0.34 | 4.3 |
| 1v1 — Intercepteur × 15 vs Cuirassé × 1 (≈ équivalent coût) | 100% | 0.30 | 4.2 |
| Spam — 50 intercepteurs vs 50 intercepteurs (miroir) | 45% | 1.01 | 3.0 |
| Spam — 20 frégates vs 20 frégates (miroir) | 44% | 1.00 | 5.3 |
| Spam — 10 croiseurs vs 10 croiseurs (miroir) | 41% | 1.07 | 5.3 |
| Spam — 5 cuirassés vs 5 cuirassés (miroir) | 38% | 1.05 | 5.6 |
| Counter — 5 croiseurs vs 40 intercepteurs (~même coût) | 100% | 0.02 | 4.2 |
| Counter — 3 cuirassés vs 20 frégates (~même coût) | 13% | 1.10 | 5.3 |
| Counter — 40 intercepteurs vs 3 cuirassés (~même coût) | 99% | 0.42 | 5.8 |
| Counter — 5 croiseurs vs 3 cuirassés | 9% | 3.33 | 4.7 |
| Défense — Flotte moyenne vs défenses légères + bouclier L3 | 100% | 1.45 | 2.9 |
| Défense — Grosse flotte vs défenses mid + bouclier L6 | 0% | 7.87 | 5.8 |
| Défense — Très grosse flotte vs défenses stackées + bouclier L10 | 4% | 3.35 | 6.0 |
| Efficacité défense — 50k budget: 25 rocketLauncher (50k) vs 12 cruiser (~348k) — test coût défenseur | 100% | 0.00 | 2.0 |
| Efficacité défense — 25 lightLaser (50k) vs 12 cruiser (~348k) | 100% | 0.00 | 2.0 |
| Efficacité défense — 6 heavyLaser (~48k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| Efficacité défense — 1 plasmaTurret (~130k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| Efficacité défense — 1 electromagneticCannon (~37k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| 100k vs 100k — 2 cuirassés vs défenses mix | 0% | 49.69 | 1.0 |
| 100k vs 100k — 5 croiseurs vs défenses mix | 0% | 24.98 | 1.0 |
| 300k vs 300k — flotte équilibrée vs défenses équilibrées | 0% | 20.73 | 2.0 |

## Détails par scénario

### 1v1 — Intercepteur × 15 vs Frégate × 6 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 60 000)
- Défenseur : {"frigate":6} + défenses {} (coût 60 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 60 000 (100.0%) · Défenseur net (après réparation) : 2 200 (3.7%)
- **Ratio coût att/def : 27.27** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Intercepteur × 15 vs Croiseur × 2 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 60 000)
- Défenseur : {"cruiser":2} + défenses {} (coût 58 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 60 000 (100.0%) · Défenseur net (après réparation) : 0 (0.0%)
- **Ratio coût att/def : ∞** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Frégate × 6 vs Croiseur × 2 (≈ équivalent coût)

- Attaquant : {"frigate":6} (coût 60 000)
- Défenseur : {"cruiser":2} + défenses {} (coût 58 000)
- **Win rate attaquant : 91.5%** (draw 2.5%, defender 6.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 23 950 (39.9%) · Défenseur net (après réparation) : 54 375 (93.8%)
- **Ratio coût att/def : 0.44** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Croiseur × 2 vs Cuirassé × 1 (≈ équivalent coût)

- Attaquant : {"cruiser":2} (coût 58 000)
- Défenseur : {"battlecruiser":1} + défenses {} (coût 60 000)
- **Win rate attaquant : 83.5%** (draw 0.0%, defender 16.5%)
- Rounds moyens : 4.3
- Pertes moyennes — Attaquant : 16 820 (29.0%) · Défenseur net (après réparation) : 50 100 (83.5%)
- **Ratio coût att/def : 0.34** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Intercepteur × 15 vs Cuirassé × 1 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 60 000)
- Défenseur : {"battlecruiser":1} + défenses {} (coût 60 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 4.2
- Pertes moyennes — Attaquant : 18 120 (30.2%) · Défenseur net (après réparation) : 60 000 (100.0%)
- **Ratio coût att/def : 0.30** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 50 intercepteurs vs 50 intercepteurs (miroir)

- Attaquant : {"interceptor":50} (coût 200 000)
- Défenseur : {"interceptor":50} + défenses {} (coût 200 000)
- **Win rate attaquant : 45.0%** (draw 7.5%, defender 47.5%)
- Rounds moyens : 3.0
- Pertes moyennes — Attaquant : 177 900 (89.0%) · Défenseur net (après réparation) : 175 940 (88.0%)
- **Ratio coût att/def : 1.01** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 20 frégates vs 20 frégates (miroir)

- Attaquant : {"frigate":20} (coût 200 000)
- Défenseur : {"frigate":20} + défenses {} (coût 200 000)
- **Win rate attaquant : 43.5%** (draw 11.5%, defender 45.0%)
- Rounds moyens : 5.3
- Pertes moyennes — Attaquant : 147 150 (73.6%) · Défenseur net (après réparation) : 147 250 (73.6%)
- **Ratio coût att/def : 1.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 10 croiseurs vs 10 croiseurs (miroir)

- Attaquant : {"cruiser":10} (coût 290 000)
- Défenseur : {"cruiser":10} + défenses {} (coût 290 000)
- **Win rate attaquant : 41.0%** (draw 11.5%, defender 47.5%)
- Rounds moyens : 5.3
- Pertes moyennes — Attaquant : 212 860 (73.4%) · Défenseur net (après réparation) : 199 665 (68.8%)
- **Ratio coût att/def : 1.07** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 5 cuirassés vs 5 cuirassés (miroir)

- Attaquant : {"battlecruiser":5} (coût 300 000)
- Défenseur : {"battlecruiser":5} + défenses {} (coût 300 000)
- **Win rate attaquant : 38.0%** (draw 20.0%, defender 42.0%)
- Rounds moyens : 5.6
- Pertes moyennes — Attaquant : 195 900 (65.3%) · Défenseur net (après réparation) : 186 300 (62.1%)
- **Ratio coût att/def : 1.05** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 5 croiseurs vs 40 intercepteurs (~même coût)

- Attaquant : {"cruiser":5} (coût 145 000)
- Défenseur : {"interceptor":40} + défenses {} (coût 160 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 4.2
- Pertes moyennes — Attaquant : 2 755 (1.9%) · Défenseur net (après réparation) : 160 000 (100.0%)
- **Ratio coût att/def : 0.02** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 3 cuirassés vs 20 frégates (~même coût)

- Attaquant : {"battlecruiser":3} (coût 180 000)
- Défenseur : {"frigate":20} + défenses {} (coût 200 000)
- **Win rate attaquant : 12.5%** (draw 2.5%, defender 85.0%)
- Rounds moyens : 5.3
- Pertes moyennes — Attaquant : 164 700 (91.5%) · Défenseur net (après réparation) : 150 300 (75.2%)
- **Ratio coût att/def : 1.10** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 40 intercepteurs vs 3 cuirassés (~même coût)

- Attaquant : {"interceptor":40} (coût 160 000)
- Défenseur : {"battlecruiser":3} + défenses {} (coût 180 000)
- **Win rate attaquant : 99.0%** (draw 1.0%, defender 0.0%)
- Rounds moyens : 5.8
- Pertes moyennes — Attaquant : 75 560 (47.2%) · Défenseur net (après réparation) : 178 800 (99.3%)
- **Ratio coût att/def : 0.42** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 5 croiseurs vs 3 cuirassés

- Attaquant : {"cruiser":5} (coût 145 000)
- Défenseur : {"battlecruiser":3} + défenses {} (coût 180 000)
- **Win rate attaquant : 8.5%** (draw 1.5%, defender 90.0%)
- Rounds moyens : 4.7
- Pertes moyennes — Attaquant : 137 750 (95.0%) · Défenseur net (après réparation) : 41 400 (23.0%)
- **Ratio coût att/def : 3.33** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Flotte moyenne vs défenses légères + bouclier L3

- Attaquant : {"cruiser":10,"frigate":20} (coût 490 000)
- Défenseur : {} + défenses {"rocketLauncher":30,"lightLaser":20} + bouclier 85 (coût 150 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.9
- Pertes moyennes — Attaquant : 107 800 (22.0%) · Défenseur net (après réparation) : 74 595 (49.7%)
- **Ratio coût att/def : 1.45** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Grosse flotte vs défenses mid + bouclier L6

- Attaquant : {"cruiser":20,"battlecruiser":10} (coût 1 180 000)
- Défenseur : {} + défenses {"rocketLauncher":50,"lightLaser":40,"heavyLaser":15,"electromagneticCannon":5} + bouclier 186 (coût 620 000)
- **Win rate attaquant : 0.0%** (draw 22.0%, defender 78.0%)
- Rounds moyens : 5.8
- Pertes moyennes — Attaquant : 1 128 900 (95.7%) · Défenseur net (après réparation) : 143 420 (23.1%)
- **Ratio coût att/def : 7.87** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Très grosse flotte vs défenses stackées + bouclier L10

- Attaquant : {"cruiser":50,"battlecruiser":30,"frigate":50,"interceptor":100} (coût 4 150 000)
- Défenseur : {} + défenses {"rocketLauncher":100,"lightLaser":80,"heavyLaser":40,"electromagneticCannon":20,"plasmaTurret":10} + bouclier 530 (coût 3 040 000)
- **Win rate attaquant : 4.0%** (draw 96.0%, defender 0.0%)
- Rounds moyens : 6.0
- Pertes moyennes — Attaquant : 2 920 135 (70.4%) · Défenseur net (après réparation) : 872 550 (28.7%)
- **Ratio coût att/def : 3.35** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 50k budget: 25 rocketLauncher (50k) vs 12 cruiser (~348k) — test coût défenseur

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"rocketLauncher":25} (coût 75 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 38 220 (51.0%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 25 lightLaser (50k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"lightLaser":25} (coût 75 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 37 605 (50.1%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 6 heavyLaser (~48k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"heavyLaser":6} (coût 60 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 30 150 (50.3%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 1 plasmaTurret (~130k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"plasmaTurret":1} (coût 130 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 64 350 (49.5%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 1 electromagneticCannon (~37k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"electromagneticCannon":1} (coût 40 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 18 400 (46.0%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 100k vs 100k — 2 cuirassés vs défenses mix

- Attaquant : {"battlecruiser":2} (coût 120 000)
- Défenseur : {} + défenses {"rocketLauncher":20,"lightLaser":15,"heavyLaser":10} (coût 205 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 120 000 (100.0%) · Défenseur net (après réparation) : 2 415 (1.2%)
- **Ratio coût att/def : 49.69** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 100k vs 100k — 5 croiseurs vs défenses mix

- Attaquant : {"cruiser":5} (coût 145 000)
- Défenseur : {} + défenses {"rocketLauncher":20,"lightLaser":15,"heavyLaser":10} (coût 205 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 145 000 (100.0%) · Défenseur net (après réparation) : 5 805 (2.8%)
- **Ratio coût att/def : 24.98** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 300k vs 300k — flotte équilibrée vs défenses équilibrées

- Attaquant : {"cruiser":8,"battlecruiser":4,"frigate":10} (coût 572 000)
- Défenseur : {} + défenses {"rocketLauncher":30,"lightLaser":30,"heavyLaser":15,"electromagneticCannon":5,"plasmaTurret":1} (coût 660 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 572 000 (100.0%) · Défenseur net (après réparation) : 27 590 (4.2%)
- **Ratio coût att/def : 20.73** (< 1 = favorable attaquant, > 1 = favorable défenseur)

