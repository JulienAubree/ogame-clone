import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { getAssetUrl, getPlanetImageUrl } from '@/lib/assets';

interface FacilityHeroProps {
  buildingId: string;
  title: string;
  level: number;
  planetClassId?: string | null;
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
  planetImageIndex,
  helpTitle,
  onOpenHelp,
  upgradeCard,
  children,
}: FacilityHeroProps) {
  const hasPlanetImage = !!planetClassId && planetImageIndex != null;
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0">
        {hasPlanetImage ? (
          <img
            src={getPlanetImageUrl(planetClassId!, planetImageIndex!, 'thumb')}
            alt=""
            className="h-full w-full object-cover opacity-50 blur-sm scale-110"
            decoding="async"
            fetchPriority="low"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
        ) : (
          <img
            src={getAssetUrl('buildings', buildingId, 'thumb')}
            alt=""
            className="h-full w-full object-cover opacity-40 blur-sm scale-110"
            decoding="async"
            fetchPriority="low"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/50 via-slate-950/70 to-purple-950/50" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

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
                src={getAssetUrl('buildings', buildingId, 'thumb')}
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
