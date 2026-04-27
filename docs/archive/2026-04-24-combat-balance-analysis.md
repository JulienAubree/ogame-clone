> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Analyse d'équilibrage combat — Exilium

_Série de 200 combats simulés par scénario (seeds variés, multiplicateurs neutres 1×1×1)._

## Résumé

| Scénario | Win att. | Ratio coût att/def | Rounds moy. |
|---|---:|---:|---:|
| 1v1 — Intercepteur × 15 vs Frégate × 6 (≈ équivalent coût) | 0% | 15.22 | 4.0 |
| 1v1 — Intercepteur × 15 vs Croiseur × 2 (≈ équivalent coût) | 0% | 46.60 | 4.0 |
| 1v1 — Frégate × 6 vs Croiseur × 2 (≈ équivalent coût) | 99% | 0.30 | 3.3 |
| 1v1 — Croiseur × 2 vs Cuirassé × 1 (≈ équivalent coût) | 73% | 0.44 | 4.0 |
| 1v1 — Intercepteur × 15 vs Cuirassé × 1 (≈ équivalent coût) | 100% | 0.27 | 4.0 |
| Spam — 50 intercepteurs vs 50 intercepteurs (miroir) | 48% | 1.02 | 3.5 |
| Spam — 20 frégates vs 20 frégates (miroir) | 3% | 0.99 | 4.0 |
| Spam — 10 croiseurs vs 10 croiseurs (miroir) | 4% | 1.05 | 4.0 |
| Spam — 5 cuirassés vs 5 cuirassés (miroir) | 12% | 1.03 | 4.0 |
| Counter — 5 croiseurs vs 40 intercepteurs (~même coût) | 0% | 0.45 | 4.0 |
| Counter — 3 cuirassés vs 20 frégates (~même coût) | 0% | 1.72 | 4.0 |
| Counter — 40 intercepteurs vs 3 cuirassés (~même coût) | 99% | 0.27 | 4.0 |
| Counter — 5 croiseurs vs 3 cuirassés | 1% | 3.40 | 4.0 |
| Défense — Flotte moyenne vs défenses légères + bouclier L3 | 100% | 4.37 | 3.0 |
| Défense — Grosse flotte vs défenses mid + bouclier L6 | 0% | 22.18 | 4.0 |
| Défense — Très grosse flotte vs défenses stackées + bouclier L10 | 0% | 13.00 | 4.0 |
| Efficacité défense — 50k budget: 25 rocketLauncher (50k) vs 12 cruiser (~348k) — test coût défenseur | 100% | 0.00 | 2.1 |
| Efficacité défense — 25 lightLaser (50k) vs 12 cruiser (~348k) | 100% | 0.00 | 2.0 |
| Efficacité défense — 6 heavyLaser (~48k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| Efficacité défense — 1 plasmaTurret (~130k) vs 12 cruiser (~348k) | 100% | 0.72 | 1.0 |
| Efficacité défense — 1 electromagneticCannon (~37k) vs 12 cruiser (~348k) | 100% | 0.00 | 1.0 |
| 100k vs 100k — 2 cuirassés vs défenses mix | 0% | 122.45 | 1.0 |
| 100k vs 100k — 5 croiseurs vs défenses mix | 0% | 65.32 | 1.0 |
| 300k vs 300k — flotte équilibrée vs défenses équilibrées | 0% | 53.86 | 2.0 |

## Détails par scénario

### 1v1 — Intercepteur × 15 vs Frégate × 6 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 60 000)
- Défenseur : {"frigate":6} + défenses {} (coût 60 000)
- **Win rate attaquant : 0.0%** (draw 29.5%, defender 70.5%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 57 060 (95.1%) · Défenseur net (après réparation) : 3 750 (6.3%)
- **Ratio coût att/def : 15.22** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Intercepteur × 15 vs Croiseur × 2 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 60 000)
- Défenseur : {"cruiser":2} + défenses {} (coût 58 000)
- **Win rate attaquant : 0.0%** (draw 99.5%, defender 0.5%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 40 540 (67.6%) · Défenseur net (après réparation) : 870 (1.5%)
- **Ratio coût att/def : 46.60** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Frégate × 6 vs Croiseur × 2 (≈ équivalent coût)

- Attaquant : {"frigate":6} (coût 60 000)
- Défenseur : {"cruiser":2} + défenses {} (coût 58 000)
- **Win rate attaquant : 98.5%** (draw 1.5%, defender 0.0%)
- Rounds moyens : 3.3
- Pertes moyennes — Attaquant : 17 250 (28.8%) · Défenseur net (après réparation) : 57 565 (99.3%)
- **Ratio coût att/def : 0.30** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Croiseur × 2 vs Cuirassé × 1 (≈ équivalent coût)

- Attaquant : {"cruiser":2} (coût 58 000)
- Défenseur : {"battlecruiser":1} + défenses {} (coût 60 000)
- **Win rate attaquant : 72.5%** (draw 24.0%, defender 3.5%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 19 140 (33.0%) · Défenseur net (après réparation) : 43 500 (72.5%)
- **Ratio coût att/def : 0.44** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 1v1 — Intercepteur × 15 vs Cuirassé × 1 (≈ équivalent coût)

- Attaquant : {"interceptor":15} (coût 60 000)
- Défenseur : {"battlecruiser":1} + défenses {} (coût 60 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 16 100 (26.8%) · Défenseur net (après réparation) : 60 000 (100.0%)
- **Ratio coût att/def : 0.27** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 50 intercepteurs vs 50 intercepteurs (miroir)

- Attaquant : {"interceptor":50} (coût 200 000)
- Défenseur : {"interceptor":50} + défenses {} (coût 200 000)
- **Win rate attaquant : 47.5%** (draw 2.0%, defender 50.5%)
- Rounds moyens : 3.5
- Pertes moyennes — Attaquant : 160 760 (80.4%) · Défenseur net (après réparation) : 158 000 (79.0%)
- **Ratio coût att/def : 1.02** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 20 frégates vs 20 frégates (miroir)

- Attaquant : {"frigate":20} (coût 200 000)
- Défenseur : {"frigate":20} + défenses {} (coût 200 000)
- **Win rate attaquant : 3.0%** (draw 94.5%, defender 2.5%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 107 850 (53.9%) · Défenseur net (après réparation) : 108 500 (54.3%)
- **Ratio coût att/def : 0.99** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 10 croiseurs vs 10 croiseurs (miroir)

- Attaquant : {"cruiser":10} (coût 290 000)
- Défenseur : {"cruiser":10} + défenses {} (coût 290 000)
- **Win rate attaquant : 3.5%** (draw 89.0%, defender 7.5%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 166 605 (57.5%) · Défenseur net (après réparation) : 158 340 (54.6%)
- **Ratio coût att/def : 1.05** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Spam — 5 cuirassés vs 5 cuirassés (miroir)

- Attaquant : {"battlecruiser":5} (coût 300 000)
- Défenseur : {"battlecruiser":5} + défenses {} (coût 300 000)
- **Win rate attaquant : 11.5%** (draw 75.5%, defender 13.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 152 700 (50.9%) · Défenseur net (après réparation) : 147 900 (49.3%)
- **Ratio coût att/def : 1.03** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 5 croiseurs vs 40 intercepteurs (~même coût)

- Attaquant : {"cruiser":5} (coût 145 000)
- Défenseur : {"interceptor":40} + défenses {} (coût 160 000)
- **Win rate attaquant : 0.0%** (draw 100.0%, defender 0.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 41 760 (28.8%) · Défenseur net (après réparation) : 92 940 (58.1%)
- **Ratio coût att/def : 0.45** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 3 cuirassés vs 20 frégates (~même coût)

- Attaquant : {"battlecruiser":3} (coût 180 000)
- Défenseur : {"frigate":20} + défenses {} (coût 200 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 180 000 (100.0%) · Défenseur net (après réparation) : 104 500 (52.3%)
- **Ratio coût att/def : 1.72** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 40 intercepteurs vs 3 cuirassés (~même coût)

- Attaquant : {"interceptor":40} (coût 160 000)
- Défenseur : {"battlecruiser":3} + défenses {} (coût 180 000)
- **Win rate attaquant : 99.0%** (draw 1.0%, defender 0.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 48 560 (30.4%) · Défenseur net (après réparation) : 179 400 (99.7%)
- **Ratio coût att/def : 0.27** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Counter — 5 croiseurs vs 3 cuirassés

- Attaquant : {"cruiser":5} (coût 145 000)
- Défenseur : {"battlecruiser":3} + défenses {} (coût 180 000)
- **Win rate attaquant : 1.0%** (draw 36.5%, defender 62.5%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 127 600 (88.0%) · Défenseur net (après réparation) : 37 500 (20.8%)
- **Ratio coût att/def : 3.40** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Flotte moyenne vs défenses légères + bouclier L3

- Attaquant : {"cruiser":10,"frigate":20} (coût 490 000)
- Défenseur : {} + défenses {"rocketLauncher":30,"lightLaser":20} + bouclier 85 (coût 100 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 3.0
- Pertes moyennes — Attaquant : 127 750 (26.1%) · Défenseur net (après réparation) : 29 230 (29.2%)
- **Ratio coût att/def : 4.37** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Grosse flotte vs défenses mid + bouclier L6

- Attaquant : {"cruiser":20,"battlecruiser":10} (coût 1 180 000)
- Défenseur : {} + défenses {"rocketLauncher":50,"lightLaser":40,"heavyLaser":15,"electromagneticCannon":5} + bouclier 186 (coût 485 000)
- **Win rate attaquant : 0.0%** (draw 86.0%, defender 14.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 983 535 (83.4%) · Défenseur net (après réparation) : 44 340 (9.1%)
- **Ratio coût att/def : 22.18** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Défense — Très grosse flotte vs défenses stackées + bouclier L10

- Attaquant : {"cruiser":50,"battlecruiser":30,"frigate":50,"interceptor":100} (coût 4 150 000)
- Défenseur : {} + défenses {"rocketLauncher":100,"lightLaser":80,"heavyLaser":40,"electromagneticCannon":20,"plasmaTurret":10} + bouclier 530 (coût 2 720 000)
- **Win rate attaquant : 0.0%** (draw 100.0%, defender 0.0%)
- Rounds moyens : 4.0
- Pertes moyennes — Attaquant : 2 664 265 (64.2%) · Défenseur net (après réparation) : 204 900 (7.5%)
- **Ratio coût att/def : 13.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 50k budget: 25 rocketLauncher (50k) vs 12 cruiser (~348k) — test coût défenseur

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"rocketLauncher":25} (coût 50 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.1
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 15 060 (30.1%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 25 lightLaser (50k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"lightLaser":25} (coût 50 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 14 850 (29.7%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 6 heavyLaser (~48k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"heavyLaser":6} (coût 48 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 14 120 (29.4%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 1 plasmaTurret (~130k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"plasmaTurret":1} (coût 130 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 29 000 (8.3%) · Défenseur net (après réparation) : 40 300 (31.0%)
- **Ratio coût att/def : 0.72** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### Efficacité défense — 1 electromagneticCannon (~37k) vs 12 cruiser (~348k)

- Attaquant : {"cruiser":12} (coût 348 000)
- Défenseur : {} + défenses {"electromagneticCannon":1} (coût 37 000)
- **Win rate attaquant : 100.0%** (draw 0.0%, defender 0.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 0 (0.0%) · Défenseur net (après réparation) : 9 620 (26.0%)
- **Ratio coût att/def : 0.00** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 100k vs 100k — 2 cuirassés vs défenses mix

- Attaquant : {"battlecruiser":2} (coût 120 000)
- Défenseur : {} + défenses {"rocketLauncher":20,"lightLaser":15,"heavyLaser":10} (coût 150 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 120 000 (100.0%) · Défenseur net (après réparation) : 980 (0.7%)
- **Ratio coût att/def : 122.45** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 100k vs 100k — 5 croiseurs vs défenses mix

- Attaquant : {"cruiser":5} (coût 145 000)
- Défenseur : {} + défenses {"rocketLauncher":20,"lightLaser":15,"heavyLaser":10} (coût 150 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 1.0
- Pertes moyennes — Attaquant : 145 000 (100.0%) · Défenseur net (après réparation) : 2 220 (1.5%)
- **Ratio coût att/def : 65.32** (< 1 = favorable attaquant, > 1 = favorable défenseur)

### 300k vs 300k — flotte équilibrée vs défenses équilibrées

- Attaquant : {"cruiser":8,"battlecruiser":4,"frigate":10} (coût 572 000)
- Défenseur : {} + défenses {"rocketLauncher":30,"lightLaser":30,"heavyLaser":15,"electromagneticCannon":5,"plasmaTurret":1} (coût 555 000)
- **Win rate attaquant : 0.0%** (draw 0.0%, defender 100.0%)
- Rounds moyens : 2.0
- Pertes moyennes — Attaquant : 572 000 (100.0%) · Défenseur net (après réparation) : 10 620 (1.9%)
- **Ratio coût att/def : 53.86** (< 1 = favorable attaquant, > 1 = favorable défenseur)

