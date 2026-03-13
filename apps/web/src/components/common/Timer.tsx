import { useState, useEffect } from 'react';

interface TimerProps {
  endTime: Date;
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

export function Timer({ endTime, onComplete, className }: TimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (secondsLeft <= 0) {
      onComplete?.();
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime, onComplete, secondsLeft]);

  return <span className={className}>{formatTimeLeft(secondsLeft)}</span>;
}
