import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

import { toKebab, type AssetCategory } from '@exilium/shared';

const VALID_CATEGORIES: AssetCategory[] = ['buildings', 'research', 'ships', 'defenses', 'planets', 'flagships', 'avatars'];

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

export async function processPlanetImage(
  buffer: Buffer,
  planetClassId: string,
  imageIndex: number,
  assetsDir: string,
): Promise<string[]> {
  const outputDir = path.join(assetsDir, 'planets', planetClassId);
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];

  for (const size of SIZES) {
    const filename = `${imageIndex}${size.suffix}.webp`;
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

export async function processAvatarImage(
  buffer: Buffer,
  avatarId: string,
  assetsDir: string,
): Promise<string[]> {
  const outputDir = path.join(assetsDir, 'avatars');
  fs.mkdirSync(outputDir, { recursive: true });

  const filename = `${avatarId}.webp`;
  const outPath = path.join(outputDir, filename);

  await sharp(buffer)
    .resize({ width: 512, height: 512, fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(outPath);

  return [filename];
}

export async function processFlagshipImage(
  buffer: Buffer,
  hullId: string,
  imageIndex: number,
  assetsDir: string,
): Promise<string[]> {
  const outputDir = path.join(assetsDir, 'flagships', hullId);
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];

  for (const size of SIZES) {
    const filename = `${imageIndex}${size.suffix}.webp`;
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
