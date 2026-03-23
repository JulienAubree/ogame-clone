import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface CoordinateInputProps {
  galaxy: number;
  system: number;
  position: number;
  onChange: (coords: { galaxy: number; system: number; position: number }) => void;
  disabled?: boolean;
  className?: string;
}

export function CoordinateInput({ galaxy, system, position, onChange, disabled, className }: CoordinateInputProps) {
  const galaxyRef = useRef<HTMLInputElement>(null);
  const systemRef = useRef<HTMLInputElement>(null);
  const positionRef = useRef<HTMLInputElement>(null);

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const handleChange = (field: 'galaxy' | 'system' | 'position', raw: string) => {
    const num = Number(raw) || 0;
    const limits = { galaxy: [1, 9], system: [1, 499], position: [1, 16] } as const;
    const [min, max] = limits[field];
    const clamped = num === 0 ? 0 : clamp(num, min, max);
    onChange({ galaxy, system, position, [field]: clamped });
  };

  const handleBlur = (field: 'galaxy' | 'system' | 'position') => {
    const current = { galaxy, system, position };
    if (current[field] === 0) {
      onChange({ ...current, [field]: 1 });
    }
  };

  const handleKeyDown = (field: 'galaxy' | 'system' | 'position', e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ':' || e.key === 'Tab') {
      if (e.key === ':') e.preventDefault();
      if (field === 'galaxy') systemRef.current?.focus();
      else if (field === 'system') positionRef.current?.focus();
    }
  };

  const fieldClass = cn(
    'bg-transparent text-center font-mono text-sm outline-none',
    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
    'placeholder:text-muted-foreground/50',
    disabled && 'cursor-not-allowed opacity-50',
  );

  return (
    <div className={cn(
      'inline-flex items-center gap-0 rounded-lg border border-border bg-card/60 px-2 py-1.5',
      'focus-within:ring-1 focus-within:ring-ring transition-shadow',
      disabled && 'opacity-60',
      className,
    )}>
      <span className="text-muted-foreground font-mono text-sm select-none mr-1">[</span>

      <div className="flex flex-col items-center">
        <span className="text-[9px] uppercase text-muted-foreground/70 leading-none mb-0.5">Gal</span>
        <input
          ref={galaxyRef}
          type="number"
          min={1}
          max={9}
          value={galaxy || ''}
          onChange={(e) => handleChange('galaxy', e.target.value)}
          onBlur={() => handleBlur('galaxy')}
          onKeyDown={(e) => handleKeyDown('galaxy', e)}
          disabled={disabled}
          className={cn(fieldClass, 'w-8')}
        />
      </div>

      <span className="text-primary/60 font-mono text-sm select-none mx-0.5">:</span>

      <div className="flex flex-col items-center">
        <span className="text-[9px] uppercase text-muted-foreground/70 leading-none mb-0.5">Sys</span>
        <input
          ref={systemRef}
          type="number"
          min={1}
          max={499}
          value={system || ''}
          onChange={(e) => handleChange('system', e.target.value)}
          onBlur={() => handleBlur('system')}
          onKeyDown={(e) => handleKeyDown('system', e)}
          disabled={disabled}
          className={cn(fieldClass, 'w-12')}
        />
      </div>

      <span className="text-primary/60 font-mono text-sm select-none mx-0.5">:</span>

      <div className="flex flex-col items-center">
        <span className="text-[9px] uppercase text-muted-foreground/70 leading-none mb-0.5">Pos</span>
        <input
          ref={positionRef}
          type="number"
          min={1}
          max={16}
          value={position || ''}
          onChange={(e) => handleChange('position', e.target.value)}
          onBlur={() => handleBlur('position')}
          onKeyDown={(e) => handleKeyDown('position', e)}
          disabled={disabled}
          className={cn(fieldClass, 'w-8')}
        />
      </div>

      <span className="text-muted-foreground font-mono text-sm select-none ml-1">]</span>

      {disabled && <span className="text-xs text-yellow-500 ml-1.5 select-none">🔒</span>}
    </div>
  );
}
