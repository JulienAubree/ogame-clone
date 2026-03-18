import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(os.homedir(), 'Desktop/Exilium Artworks/Mines');
const OUTPUT_DIR = path.resolve(__dirname, '../apps/web/public/assets/buildings');

const IMAGES = [
  { src: 'mine-minerai.png', out: 'minerai-mine' },
  { src: 'mine-silicium.png', out: 'silicium-mine' },
  { src: 'mine-hydrogene.png', out: 'hydrogene-synth' },
];

const SIZES = [
  { suffix: '', width: 1200, quality: 85, label: 'hero' },
  { suffix: '-thumb', width: 400, quality: 80, label: 'thumb' },
  { suffix: '-icon', width: 64, height: 64, quality: 75, label: 'icon' },
] as const;

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const image of IMAGES) {
    const srcPath = path.join(SOURCE_DIR, image.src);

    if (!fs.existsSync(srcPath)) {
      console.error(`Source not found: ${srcPath}`);
      continue;
    }

    for (const size of SIZES) {
      const outPath = path.join(OUTPUT_DIR, `${image.out}${size.suffix}.webp`);

      let pipeline = sharp(srcPath);

      if (size.height) {
        // Icon: square crop from center
        pipeline = pipeline.resize({
          width: size.width,
          height: size.height,
          fit: 'cover',
          position: 'centre',
        });
      } else {
        // Hero/thumb: resize width, preserve aspect ratio
        pipeline = pipeline.resize({ width: size.width });
      }

      await pipeline.webp({ quality: size.quality }).toFile(outPath);

      const stat = fs.statSync(outPath);
      const sizeKB = (stat.size / 1024).toFixed(1);
      console.log(`  ${size.label.padEnd(5)} → ${path.basename(outPath)} (${sizeKB} KB)`);
    }

    console.log('');
  }

  console.log('Done! Generated files in', OUTPUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
