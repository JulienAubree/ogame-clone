import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Compte à rebours formaté en HH:MM:SS, mis à jour chaque seconde.
 * Usage : `const display = useCountdownString(target)` → "02:15:30"
 */
export function useCountdownString(target: Date): string {
  const compute = useCallback(() => {
    const diff = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [target]);
  const [display, setDisplay] = useState(compute);
  useEffect(() => {
    const id = setInterval(() => setDisplay(compute()), 1000);
    return () => clearInterval(id);
  }, [compute]);
  return display;
}

/**
 * Compte à rebours retournant le nombre de secondes restantes.
 * Optionnel : `onComplete` est appelé une fois quand seconds <= 0.
 * Usage : `const seconds = useCountdownSeconds(endTime, () => refetch())`
 */
export function useCountdownSeconds(
  endTime: Date | null,
  onComplete?: () => void,
): number {
  const [seconds, setSeconds] = useState(() =>
    endTime ? Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000)) : 0,
  );
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    if (!endTime) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining <= 0 && cbRef.current) cbRef.current();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return seconds;
}

/**
 * Format un nombre de secondes en composantes h/m/s.
 */
export function fmtCountdown(total: number): { h: number; m: number; s: number } {
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}
