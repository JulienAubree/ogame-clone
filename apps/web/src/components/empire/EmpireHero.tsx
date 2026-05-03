import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { HeroAtmosphere } from '@/components/common/HeroAtmosphere';
import { useHomepageContent } from '@/components/landing/useHomepageContent';

interface EmpireHeroProps {
  username: string;
  avatarId: string | null | undefined;
  planetCount: number;
  activeFleetCount?: number;
  inboundAttackCount?: number;
  onOpenHelp: () => void;
  /** Right-aligned slot for view toggles, reorder button, etc. */
  actions?: ReactNode;
}

function AvatarFallback({ username }: { username: string }) {
  return (
    <span className="text-2xl font-bold text-primary">
      {username.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * Empire page hero — round portrait is the player's avatar, title is the
 * player's name. Clicking the portrait opens the page help overlay.
 *
 * Uses <HeroAtmosphere> so the blurred avatar continues several hundred px
 * below the hero, giving the rest of the page a tinted, alive backdrop.
 */
export function EmpireHero({
  username,
  avatarId,
  planetCount,
  activeFleetCount = 0,
  inboundAttackCount = 0,
  onOpenHelp,
  actions,
}: EmpireHeroProps) {
  const avatarUrl = avatarId ? `/assets/avatars/${avatarId}.webp` : null;
  // Use the same key art as the public landing — keeps the in-game empire
  // view visually anchored to the brand image the admin curates.
  const homepage = useHomepageContent();
  const keyArtUrl = homepage.hero.backgroundImage || null;

  return (
    <div className="relative overflow-hidden">
      <HeroAtmosphere imageUrl={keyArtUrl} variant="cyan-purple" />

      <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex items-start gap-4 sm:gap-5 flex-1 min-w-0">
            {/* Round avatar — clickable to open the help overlay */}
            <button
              type="button"
              onClick={onOpenHelp}
              className="relative group shrink-0"
              title={`Comprendre la vue Empire`}
            >
              <div className="h-20 w-20 lg:h-24 lg:w-24 rounded-full overflow-hidden border-2 border-primary/30 shadow-lg shadow-cyan-500/10 transition-opacity group-hover:opacity-80">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={username}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-card">
                    <AvatarFallback username={username} />
                  </div>
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
            </button>

            {/* Title + sub-line */}
            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground truncate">
                {username}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {planetCount} {planetCount > 1 ? 'colonies' : 'colonie'}
                {activeFleetCount > 0 && (
                  <>
                    {' · '}
                    <span className="text-foreground/80">
                      {activeFleetCount} flotte{activeFleetCount > 1 ? 's' : ''} en mission
                    </span>
                  </>
                )}
                {inboundAttackCount > 0 && (
                  <>
                    {' · '}
                    <span className="text-destructive font-medium">
                      {inboundAttackCount} attaque{inboundAttackCount > 1 ? 's' : ''} en approche
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
