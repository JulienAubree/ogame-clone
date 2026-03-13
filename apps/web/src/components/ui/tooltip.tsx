import { type ReactNode, useState, useRef, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  tooltip: ReactNode;
  children: ReactNode;
  className?: string;
}

const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  ({ tooltip, children, className }, ref) => {
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const show = () => {
      timeoutRef.current = setTimeout(() => setVisible(true), 200);
    };

    const hide = () => {
      clearTimeout(timeoutRef.current);
      setVisible(false);
    };

    return (
      <div
        ref={ref}
        className={cn('relative inline-block', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
        {visible && (
          <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
            {tooltip}
          </div>
        )}
      </div>
    );
  },
);
Tooltip.displayName = 'Tooltip';

export { Tooltip };
