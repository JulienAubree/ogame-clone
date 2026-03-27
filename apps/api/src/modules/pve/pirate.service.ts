import { eq } from 'drizzle-orm';
import { pirateTemplates } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  simulateCombat,
  computeFleetFP,
  scaleFleetToFP,
  type CombatMultipliers,
  type CombatConfig,
  type CombatInput,
  type ShipCategory,
  type ShipCombatConfig,
  type UnitCombatStats,
  type FPConfig,
} from '@ogame-clone/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';

interface PirateArrivalResult {
  outcome: 'attacker' | 'defender' | 'draw';
  survivingShips: Record<string, number>;
  loot: { minerai: number; silicium: number; hydrogene: number };
  bonusShips: Record<string, number>;
  attackerLosses: Record<string, number>;
}

export function createPirateService(db: Database, gameConfigService: GameConfigService) {
  return {
    async pickTemplate(tier: 'easy' | 'medium' | 'hard') {
      const templates = await db.select().from(pirateTemplates)
        .where(eq(pirateTemplates.tier, tier));

      if (templates.length === 0) return null;
      return templates[Math.floor(Math.random() * templates.length)];
    },

    buildScaledPirateFleet(
      templateShips: Record<string, number>,
      centerLevel: number,
      playerFleetFP: number,
      universeConfig: Record<string, unknown>,
      shipStats: Record<string, UnitCombatStats>,
      fpConfig: FPConfig,
      tier: 'easy' | 'medium' | 'hard',
    ): { fleet: Record<string, number>; fp: number } {
      const fpMin = Number(universeConfig[`pirate_fp_${tier}_min`]) || 1;
      const fpMax = Number(universeConfig[`pirate_fp_${tier}_max`]) || 5;
      const capRatio = Number(universeConfig.pirate_fp_player_cap_ratio) || 0.8;

      const fpRaw = (fpMin + Math.random() * (fpMax - fpMin)) * centerLevel;
      const fpCapped = playerFleetFP > 0
        ? Math.min(fpRaw, playerFleetFP * capRatio)
        : fpRaw;
      const targetFP = Math.max(1, Math.round(fpCapped));

      const fleet = scaleFleetToFP(templateShips, targetFP, shipStats, fpConfig);
      const actualFP = computeFleetFP(fleet, shipStats, fpConfig);

      return { fleet, fp: actualFP };
    },

    async processPirateArrival(
      playerShips: Record<string, number>,
      playerMultipliers: CombatMultipliers,
      pirateFleet: Record<string, number>,
      fleetCargoCapacity: number,
      rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] },
    ): Promise<PirateArrivalResult> {
      const pirateShips = pirateFleet;
      const config = await gameConfigService.getFullConfig();
      const pirateMultipliers: CombatMultipliers = {
        weapons: 1,
        shielding: 1,
        armor: 1,
      };

      // Build ShipCombatConfig map from game config
      const shipCombatConfigs: Record<string, ShipCombatConfig> = {};
      for (const [id, ship] of Object.entries(config.ships)) {
        shipCombatConfigs[id] = {
          shipType: id,
          categoryId: ship.combatCategoryId ?? 'support',
          baseShield: ship.shield,
          baseArmor: ship.baseArmor ?? 0,
          baseHull: ship.hull,
          baseWeaponDamage: ship.weapons,
          baseShotCount: ship.shotCount ?? 1,
        };
      }
      for (const [id, def] of Object.entries(config.defenses)) {
        shipCombatConfigs[id] = {
          shipType: id,
          categoryId: def.combatCategoryId ?? 'heavy',
          baseShield: def.shield,
          baseArmor: def.baseArmor ?? 0,
          baseHull: def.hull,
          baseWeaponDamage: def.weapons,
          baseShotCount: def.shotCount ?? 1,
        };
      }

      const shipIds = new Set(Object.keys(config.ships));
      const shipCosts: Record<string, { minerai: number; silicium: number }> = {};
      for (const [id, ship] of Object.entries(config.ships)) {
        shipCosts[id] = { minerai: ship.cost.minerai, silicium: ship.cost.silicium };
      }

      const categories: ShipCategory[] = [
        { id: 'light', name: 'Léger', targetable: true, targetOrder: 1 },
        { id: 'medium', name: 'Moyen', targetable: true, targetOrder: 2 },
        { id: 'heavy', name: 'Lourd', targetable: true, targetOrder: 3 },
        { id: 'support', name: 'Support', targetable: false, targetOrder: 4 },
      ];

      const combatConfig: CombatConfig = {
        maxRounds: Number(config.universe['combat_max_rounds']) || 4,
        debrisRatio: Number(config.universe['combat_debris_ratio']) || 0.3,
        defenseRepairRate: Number(config.universe['combat_defense_repair_rate']) || 0.7,
        pillageRatio: Number(config.universe['combat_pillage_ratio']) || 0.33,
        minDamagePerHit: Number(config.universe['combat_min_damage_per_hit']) || 1,
        researchBonusPerLevel: Number(config.universe['combat_research_bonus_per_level']) || 0.1,
        categories,
      };

      const combatInput: CombatInput = {
        attackerFleet: playerShips,
        defenderFleet: pirateShips,
        defenderDefenses: {},
        attackerMultipliers: playerMultipliers,
        defenderMultipliers: pirateMultipliers,
        attackerTargetPriority: 'light',
        defenderTargetPriority: 'light',
        combatConfig,
        shipConfigs: shipCombatConfigs,
        shipCosts,
        shipIds,
        defenseIds: new Set(),
      };

      const result = simulateCombat(combatInput);

      // Calculate surviving ships
      const survivingShips: Record<string, number> = {};
      for (const [type, count] of Object.entries(playerShips)) {
        const lost = result.attackerLosses[type] ?? 0;
        const remaining = count - lost;
        if (remaining > 0) survivingShips[type] = remaining;
      }

      // Victory: loot + bonus ships
      let loot = { minerai: 0, silicium: 0, hydrogene: 0 };
      const bonusShips: Record<string, number> = {};

      if (result.outcome === 'attacker') {
        // Cap loot to cargo capacity
        const totalLoot = rewards.minerai + rewards.silicium + rewards.hydrogene;
        const ratio = totalLoot > fleetCargoCapacity ? fleetCargoCapacity / totalLoot : 1;
        loot = {
          minerai: Math.floor(rewards.minerai * ratio),
          silicium: Math.floor(rewards.silicium * ratio),
          hydrogene: Math.floor(rewards.hydrogene * ratio),
        };

        // Roll for bonus ships
        for (const bonus of rewards.bonusShips) {
          if (Math.random() < bonus.chance) {
            bonusShips[bonus.shipId] = (bonusShips[bonus.shipId] ?? 0) + bonus.count;
          }
        }
      }

      return {
        outcome: result.outcome,
        survivingShips,
        loot,
        bonusShips,
        attackerLosses: result.attackerLosses,
      };
    },
  };
}
