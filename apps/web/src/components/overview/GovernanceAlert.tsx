import { useNavigate } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { trpc } from '@/trpc';

interface GovernanceAlertProps {
  /** planetClassId of the currently viewed planet — homeworld is exempt */
  planetClassId?: string | null;
}

export function GovernanceAlert({ planetClassId }: GovernanceAlertProps) {
  const navigate = useNavigate();
  const { data: governance } = trpc.colonization.governance.useQuery();

  // Don't render on homeworld or if no overextend
  if (!governance || governance.overextend <= 0) return null;
  if (planetClassId === 'homeworld') return null;

  const { colonyCount, capacity, overextend, harvestMalus, constructionMalus } = governance;

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-amber-500/30 cursor-pointer hover:border-amber-500/50 transition-colors"
      style={{ background: 'linear-gradient(135deg, rgba(120,80,20,0.35) 0%, rgba(80,50,10,0.4) 50%, rgba(120,80,20,0.3) 100%)' }}
      onClick={() => navigate('/empire')}
    >
      <div className="h-0.5 w-full bg-gradient-to-r from-amber-600/60 via-amber-500/80 to-amber-600/60" />

      <div className="px-4 py-3 relative">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <AlertCircle className="h-4 w-4 flex-shrink-0" stroke="#d97706" strokeWidth={2} />
          </div>
          <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">Surextension impériale</span>
          <span className="text-amber-400/50 text-[10px] font-semibold ml-auto">
            {colonyCount}/{capacity} colonies (+{overextend})
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-red-400 font-medium">-{Math.round(harvestMalus * 100)}% récolte</span>
          <span className="text-amber-500/30">|</span>
          <span className="text-red-400 font-medium">+{Math.round(constructionMalus * 100)}% temps construction</span>
        </div>

        <p className="mt-1.5 text-[11px] text-amber-300/50 leading-relaxed">
          Votre empire dépasse sa capacité de gouvernance. Améliorez le Centre de Pouvoir Impérial pour lever ces pénalités.
        </p>
      </div>
    </section>
  );
}
