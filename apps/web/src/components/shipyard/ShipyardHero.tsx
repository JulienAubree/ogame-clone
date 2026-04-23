import { getAssetUrl } from '@/lib/assets';

interface ShipyardHeroProps {
  level: number;
  inProduction: number;
  onOpenHelp: () => void;
}

export function ShipyardHero({ level, inProduction, onOpenHelp }: ShipyardHeroProps) {
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

      <div className="relative px-4 pt-5 pb-4 lg:px-6 lg:pt-6 lg:pb-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenHelp}
            className="relative group shrink-0"
            title="Comment fonctionne le chantier spatial ?"
          >
            <img
              src={getAssetUrl('buildings', 'shipyard', 'thumb')}
              alt="Chantier spatial"
              className="h-16 w-16 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-cyan-500/10 transition-opacity group-hover:opacity-80"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </div>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg lg:text-xl font-bold text-foreground leading-tight">Chantier spatial</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Niveau {level}
              {inProduction > 0 && (
                <>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span className="text-amber-400">{inProduction} vaisseau{inProduction > 1 ? 'x' : ''} en production</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
