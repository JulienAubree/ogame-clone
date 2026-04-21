import { Link } from 'react-router';
import { AllianceTagBadge } from './AllianceTagBadge';

const ROLE_LABELS: Record<string, string> = {
  founder: 'Fondateur',
  officer: 'Officier',
  member: 'Membre',
};

interface ProfileAllianceCardProps {
  allianceName: string;
  allianceTag: string;
  allianceRole?: 'founder' | 'officer' | 'member' | null;
  isOwn: boolean;
}

export function ProfileAllianceCard({
  allianceName,
  allianceTag,
  allianceRole,
  isOwn,
}: ProfileAllianceCardProps) {
  const inner = (
    <div className="flex items-center gap-4">
      <AllianceTagBadge tag={allianceTag} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="text-base font-bold text-foreground truncate">{allianceName}</div>
        {isOwn && allianceRole && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{ROLE_LABELS[allianceRole] ?? allianceRole}</div>
        )}
      </div>
      {isOwn ? (
        <span className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors shrink-0">
          Gérer l'alliance →
        </span>
      ) : (
        <span className="text-sm text-muted-foreground shrink-0">→</span>
      )}
    </div>
  );

  const className = 'glass-card p-4 block hover:border-amber-500/30 transition-colors';

  return (
    <Link to="/alliance" className={className} aria-label={`Alliance ${allianceName}`}>
      {inner}
    </Link>
  );
}
