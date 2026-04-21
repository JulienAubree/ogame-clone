import { describe, it, expect } from 'vitest';
import { BlasonSchema, BLASON_SHAPES, BLASON_ICONS } from '../catalog.js';

describe('BlasonSchema', () => {
  it('accepts a valid blason', () => {
    const result = BlasonSchema.safeParse({
      shape: 'shield-classic',
      icon: 'crossed-swords',
      color1: '#8b0000',
      color2: '#d4af37',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown shape', () => {
    const result = BlasonSchema.safeParse({
      shape: 'unknown-shape',
      icon: 'crossed-swords',
      color1: '#8b0000',
      color2: '#d4af37',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed hex color', () => {
    const result = BlasonSchema.safeParse({
      shape: 'circle',
      icon: 'star',
      color1: 'red',
      color2: '#d4af37',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a 3-char hex color', () => {
    const result = BlasonSchema.safeParse({
      shape: 'circle',
      icon: 'star',
      color1: '#f00',
      color2: '#d4af37',
    });
    expect(result.success).toBe(false);
  });

  it('has 12 shapes and 17 icons', () => {
    expect(BLASON_SHAPES).toHaveLength(12);
    expect(BLASON_ICONS).toHaveLength(17);
  });
});
