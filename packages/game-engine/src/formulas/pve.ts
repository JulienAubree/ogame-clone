/**
 * Base extraction per prospector, scales with Mission Center level.
 * Formula: 2000 + 800 * (centerLevel - 1)
 */
export function baseExtraction(centerLevel: number): number {
  return 2000 + 800 * (centerLevel - 1);
}

/**
 * Prospection duration in minutes.
 * Formula: 5 + floor(depositTotalQuantity / 10000) * 2
 */
export function prospectionDuration(depositTotalQuantity: number): number {
  return 5 + Math.floor(depositTotalQuantity / 10000) * 2;
}

/**
 * Mining duration in minutes at the belt.
 * Scales with cargo/prospector ratio: more cargo = longer, more prospectors = shorter.
 * Formula: max(5, cargoCapacity / (min(nbProspectors, 10) * 2000) * 10) * bonusMultiplier
 * Rock fracturing research reduces duration via bonusMultiplier.
 */
export function miningDuration(
  cargoCapacity: number,
  nbProspectors: number,
  bonusMultiplier: number,
): number {
  const BASE_RATE = 2000;
  const effectiveProspectors = Math.min(Math.max(nbProspectors, 1), 10);
  const rawMinutes = (cargoCapacity / (effectiveProspectors * BASE_RATE)) * 10;
  return Math.max(5, rawMinutes) * Math.max(0.01, bonusMultiplier);
}

/**
 * Discovery cooldown in hours.
 * Formula: max(1, 7 - level)
 * Level 1 = 6h, level 2 = 5h, …, level 6+ = 1h.
 */
export function discoveryCooldown(centerLevel: number): number {
  return Math.max(1, 7 - centerLevel);
}

/**
 * Total resource quantity of a deposit.
 * Formula: floor((15000 + 5000 * (centerLevel - 1)) * varianceMultiplier)
 */
export function depositSize(centerLevel: number, varianceMultiplier: number): number {
  return Math.floor((15000 + 5000 * (centerLevel - 1)) * varianceMultiplier);
}

/**
 * Resource composition ratios for a deposit.
 * Base ratios: 60/30/10. Hydrogene clamped to min 0.02. Normalized so sum = 1.
 */
export function depositComposition(
  mineraiOffset: number,
  siliciumOffset: number,
): { minerai: number; silicium: number; hydrogene: number } {
  const rawMinerai = 0.60 + mineraiOffset;
  const rawSilicium = 0.30 + siliciumOffset;
  const unclamped = 1 - rawMinerai - rawSilicium;
  const hydrogene = Math.max(0.02, unclamped);
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
 * Formula: clamp(baseSlagRate * 0.85^refiningLevel, 0, 0.99)
 */
export function computeSlagRate(baseSlagRate: number, refiningLevel: number): number {
  const rate = baseSlagRate * Math.pow(0.85, refiningLevel);
  return Math.min(0.99, Math.max(0, rate));
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
export function computeMiningExtraction(params: {
  centerLevel: number;
  nbProspectors: number;
  cargoCapacity: number;
  mineraiRemaining: number;
  siliciumRemaining: number;
  hydrogeneRemaining: number;
  slagRate: number;
}): MultiResourceExtraction {
  const { centerLevel, nbProspectors, cargoCapacity, mineraiRemaining, siliciumRemaining, hydrogeneRemaining, slagRate } = params;

  const zero: ResourceAmounts = { minerai: 0, silicium: 0, hydrogene: 0 };
  const totalRemaining = mineraiRemaining + siliciumRemaining + hydrogeneRemaining;
  if (totalRemaining <= 0) return { playerReceives: { ...zero }, depositLoss: { ...zero } };

  const effectiveProspectors = Math.min(nbProspectors, 10);
  const rawExtraction = baseExtraction(centerLevel) * effectiveProspectors;
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
