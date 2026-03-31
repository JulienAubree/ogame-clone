import { useState, useRef, useCallback, useEffect } from 'react';

interface KnobProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  color: string; // Tailwind color value e.g. '#fb923c'
  size?: 'sm' | 'md'; // sm=44px (table), md=72px (flux)
  disabled?: boolean;
}

const SIZES = { sm: 44, md: 72 } as const;
const STROKE = { sm: 2.5, md: 3 } as const;

export function Knob({ value, onChange, onChangeEnd, color, size = 'md', disabled = false }: KnobProps) {
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const dragStartRef = useRef<{ y: number; startValue: number } | null>(null);
  const hasMovedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const px = SIZES[size];
  const stroke = STROKE[size];
  const radius = (px - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value / 100);

  const fontSize = size === 'sm' ? 11 : 16;
  const unitSize = size === 'sm' ? 8 : 10;

  // Drag handler
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || editing) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = { y: e.clientY, startValue: value };
      hasMovedRef.current = false;
      setDragging(true);
    },
    [disabled, editing, value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || disabled) return;
      const deltaY = dragStartRef.current.y - e.clientY;
      if (Math.abs(deltaY) > 3) hasMovedRef.current = true;
      // 150px of drag = 100% change
      const deltaPercent = (deltaY / 150) * 100;
      const newValue = Math.round(Math.min(100, Math.max(0, dragStartRef.current.startValue + deltaPercent)));
      onChange(newValue);
    },
    [disabled, onChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      const deltaY = dragStartRef.current.y - e.clientY;
      const deltaPercent = (deltaY / 150) * 100;
      const newValue = Math.round(Math.min(100, Math.max(0, dragStartRef.current.startValue + deltaPercent)));
      dragStartRef.current = null;
      setDragging(false);
      onChangeEnd?.(newValue);
    },
    [onChangeEnd],
  );

  // Tap to edit (only if no drag movement)
  const handleClick = useCallback(() => {
    if (disabled || hasMovedRef.current) return;
    setEditing(true);
    setInputValue(String(value));
  }, [disabled, value]);

  // Input submit
  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = Math.round(Math.min(100, Math.max(0, Number(inputValue) || 0)));
    onChange(parsed);
    onChangeEnd?.(parsed);
  }, [inputValue, onChange, onChangeEnd]);

  // Sync input when value changes externally
  useEffect(() => {
    if (!editing) setInputValue(String(value));
  }, [value, editing]);

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ width: px, height: px, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {/* Background circle */}
      <svg width={px} height={px} className="absolute inset-0">
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="rgba(0,0,0,0.3)"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        {/* Value arc */}
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${px / 2} ${px / 2})`}
          className="transition-[stroke-dashoffset] duration-100"
          opacity={disabled ? 0.3 : 0.8}
        />
      </svg>

      {/* Center value */}
      <div className="absolute inset-0 flex items-center justify-center">
        {editing ? (
          <input
            type="number"
            min={0}
            max={100}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
            className="w-[80%] bg-transparent text-center font-mono text-foreground outline-none"
            style={{ fontSize }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="font-mono font-bold text-foreground"
            style={{ fontSize, cursor: disabled ? 'default' : 'pointer' }}
          >
            {value}
            <span className="text-muted-foreground" style={{ fontSize: unitSize }}>%</span>
          </span>
        )}
      </div>
    </div>
  );
}
