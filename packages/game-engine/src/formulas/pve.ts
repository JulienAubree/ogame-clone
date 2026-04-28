/**
 * Prospection duration in minutes.
 * Formula: 5 + floor(depositTotalQuantity / 10000) * 2
 */
export function prospectionDuration(depositTotalQuantity: number): number {
  return 5 + Math.floor(depositTotalQuantity / 10000) * 2;
}

/**
 * Mining duration in minutes at the belt.
 * Scales with cargo/extraction ratio: more cargo = longer, more extraction = shorter.
 * Formula: max(5, cargoCapacity / fleetExtraction * 10) * bonusMultiplier
 * Rock fracturing research reduces duration via bonusMultiplier.
 * @param fleetExtraction - total extraction capacity of the fleet (sum of miningExtraction per ship)
 */
export function miningDuration(
  cargoCapacity: number,
  fleetExtraction: number,
  bonusMultiplier: number,
): number {
  const effectiveExtraction = Math.max(fleetExtraction, 1);
  const rawMinutes = (cargoCapacity / effectiveExtraction) * 10;
  return Math.max(5, rawMinutes) * Math.max(0.01, bonusMultiplier);
}

/**
 * Discovery cooldown in hours.
 * Formula: max(1, 7 - level)
 * Level 1 = 6h, level 2 = 5h, …, level 6+ = 1h.
 */
export function discoveryCooldown(
  centerLevel: number,
  config: { base: number; minimum: number } = { base: 7, minimum: 1 },
): number {
  return Math.max(config.minimum, config.base - centerLevel);
}

/**
 * Total resource quantity of a deposit.
 * Formula: floor((15000 + 5000 * (centerLevel - 1)) * varianceMultiplier)
 */
export function depositSize(
  centerLevel: number,
  varianceMultiplier: number,
  config: { base: number; increment: number } = { base: 15000, increment: 5000 },
): number {
  return Math.floor((config.base + config.increment * (centerLevel - 1)) * varianceMultiplier);
}

/**
 * Resource composition ratios for a deposit.
 * Base ratios: 60/30/10. Hydrogene clamped to min 0.02. Normalized so sum = 1.
 */
export function depositComposition(
  mineraiOffset: number,
  siliciumOffset: number,
  config: { baseMinerai: number; baseSilicium: number; minHydrogene: number } = { baseMinerai: 0.60, baseSilicium: 0.30, minHydrogene: 0.02 },
): { minerai: number; silicium: number; hydrogene: number } {
  const rawMinerai = config.baseMinerai + mineraiOffset;
  const rawSilicium = config.baseSilicium + siliciumOffset;
  const unclamped = 1 - rawMinerai - rawSilicium;
  const hydrogene = Math.max(config.minHydrogene, unclamped);
  // Scale minerai and silicium proportionally to fill (1 - hydrogene)
  const msTotal = rawMinerai + rawSilicium;
  const msRoom = 1 - hydrogene;
  const scale = msTotal > 0 ? msRoom / msTotal : 0;
  return {
    minerai: rawMinerai * scale,
    silicium: rawSilicium * scale,
    hydrogene,
  };
}

/**
 * Compute effective slag rate after deep space refining tech.
 * Formula: baseSlagRate * 0.85^refiningLevel with clamping [0, 0.99]
 */
export function computeSlagRate(
  baseSlagRate: number,
  refiningLevel: number,
): number {
  const raw = baseSlagRate * 0.85 ** refiningLevel;
  return Math.min(0.99, Math.max(0, raw));
}

export interface ResourceAmounts {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

export interface MultiResourceExtraction {
  playerReceives: ResourceAmounts;
  depositLoss: ResourceAmounts;
}

/**
 * Compute mining extraction with slag mechanics across multiple resources.
 * Distributes extraction proportionally to remaining quantities per resource.
 * Returns per-resource playerReceives (net) and depositLoss (gross deducted).
 */
/**
 * @param fleetExtraction - total extraction capacity of the fleet (sum of miningExtraction per ship)
 */
export function computeMiningExtraction(params: {
  fleetExtraction: number;
  cargoCapacity: number;
  mineraiRemaining: number;
  siliciumRemaining: number;
  hydrogeneRemaining: number;
  slagRate: number;
}): MultiResourceExtraction {
  const { fleetExtraction, cargoCapacity, mineraiRemaining, siliciumRemaining, hydrogeneRemaining, slagRate } = params;

  const zero: ResourceAmounts = { minerai: 0, silicium: 0, hydrogene: 0 };
  const totalRemaining = mineraiRemaining + siliciumRemaining + hydrogeneRemaining;
  if (totalRemaining <= 0) return { playerReceives: { ...zero }, depositLoss: { ...zero } };

  const rawExtraction = fleetExtraction;
  const effectiveCargo = slagRate === 0 ? cargoCapacity : cargoCapacity * (1 - slagRate);
  const maxExtractable = Math.min(rawExtraction, effectiveCargo);

  const ratioM = mineraiRemaining / totalRemaining;
  const ratioS = siliciumRemaining / totalRemaining;

  if (maxExtractable >= totalRemaining) {
    const depositLoss: ResourceAmounts = {
      minerai: mineraiRemaining,
      silicium: siliciumRemaining,
      hydrogene: hydrogeneRemaining,
    };
    const playerReceives: ResourceAmounts = {
      minerai: Math.floor(mineraiRemaining * (1 - slagRate)),
      silicium: Math.floor(siliciumRemaining * (1 - slagRate)),
      hydrogene: Math.floor(hydrogeneRemaining * (1 - slagRate)),
    };
    if (slagRate === 0) {
      return { playerReceives: { ...depositLoss }, depositLoss };
    }
    return { playerReceives, depositLoss };
  }

  const playerM = Math.floor(maxExtractable * ratioM);
  const playerS = Math.floor(maxExtractable * ratioS);
  const playerH = maxExtractable - playerM - playerS;

  if (slagRate === 0) {
    const amounts: ResourceAmounts = { minerai: playerM, silicium: playerS, hydrogene: playerH };
    return { playerReceives: { ...amounts }, depositLoss: { ...amounts } };
  }

  const depositLoss: ResourceAmounts = {
    minerai: Math.min(Math.floor(playerM / (1 - slagRate)), mineraiRemaining),
    silicium: Math.min(Math.floor(playerS / (1 - slagRate)), siliciumRemaining),
    hydrogene: Math.min(Math.floor(playerH / (1 - slagRate)), hydrogeneRemaining),
  };

  return {
    playerReceives: { minerai: playerM, silicium: playerS, hydrogene: playerH },
    depositLoss,
  };
}

/**
 * Single source of truth for missionRelay biome bonuses, shared between
 * the backend reward calculation and the frontend progression table.
 */
export type MissionRelayBiome = 'volcanic' | 'arid' | 'temperate' | 'glacial' | 'gaseous';

export interface MissionRelayBonusPerLevel {
  minerai: number;
  silicium: number;
  hydrogene: number;
  pirate: number;
}

/** Diversity multiplier applied per distinct biome hosting at least one relay. */
export const MISSION_RELAY_DIVERSITY_BONUS_PER_BIOME = 0.05;

export function getMissionRelayBonusPerLevel(biome: string | null | undefined): MissionRelayBonusPerLevel {
  switch (biome) {
    case 'volcanic':  return { minerai: 0.02, silicium: 0,    hydrogene: 0,    pirate: 0    };
    case 'arid':      return { minerai: 0,    silicium: 0.02, hydrogene: 0,    pirate: 0    };
    case 'gaseous':   return { minerai: 0,    silicium: 0,    hydrogene: 0.02, pirate: 0    };
    case 'temperate': return { minerai: 0.01, silicium: 0.01, hydrogene: 0.01, pirate: 0    };
    case 'glacial':   return { minerai: 0,    silicium: 0,    hydrogene: 0,    pirate: 0.02 };
    default:          return { minerai: 0,    silicium: 0,    hydrogene: 0,    pirate: 0    };
  }
}
