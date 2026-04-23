import { describe, it, expect } from 'vitest';
import {
  outcomeFromAttackerSide,
  outcomeFromDefenderSide,
} from '../attack.handler.js';

describe('combat outcome mapping', () => {
  it('maps attacker-side', () => {
    expect(outcomeFromAttackerSide('attacker')).toBe('victory');
    expect(outcomeFromAttackerSide('defender')).toBe('defeat');
    expect(outcomeFromAttackerSide('draw')).toBe('draw');
  });
  it('maps defender-side', () => {
    expect(outcomeFromDefenderSide('attacker')).toBe('defeat');
    expect(outcomeFromDefenderSide('defender')).toBe('victory');
    expect(outcomeFromDefenderSide('draw')).toBe('draw');
  });
});
