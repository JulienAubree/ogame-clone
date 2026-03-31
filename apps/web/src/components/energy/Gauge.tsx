import { useState, useRef, useCallback, useEffect } from 'react';

interface GaugeProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  color: string; // hex color e.g. '#fb923c'
  disabled?: boolean;
}

export function Gauge({ value, onChange, onChangeEnd, color, disabled = false }: GaugeProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  // Local display value — holds the drag position until the parent catches up
  const [localValue, setLocalValue] = useState(value);
  const interactingRef = useRef(false);

  // Sync from parent only when not interacting
  useEffect(() => {
    if (!interactingRef.current) setLocalValue(value);
  }, [value]);

  const calcValue = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.round(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || editing) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    interactingRef.current = true;
    setDragging(true);
    const newVal = calcValue(e.clientX);
    setLocalValue(newVal);
    onChange(newVal);
  }, [disabled, editing, calcValue, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || disabled) return;
    const newVal = calcValue(e.clientX);
    setLocalValue(newVal);
    onChange(newVal);
  }, [dragging, disabled, calcValue, onChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    const finalVal = calcValue(e.clientX);
    setLocalValue(finalVal);
    onChange(finalVal);
    onChangeEnd?.(finalVal);
    // Keep interacting until parent value catches up
    setTimeout(() => { interactingRef.current = false; }, 500);
  }, [dragging, calcValue, onChange, onChangeEnd]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    interactingRef.current = true;
    const parsed = Math.round(Math.min(100, Math.max(0, Number(inputValue) || 0)));
    setLocalValue(parsed);
    onChange(parsed);
    onChangeEnd?.(parsed);
    setTimeout(() => { interactingRef.current = false; }, 500);
  }, [inputValue, onChange, onChangeEnd]);

  const displayValue = localValue;

  return (
    <div className="space-y-1">
      <div
        ref={trackRef}
        className="relative h-7 bg-black/30 rounded-md border border-white/[0.06] cursor-pointer select-none overflow-hidden hover:border-white/[0.12] transition-colors"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Fill */}
        <div
          className={`absolute inset-y-0 left-0 rounded-md ${dragging ? '' : 'transition-[width] duration-150'}`}
          style={{
            width: `${displayValue}%`,
            background: `linear-gradient(90deg, ${color}26, ${color}80)`,
          }}
        >
          {/* Handle */}
          <div
            className="absolute right-0 inset-y-0 w-1 bg-white/80 rounded-r-md shadow-[0_0_6px_rgba(255,255,255,0.3)]"
          />
        </div>

        {/* Value centered */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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
              className="w-16 bg-transparent text-center font-mono text-sm font-bold text-foreground outline-none pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              className="font-mono text-sm font-bold text-foreground/90 pointer-events-auto hover:text-foreground"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
                  setEditing(true);
                  setInputValue(String(displayValue));
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {displayValue}%
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
