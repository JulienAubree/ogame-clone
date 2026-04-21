import { BLASON_SHAPES, BLASON_ICONS, DEFAULT_PALETTE, type Blason } from './catalog.js';

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // ensure unsigned 32-bit
  return hash >>> 0;
}

export function generateDefaultBlason(tag: string): Blason {
  const h = fnv1a(tag.toUpperCase());
  const shape = BLASON_SHAPES[h % BLASON_SHAPES.length];
  const icon = BLASON_ICONS[(h >>> 4) % BLASON_ICONS.length];
  const c1Idx = (h >>> 8) % DEFAULT_PALETTE.length;
  let c2Idx = (h >>> 12) % DEFAULT_PALETTE.length;
  if (c2Idx === c1Idx) c2Idx = (c2Idx + 1) % DEFAULT_PALETTE.length;
  return {
    shape,
    icon,
    color1: DEFAULT_PALETTE[c1Idx],
    color2: DEFAULT_PALETTE[c2Idx],
  };
}
