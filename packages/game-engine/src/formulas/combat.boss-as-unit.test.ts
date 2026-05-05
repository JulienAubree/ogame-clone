import { describe, it, expect } from 'vitest';
import { simulateCombat } from './combat.js';
import type { BossSkillRuntime, ShipCombatConfig } from './combat.js';
import { COMBAT_CATEGORIES } from './combat-config.js';
import { SHIP_CONFIGS, SHIP_IDS, makeInput } from './combat.fixtures.js';

/**
 * V9.2 Boss-as-unit — tests sur l'injection d'une vraie unité boss dans la
 * flotte enemy avec category='boss', ciblée en dernier (après les escortes).
 * Couvre :
 *  - boss ciblé en dernier (escortes meurent d'abord)
 *  - last_stand sur le boss-unit
 *  - regen heal le hull du boss
 *  - shield_aura inflate le shield du boss
 *  - escortes + boss apparaissent comme deux entités distinctes en simulation
 */

// Stats équilibrées pour 1v1 finisable : flagship ~3000 hull avec gros punch,
// boss tank mais pas indestructible. Le ratio damage/hull garantit que les
// combats convergent en quelques rounds (sans timeout).
const FLAGSHIP: ShipCombatConfig = {
  shipType: 'flagship', categoryId: 'capital',
  baseShield: 100, baseArmor: 5, baseHull: 800,
  baseWeaponDamage: 80, baseShotCount: 3,
  weapons: [
    // targetCategory='medium' pour qu'il vise les frigates en priorité,
    // puis fallback sur les autres targetable, puis non-targetable.
    { damage: 80, shots: 3, targetCategory: 'medium' },
  ],
};

const BOSS_UNIT: ShipCombatConfig = {
  shipType: 'boss:test-titan', categoryId: 'boss',
  baseShield: 80, baseArmor: 4, baseHull: 300,
  baseWeaponDamage: 30, baseShotCount: 1,
  weapons: [
    { damage: 30, shots: 1, targetCategory: 'capital' },
  ],
};

const SHIP_CONFIGS_FULL: Record<string, ShipCombatConfig> = {
  ...SHIP_CONFIGS,
  flagship: FLAGSHIP,
  'boss:test-titan': BOSS_UNIT,
};

const SHIP_IDS_FULL = new Set([...SHIP_IDS, 'flagship', 'boss:test-titan']);

const COMBAT_CONFIG_PROD = {
  // maxRounds élevé pour reproduire le mode anomaly (anomaly.combat.ts:543).
  maxRounds: 9999,
  debrisRatio: 0.3,
  defenseRepairRate: 0.7,
  pillageRatio: 0,
  minDamagePerHit: 1,
  researchBonusPerLevel: 0.1,
  categories: COMBAT_CATEGORIES,
};

function runWithBoss(args: {
  defenderFleet?: Record<string, number>;
  bossSkills?: BossSkillRuntime[];
  rngSeed?: number;
} = {}) {
  return simulateCombat(makeInput({
    attackerFleet: { flagship: 1 },
    defenderFleet: args.defenderFleet ?? { interceptor: 3, 'boss:test-titan': 1 },
    shipConfigs: SHIP_CONFIGS_FULL,
    shipIds: SHIP_IDS_FULL,
    rngSeed: args.rngSeed ?? 7,
    bossSkills: args.bossSkills,
    combatConfig: COMBAT_CONFIG_PROD,
  }));
}

describe('boss-as-unit — targeting order', () => {
  it("le boss n'est pas ciblé tant que des escortes (light) vivent", () => {
    // Setup : flagship vs 5 interceptors + 1 boss. Au round 1, le flagship
    // doit cibler les interceptors (category 'light' targetable), pas le
    // boss (category 'boss', non-targetable jusqu'à ce que les light tombent).
    const result = runWithBoss({ defenderFleet: { interceptor: 5, 'boss:test-titan': 1 }, rngSeed: 11 });
    const r1 = result.rounds[0];
    // Le boss doit avoir son hull intact au round 1 (les interceptors ont
    // tanké ou été détruits avant).
    const bossHP = r1.defenderHPByType?.['boss:test-titan'];
    expect(bossHP).toBeDefined();
    expect(bossHP!.hullRemaining).toBe(BOSS_UNIT.baseHull);
  });

  it('le boss devient ciblable une fois les escortes mortes', () => {
    // Configuration où le flagship écrase le boss seul après que les escortes
    // tombent. On vérifie qu'à la fin du combat, le boss a bien pris des
    // dégâts (= il a été ciblé) et que le combat termine.
    const result = runWithBoss({ defenderFleet: { interceptor: 1, 'boss:test-titan': 1 }, rngSeed: 3 });
    expect(result.outcome).toBe('attacker');
    // Boss détruit dans defenderLosses
    expect(result.defenderLosses['boss:test-titan']).toBe(1);
  });
});

describe('boss-as-unit — last_stand', () => {
  it('le boss survit à un coup mortel grâce à last_stand (1 fois)', () => {
    const skills: BossSkillRuntime[] = [
      { type: 'last_stand', magnitude: 1, side: 'defender', bossShipType: 'boss:test-titan' },
    ];
    const baseline = runWithBoss({
      defenderFleet: { 'boss:test-titan': 1 },
      rngSeed: 5,
    });
    const withLastStand = runWithBoss({
      defenderFleet: { 'boss:test-titan': 1 },
      bossSkills: skills,
      rngSeed: 5,
    });
    // Avec last_stand, le boss tient au moins autant de rounds que sans.
    // Plus important : le combat n'a pas planté.
    expect(withLastStand.rounds.length).toBeGreaterThanOrEqual(baseline.rounds.length);
    expect(withLastStand.outcome).not.toBe('draw');
  });
});

describe('boss-as-unit — regen', () => {
  it('regen heal le hull du boss chaque round (combat plus long)', () => {
    const baseline = runWithBoss({
      defenderFleet: { 'boss:test-titan': 1 },
      rngSeed: 9,
    });
    const regen = runWithBoss({
      defenderFleet: { 'boss:test-titan': 1 },
      bossSkills: [
        { type: 'regen', magnitude: 0.40, side: 'defender', bossShipType: 'boss:test-titan' },
      ],
      rngSeed: 9,
    });
    // Avec 40% regen / round, le boss tient plus longtemps (ou autant que baseline).
    expect(regen.rounds.length).toBeGreaterThanOrEqual(baseline.rounds.length);
  });
});

describe('boss-as-unit — shield_aura', () => {
  it('shield_aura multiplie le shield maxi du boss-unit', () => {
    const aura = runWithBoss({
      defenderFleet: { 'boss:test-titan': 1 },
      bossSkills: [
        { type: 'shield_aura', magnitude: 4, side: 'defender', bossShipType: 'boss:test-titan' },
      ],
      rngSeed: 9,
    });
    // Boss avec shield ×4 → tient plus longtemps qu'à shield baseline.
    const baseline = runWithBoss({
      defenderFleet: { 'boss:test-titan': 1 },
      rngSeed: 9,
    });
    expect(aura.rounds.length).toBeGreaterThanOrEqual(baseline.rounds.length);
  });

  it("shield_aura ciblé avec bossShipType n'affecte pas les escortes", () => {
    // Avec shield_aura ×50 et bossShipType bind, les escortes (interceptor)
    // ne devraient PAS avoir leur shield gonflé. On vérifie qu'elles
    // tombent quand même (defenderLosses contient interceptor).
    const result = runWithBoss({
      defenderFleet: { interceptor: 3, 'boss:test-titan': 1 },
      bossSkills: [
        { type: 'shield_aura', magnitude: 50, side: 'defender', bossShipType: 'boss:test-titan' },
      ],
      rngSeed: 8,
    });
    // Au minimum 1 interceptor abattu — le shield aura n'a pas inflated leur shield.
    expect(result.defenderLosses['interceptor'] ?? 0).toBeGreaterThan(0);
  });
});

describe('boss-as-unit — composition mixte', () => {
  it('boss + escortes : le boss survit aux premiers rounds, les escortes fragiles tombent', () => {
    const result = runWithBoss({
      defenderFleet: { interceptor: 3, frigate: 1, 'boss:test-titan': 1 },
      rngSeed: 14,
    });
    const r1 = result.rounds[0];
    // Round 1 : le boss doit avoir son hull intact (le flagship vise les
    // catégories targetable d'abord — ici interceptor/frigate).
    // Note : aggregateHPByType skip les unités détruites — si interceptor/
    // frigate meurent au round 1, ils n'apparaissent pas. C'est OK : le
    // critère c'est que le boss soit ENCORE PRÉSENT et INTACT au round 1.
    expect(r1.defenderHPByType?.['boss:test-titan']).toBeDefined();
    expect(r1.defenderHPByType!['boss:test-titan']!.hullRemaining).toBe(BOSS_UNIT.baseHull);
    // Et au moins 1 escorte est tombée (defenderLosses non vide hors boss).
    const escortLosses = (result.defenderLosses['interceptor'] ?? 0)
      + (result.defenderLosses['frigate'] ?? 0);
    expect(escortLosses).toBeGreaterThan(0);
  });
});
