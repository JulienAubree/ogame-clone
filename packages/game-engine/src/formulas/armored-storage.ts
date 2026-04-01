import { storageCapacity } from './production.js';
import { resolveBonus, type BonusDefinition } from './bonus.js';

export interface ProtectedResourcesInput {
  storageMineraiLevel: number;
  storageSiliciumLevel: number;
  storageHydrogeneLevel: number;
  minerai: number;
  silicium: number;
  hydrogene: number;
}

export interface ProtectedResources {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

/**
 * Calculate how much of each resource is protected from pillage.
 * Protection = storageCapacity × baseRatio × resolveBonus('armored_storage')
 * Capped at actual stock.
 */
export function calculateProtectedResources(
  input: ProtectedResourcesInput,
  baseRatio: number,
  researchLevels: Record<string, number>,
  bonusDefs: BonusDefinition[],
  storageConfig?: { storageBase: number; coeffA: number; coeffB: number; coeffC: number },
  talentBonuses?: Record<string, number>,
): ProtectedResources {
  const bonus = resolveBonus('armored_storage', null, researchLevels, bonusDefs);

  const storageMineraiCap = storageCapacity(input.storageMineraiLevel, storageConfig) *
    (1 + (talentBonuses?.['storage_minerai'] ?? 0));
  const storageSiliciumCap = storageCapacity(input.storageSiliciumLevel, storageConfig) *
    (1 + (talentBonuses?.['storage_silicium'] ?? 0));
  const storageHydrogeneCap = storageCapacity(input.storageHydrogeneLevel, storageConfig) *
    (1 + (talentBonuses?.['storage_hydrogene'] ?? 0));

  return {
    minerai: Math.min(input.minerai, Math.floor(storageMineraiCap * baseRatio * bonus)),
    silicium: Math.min(input.silicium, Math.floor(storageSiliciumCap * baseRatio * bonus)),
    hydrogene: Math.min(input.hydrogene, Math.floor(storageHydrogeneCap * baseRatio * bonus)),
  };
}
