import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'exilium.sidebar.seenItems';

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // quota exceeded or unavailable — silent fallback
  }
}

/**
 * Tracks which sidebar items have already been seen (clicked) by the user.
 * Items that become visible and are not yet in the seen-set are returned as "new"
 * (they get the badge + animation). The caller must call markSeen(path) when
 * the user clicks the item.
 *
 * First-ever mount initializes seenItems with the currently visible set — so
 * existing players don't get a flood of "new" badges on already-used items.
 */
export function useSidebarNewItems(visiblePaths: Set<string>): {
  newPaths: Set<string>;
  markSeen: (path: string) => void;
} {
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  const initialized = useRef(false);

  // First mount: if localStorage has no entry yet, initialize with currently visible paths.
  // Skip seeding when visiblePaths is still empty (loading state) so that a later
  // render with the real paths can seed correctly without flooding the user with badges.
  useEffect(() => {
    if (initialized.current) return;
    if (visiblePaths.size === 0) return;
    initialized.current = true;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) {
        const initial = new Set(visiblePaths);
        writeSeen(initial);
        setSeen(initial);
      }
    } catch {
      // localStorage unavailable (Safari private mode, blocked storage) — silent fallback
    }
  }, [visiblePaths]);

  const markSeen = useCallback((path: string) => {
    setSeen((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      writeSeen(next);
      return next;
    });
  }, []);

  const newPaths = useMemo(() => {
    const result = new Set<string>();
    for (const path of visiblePaths) {
      if (!seen.has(path)) result.add(path);
    }
    return result;
  }, [visiblePaths, seen]);

  return { newPaths, markSeen };
}
