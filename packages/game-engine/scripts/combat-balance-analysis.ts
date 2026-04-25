/**
 * Combat balance analysis — runs a large series of combat simulations
 * against the production ship/defense profiles and reports aggregate
 * metrics (win rate, cost ratio, rounds, overkill).
 *
 * Run: pnpm --filter @exilium/game-engine exec tsx scripts/combat-balance-analysis.ts
 */
import { simulateCombat } from '../src/formulas/combat.js';
import type { CombatInput, ShipCombatConfig, CombatConfig, ShipCategory } from '../src/formulas/combat.js';
import { calculateShieldCapacity } from '../src/formulas/shield.js';

// ── Categories (identical to prod seed) ──
const CATEGORIES: ShipCategory[] = [
  { id: 'light',   name: 'Léger',    targetable: true,  targetOrder: 1 },
  { id: 'medium',  name: 'Moyen',    targetable: true,  targetOrder: 2 },
  { id: 'heavy',   name: 'Lourd',    targetable: true,  targetOrder: 3 },
  { id: 'shield',  name: 'Bouclier', targetable: true,  targetOrder: 4 },
  { id: 'defense', name: 'Défense',  targetable: true,  targetOrder: 5 },
  { id: 'support', name: 'Support',  targetable: false, targetOrder: 6 },
];

const COMBAT_CONFIG: CombatConfig = {
  maxRounds: 6,
  debrisRatio: 0.35,
  defenseRepairRate: 0.5,
  pillageRatio: 0.33,
  minDamagePerHit: 1,
  researchBonusPerLevel: 0.1,
  categories: CATEGORIES,
};

// ── Ship / defense prod profiles (copied from seed-game-config.ts) ──
const SHIP_CONFIGS: Record<string, ShipCombatConfig> = {
  interceptor: {
    shipType: 'interceptor', categoryId: 'light',
    baseShield: 6, baseArmor: 1, baseHull: 12, baseWeaponDamage: 4, baseShotCount: 3,
    weapons: [{ damage: 4, shots: 3, targetCategory: 'light', hasChainKill: true }],
  },
  frigate: {
    shipType: 'frigate', categoryId: 'medium',
    baseShield: 16, baseArmor: 2, baseHull: 30, baseWeaponDamage: 12, baseShotCount: 2,
    weapons: [
      { damage: 12, shots: 1, targetCategory: 'medium' },
      { damage: 6,  shots: 2, targetCategory: 'light' },
    ],
  },
  cruiser: {
    shipType: 'cruiser', categoryId: 'heavy',
    baseShield: 32, baseArmor: 4, baseHull: 55, baseWeaponDamage: 45, baseShotCount: 1,
    weapons: [
      { damage: 35, shots: 1, targetCategory: 'heavy' },
      { damage: 6,  shots: 2, targetCategory: 'light', rafale: { category: 'light', count: 6 } },
    ],
  },
  battlecruiser: {
    shipType: 'battlecruiser', categoryId: 'heavy',
    baseShield: 40, baseArmor: 6, baseHull: 120, baseWeaponDamage: 70, baseShotCount: 1,
    weapons: [
      { damage: 50, shots: 1, targetCategory: 'heavy' },
      { damage: 10, shots: 2, targetCategory: 'medium', rafale: { category: 'medium', count: 4 } },
    ],
  },
  // Defenses (prod stats)
  rocketLauncher: {
    shipType: 'rocketLauncher', categoryId: 'defense',
    baseShield: 8, baseArmor: 1, baseHull: 14, baseWeaponDamage: 6, baseShotCount: 2,
    weapons: [{ damage: 6, shots: 2, targetCategory: 'light', hasChainKill: true }],
  },
  lightLaser: {
    shipType: 'lightLaser', categoryId: 'defense',
    baseShield: 8, baseArmor: 1, baseHull: 12, baseWeaponDamage: 7, baseShotCount: 3,
    weapons: [{ damage: 7, shots: 3, targetCategory: 'light', hasChainKill: true }],
  },
  heavyLaser: {
    shipType: 'heavyLaser', categoryId: 'defense',
    baseShield: 18, baseArmor: 3, baseHull: 35, baseWeaponDamage: 15, baseShotCount: 2,
    weapons: [{ damage: 15, shots: 2, targetCategory: 'medium' }],
  },
  electromagneticCannon: {
    shipType: 'electromagneticCannon', categoryId: 'defense',
    baseShield: 35, baseArmor: 5, baseHull: 70, baseWeaponDamage: 55, baseShotCount: 1,
    weapons: [{ damage: 55, shots: 1, targetCategory: 'heavy' }],
  },
  plasmaTurret: {
    shipType: 'plasmaTurret', categoryId: 'defense',
    baseShield: 60, baseArmor: 7, baseHull: 140, baseWeaponDamage: 90, baseShotCount: 1,
    weapons: [{ damage: 90, shots: 1, targetCategory: 'heavy' }],
  },
};

const SHIP_IDS = new Set(['interceptor', 'frigate', 'cruiser', 'battlecruiser']);
const DEFENSE_IDS = new Set(['rocketLauncher', 'lightLaser', 'heavyLaser', 'electromagneticCannon', 'plasmaTurret']);

// ── Costs (minerai + silicium + hydrogène, weighted equally for "value") ──
// Approche C — coûts réduits de 25% sur ships militaires + défenses lourdes,
// défenses légères inchangées (préservation du nerf cost-efficiency).
const COSTS: Record<string, { minerai: number; silicium: number; hydrogene: number }> = {
  interceptor:           { minerai: 2250,  silicium: 750,   hydrogene: 0 },
  frigate:               { minerai: 4500,  silicium: 3000,  hydrogene: 0 },
  cruiser:               { minerai: 15000, silicium: 5250,  hydrogene: 1500 },
  battlecruiser:         { minerai: 33750, silicium: 11250, hydrogene: 0 },
  rocketLauncher:        { minerai: 3000,  silicium: 0,     hydrogene: 0 },
  lightLaser:            { minerai: 2250,  silicium: 750,   hydrogene: 0 },
  heavyLaser:            { minerai: 5625,  silicium: 1875,  hydrogene: 0 },
  electromagneticCannon: { minerai: 16500, silicium: 12000, hydrogene: 1500 },
  plasmaTurret:          { minerai: 37500, silicium: 37500, hydrogene: 22500 },
};

const SHIP_COSTS: Record<string, { minerai: number; silicium: number }> = {};
for (const [id, cost] of Object.entries(COSTS)) {
  SHIP_COSTS[id] = { minerai: cost.minerai, silicium: cost.silicium };
}

function totalCost(cost: { minerai: number; silicium: number; hydrogene: number }): number {
  return cost.minerai + cost.silicium + cost.hydrogene;
}
function fleetCost(fleet: Record<string, number>): number {
  return Object.entries(fleet).reduce((s, [id, n]) => s + (COSTS[id] ? totalCost(COSTS[id]) * n : 0), 0);
}

const NO_BONUS = { weapons: 1, shielding: 1, armor: 1 };

interface MatchupResult {
  name: string;
  attackerFleet: Record<string, number>;
  defenderFleet: Record<string, number>;
  defenderDefenses: Record<string, number>;
  planetaryShieldCapacity: number;
  wins: number;
  draws: number;
  losses: number;
  totalAttackerValueLost: number;
  totalDefenderValueLost: number;
  totalAttackerValueDeployed: number;
  totalDefenderValueDeployed: number;
  totalRounds: number;
  totalOverkill: number;
  runs: number;
}

function runMatchup(
  name: string,
  attackerFleet: Record<string, number>,
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number> = {},
  planetaryShieldCapacity = 0,
  runs = 200,
): MatchupResult {
  const result: MatchupResult = {
    name,
    attackerFleet,
    defenderFleet,
    defenderDefenses,
    planetaryShieldCapacity,
    wins: 0, draws: 0, losses: 0,
    totalAttackerValueLost: 0,
    totalDefenderValueLost: 0,
    totalAttackerValueDeployed: fleetCost(attackerFleet),
    totalDefenderValueDeployed: fleetCost(defenderFleet) + fleetCost(defenderDefenses),
    totalRounds: 0,
    totalOverkill: 0,
    runs,
  };

  for (let i = 0; i < runs; i++) {
    const input: CombatInput = {
      attackerFleet: { ...attackerFleet },
      defenderFleet: { ...defenderFleet },
      defenderDefenses: { ...defenderDefenses },
      attackerMultipliers: NO_BONUS,
      defenderMultipliers: NO_BONUS,
      combatConfig: COMBAT_CONFIG,
      shipConfigs: SHIP_CONFIGS,
      shipCosts: SHIP_COSTS,
      shipIds: SHIP_IDS,
      defenseIds: DEFENSE_IDS,
      rngSeed: 7000 + i,
      planetaryShieldCapacity,
    };

    const r = simulateCombat(input);
    if (r.outcome === 'attacker') result.wins++;
    else if (r.outcome === 'defender') result.losses++;
    else result.draws++;

    // Defense losses after 70% repair
    result.totalAttackerValueLost += fleetCost(r.attackerLosses);
    const defShipLosses: Record<string, number> = {};
    const defDefLosses: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.defenderLosses)) {
      if (DEFENSE_IDS.has(k)) defDefLosses[k] = Math.max(0, v - (r.repairedDefenses[k] ?? 0));
      else defShipLosses[k] = v;
    }
    result.totalDefenderValueLost += fleetCost(defShipLosses) + fleetCost(defDefLosses);
    result.totalRounds += r.rounds.length;
    result.totalOverkill += r.attackerStats.overkillWasted;
  }

  return result;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}
function pct(n: number, total: number): string {
  return total > 0 ? `${(100 * n / total).toFixed(1)}%` : '—';
}
function formatMatchup(r: MatchupResult): string {
  const winRate = (100 * r.wins / r.runs).toFixed(1);
  const drawRate = (100 * r.draws / r.runs).toFixed(1);
  const lossRate = (100 * r.losses / r.runs).toFixed(1);
  const avgRounds = (r.totalRounds / r.runs).toFixed(1);
  const avgAttLost = r.totalAttackerValueLost / r.runs;
  const avgDefLost = r.totalDefenderValueLost / r.runs;
  const attLossPct = r.totalAttackerValueDeployed > 0 ? pct(avgAttLost, r.totalAttackerValueDeployed) : '—';
  const defLossPct = r.totalDefenderValueDeployed > 0 ? pct(avgDefLost, r.totalDefenderValueDeployed) : '—';
  const ratio = avgDefLost > 0 ? (avgAttLost / avgDefLost).toFixed(2) : '∞';
  return [
    `### ${r.name}`,
    ``,
    `- Attaquant : ${JSON.stringify(r.attackerFleet)} (coût ${fmt(r.totalAttackerValueDeployed)})`,
    `- Défenseur : ${JSON.stringify(r.defenderFleet)} + défenses ${JSON.stringify(r.defenderDefenses)}${r.planetaryShieldCapacity > 0 ? ` + bouclier ${r.planetaryShieldCapacity}` : ''} (coût ${fmt(r.totalDefenderValueDeployed)})`,
    `- **Win rate attaquant : ${winRate}%** (draw ${drawRate}%, defender ${lossRate}%)`,
    `- Rounds moyens : ${avgRounds}`,
    `- Pertes moyennes — Attaquant : ${fmt(avgAttLost)} (${attLossPct}) · Défenseur net (après réparation) : ${fmt(avgDefLost)} (${defLossPct})`,
    `- **Ratio coût att/def : ${ratio}** (< 1 = favorable attaquant, > 1 = favorable défenseur)`,
    ``,
  ].join('\n');
}

// ── Scenarios ──
const scenarios: MatchupResult[] = [];

// 1. Head-to-head matchups (cost-equivalent)
// 1 cruiser ≈ 29k | 1 battlecruiser ≈ 60k | 1 frigate ≈ 10k | 1 interceptor ≈ 4k
scenarios.push(runMatchup('1v1 — Intercepteur × 15 vs Frégate × 6 (≈ équivalent coût)', { interceptor: 15 }, { frigate: 6 }));
scenarios.push(runMatchup('1v1 — Intercepteur × 15 vs Croiseur × 2 (≈ équivalent coût)', { interceptor: 15 }, { cruiser: 2 }));
scenarios.push(runMatchup('1v1 — Frégate × 6 vs Croiseur × 2 (≈ équivalent coût)', { frigate: 6 }, { cruiser: 2 }));
scenarios.push(runMatchup('1v1 — Croiseur × 2 vs Cuirassé × 1 (≈ équivalent coût)', { cruiser: 2 }, { battlecruiser: 1 }));
scenarios.push(runMatchup('1v1 — Intercepteur × 15 vs Cuirassé × 1 (≈ équivalent coût)', { interceptor: 15 }, { battlecruiser: 1 }));

// 2. Spam tests (1 type vs 1 type, same cost)
scenarios.push(runMatchup('Spam — 50 intercepteurs vs 50 intercepteurs (miroir)', { interceptor: 50 }, { interceptor: 50 }));
scenarios.push(runMatchup('Spam — 20 frégates vs 20 frégates (miroir)', { frigate: 20 }, { frigate: 20 }));
scenarios.push(runMatchup('Spam — 10 croiseurs vs 10 croiseurs (miroir)', { cruiser: 10 }, { cruiser: 10 }));
scenarios.push(runMatchup('Spam — 5 cuirassés vs 5 cuirassés (miroir)', { battlecruiser: 5 }, { battlecruiser: 5 }));

// 3. Counter tests
scenarios.push(runMatchup('Counter — 5 croiseurs vs 40 intercepteurs (~même coût)', { cruiser: 5 }, { interceptor: 40 }));
scenarios.push(runMatchup('Counter — 3 cuirassés vs 20 frégates (~même coût)', { battlecruiser: 3 }, { frigate: 20 }));
scenarios.push(runMatchup('Counter — 40 intercepteurs vs 3 cuirassés (~même coût)', { interceptor: 40 }, { battlecruiser: 3 }));
scenarios.push(runMatchup('Counter — 5 croiseurs vs 3 cuirassés', { cruiser: 5 }, { battlecruiser: 3 }));

// 4. Attaque vs défenses planétaires
const shieldL3 = calculateShieldCapacity(3); // 85 après rebalance
const shieldL6 = calculateShieldCapacity(6); // ~186
const shieldL10 = calculateShieldCapacity(10); // 530
scenarios.push(runMatchup('Défense — Flotte moyenne vs défenses légères + bouclier L3',
  { cruiser: 10, frigate: 20 },
  {},
  { rocketLauncher: 30, lightLaser: 20 },
  shieldL3,
));
scenarios.push(runMatchup('Défense — Grosse flotte vs défenses mid + bouclier L6',
  { cruiser: 20, battlecruiser: 10 },
  {},
  { rocketLauncher: 50, lightLaser: 40, heavyLaser: 15, electromagneticCannon: 5 },
  shieldL6,
));
scenarios.push(runMatchup('Défense — Très grosse flotte vs défenses stackées + bouclier L10',
  { cruiser: 50, battlecruiser: 30, frigate: 50, interceptor: 100 },
  {},
  { rocketLauncher: 100, lightLaser: 80, heavyLaser: 40, electromagneticCannon: 20, plasmaTurret: 10 },
  shieldL10,
));

// 5. Cost-efficiency des défenses individuelles (50k de défense vs 50k d'attaque)
// Budget 50k par camp
scenarios.push(runMatchup('Efficacité défense — 50k budget: 25 rocketLauncher (50k) vs 12 cruiser (~348k) — test coût défenseur',
  { cruiser: 12 },
  {},
  { rocketLauncher: 25 },
));
scenarios.push(runMatchup('Efficacité défense — 25 lightLaser (50k) vs 12 cruiser (~348k)',
  { cruiser: 12 },
  {},
  { lightLaser: 25 },
));
scenarios.push(runMatchup('Efficacité défense — 6 heavyLaser (~48k) vs 12 cruiser (~348k)',
  { cruiser: 12 },
  {},
  { heavyLaser: 6 },
));
scenarios.push(runMatchup('Efficacité défense — 1 plasmaTurret (~130k) vs 12 cruiser (~348k)',
  { cruiser: 12 },
  {},
  { plasmaTurret: 1 },
));
scenarios.push(runMatchup('Efficacité défense — 1 electromagneticCannon (~37k) vs 12 cruiser (~348k)',
  { cruiser: 12 },
  {},
  { electromagneticCannon: 1 },
));

// 6. Investment test — même coût côté attaquant et défenseur en défenses
scenarios.push(runMatchup('100k vs 100k — 2 cuirassés vs défenses mix',
  { battlecruiser: 2 }, // ~120k
  {},
  { rocketLauncher: 20, lightLaser: 15, heavyLaser: 10 }, // ~108k
));
scenarios.push(runMatchup('100k vs 100k — 5 croiseurs vs défenses mix',
  { cruiser: 5 }, // ~145k
  {},
  { rocketLauncher: 20, lightLaser: 15, heavyLaser: 10 }, // ~108k
));
scenarios.push(runMatchup('300k vs 300k — flotte équilibrée vs défenses équilibrées',
  { cruiser: 8, battlecruiser: 4, frigate: 10 }, // ~380k
  {},
  { rocketLauncher: 30, lightLaser: 30, heavyLaser: 15, electromagneticCannon: 5, plasmaTurret: 1 }, // ~385k
));

// ── Output ──
console.log('# Analyse d\'équilibrage combat — Exilium\n');
console.log(`_Série de ${scenarios[0].runs} combats simulés par scénario (seeds variés, multiplicateurs neutres 1×1×1)._\n`);
console.log('## Résumé\n');

// Summary table
console.log('| Scénario | Win att. | Ratio coût att/def | Rounds moy. |');
console.log('|---|---:|---:|---:|');
for (const r of scenarios) {
  const winRate = (100 * r.wins / r.runs).toFixed(0);
  const avgAttLost = r.totalAttackerValueLost / r.runs;
  const avgDefLost = r.totalDefenderValueLost / r.runs;
  const ratio = avgDefLost > 0 ? (avgAttLost / avgDefLost).toFixed(2) : '∞';
  const rounds = (r.totalRounds / r.runs).toFixed(1);
  console.log(`| ${r.name} | ${winRate}% | ${ratio} | ${rounds} |`);
}

console.log('\n## Détails par scénario\n');
for (const r of scenarios) console.log(formatMatchup(r));
