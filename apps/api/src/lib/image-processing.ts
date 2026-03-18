import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses';

const VALID_CATEGORIES: AssetCategory[] = ['buildings', 'research', 'ships', 'defenses'];

// Must match toKebab in apps/web/src/lib/assets.ts
function toKebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

const SIZES: readonly { suffix: string; width: number; height?: number; quality: number; label: string }[] = [
  { suffix: '', width: 1200, quality: 85, label: 'hero' },
  { suffix: '-thumb', width: 400, quality: 80, label: 'thumb' },
  { suffix: '-icon', width: 64, height: 64, quality: 75, label: 'icon' },
];

export function isValidCategory(value: string): value is AssetCategory {
  return VALID_CATEGORIES.includes(value as AssetCategory);
}

export async function processImage(
  buffer: Buffer,
  category: AssetCategory,
  entityId: string,
  assetsDir: string,
): Promise<string[]> {
  const kebabId = toKebab(entityId);
  const outputDir = path.join(assetsDir, category);
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];

  for (const size of SIZES) {
    const filename = `${kebabId}${size.suffix}.webp`;
    const outPath = path.join(outputDir, filename);

    let pipeline = sharp(buffer);

    if (size.height) {
      pipeline = pipeline.resize({
        width: size.width,
        height: size.height,
        fit: 'cover',
        position: 'centre',
      });
    } else {
      pipeline = pipeline.resize({ width: size.width });
    }

    await pipeline.webp({ quality: size.quality }).toFile(outPath);
    files.push(filename);
  }

  return files;
}
