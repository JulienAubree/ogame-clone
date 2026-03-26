import { useToastStore, type ToastVariant } from '@/stores/toast.store';
import { cn } from '@/lib/utils';

const TOAST_DURATION_MS = 5000;

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-green-500/30 bg-green-950/50',
  error: 'border-destructive/30 bg-red-950/50',
  info: 'border-primary/30 bg-card',
  warning: 'border-energy/30 bg-yellow-950/50',
};

const variantIcons: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

function ToastItem({ id, message, variant }: { id: string; message: string; variant: ToastVariant; createdAt: number }) {
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div
      className={cn(
        'relative max-w-sm cursor-pointer overflow-hidden rounded-md border px-4 py-3 text-sm shadow-lg animate-slide-in-right',
        variantStyles[variant],
      )}
      onClick={() => removeToast(id)}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs">{variantIcons[variant]}</span>
        <span>{message}</span>
      </div>
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-foreground/20"
        style={{
          width: '100%',
          animation: `toast-progress ${TOAST_DURATION_MS}ms linear forwards`,
        }}
      />
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
