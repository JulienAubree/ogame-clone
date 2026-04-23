import { describe, it, expect } from 'vitest';
import { buildPurgeCutoff } from '../alliance-log-purge.js';

describe('buildPurgeCutoff', () => {
  it('returns a date 30 days before the given reference', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    const cutoff = buildPurgeCutoff(now);
    expect(cutoff.toISOString()).toBe('2026-04-01T12:00:00.000Z');
  });
});
