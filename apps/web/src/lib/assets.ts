export type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses';
export type AssetSize = 'full' | 'thumb' | 'icon';

const SUFFIX: Record<AssetSize, string> = {
  full: '',
  thumb: '-thumb',
  icon: '-icon',
};

/** Convert camelCase ID to kebab-case filename */
function toKebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function getAssetUrl(category: AssetCategory, id: string, size: AssetSize = 'full'): string {
  return `/assets/${category}/${toKebab(id)}${SUFFIX[size]}.webp`;
}

export function getPlanetImageUrl(
  planetClassId: string,
  imageIndex: number,
  size: AssetSize = 'full',
): string {
  return `/assets/planets/${planetClassId}/${imageIndex}${SUFFIX[size]}.webp`;
}
