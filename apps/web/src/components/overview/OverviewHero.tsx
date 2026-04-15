import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FlagshipIcon } from '@/lib/icons';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { getPlanetImageUrl } from '@/lib/assets';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { trpc } from '@/trpc';

// Reuse BiomeBadge from existing Overview — it will be extracted in the main page rewrite
// For now, accept biomes as render prop or inline

interface OverviewHeroProps {
  planet: {
    id: string;
    name: string;
    galaxy: number;
    system: number;
    position: number;
    diameter: number;
    minTemp: number;
    maxTemp: number;
    planetClassId: string | null;
    planetImageIndex: number | null;
    renamed: boolean;
    biomes?: Array<{ id: string; name: string; rarity: string; effects?: any[] }>;
  };
  flagshipOnPlanet: boolean;
  planetTypeName?: string;
  planetTypeBonus?: { mineraiBonus: number; siliciumBonus: number; hydrogeneBonus: number };
  renderBiomeBadge: (biome: any) => React.ReactNode;
  renderPlanetDetail: (planet: any) => React.ReactNode;
}

export function OverviewHero({ planet, flagshipOnPlanet, planetTypeName, planetTypeBonus, renderBiomeBadge, renderPlanetDetail }: OverviewHeroProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [showDetail, setShowDetail] = useState(false);

  const renameMutation = trpc.planet.rename.useMutation({
    onSuccess: () => {
      utils.planet.list.invalidate();
      setIsRenaming(false);
    },
  });

  const biomes = planet.biomes ?? [];

  return (
    <>
      <div className="relative overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          {planet.planetClassId && planet.planetImageIndex != null ? (
            <img
              src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex)}
              alt=""
              className="h-full w-full object-cover opacity-40 blur-sm scale-110"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-12 lg:pb-8">
          <div className="flex items-start gap-5">
            {/* Thumbnail — clickable for detail overlay */}
            <button type="button" onClick={() => setShowDetail(true)} className="shrink-0 cursor-pointer group">
              {planet.planetClassId && planet.planetImageIndex != null ? (
                <img
                  src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
                  alt={planet.name}
                  className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-primary/10 transition-all group-hover:ring-2 group-hover:ring-primary/40 group-hover:shadow-primary/20"
                />
              ) : (
                <div className="flex h-20 w-20 lg:h-24 lg:w-24 items-center justify-center rounded-full border-2 border-primary/30 bg-card text-2xl font-bold text-primary shadow-lg shadow-primary/10">
                  {planet.name.charAt(0)}
                </div>
              )}
            </button>

            {/* Title + info */}
            <div className="flex-1 min-w-0 pt-1">
              {isRenaming ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newName.trim()) renameMutation.mutate({ planetId: planet.id, name: newName.trim() });
                  }}
                >
                  <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} className="h-7 text-sm" />
                  <Button type="submit" size="sm" disabled={renameMutation.isPending}>OK</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setIsRenaming(false)}>Annuler</Button>
                </form>
              ) : (
                <h1
                  className={`text-xl lg:text-2xl font-bold text-foreground truncate ${!planet.renamed ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                  onClick={!planet.renamed ? () => { setNewName(planet.name); setIsRenaming(true); } : undefined}
                  title={!planet.renamed ? 'Cliquer pour renommer' : undefined}
                >
                  {planet.name}
                  {flagshipOnPlanet && (
                    <FlagshipIcon width={16} height={16} className="inline-block ml-2 text-energy align-text-bottom" />
                  )}
                </h1>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">
                [{planet.galaxy}:{planet.system}:{planet.position}]
                {planetTypeName && <> · <span className="text-foreground/80">{planetTypeName}</span></>}
              </p>
              {/* Planet type bonuses — KPI-bar style with resource icons */}
              {planetTypeBonus && (planetTypeBonus.mineraiBonus !== 1 || planetTypeBonus.siliciumBonus !== 1 || planetTypeBonus.hydrogeneBonus !== 1) && (
                <div className="flex items-center gap-3 mt-1.5">
                  {planetTypeBonus.mineraiBonus !== 1 && (() => {
                    const pct = Math.round((planetTypeBonus.mineraiBonus - 1) * 100);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <MineraiIcon size={13} className="text-minerai" />
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    );
                  })()}
                  {planetTypeBonus.siliciumBonus !== 1 && (() => {
                    const pct = Math.round((planetTypeBonus.siliciumBonus - 1) * 100);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <SiliciumIcon size={13} className="text-silicium" />
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    );
                  })()}
                  {planetTypeBonus.hydrogeneBonus !== 1 && (() => {
                    const pct = Math.round((planetTypeBonus.hydrogeneBonus - 1) * 100);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <HydrogeneIcon size={13} className="text-hydrogene" />
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Biomes */}
          {biomes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {biomes.map((biome) => (
                <span key={biome.id}>{renderBiomeBadge(biome)}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Planet detail overlay */}
      <EntityDetailOverlay open={showDetail} onClose={() => setShowDetail(false)} title={planet.name}>
        {renderPlanetDetail(planet)}
      </EntityDetailOverlay>
    </>
  );
}
