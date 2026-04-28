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
type BuildingVariantConfig = {
  buildings?: Record<string, { variantPlanetTypes?: readonly string[] | string[] }>;
};

/**
 * Returns the building illustration URL with a biome-specific variant when
 * available, falling back to the generic asset otherwise. Uses the
 * `variantPlanetTypes` array declared in gameConfig for the building.
 */
export function getBuildingIllustrationUrl(
  gameConfig: BuildingVariantConfig | null | undefined,
  buildingId: string,
  planetClassId: string | null | undefined,
  size: AssetSize = 'full',
): string {
  const variants = gameConfig?.buildings?.[buildingId]?.variantPlanetTypes ?? [];
  const hasVariant = !!planetClassId && variants.includes(planetClassId);
  return getAssetUrl('buildings', buildingId, size, {
    planetType: planetClassId ?? undefined,
    hasVariant,
  });
}
