import { describe, it, expect } from 'vitest';
import { getVisibleSidebarPaths, ALWAYS_VISIBLE_PATHS } from './sidebar-visibility.js';

describe('getVisibleSidebarPaths', () => {
  it('new player (chapter 1, tutorial not complete, 1 colony): only always-visible', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 1, isComplete: false, colonyCount: 1 });
    expect(visible).toEqual(new Set(ALWAYS_VISIBLE_PATHS));
    expect(visible.has('/')).toBe(true);
    expect(visible.has('/resources')).toBe(true);
    expect(visible.has('/infrastructures')).toBe(true);
    expect(visible.has('/energy')).toBe(true);
    expect(visible.has('/messages')).toBe(true);
    expect(visible.has('/changelog')).toBe(true);
    expect(visible.has('/feedback')).toBe(true);
    expect(visible.has('/research')).toBe(false);
    expect(visible.has('/shipyard')).toBe(false);
    expect(visible.size).toBe(7);
  });

  it('chapter 2: adds research and shipyard', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 2, isComplete: false, colonyCount: 1 });
    expect(visible.has('/research')).toBe(true);
    expect(visible.has('/shipyard')).toBe(true);
    expect(visible.has('/flagship')).toBe(false);
    expect(visible.has('/galaxy')).toBe(false);
  });

  it('chapter 3: adds flagship, galaxy, fleet, missions', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 3, isComplete: false, colonyCount: 1 });
    expect(visible.has('/flagship')).toBe(true);
    expect(visible.has('/galaxy')).toBe(true);
    expect(visible.has('/fleet')).toBe(true);
    expect(visible.has('/missions')).toBe(true);
    expect(visible.has('/command-center')).toBe(false);
    expect(visible.has('/defense')).toBe(false);
  });

  it('chapter 4: adds command-center and defense', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: false, colonyCount: 1 });
    expect(visible.has('/command-center')).toBe(true);
    expect(visible.has('/defense')).toBe(true);
    expect(visible.has('/market')).toBe(false);
    expect(visible.has('/alliance')).toBe(false);
    expect(visible.has('/empire')).toBe(false);
  });

  it('tutorial complete with 1 colony: adds market, alliance, ranking, alliance-ranking but NOT empire', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: true, colonyCount: 1 });
    expect(visible.has('/market')).toBe(true);
    expect(visible.has('/alliance')).toBe(true);
    expect(visible.has('/ranking')).toBe(true);
    expect(visible.has('/alliance-ranking')).toBe(true);
    expect(visible.has('/empire')).toBe(false);
  });

  it('tutorial complete with 2 colonies: adds empire', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: true, colonyCount: 2 });
    expect(visible.has('/empire')).toBe(true);
  });

  it('tutorial NOT complete but 2 colonies: empire still hidden', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 3, isComplete: false, colonyCount: 2 });
    expect(visible.has('/empire')).toBe(false);
  });

  it('fully unlocked state: all 21 items visible', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: true, colonyCount: 2 });
    expect(visible.size).toBe(21);
  });
});
