import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HeroAtmosphere } from '@/components/common/HeroAtmosphere';
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

function AvatarFallback({ username }: { username: string }) {
  return (
    <span className="text-2xl font-bold text-primary">
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
  const avatarUrl = avatarId ? `/assets/avatars/${avatarId}.webp` : null;

  const avatar: ReactNode = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={username}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-card">
      <AvatarFallback username={username} />
    </div>
  );

  return (
    <div className="relative overflow-hidden">
      <HeroAtmosphere imageUrl={avatarUrl} variant="indigo" />

      {/* Alliance monogram (top-right corner) */}
      {allianceTag && (
        <div className="absolute top-3 right-3 z-10 lg:top-4 lg:right-4">
          <AllianceTagBadge tag={allianceTag} size="sm" />
        </div>
      )}

      {/* Content row */}
      <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
        <div className="flex items-start gap-5">
          {/* Avatar with optional edit pencil */}
          <div className="relative group shrink-0">
            <div
              className={cn(
                'h-20 w-20 lg:h-24 lg:w-24 rounded-full overflow-hidden border-2 border-primary/30 shadow-lg shadow-primary/10',
                onEditAvatar && 'cursor-pointer transition-all group-hover:ring-2 group-hover:ring-primary/40 group-hover:shadow-primary/20',
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
                className="absolute bottom-0 right-0 flex items-center justify-center w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm border border-primary/40 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Changer d'avatar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Text stack */}
          <div className="flex-1 min-w-0 pt-1">
            <h1 className="text-xl lg:text-2xl font-bold text-foreground truncate">{username}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{rankLine}</p>
            <p className="text-xs italic text-muted-foreground/80 mt-2 leading-relaxed">{phrase}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
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
    </div>
  );
}
