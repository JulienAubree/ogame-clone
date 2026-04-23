import { Link } from 'react-router';

interface Member {
  userId: string;
  username: string;
  role: string;
  totalPoints?: number;
}

interface MembersPreviewCardProps {
  members: Member[];
}

const MAX_VISIBLE = 6;

export function MembersPreviewCard({ members }: MembersPreviewCardProps) {
  const staff = members
    .filter((m) => m.role === 'founder' || m.role === 'officer')
    .sort((a, b) => {
      if (a.role === 'founder' && b.role !== 'founder') return -1;
      if (b.role === 'founder' && a.role !== 'founder') return 1;
      return (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
    });
  const visible = staff.slice(0, MAX_VISIBLE);
  const overflow = staff.length - visible.length;

  return (
    <section className="glass-card flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">État-major</h3>
        <Link to="/alliance/membres" className="text-xs text-primary hover:underline">
          Voir tous les membres →
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun officier.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {visible.map((m) => (
            <li key={m.userId} className="flex items-center justify-between">
              <span>
                <span className="text-muted-foreground capitalize">{m.role === 'founder' ? 'Fondateur' : 'Officier'} · </span>
                <span className="font-medium">{m.username}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {(m.totalPoints ?? 0).toLocaleString('fr-FR')} pts
              </span>
            </li>
          ))}
          {overflow > 0 && (
            <li className="text-xs text-muted-foreground">+{overflow} autre{overflow > 1 ? 's' : ''}</li>
          )}
        </ul>
      )}
    </section>
  );
}
