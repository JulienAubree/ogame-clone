import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  showMax?: boolean;
  className?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
  showMax = true,
  className,
}: QuantityStepperProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  function clamp(v: number) {
    return Math.max(min, Math.min(max, v));
  }

  function commitEdit() {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) onChange(clamp(parsed));
    setEditing(false);
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
      >
        <Minus className="h-3 w-3" />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-7 w-12 rounded-md border border-primary bg-background text-center text-xs font-mono tabular-nums focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setEditValue(String(value)); setEditing(true); }}
          className="h-7 min-w-[2.5rem] rounded-md border border-border bg-background px-1 text-center text-xs font-mono tabular-nums text-foreground transition-colors hover:border-primary"
        >
          {value}
        </button>
      )}

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
      >
        <Plus className="h-3 w-3" />
      </button>

      {showMax && max < Infinity && (
        <button
          type="button"
          onClick={() => onChange(max)}
          disabled={value >= max}
          className="h-7 rounded-md px-1.5 text-[10px] font-bold text-emerald-400 transition-colors hover:text-emerald-300 disabled:opacity-30 disabled:pointer-events-none"
        >
          MAX
        </button>
      )}
    </div>
  );
}
