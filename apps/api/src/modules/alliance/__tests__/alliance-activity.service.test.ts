import { describe, it, expect } from 'vitest';
import { canSeeVisibility, categoriesToTypePrefixes } from '../alliance.service.js';

describe('canSeeVisibility', () => {
  it('everyone sees "all"', () => {
    expect(canSeeVisibility('member', 'all')).toBe(true);
    expect(canSeeVisibility('officer', 'all')).toBe(true);
    expect(canSeeVisibility('founder', 'all')).toBe(true);
  });
  it('only leaders see "officers"', () => {
    expect(canSeeVisibility('member', 'officers')).toBe(false);
    expect(canSeeVisibility('officer', 'officers')).toBe(true);
    expect(canSeeVisibility('founder', 'officers')).toBe(true);
  });
});

describe('categoriesToTypePrefixes', () => {
  it('military maps to combat. + espionage.', () => {
    expect(categoriesToTypePrefixes(['military'])).toEqual(['combat.', 'espionage.']);
  });
  it('members maps to member.', () => {
    expect(categoriesToTypePrefixes(['members'])).toEqual(['member.']);
  });
  it('both maps to all three', () => {
    expect(categoriesToTypePrefixes(['military', 'members'])).toEqual(['combat.', 'espionage.', 'member.']);
  });
  it('empty maps to empty', () => {
    expect(categoriesToTypePrefixes([])).toEqual([]);
  });
});
