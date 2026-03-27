import { type ReactNode, type HTMLAttributes, useEffect, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ open, onClose, children, title, className, ...props }, ref) => {
    useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      if (open) {
        document.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';
      }
      return () => {
        document.removeEventListener('keydown', handleEsc);
        document.body.style.overflow = '';
      };
    }, [open, onClose]);

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
        <div className="fixed inset-0 bg-black/60" onClick={onClose} />
        <div
          ref={ref}
          className={cn(
            'relative z-50 w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-card p-5 pb-safe-bottom shadow-lg animate-slide-up-sheet',
            'lg:max-w-lg lg:rounded-lg lg:animate-fade-in lg:pb-6',
            className,
          )}
          {...props}
        >
          {title && <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>}
          {children}
        </div>
      </div>
    );
  },
);
Modal.displayName = 'Modal';

export { Modal };
