import { useEffect, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EntityDetailOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function EntityDetailOverlay({ open, onClose, title, children }: EntityDetailOverlayProps) {
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
      <div className="fixed inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          'relative z-50 w-full overflow-y-auto shadow-lg',
          'max-h-[85vh] rounded-t-2xl animate-slide-up-sheet bg-card/95 backdrop-blur-lg border-t border-white/10',
          'lg:max-w-2xl lg:max-h-[85vh] lg:rounded-lg lg:mx-4 lg:border lg:border-border lg:bg-card lg:backdrop-blur-none lg:animate-slide-up',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute top-2 right-2 rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
      title="Plus d'informations"
    >
      <Info className="h-4 w-4" />
    </button>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</span>
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="px-2 py-1">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/30">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 font-mono">
                  {typeof cell === 'number' ? cell.toLocaleString('fr-FR') : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
