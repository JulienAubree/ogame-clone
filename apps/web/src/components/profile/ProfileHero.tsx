import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AllianceTagBadge } from './AllianceTagBadge';

const PLAYSTYLE_LABELS: Record<string, string> = {
  miner: 'Mineur',
  warrior: 'Guerrier',
  explorer: 'Explorateur',
};

interface ProfileHeroProps {
  username: string;
  avatarId: string | null;
  rank: number | null;
  bio: string | null;
  createdAt: string | Date;
  playstyle: 'miner' | 'warrior' | 'explorer' | null;
  seekingAlliance: boolean | null;
  allianceTag: string | null;
  onEditAvatar?: () => void;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function AvatarFallback({ username }: { username: string }) {
  return (
    <span className="text-2xl font-bold text-white/90">
      {username.slice(0, 2).toUpperCase()}
    </span>
  );
}

function formatJoinMonth(createdAt: string | Date): string {
  const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);
}

function tagline(bio: string | null, createdAt: string | Date): string {
  if (bio && bio.trim().length > 0) {
    const firstLine = bio.split('\n')[0].trim();
    return firstLine.length > 90 ? firstLine.slice(0, 87) + '…' : firstLine;
  }
  return `Aux commandes depuis ${formatJoinMonth(createdAt)}`;
}

export function ProfileHero({
  username,
  avatarId,
  rank,
  bio,
  createdAt,
  playstyle,
  seekingAlliance,
  allianceTag,
  onEditAvatar,
}: ProfileHeroProps) {
  const phrase = tagline(bio, createdAt);
  const rankLine = rank != null ? `Capitaine · Rang ${rank}` : 'Capitaine';

  const avatar: ReactNode = avatarId ? (
    <img
      src={`/assets/avatars/${avatarId}.webp`}
      alt={username}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-700 to-cyan-600">
      <AvatarFallback username={username} />
    </div>
  );

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-slate-500/30 px-5 py-5"
      style={{ background: 'linear-gradient(180deg, #020617 0%, #1e1b4b 100%)', minHeight: '160px' }}
    >
      {/* Stars layer */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: [
            'radial-gradient(1px 1px at 15% 20%, white, transparent)',
            'radial-gradient(1px 1px at 70% 40%, white, transparent)',
            'radial-gradient(1px 1px at 30% 70%, white, transparent)',
            'radial-gradient(1px 1px at 85% 80%, white, transparent)',
            'radial-gradient(1.5px 1.5px at 50% 15%, #fbbf24, transparent)',
          ].join(','),
        }}
      />

      {/* Distant planet */}
      <div
        className="pointer-events-none absolute opacity-80"
        style={{
          right: '-30px',
          top: '-10px',
          width: '90px',
          height: '90px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #86efac 0%, #16a34a 50%, #052e16 100%)',
        }}
      />

      {/* Alliance monogram (top-right corner) */}
      {allianceTag && (
        <div className="absolute top-3 right-3">
          <AllianceTagBadge tag={allianceTag} size="sm" />
        </div>
      )}

      {/* Content row */}
      <div className="relative flex items-center gap-4">
        {/* Avatar with optional edit pencil */}
        <div className="relative group shrink-0">
          <div
            className={cn(
              'w-[90px] h-[90px] rounded-full overflow-hidden border-2 border-slate-400/40',
              onEditAvatar && 'cursor-pointer',
            )}
            onClick={onEditAvatar}
            role={onEditAvatar ? 'button' : undefined}
            aria-label={onEditAvatar ? 'Changer d\'avatar' : undefined}
          >
            {avatar}
          </div>
          {onEditAvatar && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEditAvatar(); }}
              className="absolute bottom-0 right-0 flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/90 border border-cyan-400/40 text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Changer d'avatar"
            >
              <PencilIcon />
            </button>
          )}
        </div>

        {/* Text stack */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">{rankLine}</div>
          <h2 className="text-[22px] font-bold text-white mt-1 truncate">{username}</h2>
          <p className="text-[11px] italic text-slate-400 mt-1.5 leading-relaxed">{phrase}</p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {playstyle && (
              <span className="inline-flex items-center rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                {PLAYSTYLE_LABELS[playstyle] ?? playstyle}
              </span>
            )}
            {seekingAlliance === true && (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                Cherche une alliance
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
