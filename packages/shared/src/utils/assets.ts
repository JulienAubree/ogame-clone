export type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses' | 'planets' | 'flagships' | 'avatars' | 'landing' | 'anomaly';

/** Convert camelCase ID to kebab-case filename */
export function toKebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
