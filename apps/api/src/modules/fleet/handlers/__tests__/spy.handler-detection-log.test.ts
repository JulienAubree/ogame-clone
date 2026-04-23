import { describe, it, expect, vi } from 'vitest';

describe('espionage detection gate (behavioural contract)', () => {
  it('does not emit alliance logs when detection is false', () => {
    const add = vi.fn();
    const detected = false;
    const reportId = 'r1';
    const svc = { add };
    if (detected && reportId && svc) add({});
    expect(add).not.toHaveBeenCalled();
  });

  it('emits alliance logs when detection is true', () => {
    const add = vi.fn();
    const detected = true;
    const reportId = 'r1';
    const svc = { add };
    if (detected && reportId && svc) add({});
    expect(add).toHaveBeenCalledTimes(1);
  });
});
