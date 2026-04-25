/**
 * TransportReportDetail — renders a transport mission report.
 *
 * Two states:
 *   - Success: shows delivered resources with colored bars
 *   - Failed: shows "Transport echoue" with reason
 */

import { XCircle, Check } from 'lucide-react';
import { CoordsLink } from '@/components/common/CoordsLink';
import { cn } from '@/lib/utils';

const RESOURCE_META: Array<{
  key: string;
  label: string;
  color: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}> = [
  { key: 'minerai', label: 'Minerai', color: '#fb923c', textColor: 'text-orange-400', bgColor: 'bg-orange-500/15', borderColor: 'border-orange-500/30' },
  { key: 'silicium', label: 'Silicium', color: '#34d399', textColor: 'text-emerald-400', bgColor: 'bg-emerald-500/15', borderColor: 'border-emerald-500/30' },
  { key: 'hydrogene', label: 'Hydrogene', color: '#60a5fa', textColor: 'text-blue-400', bgColor: 'bg-blue-500/15', borderColor: 'border-blue-500/30' },
];

interface TransportReportDetailProps {
  result: Record<string, any>;
  coordinates: { galaxy: number; system: number; position: number };
}

export function TransportReportDetail({ result, coordinates }: TransportReportDetailProps) {
  const isAborted = !!result.aborted;
  const delivered = result.delivered as { minerai?: number; silicium?: number; hydrogene?: number } | undefined;

  // Total delivered for the bar widths
  const deliveredValues = RESOURCE_META.map((r) => ({
    ...r,
    amount: Number(delivered?.[r.key as keyof typeof delivered] ?? 0),
  })).filter((r) => r.amount > 0);
  const totalDelivered = deliveredValues.reduce((s, r) => s + r.amount, 0);

  if (isAborted) {
    return (
      <div className="glass-card border-red-500/20 bg-red-500/5 px-4 py-6 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 mb-1">
          <XCircle className="h-6 w-6 text-red-400" />
        </div>
        <div className="text-red-400 text-sm font-semibold">Transport échoué</div>
        <div className="text-xs text-muted-foreground">
          La planète cible en <CoordsLink galaxy={coordinates.galaxy} system={coordinates.system} position={coordinates.position} /> n'existe plus ou est inaccessible.
          Les ressources ont été rapatriées à votre planète d'origine.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="glass-card border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
            <Check className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-400">Livraison effectuee</div>
            <div className="text-xs text-muted-foreground">
              Ressources deposees en <CoordsLink galaxy={coordinates.galaxy} system={coordinates.system} position={coordinates.position} />
            </div>
          </div>
        </div>
      </div>

      {/* Delivered resources */}
      {deliveredValues.length > 0 && (
        <div className="glass-card p-4 lg:p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Ressources livrees
          </h3>
          <div className="space-y-4">
            {deliveredValues.map((res) => {
              const pct = totalDelivered > 0 ? Math.round((res.amount / totalDelivered) * 100) : 0;
              return (
                <div key={res.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn('text-sm font-medium', res.textColor)}>
                      {res.label}
                    </span>
                    <span className={cn('text-lg font-bold tabular-nums', res.textColor)}>
                      +{res.amount.toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(4, pct)}%`,
                        backgroundColor: res.color,
                        boxShadow: `0 0 8px ${res.color}40`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Total livre</span>
            <span className="text-sm font-bold text-foreground tabular-nums">
              {totalDelivered.toLocaleString('fr-FR')} unites
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
