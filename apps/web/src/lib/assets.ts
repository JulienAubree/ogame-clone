import { toKebab, type AssetCategory } from '@exilium/shared';
export type { AssetCategory } from '@exilium/shared';
export type AssetSize = 'full' | 'thumb' | 'icon';

const SUFFIX: Record<AssetSize, string> = {
  full: '',
  thumb: '-thumb',
  icon: '-icon',
};

export interface VariantOptions {
  planetType?: string;
  hasVariant?: boolean;
}

export function getAssetUrl(
  category: AssetCategory,
  id: string,
  size: AssetSize = 'full',
  options?: VariantOptions,
): string {
  const slug = toKebab(id);
  const sfx = SUFFIX[size];
  if (options?.planetType && options.hasVariant && (category === 'buildings' || category === 'defenses')) {
    return `/assets/${category}/${slug}/${options.planetType}${sfx}.webp`;
  }
  return `/assets/${category}/${slug}${sfx}.webp`;
}

export function getPlanetImageUrl(
  planetClassId: string,
  imageIndex: number,
  size: AssetSize = 'full',
): string {
  return `/assets/planets/${planetClassId}/${imageIndex}${SUFFIX[size]}.webp`;
}

export function getFlagshipImageUrl(
  hullId: string,
  imageIndex: number,
  size: AssetSize = 'full',
): string {
  return `/assets/flagships/${hullId}/${imageIndex}${SUFFIX[size]}.webp`;
}

/** Minimal shape we need from gameConfig to detect biome variants. */
type EntityVariantConfig = {
  buildings?: Record<string, { variantPlanetTypes?: readonly string[] | string[] }>;
  defenses?: Record<string, { variantPlanetTypes?: readonly string[] | string[] }>;
};

/** Categories of game assets that can have biome-specific variants. */
type VariantCategory = 'buildings' | 'defenses';

/**
 * Resolve the biome variant props for a given entity. The 'homeworld' planet
 * class is mapped to 'temperate' — the home planet is conceptually a lush
 * temperate world even if its planetClassId is 'homeworld'.
 *
 * Use this to feed `<GameImage planetType={...} hasVariant={...} />` or any
 * other consumer of the underlying VariantOptions.
 */
export function getEntityVariantProps(
  gameConfig: EntityVariantConfig | null | undefined,
  category: VariantCategory,
  id: string,
  planetClassId: string | null | undefined,
): { planetType?: string; hasVariant: boolean } {
  const effectiveClass = planetClassId === 'homeworld' ? 'temperate' : planetClassId;
  const variants = gameConfig?.[category]?.[id]?.variantPlanetTypes ?? [];
  const hasVariant = !!effectiveClass && variants.includes(effectiveClass);
  return {
    planetType: effectiveClass ?? undefined,
    hasVariant,
  };
}

/**
 * Returns the entity illustration URL with a biome-specific variant when
 * available, falling back to the generic asset otherwise.
 */
export function getEntityIllustrationUrl(
  gameConfig: EntityVariantConfig | null | undefined,
  category: VariantCategory,
  id: string,
  planetClassId: string | null | undefined,
  size: AssetSize = 'full',
): string {
  const variantProps = getEntityVariantProps(gameConfig, category, id, planetClassId);
  return getAssetUrl(category, id, size, variantProps);
}

/** Building-specific shortcut around getEntityIllustrationUrl. */
export function getBuildingIllustrationUrl(
  gameConfig: EntityVariantConfig | null | undefined,
  buildingId: string,
  planetClassId: string | null | undefined,
  size: AssetSize = 'full',
): string {
  return getEntityIllustrationUrl(gameConfig, 'buildings', buildingId, planetClassId, size);
}

/** Defense-specific shortcut around getEntityIllustrationUrl. */
export function getDefenseIllustrationUrl(
  gameConfig: EntityVariantConfig | null | undefined,
  defenseId: string,
  planetClassId: string | null | undefined,
  size: AssetSize = 'full',
): string {
  return getEntityIllustrationUrl(gameConfig, 'defenses', defenseId, planetClassId, size);
}
