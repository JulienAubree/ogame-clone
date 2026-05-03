> 🗄️ **ARCHIVÉ** — Le système de Talents a été retiré le 2026-05-03. Voir [`2026-05-03-talents-removal-design.md`](2026-05-03-talents-removal-design.md) pour la migration.

---

# Talent: Amplification Energétique (`sci_energy`)

## Résumé

Nouveau talent Tier 2 dans la branche Scientifique. Augmente la production d'énergie de +2% par rang (max 3 rangs = +6%) sur la planète où le flagship est stationné.

## Design

| Champ | Valeur |
|-------|--------|
| ID | `sci_energy` |
| Branche | `scientifique` |
| Tier | 2 |
| Position | `left` |
| Nom | Amplification Energétique |
| Description | +2% production d'énergie par rang (planète du flagship) |
| Max ranks | 3 |
| Prérequis | aucun |
| Effect type | `planet_bonus` |
| Effect params | `{ key: 'energy_production', perRank: 0.02 }` |

## Consommateur

Déjà implémenté dans `packages/game-engine/src/formulas/resources.ts:101` :

```typescript
const energyBonus = 1 + (talentBonuses?.['energy_production'] ?? 0);
const energyProduced = Math.floor((solarPlant + solarSat) * energyBonus);
```

Quand `energy_production = 0` (pas de talent), le comportement est inchangé (`1 + 0 = 1`).

## Stacking

La recherche `energyTech` injecte aussi dans `energy_production` via `resolveBonus()` dans `resource.service.ts:277`. Le talent s'additionne avec la recherche : un joueur avec energyTech niveau 5 (+10%) et sci_energy rang 3 (+6%) obtiendrait +16% total.

## Implémentation

1. Ajouter le talent dans `packages/db/src/seed-game-config.ts` (section TALENT_DEFINITIONS scientifique)
2. Mettre à jour `apps/admin/src/pages/GameplayKeys.tsx` avec la nouvelle entrée
3. Re-seed et tester en jeu

Aucun code service à écrire — le consommateur existe déjà.
