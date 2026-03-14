import { useState, useEffect, useRef } from 'react';

interface TimerProps {
  endTime: Date;
  totalDuration?: number;
  onComplete?: () => void;
  className?: string;
}

function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function Timer({ endTime, totalDuration, onComplete, className }: TimerProps) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        if (id) clearInterval(id);
        onCompleteRef.current?.();
      }
    };

    tick();
    id = setInterval(tick, 1000);
    return () => { if (id) clearInterval(id); };
  }, [endTime]);

  const progress = totalDuration && totalDuration > 0
    ? Math.min(100, ((totalDuration - secondsLeft) / totalDuration) * 100)
    : null;

  return (
    <div className={className}>
      <span className="text-xs font-mono">{formatTimeLeft(secondsLeft)}</span>
      {progress !== null && (
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
