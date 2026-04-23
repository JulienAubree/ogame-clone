import type { ReactNode } from 'react';
import { getAssetUrl } from '@/lib/assets';

interface ShipyardHeroProps {
  level: number;
  onOpenHelp: () => void;
  upgradeCard?: ReactNode;
  children?: ReactNode;
}

export function ShipyardHero({ level, onOpenHelp, upgradeCard, children }: ShipyardHeroProps) {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={getAssetUrl('buildings', 'shipyard')}
          alt=""
          className="h-full w-full object-cover opacity-40 blur-sm scale-110"
          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/60 via-slate-950/80 to-purple-950/60" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

      <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex items-start gap-4 sm:gap-5 flex-1 min-w-0">
            <button
              type="button"
              onClick={onOpenHelp}
              className="relative group shrink-0"
              title="Comment fonctionne le chantier spatial ?"
            >
              <img
                src={getAssetUrl('buildings', 'shipyard', 'thumb')}
                alt="Chantier spatial"
                className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-cyan-500/10 transition-opacity group-hover:opacity-80"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
            </button>

            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">Chantier spatial</h1>
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
