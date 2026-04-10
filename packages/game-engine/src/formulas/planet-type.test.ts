import { describe, it, expect } from 'vitest';
import { pickPlanetTypeForPosition } from './planet-type.js';
import { seededRandom } from './biomes.js';

describe('pickPlanetTypeForPosition', () => {
  it('very hot temp (>150) is mostly volcanic', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const rng = seededRandom(i);
      const type = pickPlanetTypeForPosition(200, rng);
      counts[type] = (counts[type] ?? 0) + 1;
    }
    expect(counts['volcanic']).toBeGreaterThan(500);
  });

  it('very cold temp (<-100) never produces volcanic', () => {
    for (let i = 0; i < 200; i++) {
      const rng = seededRandom(i + 10000);
      const type = pickPlanetTypeForPosition(-150, rng);
      expect(type).not.toBe('volcanic');
    }
  });

  it('temperate temp (~30) is mostly temperate', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const rng = seededRandom(i + 20000);
      const type = pickPlanetTypeForPosition(30, rng);
      counts[type] = (counts[type] ?? 0) + 1;
    }
    expect(counts['temperate']).toBeGreaterThan(counts['volcanic'] ?? 0);
    expect(counts['temperate']).toBeGreaterThan(counts['glacial'] ?? 0);
  });

  it('cold temp (-50) is mostly glacial', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const rng = seededRandom(i + 30000);
      const type = pickPlanetTypeForPosition(-50, rng);
      counts[type] = (counts[type] ?? 0) + 1;
    }
    expect(counts['glacial']).toBeGreaterThan(400);
  });

  it('returns deterministic results for the same seed', () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    expect(pickPlanetTypeForPosition(80, rng1)).toBe(pickPlanetTypeForPosition(80, rng2));
  });

  it('only returns valid planet type ids', () => {
    const valid = new Set(['volcanic', 'arid', 'temperate', 'glacial', 'gaseous']);
    for (let i = 0; i < 100; i++) {
      const rng = seededRandom(i);
      const type = pickPlanetTypeForPosition(50, rng);
      expect(valid.has(type)).toBe(true);
    }
  });
});
