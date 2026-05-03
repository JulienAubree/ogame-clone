import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { getBuildingIllustrationUrl } from '@/lib/assets';
import { useGameConfig } from '@/hooks/useGameConfig';
import { HeroAtmosphere } from './HeroAtmosphere';

interface FacilityHeroProps {
  buildingId: string;
  title: string;
  level: number;
  planetClassId?: string | null;
  /** Kept for backwards compat with callers — ignored: the hero always uses
   *  the building illustration as backdrop for an immersive look. */
  planetImageIndex?: number | null;
  helpTitle?: string;
  onOpenHelp: () => void;
  upgradeCard?: ReactNode;
  children?: ReactNode;
}

export function FacilityHero({
  buildingId,
  title,
  level,
  planetClassId,
  helpTitle,
  onOpenHelp,
  upgradeCard,
  children,
}: FacilityHeroProps) {
  const { data: gameConfig } = useGameConfig();
  const heroImage = getBuildingIllustrationUrl(gameConfig, buildingId, planetClassId, 'full');
  return (
    <div className="relative overflow-hidden">
      <HeroAtmosphere imageUrl={heroImage} variant="cyan-purple" />

      <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex items-start gap-4 sm:gap-5 flex-1 min-w-0">
            <button
              type="button"
              onClick={onOpenHelp}
              className="relative group shrink-0"
              title={helpTitle ?? `Comment fonctionne ${title} ?`}
            >
              <img
                src={getBuildingIllustrationUrl(gameConfig, buildingId, planetClassId, 'thumb')}
                alt={title}
                className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-cyan-500/10 transition-opacity group-hover:opacity-80"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
            </button>

            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">{title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Niveau {level}</p>
              {children}
            </div>
          </div>

          {upgradeCard}
        </div>
      </div>
    </div>
  );
}
