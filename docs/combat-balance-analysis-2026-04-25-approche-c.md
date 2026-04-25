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
| Défense — Flotte moyenne vs défenses légères + bouclier L3 | 100% | 1.08 | 2.9 |
| Défense — Grosse flotte vs défenses mid + bouclier L6 | 0% | 6.35 | 5.8 |
| Défense — Très grosse flotte vs défenses stackées + bouclier L10 | 4% | 3.03 | 6.0 |
| Efficacité défense — 50k budget: 25 rocketLauncher (50k) vs 12 cruiser (~348k) — test coût défenseur | 100% | 0.00 | 2.0 |
| Efficacité défense — 25 lightLaser (50k) vs 12 cruiser (~348k) | 100% | 0.00 | 2.0 |
| Efficacité défense — 6 heavyLaser (~48k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| Efficacité défense — 1 plasmaTurret (~130k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| Efficacité défense — 1 electromagneticCannon (~37k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| 100k vs 100k — 2 cuirassés vs défenses mix | 0% | 37.85 | 1.0 |
| 100k vs 100k — 5 croiseurs vs défenses mix | 0% | 18.86 | 1.0 |
| 300k vs 300k — flotte équilibrée vs défenses équilibrées | 0% | 16.26 | 2.0 |

## Détails par scénario

### 1v1 — Intercepteur × 15 vs Frégate × 6 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 45 000)
- Défenseur : {"frigate":6} + défenses {} (coût 45 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 45 000 (100.0%) · Défenseur net (après réparation) : 1 650 (3.7%)
- **Ratio coût att/def : 27.27** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Intercepteur × 15 vs Croiseur × 2 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 45 000)
- Défenseur : {"cruiser":2} + défenses {} (coût 43 500)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 45 000 (100.0%) · Défenseur net (après réparation) : 0 (0.0%)
- **Ratio coût att/def : ∞** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Frégate × 6 vs Croiseur × 2 (≈ équivalent coût)

- Attaquant : {"frigate":6} (coût 45 000)
- Défenseur : {"cruiser":2} + défenses {} (coût 43 500)
- **Win rate attaquant : 91.5%** (draw 2.5%, defender 6.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 17 963 (39.9%) · Défenseur net (après réparation) : 40 781 (93.8%)
- **Ratio coût att/def : 0.44** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Croiseur × 2 vs Cuirassé × 1 (≈ équivalent coût)

- Attaquant : {"cruiser":2} (coût 43 500)
- Défenseur : {"battlecruiser":1} + défenses {} (coût 45 000)
- **Win rate attaquant : 83.5%** (draw 0.0%, defender 16.5%)
- Rounds moyens : 4.3
- Pertes moyennes — Attaquant : 12 615 (29.0%) · Défenseur net (après réparation) : 37 575 (83.5%)
- **Ratio coût att/def : 0.34** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Intercepteur × 15 vs Cuirassé × 1 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 45 000)
- Défenseur : {"battlecruiser":1} + défenses {} (coût 45 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 4.2
- Pertes moyennes — Attaquant : 13 590 (30.2%) · Défenseur net (après réparation) : 45 000 (100.0%)
- **Ratio coût att/def : 0.30** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 50 intercepteurs vs 50 intercepteurs (miroir)

- Attaquant : {"interceptor":50} (coût 150 000)
- Défenseur : {"interceptor":50} + défenses {} (coût 150 000)
- **Win rate attaquant : 45.0%** (draw 7.5%, defender 47.5%)
- Rounds moyens : 3.0
- Pertes moyennes — Attaquant : 133 425 (89.0%) · Défenseur net (après réparation) : 131 955 (88.0%)
- **Ratio coût att/def : 1.01** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 20 frégates vs 20 frégates (miroir)

- Attaquant : {"frigate":20} (coût 150 000)
- Défenseur : {"frigate":20} + défenses {} (coût 150 000)
- **Win rate attaquant : 43.5%** (draw 11.5%, defender 45.0%)
- Rounds moyens : 5.3
- Pertes moyennes — Attaquant : 110 363 (73.6%) · Défenseur net (après réparation) : 110 438 (73.6%)
- **Ratio coût att/def : 1.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 10 croiseurs vs 10 croiseurs (miroir)

- Attaquant : {"cruiser":10} (coût 217 500)
- Défenseur : {"cruiser":10} + défenses {} (coût 217 500)
- **Win rate attaquant : 41.0%** (draw 11.5%, defender 47.5%)
- Rounds moyens : 5.3
- Pertes moyennes — Attaquant : 159 645 (73.4%) · Défenseur net (après réparation) : 149 749 (68.8%)
- **Ratio coût att/def : 1.07** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 5 cuirassés vs 5 cuirassés (miroir)

- Attaquant : {"battlecruiser":5} (coût 225 000)
- Défenseur : {"battlecruiser":5} + défenses {} (coût 225 000)
- **Win rate attaquant : 38.0%** (draw 20.0%, defender 42.0%)
- Rounds moyens : 5.6
- Pertes moyennes — Attaquant : 146 925 (65.3%) · Défenseur net (après réparation) : 139 725 (62.1%)
- **Ratio coût att/def : 1.05** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 5 croiseurs vs 40 intercepteurs (~même coût)

- Attaquant : {"cruiser":5} (coût 108 750)
- Défenseur : {"interceptor":40} + défenses {} (coût 120 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 4.2
- Pertes moyennes — Attaquant : 2 066 (1.9%) · Défenseur net (après réparation) : 120 000 (100.0%)
- **Ratio coût att/def : 0.02** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 3 cuirassés vs 20 frégates (~même coût)

- Attaquant : {"battlecruiser":3} (coût 135 000)
- Défenseur : {"frigate":20} + défenses {} (coût 150 000)
- **Win rate attaquant : 12.5%** (draw 2.5%, defender 85.0%)
- Rounds moyens : 5.3
- Pertes moyennes — Attaquant : 123 525 (91.5%) · Défenseur net (après réparation) : 112 725 (75.2%)
- **Ratio coût att/def : 1.10** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 40 intercepteurs vs 3 cuirassés (~même coût)

- Attaquant : {"interceptor":40} (coût 120 000)
- Défenseur : {"battlecruiser":3} + défenses {} (coût 135 000)
- **Win rate attaquant : 99.0%** (draw 1.0%, defender 0.0%)
- Rounds moyens : 5.8
- Pertes moyennes — Attaquant : 56 670 (47.2%) · Défenseur net (après réparation) : 134 100 (99.3%)
- **Ratio coût att/def : 0.42** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 5 croiseurs vs 3 cuirassés

- Attaquant : {"cruiser":5} (coût 108 750)
- Défenseur : {"battlecruiser":3} + défenses {} (coût 135 000)
- **Win rate attaquant : 8.5%** (draw 1.5%, defender 90.0%)
- Rounds moyens : 4.7
- Pertes moyennes — Attaquant : 103 313 (95.0%) · Défenseur net (après réparation) : 31 050 (23.0%)
- **Ratio coût att/def : 3.33** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Flotte moyenne vs défenses légères + bouclier L3

- Attaquant : {"cruiser":10,"frigate":20} (coût 367 500)
- Défenseur : {} + défenses {"rocketLauncher":30,"lightLaser":20} + bouclier 85 (coût 150 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.9
- Pertes moyennes — Attaquant : 80 850 (22.0%) · Défenseur net (après réparation) : 74 595 (49.7%)
- **Ratio coût att/def : 1.08** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Grosse flotte vs défenses mid + bouclier L6

- Attaquant : {"cruiser":20,"battlecruiser":10} (coût 885 000)
- Défenseur : {} + défenses {"rocketLauncher":50,"lightLaser":40,"heavyLaser":15,"electromagneticCannon":5} + bouclier 186 (coût 532 500)
- **Win rate attaquant : 0.0%** (draw 22.0%, defender 78.0%)
- Rounds moyens : 5.8
- Pertes moyennes — Attaquant : 846 675 (95.7%) · Défenseur net (après réparation) : 133 433 (25.1%)
- **Ratio coût att/def : 6.35** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Très grosse flotte vs défenses stackées + bouclier L10

- Attaquant : {"cruiser":50,"battlecruiser":30,"frigate":50,"interceptor":100} (coût 3 112 500)
- Défenseur : {} + défenses {"rocketLauncher":100,"lightLaser":80,"heavyLaser":40,"electromagneticCannon":20,"plasmaTurret":10} + bouclier 530 (coût 2 415 000)
- **Win rate attaquant : 4.0%** (draw 96.0%, defender 0.0%)
- Rounds moyens : 6.0
- Pertes moyennes — Attaquant : 2 190 101 (70.4%) · Défenseur net (après réparation) : 721 913 (29.9%)
- **Ratio coût att/def : 3.03** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 50k budget: 25 rocketLauncher (50k) vs 12 cruiser (~348k) — test coût défenseur

- Attaquant : {"cruiser":12} (coût 261 000)
- Défenseur : {} + défenses {"rocketLauncher":25} (coût 75 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 38 220 (51.0%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 25 lightLaser (50k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 261 000)
- Défenseur : {} + défenses {"lightLaser":25} (coût 75 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 37 605 (50.1%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 6 heavyLaser (~48k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 261 000)
- Défenseur : {} + défenses {"heavyLaser":6} (coût 45 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 22 613 (50.3%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 1 plasmaTurret (~130k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 261 000)
- Défenseur : {} + défenses {"plasmaTurret":1} (coût 97 500)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 48 263 (49.5%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 1 electromagneticCannon (~37k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 261 000)
- Défenseur : {} + défenses {"electromagneticCannon":1} (coût 30 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 13 800 (46.0%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 100k vs 100k — 2 cuirassés vs défenses mix

- Attaquant : {"battlecruiser":2} (coût 90 000)
- Défenseur : {} + défenses {"rocketLauncher":20,"lightLaser":15,"heavyLaser":10} (coût 180 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 90 000 (100.0%) · Défenseur net (après réparation) : 2 378 (1.3%)
- **Ratio coût att/def : 37.85** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 100k vs 100k — 5 croiseurs vs défenses mix

- Attaquant : {"cruiser":5} (coût 108 750)
- Défenseur : {} + défenses {"rocketLauncher":20,"lightLaser":15,"heavyLaser":10} (coût 180 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 108 750 (100.0%) · Défenseur net (après réparation) : 5 768 (3.2%)
- **Ratio coût att/def : 18.86** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 300k vs 300k — flotte équilibrée vs défenses équilibrées

- Attaquant : {"cruiser":8,"battlecruiser":4,"frigate":10} (coût 429 000)
- Défenseur : {} + défenses {"rocketLauncher":30,"lightLaser":30,"heavyLaser":15,"electromagneticCannon":5,"plasmaTurret":1} (coût 540 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 429 000 (100.0%) · Défenseur net (après réparation) : 26 378 (4.9%)
- **Ratio coût att/def : 16.26** (< 1 = favorable attaquant, > 1 = favorable défenseur)

