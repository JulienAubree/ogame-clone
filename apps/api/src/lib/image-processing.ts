import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

import { toKebab, type AssetCategory } from '@exilium/shared';

const VALID_CATEGORIES: AssetCategory[] = ['buildings', 'research', 'ships', 'defenses', 'planets', 'flagships', 'avatars', 'landing', 'anomaly'];

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

const AVATAR_SIZES: readonly { suffix: string; width: number; quality: number }[] = [
  { suffix: '', width: 512, quality: 85 },
  { suffix: '-thumb', width: 128, quality: 80 },
  { suffix: '-icon', width: 64, quality: 75 },
];

export async function processAvatarImage(
  buffer: Buffer,
  imageIndex: number,
  assetsDir: string,
): Promise<string[]> {
  const outputDir = path.join(assetsDir, 'avatars');
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];

  for (const size of AVATAR_SIZES) {
    const filename = `${imageIndex}${size.suffix}.webp`;
    const outPath = path.join(outputDir, filename);

    await sharp(buffer)
      .resize({ width: size.width, height: size.width, fit: 'cover', position: 'centre' })
      .webp({ quality: size.quality })
      .toFile(outPath);

    files.push(filename);
  }

  return files;
}

export async function processBuildingVariant(
  buffer: Buffer,
  category: 'buildings' | 'defenses',
  entityId: string,
  planetType: string,
  assetsDir: string,
): Promise<string[]> {
  if (category !== 'buildings' && category !== 'defenses') {
    throw new Error(`processBuildingVariant only supports buildings|defenses, got "${category}"`);
  }
  if (!/^[a-z0-9_-]+$/i.test(planetType)) {
    throw new Error(`Invalid planetType "${planetType}"`);
  }

  const slug = toKebab(entityId);
  const outputDir = path.join(assetsDir, category, slug);
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];
  for (const size of SIZES) {
    const filename = `${planetType}${size.suffix}.webp`;
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

/**
 * Landing-page assets are full-bleed background and gallery images, so they
 * need a much wider hero size than the in-game entity icons. Two outputs:
 * a 1920px hero for desktop (with a generous quality budget) and a 960px
 * thumb for mobile / lazy-loaded fallbacks.
 *
 * The slot is a free-form kebab-case key chosen by the admin (e.g. "hero",
 * "immersive-1"). Files are written under `assets/landing/<slot>{,-thumb}.webp`.
 */
const LANDING_SIZES: readonly { suffix: string; width: number; quality: number }[] = [
  { suffix: '', width: 1920, quality: 82 },
  { suffix: '-thumb', width: 960, quality: 78 },
];

export async function processLandingImage(
  buffer: Buffer,
  slot: string,
  assetsDir: string,
): Promise<string[]> {
  if (!/^[a-z0-9_-]+$/i.test(slot)) {
    throw new Error(`Invalid landing slot "${slot}"`);
  }

  const outputDir = path.join(assetsDir, 'landing');
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];
  for (const size of LANDING_SIZES) {
    const filename = `${slot}${size.suffix}.webp`;
    const outPath = path.join(outputDir, filename);
    await sharp(buffer)
      .resize({ width: size.width, withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toFile(outPath);
    files.push(filename);
  }
  return files;
}

/**
 * Anomaly content images — depth illustrations and (later) random-event
 * cards. Cinematic format, narrower than landing because they sit inside
 * an in-game card. Two outputs: 1280px hero + 640px thumb.
 *
 * Slot is a free-form key (e.g. "depth-1", "depth-2", "event-<id>").
 * Files written under `assets/anomaly/<slot>{,-thumb}.webp`.
 */
const ANOMALY_SIZES: readonly { suffix: string; width: number; quality: number }[] = [
  { suffix: '', width: 1280, quality: 82 },
  { suffix: '-thumb', width: 640, quality: 78 },
];

export async function processAnomalyImage(
  buffer: Buffer,
  slot: string,
  assetsDir: string,
): Promise<string[]> {
  if (!/^[a-z0-9_-]+$/i.test(slot)) {
    throw new Error(`Invalid anomaly slot "${slot}"`);
  }

  const outputDir = path.join(assetsDir, 'anomaly');
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];
  for (const size of ANOMALY_SIZES) {
    const filename = `${slot}${size.suffix}.webp`;
    const outPath = path.join(outputDir, filename);
    await sharp(buffer)
      .resize({ width: size.width, withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toFile(outPath);
    files.push(filename);
  }
  return files;
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
