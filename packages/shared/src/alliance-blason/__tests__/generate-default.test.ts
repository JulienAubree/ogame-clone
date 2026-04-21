import { describe, it, expect } from 'vitest';
import { generateDefaultBlason } from '../generate-default.js';
import { BlasonSchema } from '../catalog.js';

describe('generateDefaultBlason', () => {
  it('is deterministic for a given tag', () => {
    expect(generateDefaultBlason('LSTL')).toEqual(generateDefaultBlason('LSTL'));
  });

  it('produces different blasons for different tags', () => {
    const a = generateDefaultBlason('LSTL');
    const b = generateDefaultBlason('ERNT');
    expect(a).not.toEqual(b);
  });

  it('always produces a valid blason (Zod)', () => {
    for (const tag of ['A', 'AB', 'ABC', 'ABCD', 'ZZZZ', 'CORS', 'CMU', 'XY12']) {
      const b = generateDefaultBlason(tag);
      expect(BlasonSchema.safeParse(b).success).toBe(true);
    }
  });

  it('produces color1 !== color2', () => {
    for (const tag of ['A', 'AB', 'ABC', 'ABCD', 'ZZZZ']) {
      const b = generateDefaultBlason(tag);
      expect(b.color1).not.toEqual(b.color2);
    }
  });

  it('normalizes tag to uppercase', () => {
    expect(generateDefaultBlason('lstl')).toEqual(generateDefaultBlason('LSTL'));
  });
});
